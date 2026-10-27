'use strict';
// Meu Financeiro • Optional WebAuthn PRF and fallback with existing password.
// Biometria local: a PRF do autenticador protege a senha do cofre com AES-GCM.
// Não há senha legível armazenada e a impressão digital nunca é acessada pelo site.
const BIO_KEY='bioUnlock',BIO_AAD=new TextEncoder().encode('meu-financeiro/biometria/v1/'+location.origin);
const randomBytes=n=>crypto.getRandomValues(new Uint8Array(n));
const b64url=raw=>b64(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const bioMessage=err=>err?.name==='NotAllowedError'?'Autenticação cancelada ou não autorizada no aparelho. Você pode usar sua senha.':err?.name==='NotSupportedError'?'Este Android/navegador não oferece uma passkey com chave PRF necessária para desbloquear o cofre. Continue usando sua senha.':err?.message||'Não foi possível utilizar a biometria. Use sua senha.';
function localVaultField(key,verb,value){return openDB().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction('vault',verb==='get'?'readonly':'readwrite'),store=tx.objectStore('vault'),request=verb==='get'?store.get(key):verb==='put'?store.put(value,key):store.delete(key);request.onsuccess=()=>{if(verb==='get')resolve(request.result)};tx.oncomplete=()=>{if(verb!=='get')resolve()};tx.onerror=()=>reject(tx.error)}))}
const readBio=()=>localVaultField(BIO_KEY,'get'),writeBio=x=>localVaultField(BIO_KEY,'put',x),deleteBio=()=>localVaultField(BIO_KEY,'delete');
async function biometricAvailable(){if(!isSecureContext||!globalThis.PublicKeyCredential||!navigator.credentials?.create||!navigator.credentials?.get)return false;try{if(PublicKeyCredential.getClientCapabilities){const c=await PublicKeyCredential.getClientCapabilities();if(c['extension:prf']===false)return false}if(PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable){return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()}return true}catch{return false}}
async function askBioPrf(credId,prfSalt){const assertion=await navigator.credentials.get({publicKey:{challenge:randomBytes(32),timeout:60000,allowCredentials:[{type:'public-key',id:bytes(credId),transports:['internal','hybrid']}],userVerification:'required',extensions:{prf:{eval:{first:bytes(prfSalt)}}}}});
 if(!assertion||b64(assertion.rawId)!==credId)throw Error('A credencial do Android não corresponde à credencial cadastrada.');
 const output=assertion.getClientExtensionResults?.().prf?.results?.first;
 if(!output||new Uint8Array(output).byteLength!==32)throw new DOMException('PRF indisponível para desbloqueio.','NotSupportedError');return new Uint8Array(output)}
async function bioAesKey(prf){if(new Uint8Array(prf).byteLength!==32)throw Error('Chave biométrica inválida.');return crypto.subtle.importKey('raw',prf,{name:'AES-GCM'},false,['encrypt','decrypt'])}
async function setBioStatus(){try{const config=await readBio(),available=await biometricAvailable();
 const canEnable=!!state&&!!passphrase&&available,has=!!config;
 const status=$('#bioSettingsStatus');if(status)status.textContent=has?'Biometria ativada para este navegador. A senha original continua funcionando.':available?'Disponível neste dispositivo. Ative para abrir o cofre sem digitar a senha.':'Indisponível neste navegador ou aparelho. A senha permanece como acesso seguro.';
 const yes=$('#enableBiometric'),no=$('#disableBiometric');if(yes)yes.disabled=!canEnable||has;if(no)no.disabled=!has;
 const login=$('#bioUnlockBtn'),hint=$('#bioLoginHint');if(login)login.classList.toggle('hide',!has);if(hint)hint.classList.toggle('hide',!has);
 }catch(err){if($('#bioSettingsStatus'))$('#bioSettingsStatus').textContent='Não foi possível consultar a biometria. Use a senha.'}}
async function enableBio(){const status=$('#bioSettingsStatus'),button=$('#enableBiometric');try{
 if(!state||!passphrase)throw Error('Primeiro desbloqueie o cofre com a senha.');
 if(!await biometricAvailable())throw new DOMException('Extensão PRF indisponível.','NotSupportedError');
 if(await readBio())throw Error('A biometria já está ativada neste navegador.');
 button.disabled=true;status.textContent='Solicitando autorização ao Android...';
 const saltPrf=randomBytes(32),credential=await navigator.credentials.create({publicKey:{challenge:randomBytes(32),rp:{name:'Meu Financeiro'},user:{id:randomBytes(32),name:'cofre-financeiro',displayName:'Cofre Meu Financeiro'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],timeout:60000,authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'},attestation:'none',extensions:{prf:{eval:{first:saltPrf}}}}});
 if(!credential?.rawId)throw Error('Não foi criada uma credencial.');
 const id=b64(credential.rawId),saltText=b64(saltPrf),prfOut=credential.getClientExtensionResults?.().prf?.results?.first;
 const result=prfOut&&new Uint8Array(prfOut).byteLength===32?new Uint8Array(prfOut):await askBioPrf(id,saltText);
 const k=await bioAesKey(result),iv=randomBytes(12),secret=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:BIO_AAD},k,new TextEncoder().encode(passphrase));
 await writeBio({schema:'meu-financeiro-biometria-v1',credId:id,prfSalt:saltText,iv:b64(iv),secret:b64(secret),origin:location.origin,createdAt:new Date().toISOString()});
 // round-trip valida o registro sem acessar a senha em texto no armazenamento
 if(!(await readBio())?.secret)throw Error('Falha ao confirmar ativação.');
 status.textContent='Biometria ativada neste navegador. Use-a na próxima abertura do cofre.';
 }catch(err){const message=bioMessage(err);await setBioStatus();status.textContent=message;return}finally{await setBioStatus()}}
async function unlockBio(){const btn=$('#bioUnlockBtn');btn.disabled=true;$('#authError').textContent='Solicitando biometria ou bloqueio do Android...';try{
 const record=await readBio(),vault=await readVault();if(!record||record.schema!=='meu-financeiro-biometria-v1'||record.origin!==location.origin||!vault)throw Error('Configuração biométrica ausente ou incompatível. Entre com sua senha.');
 const prf=await askBioPrf(record.credId,record.prfSalt),key=await bioAesKey(prf);
 const recovered=new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(record.iv),additionalData:BIO_AAD},key,bytes(record.secret)));
 const financial=await decryptData(vault,recovered);if(!financial||!Array.isArray(financial.transactions))throw Error('O cofre não pôde ser validado.');
 completeUnlock(financial,recovered,vault.salt);
 }catch(err){$('#authError').textContent=bioMessage(err)+' A senha continua disponível.'}finally{btn.disabled=false}}
async function disableBio(){if(!state)return;const ok=confirm('Desativar o desbloqueio biométrico neste navegador? A sua senha continuará funcionando.');if(!ok)return;try{await deleteBio();await setBioStatus();$('#bioSettingsStatus').textContent='Biometria desativada neste navegador. A passkey do Android pode permanecer no gerenciador do dispositivo.'}catch(err){$('#bioSettingsStatus').textContent='Erro ao desativar: '+bioMessage(err)}}
function completeUnlock(financial,pass,secureSalt){state=financial;passphrase=pass;salt=secureSalt;$('#pass').value='';$('#passConfirm').value='';$('#authError').textContent='';$('#auth').classList.add('hide');$('#app').classList.remove('hide');renderAll();setBioStatus()}
$('#bioUnlockBtn').addEventListener('click',unlockBio);
$('#enableBiometric').addEventListener('click',enableBio);
$('#disableBiometric').addEventListener('click',disableBio);
