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
