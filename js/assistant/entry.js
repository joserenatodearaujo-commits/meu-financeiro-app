'use strict';
// Meu Financeiro • Assistant dialog and opt-in browser AI.
function agentCardDescription(){return `<div class="agent-tips">Fale ou escreva naturalmente: <b>“15 reais de combustível no Pix hoje”</b>. Você revisará os dados antes de gravar. Sem JSON.</div>`;}
function openAgent(){if(!state)return;agentDraft=null;cleanAgentImage();
 modal('＋ Novo lançamento',`${agentCardDescription()}<div class="agent-tools"><button type="button" id="agentMic" class="btn">🎙️ Ditar</button><button type="button" id="agentPhoto" class="btn">📷 Foto</button><button type="button" id="agentTraditional" class="btn">✍️ Tradicional</button></div><div class="field"><label for="agentText">Descreva sua movimentação</label><textarea class="agent-text" id="agentText" name="agentText" rows="5" placeholder="Ex.: R$ 45 de almoço, no Pix, hoje" required></textarea></div><input class="hide" accept="image/*" capture="environment" id="agentFile" type="file"><div id="agentStatus" class="agent-status" role="status">A leitura de foto é feita neste dispositivo; a voz pode usar o reconhecimento do navegador.</div>`,async f=>{
 const text=String(f.get('agentText')||'').trim();if(!text)throw Error('Descreva a movimentação antes de continuar.');
 const fromVoice=$('#agentText')?.dataset?.fromVoice==='1',voiceUncertain=$('#agentText')?.dataset?.voiceUncertain==='1';
 let obj=null;try{obj=await browserAI(text)}catch(e){/* local fallback intentionally */}
 const local=extractLocal(text,agentDraft?.fromPhoto);
 const parsed=obj?{...local,...obj}:local;
 // Nunca deixar um modelo de linguagem substituir silenciosamente um valor monetário reconhecido.
 if(obj&&local.amount&&Math.abs(Number(obj.amount)-local.amount)>0.009){parsed.amount=local.amount;parsed.amountUncertain=true;parsed.amountIssue='O interpretador e o modelo divergiram sobre o valor. Confira e corrija.';}
 parsed.fromVoice=fromVoice;parsed.sourceText=fromVoice?text.slice(0,220):'';
 if(voiceUncertain){parsed.amountUncertain=true;parsed.amountIssue='O reconhecimento de voz ofereceu valores diferentes. Confira o total.';}
 openApproval(parsed);return false;
 });
 $('#modalForm button[type="submit"]').textContent='Gerar card de confirmação';
 $('#agentMic').onclick=startVoice;
 $('#agentPhoto').onclick=()=>$('#agentFile').click();
 $('#agentFile').onchange=e=>handleReceipt(e.target.files?.[0]);
 $('#agentTraditional').onclick=()=>{stopVoice();cleanAgentImage();entryForm();};
}
// Use browser AI only when the device actually exposes it. Most Android browsers will fall back to local classification.
async function browserAI(text){
 if(!globalThis.LanguageModel||typeof globalThis.LanguageModel.availability!=='function')return null;
 const avail=await globalThis.LanguageModel.availability();if(avail!=='available')return null;
 const model=await globalThis.LanguageModel.create();
 try {const result=await model.prompt('Extraia APENAS um JSON de uma movimentação financeira em português: {"type":"expense|income|investment|transfer","description":"...","amount":number,"macro":"...","micro":"...","paymentMethod":"pix|cash|debit|credit|unspecified","installments":number}. Não invente valor. Frase: '+text);
 const json=String(result).match(/\{[\s\S]*\}/)?.[0];if(!json)return null;const o=JSON.parse(json);if(!o||typeof o!=='object'||!['expense','income','investment','transfer'].includes(o.type)||typeof o.description!=='string'||!Number.isFinite(Number(o.amount))||+o.amount<=0)return null;
 return {type:o.type,description:o.description.slice(0,120),amount:Number(o.amount),macro:categories.includes(o.macro)?o.macro:'Outros',micro:String(o.micro||'Diversos').slice(0,80),paymentMethod:['pix','cash','debit','credit','unspecified'].includes(o.paymentMethod)?o.paymentMethod:'unspecified',installments:Number.isInteger(+o.installments)&&+o.installments>=1&&+o.installments<=120?+o.installments:1};
 }finally{model.destroy?.()}
}
