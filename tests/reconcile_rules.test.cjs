'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),ctx=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'js/import/parser.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/import/reconcile.js'),'utf8'),ctx);
const R=vm.runInContext('ReconcileRules',ctx);let count=0;
const eq=(a,b,label)=>{assert.equal(a,b,label);count++};
const ok=(a,label)=>{assert(a,label);count++};
const files=[
 {source:'inter-bank',name:'inter.csv',status:'ok',unreadable:[],issues:[],rows:[
  {date:'2026-10-05',description:'PIX TRANSFERENCIA',amountCents:-50000,reference:'Linha 1'},
  {date:'2026-10-08',description:'SAQUE ATM',amountCents:-10000,reference:'Linha 2'},
  {date:'2026-10-10',description:'PAGAMENTO FATURA SANTANDER',amountCents:-30000,reference:'Linha 3'},
  {date:'2026-10-11',description:'MERCADO CENTRAL',amountCents:-2500,reference:'Linha 4'},
 ]},
 {source:'itau-bank',name:'itau.txt',status:'ok',unreadable:[],issues:[],rows:[
  {date:'2026-10-06',description:'PIX RECEBIDO',amountCents:50000,reference:'Linha 1'},
  {date:'2026-10-09',description:'PIX RECEBIDO',amountCents:1000,reference:'Linha 2'},
 ]},
 {source:'santander-card',name:'santander-out.pdf',status:'ok',unreadable:[],issues:[],rows:[
  {date:'2026-10-07',description:'LIVRARIA',amountCents:30000,reference:'P 1'}
 ]},
 {source:'santander-card',name:'santander-overlap.pdf',status:'ok',unreadable:[],issues:[],rows:[
  {date:'2026-10-07',description:'LIVRARIA',amountCents:30000,reference:'P 2'}
 ]}
];
const rv=R.review(files,{transactions:[]});
eq(rv.length,8,'all recognized records kept');
eq(rv.find(x=>x.id==='0:0').status,'transfer','inter transfer candidate');
eq(rv.find(x=>x.id==='1:0').status,'transfer','itau transfer candidate');
eq(rv.find(x=>x.id==='0:1').status,'cash','cash withdrawals are not expenses');
eq(rv.find(x=>x.id==='0:2').status,'invoice','invoice payment candidate not expense');
eq(rv.find(x=>x.id==='1:1').status,'pix','Pix receipt ambiguous');
eq(rv.find(x=>x.id==='2:0').status,'duplicate','card statement overlap duplicate warning');
eq(rv.find(x=>x.id==='3:0').status,'duplicate','other copy warned');
eq(rv.find(x=>x.id==='0:3').category.micro,'Supermercado','market category suggested');
const sm=R.monthly(files,{transactions:[]});
eq(sm.length,3,'one month x three sources');
const bi=sm.find(x=>x.source==='inter-bank');
eq(bi.count,4,'bank row count');
eq(bi.negative,92500,'bank negative total');
eq(bi.net,-92500,'bank net');
const check=R.checkBankMonth(bi,100000,7500,true,0);
ok(check.ok,'exact bank movement reconciliation');
eq(check.difference,0,'zero bank difference');
ok(!R.checkBankMonth(bi,100000,7501,true,0).ok,'one-cent mismatch blocked');
ok(!R.checkBankMonth(bi,100000,7500,false,0).ok,'partial coverage blocked');
ok(!R.checkBankMonth(bi,100000,7500,true,1).ok,'ambiguous duplicate blocked');
const bad={...bi,unreadable:1};
ok(!R.checkBankMonth(bad,100000,7500,true,0).ok,'incomplete extraction blocks closing');
const many=[
 {source:'inter-bank',name:'a.csv',status:'ok',unreadable:[],issues:[],rows:[{date:'2026-10-01',description:'TRF',amountCents:-1000}]},
 {source:'itau-bank',name:'b.txt',status:'ok',unreadable:[],issues:[],rows:[{date:'2026-10-01',description:'TRF',amountCents:1000},{date:'2026-10-01',description:'TRF',amountCents:1000}]},
];
eq(R.review(many,{transactions:[]}).find(x=>x.source==='inter-bank').status,'review','ambiguous 1:N transfer never auto paired');
const existing=R.review([{source:'inter-bank',name:'a',status:'ok',unreadable:[],issues:[],rows:[
 {date:'2026-10-11',amountCents:-2500,description:'Mercado Central'}
]}],{transactions:[{type:'expense',description:'Mercado Central',amount:25,purchaseDate:'2026-10-11'}]});
eq(existing[0].status,'existing','existing transaction flagged');
ok(!fs.readFileSync(path.join(root,'js/import/reconcile.js'),'utf8').includes('fetch('),'pure reconciliation never sends data');
console.log('PASS '+count+' reconciliação: transferência 1:1, fatura, espécie, repetição, saldo e histórico');
