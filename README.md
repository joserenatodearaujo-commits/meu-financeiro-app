# Meu Financeiro — Aplicativo Android/PWA

Aplicativo web de controle financeiro pessoal para Android e computador, servido como site estático gratuito pelo GitHub Pages.

## Funções existentes
- Receitas, despesas, cartões e parcelas, metas por mês, investimentos e projeções recorrentes.
- Visão de 1 a 12 meses e Sankey com as cores previstas.
- Assistente local de lançamento por texto, microfone do navegador e leitura opcional de imagem com Tesseract.js.
- Card de revisão antes de gravar; cofre AES-GCM protegido por senha, WebAuthn/PRF opcional em dispositivos compatíveis.

**O agente local não é o ChatGPT:** regras determinísticas para interpretar entradas; integração GPT e sincronização remota não estão implementadas. O serviço de voz pode usar serviços do navegador. OCR pode baixar Tesseract.js por CDN quando usado.

## Privacidade
O repositório contém somente código. **Não envie para o GitHub** bancos de dados financeiros, backups, senhas, tokens, extratos ou credenciais. Os dados ficam no IndexedDB do navegador, criptografados com senha; cada navegador/dispositivo mantém seu próprio cofre. Faça backups criptografados antes de limpar dados ou trocar de aparelho. A biometria não substitui a senha de recuperação.

## Estrutura de código
- `index.html`: HTML das telas e carregamento ordenado dos scripts.
- `css/base.css`, `css/mobile.css`: base visual e ajustes Android.
- `js/core/`: estado compartilhado, IndexedDB, AES-GCM, biometria, sessão e inicialização.
- `js/finance/`: regras financeiras e metas.
- `js/charts/`: Sankey e projeções.
- `js/ui/`: painéis, cadastros e eventos.
- `js/assistant/`: interpretação local, ditado, OCR, revisão e aprovação.
- `sw.js`, `manifest.webmanifest`: PWA e cache offline.
- `tests/`: regressões financeiras, criptografia, contratos e teste de interface.

Veja [ARCHITECTURE.md](./ARCHITECTURE.md) para dependências, limites e política de alterações.

## Testes (para desenvolvimento; não exigidos para usar no celular)
Requer Node 22. Para teste de interface, Python 3 + Playwright e Chromium em ambiente de desenvolvimento:

```sh
node tests/finance_rules.test.cjs
node tests/crypto.test.cjs
node tests/contract.test.cjs
python tests/browser_smoke.py
```

O teste de interface usa dados **fictícios** e criptografia/armazenamento simulados para isolar a lógica e a apresentação. O teste `crypto` usa AES-GCM/PBKDF2 reais. A biometria física precisa ser testada num Android compatível. Não se cria nenhuma base de dados de usuário para testar.

## Publicação
GitHub Pages: branch `main`, raiz `/`. O SW pré-armazena todos os arquivos HTML/CSS/JS públicos. `index.html` deve manter as mesmas URLs relativas e o mesmo domínio para preservar acesso ao cofre local existente.


## Contas, dinheiro físico e cartão de crédito (V2.8)
- Cadastre **Conta bancária**, **Carteira (dinheiro em espécie)** ou **Cartão** em Contas e cartões.
- O saldo inicial é um ponto de partida em uma data, não receita. Não recategorize automaticamente a conta antiga `Dinheiro/Pix`; confira o saldo e a distribuição dos lançamentos antigos.
- Use **Transferir entre contas** para saques, depósitos e movimentações próprias: não contam como despesas.
- Compras de cartão contam no orçamento/categorias na **data da compra** e se tornam parcelas de faturas futuras.
- A fatura pode ser paga integralmente ou parcialmente escolhendo **Pagar fatura** e a conta bancária debitada. O extrato mostra **Pagamento de fatura**, mas ele não aparece como uma segunda compra.
- A visão de **consumo** mostra despesas contratadas; a de **caixa** mostra desembolsos reais de faturas registradas. Projeções mostram faturas ainda não pagas.
- Faturas históricas sem pagamento registrado devem ser conciliadas; não são automaticamente marcadas como pagas.
- Saldos são estimados a partir dos dados lançados. Receitas e gastos recorrentes previstos ainda não têm confirmação de liquidação individual e podem diferir do extrato bancário real.
- Sua senha e biometria continuam as mesmas; todos os dados permanecem no cofre local criptografado. Não limpe os dados do navegador sem backup.


### Categorias e subcategorias (V2.9)
Em **Configurações → Categorias e subcategorias**, adicione categorias, crie subcategorias e faça edições. No lançamento tradicional ou no card do assistente, a subcategoria aparece como uma lista dependente da categoria selecionada; use **+ Nova subcategoria** quando necessário. O reconhecimento de texto/voz também consulta as subcategorias personalizadas.

As classificações de lançamentos antigos permanecem intactas e são incorporadas à lista na primeira abertura do cofre atualizado. Para não quebrar os relatórios e metas, categorias ou subcategorias vinculadas ao histórico só podem ser renomeadas/excluídas depois de reclassificar os registros correspondentes.

### Organização da tela (V2.10)
Em **Contas e cartões**, as contas bancárias, carteiras físicas e cartões de crédito aparecem em grupos expansíveis, com quantidade de cadastros e total estimado. Use **Expandir grupos** e **Recolher grupos** para alternar todos. Faturas, transferências e extratos têm seus próprios cabeçalhos expansíveis.
Em **Configurações → Categorias e subcategorias**, toque no nome de uma categoria para expandir as subcategorias; use **Expandir todas** ou **Recolher todas** para visualizar rapidamente o catálogo. As escolhas de expansão são mantidas durante a navegação da sessão, mas não são gravadas no cofre.


### V2.11 — Importação local em lote (prévia)
A aba **Importação e conciliação** oferece seleção múltipla simultânea para PDFs digitais de cartões Santander/Inter/Mercado Pago, CSV de conta Inter e TXT de conta Itaú. O processamento do arquivo é feito no navegador: o código do PDF.js está fixado e servido na mesma origem, com seu worker local. Nenhum arquivo é enviado para o ChatGPT, Supabase ou GitHub; a prévia é temporária e não é persistida no cofre.
Após leitura, o usuário escolhe a origem de cada documento, revisa as linhas reconhecidas e encontra um resumo preliminar por mês, separado por contas e cartões. **O importador ainda não grava registros ou fecha meses**: formatos ainda não reconhecidos, faturas com datas sem ano, PDFs digitalizados e pagamentos potencialmente duplicados ficam pendentes até que leitores específicos e o motor de conciliação sejam validados. Não trate totais de cartões como saídas de contas.
Limites operacionais: 100 arquivos por sessão, 20 MB por arquivo, 100 MB por lote, máximo de 150 páginas por PDF e até 60.000 linhas de texto delimitado por arquivo. Use **Limpar prévia** ou bloqueie o cofre para descartar a seleção. Os arquivos originais não são gravados no aplicativo.
O leitor PDF incluído em `js/vendor` é PDF.js v2.8.335, distribuído sob licença Apache-2.0 conforme os avisos preservados nos bundles. Em manutenção futura, revisar atualizações de segurança da biblioteca.


### V2.12 — Conciliação cruzada provisória e conferência de saldos
Depois de selecionar todos os extratos simultaneamente na aba **Importação e conciliação**, o módulo organiza a revisão por mês e por origem e mostra possíveis pares de transferências bancárias (valor igual, sinais opostos, até dois dias, correspondência única), repetições entre arquivos sobrepostos, saques, Pix recebidos, candidatos a pagamentos de fatura e registros semelhantes já presentes no cofre. São **sugestões**, não liquidações ou exclusões automáticas. A categorização sugerida também não é gravada.
É possível conferir o saldo de uma conta corrente informando saldos inicial e final oficiais e confirmando cobertura integral do mês. Somente quando os centavos fecham exatamente, não há linhas não reconhecidas nem duplicidades de arquivo, permite-se **salvar um resumo de saldo bancário conferido** no cofre criptografado (tabela opcional `importCheckpoints`). A conferência **não incorpora lançamentos, não ajusta os saldos das contas e não equivale ao fechamento financeiro definitivo**. Extratos bancários de períodos incompletos não devem receber cobertura integral.
Dados de extratos e a prévia não são enviados para rede ou armazenados pela conciliação; ao salvar uma conferência, somente fonte, mês, valores totais, quantidade e referência temporal ficam criptografados no cofre local. Backups existentes continuam compatíveis.

### Restauração da interface V2.12 — 02/11/2026
A pedido do usuário, a publicação voltou à interface V2.12, **sem a aba Dispositivos e sincronização** ou login remoto no navegador. O código publicado não faz uploads de cofres ao Supabase e continua lendo o IndexedDB local sem apagar dados. Esta reversão **não remove os registros locais dos aparelhos**. O projeto Supabase existente pode permanecer sem uso enquanto uma sincronização automática sem etapas de exportação/importação for validada separadamente. Cada navegador ainda mantém uma base própria nesta versão. **Não utilizar a base de testes do desktop como origem oficial de dados reais.**


## V2.15 — sincronização automática (Android primeiro)

- **Sem aba de sincronização.** O único passo necessário é vincular uma conta no acesso normal do aplicativo para que o Supabase saiba que dois navegadores pertencem ao mesmo usuário. Não é possível reconhecer o mesmo usuário em dois dispositivos sem uma autenticação inicial. Após a vinculação, o aplicativo salva e recebe revisões automaticamente enquanto estiver aberto, desbloqueado e conectado.
- O **Android com lançamentos** é a única origem que pode criar a primeira revisão em uma nuvem vazia. O desktop não tem permissão no cliente para publicar sua base de testes como oficial. O servidor rejeita atualizações obsoletas por CAS.
- No primeiro acesso do desktop conectado à mesma conta, os dados de teste são colocados em quarentena local criptografada e substituídos pela base oficial recebida. Se a senha do cofre Android for diferente, é solicitada uma única vez para abrir a cópia cifrada. Não há importação ou exportação de arquivos.
- Após o vínculo inicial, é realizado **merge de registros por UUID** no cliente entre a última base confirmada, os dados locais e a versão mais recente no Supabase. A criptografia AES-GCM e formato do cofre V1 são mantidos; o servidor armazena apenas o envelope criptografado e metadados de revisão. Operações independentes convergem. Para alterações divergentes no MESMO registro, a cópia local e a remota permanecem preservadas e a sincronização fica bloqueada para reconciliação.
- Uma cópia cifrada da base anterior, da base de comparação e de eventuais conflitos é guardada no IndexedDB. O status aparece discretamente na interface. Não há sincronização com o app fechado, nem garantia de conectividade em tempo real offline.
- A sessão da conta de nuvem é armazenada no navegador e renovada via refresh token. Senha da conta de nuvem e senha do cofre são distintas; a senha do cofre não sai do dispositivo.
- IMPORTANTE: a migração REAL do Android não é executada automaticamente por ChatGPT. É preciso entrar uma vez na conta da nuvem no próprio Android e depois no desktop. Não importar extratos reais antes de verificar que ambos apresentam os mesmos lançamentos e saldos.
- Segurança: nunca incluir service_role, credenciais pessoais, arquivos bancários ou backups reais no repositório. Somente chave publishable.
- Testes automáticos: merge 3 vias por UUID, simultaneidade, offline, conflitos, criptografia e interface. O backend mantém funções RPC por usuário e CAS atômico. O CI usa MOCK de servidor em navegadores; o teste operacional com a conta real do usuário deve ser verificado no próprio dispositivo.


### V2.16 — Login com Google (fluxo PKCE)

- O botão **Entrar com Google** usa Supabase Auth OAuth, com verificador PKCE armazenado temporariamente somente na sessão do navegador; nenhum Google Client Secret é publicado no GitHub.
- O retorno é processado antes de acessar a nuvem. Em dispositivo previamente vinculado a outro `user_id`, a sessão diferente é rejeitada e os lançamentos locais não são modificados.
- **Configuração externa necessária:** criar cliente OAuth tipo **Web application** no Google Auth Platform, incluir como origem JavaScript `https://joserenatodearaujo-commits.github.io` e como URI de redirecionamento Google `https://cvrshlwutczmeyqotqbw.supabase.co/auth/v1/callback`. No Supabase → Authentication → Providers → Google, habilitar o provedor com ID/secret no painel privado. Em Authentication → URL Configuration, permitir `https://joserenatodearaujo-commits.github.io/meu-financeiro-app/` como redirect URL e Site URL, conferindo a URL real publicada. Nunca colocar o segredo no código ou nesta conversa.
- O Google deve corresponder **ao mesmo e-mail verificado** da conta Supabase existente para possível vinculação automática de identidades. Se gerar outro `user_id`, o app deve preservar a base local e bloquear substituição.
- O cofre AES-GCM continua exigindo senha/biometria local. **O login Google não migra sozinho dados reais; Android primeiro, e somente depois desktop.**
- Sem configurar o provedor e a URL no Supabase, o botão não completará o login. Testes simulados e CI não equivalem à validação real do OAuth no dispositivo.
