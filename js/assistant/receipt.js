'use strict';
// Meu Financeiro • Optional on-device OCR via a CDN runtime.
function cleanAgentImage(){if(agentImageUrl){URL.revokeObjectURL(agentImageUrl);agentImageUrl=null;}}
async function handleReceipt(file){if(!file)return;
 if(!file.type.startsWith('image/')){$('#agentStatus').textContent='Selecione uma imagem válida.';return}
 if(file.size>12*1024*1024){$('#agentStatus').textContent='Escolha uma foto de até 12 MB.';return}
 const s=$('#agentStatus');s.textContent='Lendo imagem neste aparelho (a primeira leitura precisa de internet)…';
 const btn=$('#modalForm button[type="submit"]');btn.disabled=true;
 try{
  if(!globalThis.Tesseract)await new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';tag.onload=resolve;tag.onerror=()=>reject(Error('Falha ao baixar o leitor de imagem'));document.head.append(tag)});
  const worker=await Tesseract.createWorker('por');let result;try{result=await worker.recognize(file)}finally{await worker.terminate()}
  const text=result.data.text?.trim()||'';if(!text)throw Error('Não encontrei texto legível. Digite a despesa manualmente.');
  $('#agentText').value=text;agentDraft={fromPhoto:true};s.textContent='Texto extraído do comprovante. Revise a descrição e o valor no card; a imagem não será guardada.';
 }catch(e){s.textContent='Não consegui interpretar a foto: '+(e.message||e)+'. Você pode digitar a despesa.'}
 finally{btn.disabled=false;if($('#agentFile'))$('#agentFile').value='';}
}
