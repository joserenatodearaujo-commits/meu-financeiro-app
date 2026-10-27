'use strict';
// Meu Financeiro • Browser speech recognition.
function stopVoice(){if(agentRecognizer){try{agentRecognizer.stop()}catch(e){}agentRecognizer=null;}}
function startVoice(){const Speech=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
 if(!Speech){$('#agentStatus').textContent='Reconhecimento de voz indisponível neste navegador. Use o microfone do teclado Android ou digite.';return;}
 stopVoice();const speech=new Speech();agentRecognizer=speech;speech.lang='pt-BR';speech.interimResults=false;speech.continuous=false;speech.maxAlternatives=3;
 if($('#agentText')){$('#agentText').dataset.fromVoice='1';$('#agentText').dataset.voiceUncertain='';}
 $('#agentStatus').textContent='🎙️ Ouvindo… diga a despesa e aguarde.';
 speech.onresult=e=>{if(!$('#agentText'))return;const phrase=[...e.results].map(x=>x[0]?.transcript||'').join(' ').trim();
  const variants=[...e.results].flatMap(x=>Array.from(x).slice(0,3).map(a=>a.transcript||''));
  const amounts=variants.map(v=>guessAmountDetailed(v).value).filter(v=>v!=null);
  const disagree=amounts.some(v=>Math.abs(v-amounts[0])>0.009);
  $('#agentText').dataset.voiceUncertain=disagree?'1':'';
  $('#agentText').value=($('#agentText').value+' '+phrase).trim();
  $('#agentStatus').textContent=(disagree?'⚠️ O áudio gerou valores diferentes. ':'🎙️ Ouvi: ')+phrase+'. Revise antes de gerar o card.';};
 speech.onerror=e=>{if($('#agentStatus'))$('#agentStatus').textContent='Não foi possível reconhecer a voz ('+e.error+'). Use o microfone do teclado Android.';};
 speech.onend=()=>{agentRecognizer=null};
 try{speech.start()}catch(e){$('#agentStatus').textContent='Microfone não disponível. Confira a permissão no navegador.'}
}
