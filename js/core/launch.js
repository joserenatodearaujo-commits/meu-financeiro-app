'use strict';
// Meu Financeiro • Start once after all scripts are loaded.
// Cancela reconhecimento ao bloquear o cofre.
document.addEventListener('click',e=>{if(e.target?.id==='closeModal'||e.target?.id==='cancelModal')stopVoice()});
start();
