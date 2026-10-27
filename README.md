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
