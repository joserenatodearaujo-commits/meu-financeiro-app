# Sincronização automática transparente — Meu Financeiro

**Estado:** proposta técnica para implementação e teste isolados. Não está ativada na versão publicada V2.12.

## Experiência esperada

- Sem aba de sincronização, exportação ou importação de backups para uso normal.
- Na primeira instalação/acesso, o usuário identifica a conta do aplicativo na própria tela normal de entrada. É indispensável um vínculo/autenticação inicial entre dispositivos: o navegador não tem acesso ao IndexedDB de outro aparelho.
- Na primeira migração, o Android com lançamentos reais é a **única fonte oficial autorizada**. O desktop jamais publica os testes como base inicial.
- Ao entrar no desktop usando a mesma conta e liberar a chave do cofre oficial uma vez, o histórico real aparece automaticamente. Os testes do desktop ficam preservados em backup criptografado de quarentena, sem mesclagem com a base real.
- Daí em diante, abrir o app conectado e desbloqueado faz `pull` antes de mostrar indicadores/saldos. Novos lançamentos geram operações criptografadas na fila e `push` após `save`. Mudanças de outros aparelhos são recebidas automaticamente por Realtime e `pull` de recuperação.
- Um indicador discreto no cabeçalho informa `Sincronizado`, `Offline — pendente`, `Conflito` ou `Erro`. Não há etapa de exportar/importar.
- A conta usa autenticação Supabase Auth com sessão persistida de forma apropriada e token renovado. A senha do cofre/biometria protege a chave de dados e não é enviada ao Supabase.
- Não prometer sincronização instantânea quando offline ou com o app fechado. Ao reabrir e voltar a ficar online, reenviar operações pendentes e obter todas as revisões ausentes.

## Formato de dados e segurança

- Evoluir da sincronização de snapshot inteiro para registros/eventos criptografados individualmente por UUID: transações, contas, transferências, pagamentos de fatura, metas, categorias e checkpoints.
- Criptografia AES-GCM client-side com chave aleatória de dados (DEK); passphrase do cofre envolve a DEK (KEK). Dados no servidor são ciphertext; conferir AAD incluindo tipo, UUID e versão para evitar troca de envelopes.
- Manter o cofre legado no IndexedDB até a migração ser validada. Antes de limpar a base local de testes no desktop, preservar cópia recuperável criptografada.
- Servidor: `user_id`, `record_id`, `kind`, `version`, `ciphertext`, `updated_seq`, `tombstone`/marca de exclusão, `op_id` idempotente. Minimizar metadados observáveis; sem descrições, datas de compra, valores ou categorias em claro.
- RLS por `auth.uid()=user_id`, políticas de SELECT/INSERT/UPDATE/DELETE, rejeitar `anon`, teste de acesso cruzado entre dois usuários, sem `service_role` no navegador. Funções privilegiadas apenas com auditoria de autorização e validação da identidade.
- Histórico criptografado e restauração testada; manter backups com limites e plano de retenção. Nenhuma senha, extrato bancário ou credencial em GitHub.
- Revisões transacionais emitidas pelo banco e usadas como cursor monotônico por usuário, nunca relógios de dispositivos.

## Convergência e resolução de conflitos

1. Cada alteração local gera um `op_id` estável e guarda `base_record_version` e ciphertext na fila IndexedDB, atomicamente com a mutação local.
2. Em um aparelho online, a operação é enviada de modo idempotente; gravação no servidor avança `record_version` e `updated_seq` se a revisão do registro coincidir.
3. Alterações independentes de UUIDs diferentes convergem automaticamente, sem substituir uma base inteira por outra.
4. Se o mesmo registro foi alterado em dois aparelhos a partir de versões divergentes, nenhum registro é descartado: preservar versão local e remota, mostrar aviso contextual para escolher ou reconciliar. Não aplicar `last-write-wins` cego a dados financeiros.
5. Exclusões usam `tombstones` para não ressuscitar movimentos antigos de aparelhos offline.
6. `pull` idempotente em ordem de `updated_seq`; após reconnect/restart, reconciliar lacunas mesmo se mensagens Realtime forem perdidas. WebSocket é notificação, banco é fonte da verdade.
7. Nunca duplicar pagamentos de fatura nem registrar Pix/saques como novas despesas sem aprovação; verificar operações por UUID e referências.

## Migração e segurança de UX

1. Android autenticado primeiro — cofre real existente é a fonte inicial; após autorização de vínculo da conta, a sincronização inicial ocorre sem exportar arquivos.
2. Desktop com dados fictícios recebe vínculo da mesma conta e é bloqueado para envio de seus testes; cria backup de quarentena e recupera os registros oficiais do Android de forma automática após o desbloqueio da chave.
3. Não migrar valores de contas ou cartões sem testes de igualdade contábil, além de contagem: conferir UUIDs, saldos por conta, parcelas, pagamentos, categorias, metas e total mensal.
4. Executar bateria de testes com aparelhos/navegadores separados, dados fictícios, acesso offline, simultaneidade, bloqueio de dados de teste, ressurreição pós-exclusão, refresh token e falha de rede, além de testes RLS entre usuários diferentes.
5. Habilitar o sincronismo real somente após a verificação ponta a ponta e confirmação de que a base oficial é a do Android.

## Critérios de aceite

- Nenhuma aba Dispositivos e sincronização, nenhum botão de importar/exportar cofre para a operação normal.
- Android com N movimentos oficiais; desktop instala/vincula a mesma conta e mostra exatamente esses N movimentos e os mesmos saldos sem importar arquivo.
- Compra registrada no Android aparece no desktop após sincronização online sem interação manual e vice-versa.
- Dois lançamentos novos feitos offline em aparelhos diferentes convergem sem perda quando ambos conectam; conflito simultâneo no **mesmo** lançamento fica pendente de resolução explícita.
- Nenhum lançamento de teste antigo do desktop aparece na base oficial; backup de quarentena recuperável.
- Comparativo de saldos mensais, cartões, metas e categorias permanece idêntico em ambas as interfaces.
- Banco não armazena valores/descrições legíveis; RLS impede leitura e alteração entre contas; nenhum dado financeiro real é utilizado nos testes.
