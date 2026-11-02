'use strict';
/* Regression: purchase/competence and income/investment rules remain compatible.
 * Cash behavior for cards intentionally changes: only confirmed invoice payments debit the account. */
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const oldCode=fs.readFileSync(path.join(root,'tests/fixtures/v26_ledger.js'),'utf8');
const newCode=fs.readFileSync(path.join(root,'js/finance/ledger.js'),'utf8');
const shared={
 monthKey:d=>String(d||'').slice(0,7),
 addMonths:(m,n)=>{const [y,mo]=m.split('-').map(Number);const d=new Date(y,mo-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');},
 dateInMonth:(m,day)=>{const [y,mo]=m.split('-').map(Number),last=new Date(y,mo,0).getDate();return m+'-'+String(Math.min(Math.max(+day||1,1),last)).padStart(2,'0');}
};
function context(source,transactions){const c=vm.createContext({...shared,state:{transactions,accounts:[],transfers:[],invoicePayments:[]}});vm.runInContext(source,c);return c}
const t=[
 {id:'p1',type:'expense',amount:100.01,cardId:'c1',installments:6,firstDue:'2026-03-15',paymentDate:'2026-03-15',purchaseDate:'2026-02-27'},
 {id:'p2',type:'expense',amount:250,cardId:'c1',installments:2,firstDue:'2026-04-15',paymentDate:'2026-04-15',purchaseDate:'2026-03-03'},
 {id:'f1',type:'expense',amount:30.25,recurring:true,purchaseDate:'2026-01-01',paymentDate:'2026-01-31',recurringEnd:'2026-10-31'},
 {id:'e1',type:'expense',amount:12.75,cardId:'',purchaseDate:'2026-04-01',paymentDate:'2026-05-02'},
 {id:'i1',type:'income',amount:500,recurring:true,purchaseDate:'2026-01-10',paymentDate:'2026-01-10'},
 {id:'i2',type:'income',amount:25,paymentDate:'2026-04-10'},
 {id:'a1',type:'investment',amount:75,paymentDate:'2026-06-20',operation:'aporte'}
];
for(let i=0;i<80;i++){const m=shared.addMonths('2026-01',i%12);t.push({id:'gen'+i,type:'expense',amount:Math.round((i*71.31+0.07)*100)/100,cardId:i%2?'c1':'',installments:i%2?1+(i%12):1,firstDue:m+'-15',paymentDate:m+'-15',purchaseDate:m+'-03',recurring:i%7===0,recurringEnd:'2027-09-30'})}
const old=context(oldCode,t),newer=context(newCode,t),stable=x=>JSON.parse(JSON.stringify(x));let count=0;
for(let i=0;i<30;i++){
 const m=shared.addMonths('2026-01',i);
 for(const expr of [
  'txExpenses('+JSON.stringify(m)+',"competence")',
  'txIncome('+JSON.stringify(m)+')',
  'txInvest('+JSON.stringify(m)+')'
 ]){
  assert.deepEqual(stable(vm.runInContext(expr,newer)),stable(vm.runInContext(expr,old)),expr);count++;
 }
}
for(const x of t.filter(x=>x.cardId)){
 const expr='installments(state.transactions.find(x=>x.id==='+JSON.stringify(x.id)+'))';
 assert.deepEqual(stable(vm.runInContext(expr,newer)),stable(vm.runInContext(expr,old)),expr);count++;
}
assert.equal(vm.runInContext('Object.isFrozen(FinanceRules)',newer),true);
console.log('PASS '+count+' compatibility regressions (competence, income, investment, installments)');
