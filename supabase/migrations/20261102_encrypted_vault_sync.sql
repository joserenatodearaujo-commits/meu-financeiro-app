-- Meu Financeiro V2.13: proposta de backend de sincronização de cofres criptografados.
-- NÃO aplicada em nenhum banco; requer projeto Supabase conectado, revisão e testes RLS.
-- Somente ciphertext AES-GCM; jamais armazenar senha, chave em claro ou extratos legíveis.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.encrypted_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision >= 1),
  envelope jsonb not null,
  source_device uuid not null,
  updated_at timestamptz not null default clock_timestamp(),
  constraint envelope_format check (
    envelope->>'schema' = 'meu-financeiro-encrypted-v1'
    and jsonb_typeof(envelope->'salt') = 'string'
    and jsonb_typeof(envelope->'iv') = 'string'
    and jsonb_typeof(envelope->'data') = 'string'
    and octet_length(envelope::text) <= 6000000
  )
);
alter table private.encrypted_vaults enable row level security;
revoke all on table private.encrypted_vaults from public, anon, authenticated;

-- Cópias criptografadas das revisões anteriores, para recuperação auditável.
create table if not exists private.encrypted_vault_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  envelope jsonb not null,
  source_device uuid not null,
  replaced_at timestamptz not null default clock_timestamp(),
  primary key(user_id,revision)
);
alter table private.encrypted_vault_history enable row level security;
revoke all on table private.encrypted_vault_history from public, anon, authenticated;

create or replace function private.archive_old_encrypted_vault()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into private.encrypted_vault_history(user_id, revision, envelope, source_device)
  values (old.user_id, old.revision, old.envelope, old.source_device)
  on conflict (user_id,revision) do nothing;
  return new;
end;
$$;
drop trigger if exists encrypted_vault_archive on private.encrypted_vaults;
create trigger encrypted_vault_archive
before update on private.encrypted_vaults
for each row execute function private.archive_old_encrypted_vault();

-- Leitura permitida apenas ao usuário logado. Não expor private ao Data API.
create or replace function public.finance_pull_vault()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row private.encrypted_vaults%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode='28000'; end if;
  select * into v_row from private.encrypted_vaults where user_id=v_uid;
  if not found then return jsonb_build_object('revision',0,'envelope',null); end if;
  return jsonb_build_object('revision',v_row.revision,
                            'envelope',v_row.envelope,
                            'source_device',v_row.source_device,
                            'updated_at',v_row.updated_at);
end;
$$;

-- Compare-and-swap atômico: o servidor decide a última revisão confirmada.
-- Android cria revision=1; desktop só pode escrever após ler a revisão atual.
-- Se outro aparelho gravar primeiro, retorna applied=false SEM sobrescrever.
create or replace function public.finance_push_vault(
  p_expected_revision bigint, p_envelope jsonb, p_device uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_new bigint;
  v_actual bigint;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode='28000'; end if;
  if p_device is null or p_expected_revision < 0 then raise exception 'invalid revision/device'; end if;
  if p_envelope->>'schema' is distinct from 'meu-financeiro-encrypted-v1'
     or jsonb_typeof(p_envelope->'salt') is distinct from 'string'
     or jsonb_typeof(p_envelope->'iv') is distinct from 'string'
     or jsonb_typeof(p_envelope->'data') is distinct from 'string'
     or octet_length(p_envelope::text)>6000000 then
    raise exception 'invalid encrypted payload';
  end if;
  if p_expected_revision=0 then
    insert into private.encrypted_vaults(user_id,revision,envelope,source_device)
    values(v_uid,1,p_envelope,p_device)
    on conflict (user_id) do nothing
    returning revision into v_new;
  else
    update private.encrypted_vaults
       set revision=revision+1, envelope=p_envelope,
           source_device=p_device, updated_at=clock_timestamp()
     where user_id=v_uid and revision=p_expected_revision
    returning revision into v_new;
  end if;
  if v_new is not null then
    return jsonb_build_object('applied',true,'revision',v_new);
  end if;
  select revision into v_actual from private.encrypted_vaults where user_id=v_uid;
  return jsonb_build_object('applied',false,'revision',coalesce(v_actual,0),'conflict',true);
end;
$$;

-- Bloquear EXECUTE implícito ao público e deixar somente usuários autenticados.
revoke all on function public.finance_pull_vault() from public, anon;
revoke all on function public.finance_push_vault(bigint,jsonb,uuid) from public, anon;
grant execute on function public.finance_pull_vault() to authenticated;
grant execute on function public.finance_push_vault(bigint,jsonb,uuid) to authenticated;
