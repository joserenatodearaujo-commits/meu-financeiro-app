'use strict';
/* Test real PBKDF2/AES-GCM behavior using Node WebCrypto. No test personal data. */
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const ctx=vm.createContext({
  crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,
  atob,btoa,window:{},indexedDB:{},
  document:{},location:{origin:'https://example.test'}
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js/core/vault.js'),'utf8'),ctx);
const payload={accounts:[],transactions:[{id:'TEST_ONLY',amount:123.45,description:'Teste fictício'}],goals:[]};
(async()=>{
 const salt=btoa(String.fromCharCode(...webcrypto.getRandomValues(new Uint8Array(16))));
 const data=await vm.runInContext('encryptData',ctx)(payload,'Senha-de-teste-2026!!',salt);
 assert.equal(data.schema,'meu-financeiro-encrypted-v1');
 assert.equal(data.salt,salt);
 assert(!JSON.stringify(data).includes('Teste fictício'));
 const restored=await vm.runInContext('decryptData',ctx)(data,'Senha-de-teste-2026!!');
 assert.deepEqual(JSON.parse(JSON.stringify(restored)),payload);
 await assert.rejects(vm.runInContext('decryptData',ctx)(data,'Senha-incorreta-2026!'));
 assert.equal(vm.runInContext('DB',ctx),'meu-financeiro-v1');
 console.log('PASS AES-GCM + PBKDF2 roundtrip, failure on wrong password, legacy vault schema');
})().catch(e=>{console.error(e);process.exitCode=1});
