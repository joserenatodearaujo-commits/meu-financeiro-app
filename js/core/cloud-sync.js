'use strict';
// Meu Financeiro V2.14 — synchronization of *encrypted* vault snapshots.
// Local vault encryption remains unchanged. No data leaves the browser before explicit Android bootstrap.
const CLOUD_URL='https://cvrshlwutczmeyqotqbw.supabase.co';
const CLOUD_PUBLISHABLE='sb_publishable_UOifhMzHXF1rDMQOJRpSKA_L6aXE--f';
const cloudState={session:null,userId:null,deviceId:null,busy:false,syncQueued:false,remote:null,
                  blocked:false,localMeta:null,lastError:'',poll:null,localWriteBusy:false};
const cloudStoreKey='meu-financeiro-cloud-session-v1';
function cloudStatus(message,isError=false){
 cloudState.lastError=isError?message:'';
 const el=$('#cloudStatus');if(el){el.textContent=message;el.classList.toggle('amountneg',isError)}
 cloudButtons();
}
function cloudButtons(){
 const active=!!cloudState.session&&!!cloudState.userId;
 if($('#cloudConnected'))$('#cloudConnected').textContent=active?
   'Autenticado como '+cloudState.session.user.email+' · revisão local '+(cloudState.localMeta?.revision||'sem vínculo'):
   'Nuvem desconectada. O cofre local continua funcionando.';
 for(const id of ['cloudSignOut','cloudRefresh','cloudPublishAndroid','cloudReceiveDesktop']){
  const btn=$('#'+id);if(btn)btn.disabled=!active||cloudState.busy;
 }
 const login=$('#cloudLogin');if(login)login.disabled=cloudState.busy;
}
function cloudDeviceId(){
 const k='meu-financeiro-cloud-device-v1';
 try{
  let value=localStorage.getItem(k);
  if(!/^[0-9a-f-]{36}$/i.test(value||'')){value=crypto.randomUUID();localStorage.setItem(k,value)}
  return value;
 }catch{return crypto.randomUUID()}
}
function cloudReadSession(){
 try{const o=JSON.parse(sessionStorage.getItem(cloudStoreKey)||'null');
  if(o?.access_token&&o?.refresh_token&&o?.user?.id&&o?.expires_at)return o;
 }catch{}
 return null;
}
function cloudSaveSession(session){
 cloudState.session=session;
 cloudState.userId=session?.user?.id||null;
 try{if(session)sessionStorage.setItem(cloudStoreKey,JSON.stringify(session));else sessionStorage.removeItem(cloudStoreKey)}catch{}
 cloudButtons();
}
async function cloudRequest(path,{method='GET',body,authenticated=false,token}={}){
 const authorization=token||(authenticated?await cloudAccessToken():null);
 const headers={'apikey':CLOUD_PUBLISHABLE,'Content-Type':'application/json'};
 if(authorization)headers.Authorization='Bearer '+authorization;
 const ctrl=new AbortController(),abort=setTimeout(()=>ctrl.abort(),17000);
 try{
  const res=await fetch(CLOUD_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:ctrl.signal,cache:'no-store'});
  let data;try{data=await res.json()}catch{data={}}
  if(!res.ok)throw Error(data.msg||data.error_description||data.message||data.error||'Erro HTTP '+res.status);
  return data;
 }finally{clearTimeout(abort)}
}
async function cloudAccessToken(){
 const s=cloudState.session;
 if(!s)throw Error('Entre na conta da nuvem para sincronizar.');
 if(Date.now()/1000<(s.expires_at||0)-90)return s.access_token;
 const next=await cloudRequest('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:s.refresh_token}});
 const session={...next,expires_at:Math.floor(Date.now()/1000)+(next.expires_in||3600)};
 if(!session.user?.id||session.user.id!==cloudState.userId)throw Error('Identidade da nuvem alterada; autentique novamente.');
 cloudSaveSession(session);return session.access_token;
}
async function cloudValidateUser(){
 const s=cloudState.session;if(!s)return false;
 try{
  const info=await cloudRequest('/auth/v1/user',{authenticated:true});
  if(info?.id!==s.user.id||!info?.email)throw Error('Identidade inconsistente.');
  cloudState.userId=info.id;return true;
 }catch(e){cloudSaveSession(null);cloudStatus('Sessão da nuvem expirada: entre novamente. '+e.message,true);return false}
}
async function cloudPull(){
 const r=await cloudRequest('/rest/v1/rpc/finance_pull_vault',{method:'POST',body:{},authenticated:true});
 if(!Number.isSafeInteger(r?.revision)||r.revision<0)throw Error('Resposta de sincronização inválida.');
 cloudState.remote=r;return r;
}
async function cloudPush(expected,envelope){
 if(!Number.isSafeInteger(expected)||expected<0)throw Error('Revisão inválida.');
 if(envelope?.schema!=='meu-financeiro-encrypted-v1'||!envelope?.salt||!envelope?.iv||!envelope?.data)
  throw Error('Somente cofre criptografado é aceito.');
 const r=await cloudRequest('/rest/v1/rpc/finance_push_vault',{
  method:'POST',authenticated:true,body:{p_expected_revision:expected,p_envelope:envelope,p_device:cloudState.deviceId}
 });
 if(typeof r?.applied!=='boolean'||!Number.isSafeInteger(r?.revision))throw Error('Revisão do servidor inválida.');
 return r;
}
const cloudReadMeta=()=>localVaultField('cloudSyncMeta','get');
const cloudSaveMeta=meta=>localVaultField('cloudSyncMeta','put',meta);
function cloudMetaMatches(meta){return meta?.userId===cloudState.userId&&Number.isSafeInteger(meta.revision)&&meta.revision>0}
async function cloudReadCurrentMeta(){cloudState.localMeta=await cloudReadMeta();return cloudState.localMeta}
function cloudBusy(v){cloudState.busy=v;cloudButtons()}
function cloudShowRemote(r){
 const el=$('#cloudRemote');
 if(!el)return;
 if(r?.revision>0)el.textContent='Cofre oficial na nuvem: revisão '+r.revision+
   '. A primeira publicação deverá ter sido feita no Android. A base de testes do desktop nunca será enviada automaticamente.';
 else el.textContent='Ainda não existe um cofre na nuvem. Somente o Android com registros reais deve iniciar esta base.';
}
async function cloudLogin(e){
 e.preventDefault();
 const email=$('#cloudEmail').value.trim(),password=$('#cloudPassword').value;
 if(!email||!password){cloudStatus('Informe o e-mail e a senha da conta da nuvem.',true);return}
 cloudBusy(true);
 try{
  const r=await cloudRequest('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  if(!r?.access_token||!r?.user?.id||!r?.refresh_token)throw Error('Login incompleto; confira seu e-mail.');
  cloudSaveSession({...r,expires_at:Math.floor(Date.now()/1000)+(r.expires_in||3600)});
  $('#cloudPassword').value='';
  await cloudReadCurrentMeta();
  await cloudRefresh();
 }catch(err){cloudStatus('Login na nuvem não autorizado: '+err.message,true)}
 finally{cloudBusy(false)}
}
async function cloudSignup(){
 const email=$('#cloudEmail').value.trim(),password=$('#cloudPassword').value;
 if(!email||password.length<12){cloudStatus('Informe e-mail e senha exclusiva da nuvem com pelo menos 12 caracteres.',true);return}
 cloudBusy(true);
 try{
  const r=await cloudRequest('/auth/v1/signup',{method:'POST',body:{email,password}});
  $('#cloudPassword').value='';
  if(r?.access_token&&r?.refresh_token&&r?.user){
   cloudSaveSession({...r,expires_at:Math.floor(Date.now()/1000)+(r.expires_in||3600)});
   await cloudReadCurrentMeta();await cloudRefresh();
  }else cloudStatus('Cadastro solicitado. Confira seu e-mail para confirmar a conta; depois entre nesta tela.');
 }catch(err){cloudStatus('Não foi possível cadastrar: '+err.message,true)}
 finally{cloudBusy(false)}
}
async function cloudRefresh(){
 if(!cloudState.session||!state)return;
 const r=await cloudPull();await cloudReadCurrentMeta();cloudShowRemote(r);
 const meta=cloudState.localMeta;
 if(!r.revision){cloudStatus('Nuvem vazia. No Android, use Publicar base oficial após conferir seu backup.');return}
 if(!cloudMetaMatches(meta)){
  cloudStatus('Existe uma base oficial na nuvem, mas este navegador ainda não foi vinculado. Use Receber base oficial. Nenhum dado local foi sobrescrito.');
  return;
 }
 if(meta.revision>r.revision){cloudState.blocked=true;cloudStatus('Revisões inconsistentes; sincronização suspensa. Não sobrescreva o cofre.',true);return}
 if(meta.revision<r.revision){
  if(meta.dirty){cloudState.blocked=true;cloudStatus('CONFLITO: houve alteração local e nova revisão na nuvem. Exporte o backup local e resolva antes de substituir.',true);return}
  if(cloudState.localWriteBusy||document.querySelector('#modalRoot form')){cloudStatus('Nova revisão disponível; feche a edição aberta para atualizar com segurança.');return}
  try{await cloudApplyRemote(r,passphrase,false)}
  catch(err){cloudState.blocked=true;cloudStatus('Atualização disponível, mas o cofre não abriu com a senha local. Use Receber base oficial: '+err.message,true)}
  return;
 }
 if(meta.dirty){cloudStatus('Alterações locais pendentes de envio.');cloudSchedulePush()}
 else cloudStatus('Sincronizado: revisão '+r.revision+'. Cofre do navegador e da nuvem correspondem.');
}
async function cloudApplyRemote(r,password,firstLink){
 if(!r?.envelope||r.revision<1)throw Error('Cofre remoto não encontrado.');
 const incoming=ensureFinancialState(await decryptData(r.envelope,password));
 if(!Array.isArray(incoming.accounts)||!Array.isArray(incoming.transactions))throw Error('Cofre recebido inválido.');
 // Revalidar sessão no servidor antes da escrita local. Nunca substituir um cofre sujo.
 const current=await cloudReadMeta();
 if(!firstLink&&(cloudState.localWriteBusy||!cloudMetaMatches(current)||current.dirty||current.revision>=r.revision))
  throw Error('Houve alteração local durante a verificação. Nenhum dado foi substituído.');
 if(firstLink){
  const alreadyLinked=cloudMetaMatches(current);
  if(alreadyLinked&&current.dirty)throw Error('Alterações locais pendentes; não substitua sem cópia e revisão.');
 }
 const db=await openDB();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('vault','readwrite'),st=tx.objectStore('vault');
  st.put(r.envelope,'main');
  if(firstLink)st.delete('bioUnlock');
  st.put({userId:cloudState.userId,revision:r.revision,dirty:false},'cloudSyncMeta');
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
 state=incoming;salt=r.envelope.salt;passphrase=password;
 cloudState.localMeta={userId:cloudState.userId,revision:r.revision,dirty:false};
 renderAll();await setBioStatus();
 cloudStatus('Base oficial aplicada: revisão '+r.revision+'. Nenhum teste local foi mesclado.');
}
async function cloudPublishAndroid(){
 if(!cloudState.session||!state)throw Error('Entre na nuvem e desbloqueie o cofre Android.');
 if(!/Android/i.test(navigator.userAgent))throw Error('A primeira publicação está limitada ao aplicativo aberto em Android.');
 if(!$('#cloudAndroidConfirm').checked)throw Error('Confirme que este Android possui a base real e que você guardou um backup.');
 if(!state.transactions.length)throw Error('O cofre local não contém lançamentos; não publique uma base vazia.');
 if(!confirm('Publicar este cofre criptografado do ANDROID como primeira base oficial na nuvem? Esta operação não envia textos legíveis nem permite dados de testes do desktop.'))return;
 cloudBusy(true);
 try{
  const r=await cloudPull();cloudShowRemote(r);
  if(r.revision!==0){cloudStatus('A nuvem já possui uma base. A publicação inicial foi bloqueada para evitar sobrescrita.',true);return}
  const v=await readVault();
  const pushed=await cloudPush(0,v);
  if(!pushed.applied){cloudStatus('Outro aparelho inicializou a nuvem primeiro. Nenhum dado foi substituído.',true);return}
  const afterUpload=await readVault();
  const meta={userId:cloudState.userId,revision:pushed.revision,dirty:afterUpload.iv!==v.iv};
  await cloudSaveMeta(meta);cloudState.localMeta=meta;
  cloudStatus('Android definido como base oficial. Revisão '+pushed.revision+' publicada criptografada.');
  await cloudRefresh();
 }finally{cloudBusy(false)}
}
async function cloudReceiveDesktop(){
 if(!cloudState.session||!state)throw Error('Entre na nuvem e desbloqueie o cofre local.');
 if(!$('#cloudDesktopBackupConfirm').checked)throw Error('Faça e confirme um backup do cofre deste dispositivo antes de receber a nuvem.');
 const password=$('#cloudVaultPassword').value;
 if(!password)throw Error('Informe a senha do cofre oficial do Android.');
 cloudBusy(true);
 try{
  const r=await cloudPull();cloudShowRemote(r);
  if(!r.revision)throw Error('A base oficial ainda não foi publicada no Android.');
  const incoming=await decryptData(r.envelope,password);
  if(!Array.isArray(incoming?.transactions)||!Array.isArray(incoming?.accounts))throw Error('Backup de nuvem inválido.');
  const meta=await cloudReadMeta();
  if(cloudMetaMatches(meta)&&meta.dirty)throw Error('Este dispositivo tem alterações locais não sincronizadas; faça reconciliação antes de receber.');
  const message='Esta operação substituirá os dados locais pelos da nuvem (revisão '+r.revision+').\n'+
  'Local: '+state.transactions.length+' lançamentos. Nuvem: '+incoming.transactions.length+' lançamentos.\n'+
  'Confirme que salvou backup do cofre atual, que a origem oficial foi o Android e que os testes do desktop podem ser substituídos.\n'+
  'Não será feita mesclagem automática. Continuar?';
  if(!confirm(message))return;
  const latest=await cloudPull();
  if(latest.revision!==r.revision)throw Error('A nuvem mudou durante a confirmação. Repita a operação.');
  await cloudApplyRemote(r,password,true);
  $('#cloudVaultPassword').value='';$('#cloudDesktopBackupConfirm').checked=false;
 }finally{cloudBusy(false)}
}
let cloudPushTask=null;
function cloudSchedulePush(){
 if(cloudPushTask)return cloudPushTask;
 cloudPushTask=(async()=>{
  await new Promise(resolve=>setTimeout(resolve,300));
  try{await cloudSyncPending()}finally{cloudPushTask=null}
 })();
 return cloudPushTask;
}
async function cloudSyncPending(){
 if(cloudState.busy||cloudState.blocked||!cloudState.session||!state||cloudState.localWriteBusy)return;
 const meta=await cloudReadMeta();
 if(!cloudMetaMatches(meta)||!meta.dirty)return;
 cloudBusy(true);
 let uploaded=false;
 try{
  // Pull first; never upload against a stale server revision.
  const remote=await cloudPull();
  if(remote.revision!==meta.revision){cloudState.blocked=true;cloudStatus('CONFLITO entre dispositivos. Cópia local preservada; exporte um backup antes de resolver.',true);return}
  const snapshot=await readVault();
  const response=await cloudPush(meta.revision,snapshot);
  if(!response.applied){cloudState.blocked=true;cloudStatus('O servidor recusou uma gravação desatualizada; cópia local preservada.',true);return}
  uploaded=true;
  const latest=await readVault();
  const updated={...meta,revision:response.revision,dirty:latest.iv!==snapshot.iv};
  await cloudSaveMeta(updated);cloudState.localMeta=updated;
  cloudStatus(updated.dirty?'Alteração mais nova aguardando o próximo envio.':'Sincronizado: revisão '+response.revision+'.');
 }catch(err){cloudStatus('Sem conexão com a nuvem. Alterações locais preservadas e pendentes: '+err.message,true)}
 finally{cloudBusy(false)}
 const pending=await cloudReadMeta();
 if(uploaded&&cloudMetaMatches(pending)&&pending.dirty&&!cloudState.blocked)cloudSchedulePush();
}
const cloudOriginalSave=save;
save=async function(){
 cloudState.localWriteBusy=true;
 try{
  await cloudOriginalSave();
  // Always mark dirty even if the user is logged out or the network is unavailable.
  const m=await cloudReadMeta();
  if(m?.userId&&Number.isSafeInteger(m.revision)&&m.revision>0){
   const next={...m,dirty:true};
   await cloudSaveMeta(next);cloudState.localMeta=next;
   cloudStatus('Salvo localmente; aguardando sincronização na nuvem.');
  }
 }finally{cloudState.localWriteBusy=false}
 if(cloudState.session&&!cloudState.blocked)cloudSchedulePush();
};
async function cloudLogout(){
 try{if(cloudState.session)await cloudRequest('/auth/v1/logout',{method:'POST',authenticated:true})}catch{}
 cloudSaveSession(null);cloudState.blocked=false;cloudState.remote=null;
 cloudStatus('Conta da nuvem desconectada. Dados locais permanecem criptografados.');cloudShowRemote(null);
}
function cloudInit(){
 cloudState.deviceId=cloudDeviceId();
 $('#cloudLoginForm').onsubmit=cloudLogin;
 $('#cloudSignup').onclick=()=>cloudSignup();
 $('#cloudSignOut').onclick=()=>cloudLogout();
 $('#cloudRefresh').onclick=async()=>{try{await cloudRefresh()}catch(e){cloudStatus('Falha ao consultar nuvem: '+e.message,true)}};
 $('#cloudPublishAndroid').onclick=async()=>{try{await cloudPublishAndroid()}catch(e){cloudStatus(e.message,true)}};
 $('#cloudReceiveDesktop').onclick=async()=>{try{await cloudReceiveDesktop()}catch(e){cloudStatus(e.message,true)}};
 $('#cloudBackupLocal').onclick=()=>$('#exportBackup').click();
 const existing=cloudReadSession();
 if(existing){
  cloudSaveSession(existing);
  // Cloud sync is only possible after the local vault has been unlocked.
  cloudStatus('Sessão da nuvem recuperada. Desbloqueie o cofre e confira a revisão.');
 }
 cloudButtons();
 const existingCompleteUnlock=completeUnlock;
 completeUnlock=function(...args){
  const result=existingCompleteUnlock(...args);
  if(cloudState.session)cloudValidateUser().then(ok=>{if(ok)cloudRefresh()}).catch(e=>cloudStatus(e.message,true));
  return result;
 };
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&state&&cloudState.session)cloudRefresh().catch(e=>cloudStatus(e.message,true));
 });
 cloudState.poll=setInterval(()=>{
  if(!document.hidden&&state&&cloudState.session&&!cloudState.busy){
   cloudRefresh().catch(e=>cloudStatus(e.message,true));
  }
 },20000);
}
