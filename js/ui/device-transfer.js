'use strict';
// V2.13: transição manual segura Android -> desktop. NÃO é sincronização automática.
const deviceTransfer={candidate:null,preview:null,localBackupAcknowledged:false};
function transferStatus(message,warning=false){
 const el=$('#deviceTransferStatus');if(!el)return;
 el.textContent=message;el.classList.toggle('amountneg',!!warning);
}
function downloadVaultSnapshot(v,filename){
 if(!v||v.schema!=='meu-financeiro-encrypted-v1')throw Error('Cofre criptografado inválido.');
 const url=URL.createObjectURL(new Blob([JSON.stringify(v,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=filename;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),8000);
}
async function replaceLocalVaultAndBio(v){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('vault','readwrite'),store=tx.objectStore('vault');
  store.put(v,'main');store.delete('bioUnlock');store.delete('cloudSyncMeta');
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error||Error('Falha ao restaurar o cofre.'));
  tx.onabort=()=>reject(tx.error||Error('Restauração cancelada.'));
 });
}
function transferClearPreview(){
 deviceTransfer.candidate=null;deviceTransfer.preview=null;
 $('#deviceTransferPreview').textContent='Nenhum backup do Android validado.';
 $('#deviceTransferApply').disabled=true;
}
async function transferPreview(){
 transferClearPreview();
 const file=$('#deviceTransferFile').files?.[0],pass=$('#deviceTransferPassword').value;
 if(!file)throw Error('Selecione o backup criptografado exportado do Android.');
 if(file.size>30*1024*1024)throw Error('O backup excede 30 MB e precisa de avaliação.');
 if(!pass)throw Error('Digite a senha do cofre utilizado no Android.');
 const v=JSON.parse(await file.text());
 if(v?.schema!=='meu-financeiro-encrypted-v1'||typeof v.salt!=='string'||typeof v.iv!=='string'||typeof v.data!=='string')
  throw Error('Este não é um backup criptografado compatível.');
 const decrypted=await decryptData(v,pass);
 if(!Array.isArray(decrypted?.transactions)||!Array.isArray(decrypted?.accounts))throw Error('Backup sem estrutura financeira válida.');
 deviceTransfer.candidate=v;
 deviceTransfer.preview={
  accounts:decrypted.accounts.length,
  transactions:decrypted.transactions.length,
  transfers:Array.isArray(decrypted.transfers)?decrypted.transfers.length:0,
  invoices:Array.isArray(decrypted.invoicePayments)?decrypted.invoicePayments.length:0
 };
 $('#deviceTransferPreview').textContent='Backup aberto e validado localmente: '+deviceTransfer.preview.accounts+' contas/cartões, '+
  deviceTransfer.preview.transactions+' lançamentos, '+deviceTransfer.preview.transfers+
  ' transferências e '+deviceTransfer.preview.invoices+
  ' pagamentos de fatura. Confira se estes números correspondem ao Android.';
 $('#deviceTransferApply').disabled=false;
 transferStatus('Prévia verificada. A base do desktop ainda não foi modificada.');
}
async function transferApply(){
 if(!deviceTransfer.candidate||!deviceTransfer.preview)throw Error('Valide o backup do Android primeiro.');
 if(!$('#deviceTransferSavedCopy').checked)throw Error('Primeiro faça e confirme o backup criptografado do desktop.');
 if(!$('#deviceTransferAndroidSource').checked)throw Error('Confirme que o arquivo foi exportado do Android com lançamentos reais.');
 const pass=$('#deviceTransferPassword').value;
 if(!pass)throw Error('Informe novamente a senha do cofre do Android.');
 const incoming=await decryptData(deviceTransfer.candidate,pass);
 if(!Array.isArray(incoming?.transactions)||!Array.isArray(incoming?.accounts))throw Error('Arquivo inválido.');
 if(incoming.transactions.length!==deviceTransfer.preview.transactions||
 incoming.accounts.length!==deviceTransfer.preview.accounts)throw Error('O conteúdo difere da prévia anterior.');
 const desktopCounts='Desktop atual: '+(state?.transactions?.length||0)+' lançamentos e '+(state?.accounts?.length||0)+' contas.';
 const incomingCounts='Android: '+deviceTransfer.preview.transactions+' lançamentos e '+deviceTransfer.preview.accounts+' contas.';
 const message='ATENÇÃO: esta operação SUBSTITUI o cofre local deste navegador pelos dados do Android.\n\n'+
 desktopCounts+'\n'+incomingCounts+'\n\n'+
 'Os lançamentos de teste do desktop não serão misturados.\n'+
 'A senha para abrir este dispositivo passará a ser a senha do backup do Android.\n'+
 'A biometria antiga do desktop será desativada.\n\n'+
 'A sincronização automática na nuvem ainda NÃO está ativada.\n\nConfirmar substituição?';
 if(!confirm(message))return;
 $('#deviceTransferApply').disabled=true;
 try{
  await replaceLocalVaultAndBio(deviceTransfer.candidate);
  state=ensureFinancialState(incoming);
  salt=deviceTransfer.candidate.salt;
  passphrase=pass;
  $('#deviceTransferPassword').value='';
  $('#deviceTransferFile').value='';
  $('#deviceTransferSavedCopy').checked=false;
  $('#deviceTransferAndroidSource').checked=false;
  transferClearPreview();
  renderAll();
  await setBioStatus();
  transferStatus('Base do Android restaurada com sucesso neste dispositivo. Isso foi uma transferência MANUAL; o sincronismo automático permanece desativado.');
 }catch(e){
  $('#deviceTransferApply').disabled=false;
  throw e;
 }
}
function initDeviceTransfer(){
 $('#deviceTransferAndroidExport').onclick=()=>$('#exportBackup').click();
 $('#deviceTransferDesktopBackup').onclick=async()=>{
  try{
   const v=await readVault();
   downloadVaultSnapshot(v,'meu-financeiro-copia-desktop-antes-da-migracao-'+new Date().toISOString().slice(0,10)+'.json');
   transferStatus('Download do backup criptografado do desktop solicitado. Verifique se ele foi realmente salvo antes de marcar a confirmação.');
  }catch(e){transferStatus('Não foi possível preparar o backup do desktop: '+e.message,true)}
 };
 $('#deviceTransferInspect').onclick=async()=>{
  $('#deviceTransferInspect').disabled=true;
  try{await transferPreview()}catch(e){transferClearPreview();transferStatus('Falha ao validar: '+(e.message||'senha do Android incorreta ou arquivo incompatível'),true)}
  finally{$('#deviceTransferInspect').disabled=false}
 };
 $('#deviceTransferApply').onclick=async()=>{
  try{await transferApply()}catch(e){transferStatus('Não foi possível restaurar: '+(e.message||'Erro inesperado'),true)}
 };
 $('#deviceTransferFile').onchange=transferClearPreview;
 $('#deviceTransferPassword').oninput=transferClearPreview;
 transferClearPreview();
}
