# Meu Financeiro — PWA

Aplicativo web de controle financeiro pessoal para Android e computador.

## Recursos
- Dashboard, categorias, cartões, parcelamentos, metas, investimentos, Sankey e projeções de despesas recorrentes.
- Assistente de lançamentos por texto; ditado de voz quando o navegador suportar; leitura de comprovantes por OCR opcional.
- Card de revisão obrigatório antes de gravar.
- Cofre local criptografado com AES-GCM e senha do usuário.

## Privacidade e limitações
**Este repositório contém somente código público, nenhum registro financeiro.**
Os dados são armazenados localmente no navegador (IndexedDB), não no GitHub. Use a mesma origem HTTPS para preservar o acesso ao cofre, faça backups criptografados regularmente e guarde sua senha em segurança.
**Não há sincronização entre dispositivos nem integração embutida com o ChatGPT.** O interpretador de lançamentos usa regras locais, não um modelo GPT. O reconhecimento de voz poderá usar serviços do navegador. A leitura de imagens carrega a biblioteca Tesseract por CDN quando utilizada.

## Instalação
Publique o conteúdo da raiz na branch `main` via GitHub Pages. Acesse a URL HTTPS e, no Chrome Android, use o menu para adicionar à tela inicial. O navegador pode exigir primeiro a criação do cofre.

## Aviso
Não envie extratos, dados privados, backup do cofre, tokens ou senhas para o repositório. GitHub Pages publica arquivos que podem ser acessados por qualquer pessoa.
