# Arquitetura e política de mudanças — Meu Financeiro v2.7

## Objetivo
Reduzir impacto de alterações e proteger registros locais existentes. O layout e as funcionalidades da versão anterior são preservados.

## Proteções que NÃO podem ser alteradas sem plano de migração
1. URL/hostname/origem do site usado para abrir o cofre.
2. IndexedDB: `meu-financeiro-v1`, object store `vault`, chave `main`.
3. AES-GCM com derivação PBKDF2 de 310.000 iterações; schema `meu-financeiro-encrypted-v1`.
4. Configuração de biometria `bioUnlock` e identificação WebAuthn/PRF existentes.
5. Campos antigos em `state.accounts`, `state.transactions`, `state.goals`, inclusive metas legadas com `amount` sem `monthly`.

Nenhuma alteração desta refatoração mudou essas condições.

## Dependências
- `core/shared.js` define utilitários, estado e variáveis de período.
- `core/vault.js` acessa IndexedDB e criptografia; não conhece cards, metas ou telas.
- `core/biometrics.js` depende do cofre e da sessão, mas só inicia mediante solicitação do usuário.
- `finance/ledger.js` expõe `FinanceRules` **puro** (recebe lista de transações, não grava dados) e adaptadores compatíveis `txExpenses`, `txIncome`, `txInvest`, `installments`, `sums`.
- `finance/goals.js` calcula metas por mês e mantém valores legados.
- `charts/*` usa calculadoras financeiras sem modificar transações.
- `ui/dashboard.js` atualiza as telas; `ui/forms.js` constrói formulários; `ui/events.js` liga ações à interface.
- `assistant/parser.js` extrai dados; `assistant/voice.js` e `assistant/receipt.js` capturam entrada; `assistant/approval.js` valida, impede duplicidade e confirma a persistência do cofre antes de mostrar sucesso.
- `core/launch.js` inicializa a aplicação depois dos demais scripts.

**Transição controlada:** os arquivos atuais usam scripts clássicos carregados em ordem e ainda compartilham parte do estado global. O isolamento de `FinanceRules` já evita dependência do estado para os cálculos centrais. A retirada dos demais globais exigirá uma nova etapa específica com testes, sem reescrever tudo na mesma entrega.

## Testes obrigatórios para uma alteração
1. Validação sintática de todos os JS.
2. Regressão de receitas, despesas, investimentos e parcelas, comparando 30 meses / competência e caixa.
3. Verificação real da criptografia e falha de senha incorreta.
4. Teste de metas 12 meses, substituição por mês e versão legada.
5. Testes simulados de diálogo, cancelamento, voz, OCR e biometria com recuperação por senha.
6. Conferência de responsividade nos tamanhos 320, 360, 390, 412, 768 e 1280 px.
7. Verificar que TODOS os assets estão no cache e que não se publicaram dados privados.
8. Validação física opcional no Android para sensor biométrico, câmera e reconhecimento de voz reais; mocks não os substituem.

## Notas de segurança
GitHub Pages é público, **somente código**. Não sincroniza saldos entre navegadores. Acesso biométrico utiliza passkey local; não é um servidor de contas. OCR usa biblioteca externa CDN no momento da leitura; o navegador pode obter transcrição de serviços próprios do fornecedor.


## V2.8 — Bancos, carteira física e faturas conciliadas
- Conserva a origem, DB (`meu-financeiro-v1`), cofre e criptografia anteriores.
- `accounts[]` pode ter `type:'cash'` (carteira) ou `bank` ou `card`; saldos usam `openingBalance` e `openingDate` por conta. Ausência desses campos em contas legadas mantém registros e mostra saldo estimado a conciliar.
- `transfers[]` contém `id, fromAccountId, toAccountId, amount, date, description`. Transferência entre contas próprias não é despesa nem receita.
- `invoicePayments[]` contém `id, cardId, month, accountId, amount, date`; pagamentos debitam a conta e reduzem o compromisso, mas não geram segunda despesa por categoria.
- Compra no cartão aparece integralmente em consumo (data da compra); as parcelas compõem faturas por mês de vencimento; caixa realizado só é debitado ao registrar pagamento de fatura.
- Pagamentos de fatura parcialmente realizados são rateados proporcionalmente às categorias da fatura na visualização de caixa, preservando a classificação original para visão de consumo.
- Faturas antigas sem histórico de pagamento são exibidas como **não conciliadas** quando vencidas: não se presume que foram quitadas ou que estejam de fato em dívida.
- Compras relacionadas a pagamentos já registrados não podem ser alteradas/excluídas até o registro de pagamento ser revertido.
- Saldos são estimados com base nos registros efetivamente cadastrados. Recorrências previstas sem confirmação individual de pagamento permanecem uma limitação para reconciliação bancária completa.
- O novo esquema é aditivo e não força migração destrutiva de cofre ou recategorização de `cash-default`.
- Regressão: `tests/banking_v28.test.cjs`, `tests/finance_rules.test.cjs`, `tests/contract.test.cjs`, `tests/crypto.test.cjs`.


## V2.9 — Catálogo centralizado
- Adiciona `state.taxonomy = {version:1,entries:[{name,subcategories}]}` opcional ao cofre local, sem alterar IndexedDB, PBKDF2, AES-GCM ou formato de movimentações antigas.
- Na abertura de cofre legado, `ensureTaxonomy` carrega as categorias base e incorpora classificações já utilizadas em lançamentos e metas, sem modificar ou renomear registros históricos.
- `js/finance/taxonomy.js` é responsável por validação, unicidade, relações, bloqueio de renomear/excluir classificações em uso e catálogo dinâmico.
- `js/ui/taxonomy.js` reúne gerenciamento, subcategorias dependentes da categoria e criação inline em lançamentos. O assistente de texto/voz e o editor tradicional usam a mesma fonte.
- Registros relacionados a metas e movimentações bloqueiam exclusões/renomeações para não gerar dados órfãos; demais rótulos podem ser administrados.
- `tests/taxonomy.test.cjs` valida migração, proteção histórica, inclusão, renomeação, exclusão e duplicidade; teste de interface cobre smartphone e desktop.

## V2.10 — Seções expansíveis sem impacto financeiro
- `<details>/<summary>` nativos em Contas e Cartões e no catálogo central, com atalhos para expandir/recolher todos os grupos.
- `expandedAccountGroups` e `expandedTaxonomyGroups` mantêm apenas o estado de expansão enquanto a página está aberta; nenhuma estrutura do cofre é modificada.
- Grupos de banco, espécie e crédito exibem valores derivados das regras financeiras preexistentes. Faturas, transferências e extratos continuam usando as mesmas consultas e ações.
- A regressão de interface cobre inicialização, expandir/recolher, criação, troca de página, pagamentos e telas de 320 a 1280 px. Os testes financeiros e de criptografia continuam obrigatórios.


## V2.11 — Importador em lote de leitura local
- Aba separada `importacao`; entrada `#importFiles` com `multiple` para PDFs, CSV e TXT.
- `js/import/parser.js` contém regras puras de reconhecimento de cabeçalhos CSV e linhas TXT/PDF, centavos inteiros, validações de datas e totais por tipo (conta/cartão).
- `js/vendor/pdf.min.js` e `pdf.worker.min.js` são cópias fixadas PDF.js v2.8.335 (Apache-2.0), carregadas da mesma origem e pré-cacheadas no service worker. Nenhuma leitura usa bibliotecas de CDN.
- `js/ui/importer.js` mantém resultados exclusivamente em memória, jamais chama `save()`, `writeVault()` ou APIs de upload. Prévia apenas: não prometer conciliação integral de faturas ou fechamento para PDFs sem datas completas e formatos não reconhecidos.
- A validação deve conferir valores, data, fonte, totais e origem das operações antes de permitir importação efetiva numa versão posterior. Não criar automaticamente transações, transferências ou pagamentos.


## V2.12 — Cruzamento conservador e checkpoints
- `js/import/reconcile.js`: normaliza somente linhas já reconhecidas, propõe correspondências 1:1 para bancos distintos, alerta sobre saques, Pix, faturas, repetição entre arquivos e possíveis registros existentes. Não modifica saldos ou transações.
- `js/ui/reconcile.js`: tela mensal com resumo por origem, lista de exceções e conferência de saldo bancário usando centavos inteiros. Sem conexão de rede.
- `state.importCheckpoints[]`: resumos opcionais de conta/mês, salvos explicitamente no mesmo cofre AES-GCM, sem armazenar linhas ou anexos e sem impactar `FinanceRules`.
- Fechamento parcial de banco é diferente de conciliação de toda a carteira: cartão, dinheiro físico, cobertura completa e classificação final permanecem pendentes até tratamento em etapas futuras.
- Testes de correspondência ambiguidades 1:N, faturas não duplicadas, dinheiro físico, saldos exatos, proteção do histórico e revisão sem gravação.


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
