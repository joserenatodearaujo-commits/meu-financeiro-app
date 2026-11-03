'use strict';
// V2.15: account linking once; thereafter transparent, encrypted, revision-checked synchronization.
// Financial plaintext never leaves this browser. Android is the ONLY allowed first publisher.
// All device data remain intact until an authenticated, decryptable official copy exists.
const AUTO_URL='https://cvrshlwutczmeyqotqbw.supabase.co';
const AUTO_KEY='sb_publishable_UOifhMzHXF1rDMQOJRpSKA_L6aXE--f';
const AUTO_SESSION='meufin-auth-session-v1';
const auto={session:null,meta:null,busy:false,blocked:false,unlocked:false,queue:Promise.resolve(),timer:null,
            error:'',status:'desconectado',running:false,ready:false,base:null,attempt:0};
const autoOnAndroid=()=>/Android/i.test(navigator.userAgent);
function autoSerial(work){const task=auto.queue.then(work,work);auto.queue=task.catch(()=>{});return task}
function autoLocal(field,op,value){
 return openDB().then(db=>new Promise((resolve,reject)=>{
  const tx=db.transaction('vault',op==='get'?'readonly':'readwrite'),st=tx.objectStore('vault');
  const req=op==='get'?st.get(field):op==='put'?st.put(value,field):st.delete(field);
  if(op==='get')req.onsuccess=()=>resolve(req.result);
  tx.oncomplete=()=>{if(op!=='get')resolve()};
  tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 }));
}
function autoAtomic(items){
 return openDB().then(db=>new Promise((resolve,reject)=>{
  const tx=db.transaction('vault','readwrite'),st=tx.objectStore('vault');
  for(const [key,value] of Object.entries(items))st.put(value,key);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 }));
}
function autoSessionSave(s){
 auto.session=s;
 try{if(s)localStorage.setItem(AUTO_SESSION,JSON.stringify(s));else localStorage.removeItem(AUTO_SESSION)}catch{}
}
function autoSessionRestore(){
 try{const s=JSON.parse(localStorage.getItem(AUTO_SESSION)||'null');
  if(s?.access_token&&s?.refresh_token&&s?.user?.id&&s?.expires_at)return s;
 }catch{}
 return null;
}
async function autoHttp(path,{method='GET',body,token}={}){
 const headers={'apikey':AUTO_KEY,'Content-Type':'application/json'};
 if(token)headers.Authorization='Bearer '+token;
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),16000);
 try{
  const res=await fetch(AUTO_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),
                                   signal:abort.signal,cache:'no-store'});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error_description||data.msg||data.message||data.error||'Erro HTTP '+res.status);
  return data;
 }finally{clearTimeout(timeout)}
}
async function autoToken(){
 let s=auto.session;if(!s)throw Error('Conta não vinculada.');
 if(Date.now()/1000<s.expires_at-80)return s.access_token;
 const response=await autoHttp('/auth/v1/token?grant_type=refresh_token',{
  method:'POST',body:{refresh_token:s.refresh_token}});
 if(response?.user?.id!==s.user.id||!response.access_token||!response.refresh_token)
  throw Error('Sessão inválida. Entre novamente.');
 s={...response,expires_at:Math.floor(Date.now()/1000)+(response.expires_in||3600)};
 autoSessionSave(s);return s.access_token;
}
async function autoRpc(name,params){
 return autoHttp('/rest/v1/rpc/'+name,{method:'POST',body:params,token:await autoToken()});
}
const autoPull=()=>autoRpc('finance_pull_vault',{});
async function autoPush(revision,envelope){
 if(envelope?.schema!=='meu-financeiro-encrypted-v1')throw Error('Cofre criptografado inválido.');
 return autoRpc('finance_push_vault',{p_expected_revision:revision,p_envelope:envelope,
  p_device:(()=>{let id=localStorage.getItem('meufin-device-id');if(!id){id=crypto.randomUUID();localStorage.setItem('meufin-device-id',id)}return id})()});
}
function autoVisible(status,detail='',warning=false){
 auto.status=status;auto.error=warning?detail:'';
 const indicator=$('#autoSyncIndicator'),notice=$('#autoSyncNotice');
 if(indicator){indicator.textContent=(status==='ok'?'● Sincronizado':status==='pending'?'● Pendente':status==='conflict'?'● Conflito':status==='offline'?'● Offline':'● Nuvem não vinculada');indicator.dataset.status=status;}
 if(notice){notice.textContent=detail;notice.classList.toggle('amountneg',warning)}
 if($('#autoConnectPanel')){
  // Only a one-time account authorization at the normal app entry; never a sync administration tab.
  $('#autoConnectPanel').hidden=!!auto.session&&!auto.error&&!auto.blocked;
 }
}
async function autoGetMeta(){auto.meta=await autoLocal('autoSyncMeta','get');return auto.meta}
function autoMetaCurrent(m=auto.meta){return !!(auto.session&&m?.userId===auto.session.user.id&&Number.isSafeInteger(m.revision)&&m.revision>0)}
function autoEqual(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function autoThreeWay(base,local,remote){
 // Identity-based, conflict-preserving three-way merge; unmodified data from either device is retained.
 const result={};const conflicts=[];
 const fields=new Set([...Object.keys(base||{}),...Object.keys(local||{}),...Object.keys(remote||{})]);
 for(const field of fields){
  const b=base?.[field],l=local?.[field],r=remote?.[field];
  if(Array.isArray(b)||Array.isArray(l)||Array.isArray(r)){
   if(!Array.isArray(b??[])||!Array.isArray(l??[])||!Array.isArray(r??[])){
    conflicts.push(field);continue;
   }
   const looksRecords=[...(b||[]),...(l||[]),...(r||[])].every(x=>x&&typeof x==='object'&&typeof x.id==='string');
   if(!looksRecords){
    if(autoEqual(l,b))result[field]=r??[];
    else if(autoEqual(r,b)||autoEqual(r,l))result[field]=l??[];
    else conflicts.push(field);
    continue;
   }
   const bm=new Map((b||[]).map(x=>[x.id,x])),lm=new Map((l||[]).map(x=>[x.id,x])),rm=new Map((r||[]).map(x=>[x.id,x]));
   const ids=new Set([...bm.keys(),...lm.keys(),...rm.keys()]);
   const merged=[];
   for(const id of ids){
    const prev=bm.get(id),loc=lm.get(id),srv=rm.get(id);
    const cl=!autoEqual(prev,loc),cr=!autoEqual(prev,srv);
    if(cl&&cr&&!autoEqual(loc,srv)){conflicts.push(field+':'+id);continue}
    const value=cl?loc:srv;
    if(value!==undefined)merged.push(value);
   }
   result[field]=merged;
  }else{
   if(autoEqual(l,b))result[field]=r;
   else if(autoEqual(r,b)||autoEqual(r,l))result[field]=l;
   else conflicts.push(field);
  }
 }
 return {result,conflicts};
}
async function autoSetLocalOfficial(remote,official,password){
 const v=remote.envelope;
 const original=await readVault();
 const db=await openDB();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('vault','readwrite'),st=tx.objectStore('vault');
  // One-time quarantine of pre-existing desktop tests; not merged into official records.
  st.put(original,'autoQuarantineVault');
  st.put(v,'main');st.put(v,'autoSyncBase');
  st.put({userId:auto.session.user.id,revision:remote.revision,dirty:false},'autoSyncMeta');
  st.delete('bioUnlock');
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
 state=ensureFinancialState(official);passphrase=password;salt=v.salt;auto.base=structuredClone(official);
 auto.meta={userId:auto.session.user.id,revision:remote.revision,dirty:false};
 await setBioStatus();
 renderAll();
 autoVisible('ok','Base oficial recebida. A base anterior foi preservada criptografada neste aparelho.');
}
async function autoReceive(remote){
 if(!remote?.envelope)throw Error('Cofre remoto não encontrado.');
 let password=passphrase,decoded;
 try{decoded=await decryptData(remote.envelope,password)}
 catch{
  const field=$('#autoOfficialPass');
  if(field&&!field.hidden&&field.value){password=field.value;decoded=await decryptData(remote.envelope,password)}
  else{
   if(field)field.hidden=false;
   autoVisible('pending','Informe uma única vez a senha do cofre oficial do Android para vincular este aparelho.',true);
   return false;
  }
 }
 if(!decoded?.accounts||!Array.isArray(decoded.transactions))throw Error('Cofre oficial inválido.');
 await autoSetLocalOfficial(remote,decoded,password);
 if($('#autoOfficialPass')){$('#autoOfficialPass').value='';$('#autoOfficialPass').hidden=true}
 return true;
}
async function autoBootstrap(remote){
 if(remote.revision)return false;
 if(!autoOnAndroid()){
  autoVisible('pending','Aguardando o Android publicar automaticamente a base oficial. Os testes do desktop não serão enviados.');
  return false;
 }
 if(!state?.transactions?.length){autoVisible('pending','O Android ainda não possui lançamentos para inicializar a base oficial.');return false}
 const envelope=await readVault();
 const result=await autoPush(0,envelope);
 if(!result.applied){autoVisible('pending','Outro aparelho iniciou a base. Verificando novamente.');return false}
 const meta={userId:auto.session.user.id,revision:result.revision,dirty:false};
 await autoAtomic({autoSyncMeta:meta,autoSyncBase:envelope});
 auto.meta=meta;auto.base=structuredClone(state);
 autoVisible('ok','Base real do Android protegida e sincronizada.');
 return true;
}
async function autoRefresh(){
 return autoSerial(async()=>{
 if(!state||!auto.session||auto.busy||auto.blocked||document.querySelector('#modalRoot form'))return;
 auto.busy=true;
 const inMemoryBefore=JSON.stringify(state);
 try{
  const r=await autoPull();
  if(JSON.stringify(state)!==inMemoryBefore){autoVisible('pending','Edição local em andamento; a atualização remota será conferida depois.');return}
  if(!Number.isSafeInteger(r?.revision)||r.revision<0)throw Error('Revisão inválida da nuvem.');
  const meta=await autoGetMeta();
  if(!r.revision){await autoBootstrap(r);return}
  if(meta?.userId&&meta.userId!==auto.session.user.id){
   auto.blocked=true;
   autoVisible('conflict','Este cofre está vinculado a outra conta. Nenhum dado será substituído ou enviado.',true);
   return;
  }
  if(!autoMetaCurrent(meta)){
   if(autoOnAndroid()&&state.transactions.length){
    auto.blocked=true;
    autoVisible('conflict','Este Android possui registros locais ainda não vinculados, mas a conta já tem uma base oficial. Ambas as cópias foram preservadas para conferência.',true);
    return;
   }
   await autoReceive(r);return;
  }
  if(meta.revision>r.revision)throw Error('Revisão local maior que a revisão remota; acesso bloqueado.');
  if(meta.revision===r.revision){
   if(meta.dirty)await autoUpload(meta,r);
   else autoVisible('ok','Revisão '+r.revision+' confirmada no servidor.');
   return;
  }
  const latest=await decryptData(r.envelope,passphrase);
  if(JSON.stringify(state)!==inMemoryBefore){autoVisible('pending','Nova edição local detectada; a atualização remota será conferida depois.');return}
  const baseEnvelope=await autoLocal('autoSyncBase','get');
  if(!baseEnvelope)throw Error('Base de comparação criptografada ausente; sincronização bloqueada.');
  const baseline=await decryptData(baseEnvelope,passphrase);
  if(JSON.stringify(state)!==inMemoryBefore){autoVisible('pending','Nova edição local detectada; nenhuma versão foi substituída.');return}
  if(meta.dirty){
   const merged=autoThreeWay(baseline,state,latest);
   if(merged.conflicts.length){
    await autoLocal('autoSyncConflict','put',{base:baseEnvelope,server:r.envelope,
      local:await readVault(),fields:merged.conflicts,revision:r.revision});
    auto.blocked=true;autoVisible('conflict','Alterações simultâneas em '+merged.conflicts.length+
      ' registro(s). Dados preservados; resolução necessária antes de sobrescrever.',true);
    return;
   }
   // rebase local mutations on newer remote revision, then upload merged encrypted data.
   const newEnvelope=await encryptData(merged.result,passphrase,r.envelope.salt);
   await autoAtomic({main:newEnvelope,autoSyncBase:r.envelope,
    autoSyncMeta:{userId:auto.session.user.id,revision:r.revision,dirty:true}});
   state=ensureFinancialState(merged.result);auto.meta={userId:auto.session.user.id,revision:r.revision,dirty:true};
   renderAll();
   await autoUpload(auto.meta,r);
  }else{
   const snapshot=await readVault();
   await autoAtomic({main:r.envelope,autoSyncBase:r.envelope,
    autoSyncMeta:{userId:auto.session.user.id,revision:r.revision,dirty:false}});
   state=ensureFinancialState(latest);auto.base=structuredClone(latest);
   auto.meta={userId:auto.session.user.id,revision:r.revision,dirty:false};
   renderAll();autoVisible('ok','Atualizado automaticamente: revisão '+r.revision+'.');
  }
 }catch(e){autoVisible('offline','Atualização pendente: '+e.message,true)}
 finally{auto.busy=false}
 });
}
async function autoUpload(meta,remote){
 if(!autoMetaCurrent(meta)||meta.revision!==remote.revision)return;
 const snapshot=await readVault();
 const response=await autoPush(meta.revision,snapshot);
 if(!response.applied){
  autoVisible('pending','O servidor recebeu outra atualização. Conferindo as alterações antes de combinar.');
  return;
 }
 const current=await readVault();
 const dirty=current.iv!==snapshot.iv;
 const next={userId:auto.session.user.id,revision:response.revision,dirty};
 await autoAtomic({autoSyncMeta:next,autoSyncBase:snapshot});
 auto.meta=next;auto.base=structuredClone(await decryptData(snapshot,passphrase));
 autoVisible(dirty?'pending':'ok',dirty?'Nova alteração local pendente.':'Revisão '+response.revision+' sincronizada.');
}
const autoOriginalSave=save;
save=async function(){
 return autoSerial(async()=>{
  const encrypted=await encryptData(state,passphrase,salt);
  const meta=await autoLocal('autoSyncMeta','get');
  if(meta?.userId&&meta?.revision>0){
   await autoAtomic({main:encrypted,autoSyncMeta:{...meta,dirty:true}});
   auto.meta={...meta,dirty:true};
   autoVisible('pending','Dados salvos localmente. Sincronização automática em andamento.');
   if(auto.session)queueMicrotask(()=>autoRefresh());
  }else await writeVault(encrypted);
 });
};
// Google OAuth (PKCE). The verifier never leaves this device until the code exchange.
const AUTO_GOOGLE_VERIFIER='meufin-google-pkce-verifier-v1';
const AUTO_GOOGLE_STARTED='meufin-google-pkce-started-v1';
function autoBase64Url(data){
 return btoa(String.fromCharCode(...data)).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
}
function autoOAuthRedirect(){
 // Keep the existing GitHub Pages origin/path so IndexedDB remains unchanged.
 return location.origin+location.pathname;
}
async function autoGoogleStart(){
 if(!globalThis.crypto?.subtle||!globalThis.isSecureContext)throw Error('O acesso Google requer HTTPS.');
 if(!navigator.onLine)throw Error('Conecte-se à internet para vincular sua conta Google.');
 const verifier=autoBase64Url(crypto.getRandomValues(new Uint8Array(48)));
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
 const challenge=autoBase64Url(new Uint8Array(hash));
 sessionStorage.setItem(AUTO_GOOGLE_VERIFIER,verifier);
 sessionStorage.setItem(AUTO_GOOGLE_STARTED,String(Date.now()));
 const query=new URLSearchParams({provider:'google',redirect_to:autoOAuthRedirect(),
  code_challenge:challenge,code_challenge_method:'s256'});
 location.assign(AUTO_URL+'/auth/v1/authorize?'+query.toString());
}
async function autoGoogleComplete(){
 const query=new URLSearchParams(location.search);
 // Only handle OAuth callbacks started by this exact browser session.
 const verifier=sessionStorage.getItem(AUTO_GOOGLE_VERIFIER);
 if(!verifier)return;
 const started=Number(sessionStorage.getItem(AUTO_GOOGLE_STARTED));
 const code=query.get('code'),authError=query.get('error');
 const clear=()=>{
  sessionStorage.removeItem(AUTO_GOOGLE_VERIFIER);
  sessionStorage.removeItem(AUTO_GOOGLE_STARTED);
  query.delete('code');query.delete('error');query.delete('error_description');
  const qs=query.toString();
  history.replaceState(null,'',location.pathname+(qs?'?'+qs:'')+location.hash);
 };
 if(!code&&!authError)return;
 try{
  if(!started||Date.now()-started>10*60*1000)throw Error('Login expirado. Inicie novamente.');
  if(authError)throw Error('Google não autorizou a entrada: '+(query.get('error_description')||authError));
  const response=await autoHttp('/auth/v1/token?grant_type=pkce',{
    method:'POST',body:{auth_code:code,code_verifier:verifier}});
  if(!response?.access_token||!response?.refresh_token||!response?.user?.id)
    throw Error('O Google não retornou uma sessão válida do Supabase.');
  // An existing device must NEVER silently switch to a different cloud user.
  const existing=await autoLocal('autoSyncMeta','get');
  if(existing?.userId&&existing.userId!==response.user.id)
    throw Error('Esta conta Google é diferente da conta já vinculada neste aparelho. O cofre local foi preservado; entre com a conta original.');
  if(auto.session?.user?.id&&auto.session.user.id!==response.user.id)
    throw Error('Outra conta já estava ativa. Nenhum cofre foi substituído.');
  autoSessionSave({...response,expires_at:Math.floor(Date.now()/1000)+(response.expires_in||3600)});
  autoVisible('pending','Conta Google autenticada. Desbloqueie o cofre para sincronizar.');
  if(auto.unlocked)await autoRefresh();
 }catch(e){
  autoVisible('offline','Não foi possível entrar com Google: '+e.message,true);
  const error=$('#authError');if(error)error.textContent='Login Google: '+e.message;
 }finally{clear()}
}
async function autoSignIn(mode){
 const email=$('#autoEmail').value.trim(),password=$('#autoPassword').value;
 if(!email||password.length<12)throw Error('Informe e-mail e senha de conta com pelo menos 12 caracteres.');
 const path=mode==='signup'?'/auth/v1/signup':'/auth/v1/token?grant_type=password';
 const res=await autoHttp(path,{method:'POST',body:{email,password}});
 $('#autoPassword').value='';
 if(!res.access_token||!res.refresh_token||!res.user?.id){
  autoVisible('pending','Confira seu e-mail para confirmar o cadastro. Depois faça login.');
  return;
 }
 autoSessionSave({...res,expires_at:Math.floor(Date.now()/1000)+(res.expires_in||3600)});
 $('#autoConnectPanel').hidden=true;
 await autoRefresh();
}
function autoInit(){
 const panel=$('#autoConnectPanel'),form=$('#autoConnectForm');
 $('#autoGoogleLogin').onclick=()=>autoGoogleStart().catch(err=>autoVisible('offline',err.message,true));
 autoGoogleComplete().catch(err=>autoVisible('offline',err.message,true));
 form.onsubmit=e=>{e.preventDefault();autoSignIn('login').catch(err=>autoVisible('offline',err.message,true))};
 $('#autoSignUp').onclick=()=>autoSignIn('signup').catch(err=>autoVisible('offline',err.message,true));
 $('#autoOfficialPass').onchange=()=>autoRefresh();
 autoSessionSave(autoSessionRestore());
 const previousUnlock=completeUnlock;
 completeUnlock=function(...args){
  const result=previousUnlock(...args);
  auto.unlocked=true;
  autoRefresh().catch(e=>autoVisible('offline',e.message,true));
  if(!auto.session){panel.hidden=false;autoVisible('unlinked','Vincule sua conta uma vez para manter Android e desktop atualizados.');}
  return result;
 };
 // Pull on focus and periodic reconnect; polling does not require manual interaction.
 window.addEventListener('online',()=>autoRefresh());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)autoRefresh()});
 auto.timer=setInterval(()=>{if(auto.unlocked&&!document.hidden)autoRefresh()},12000);
}
