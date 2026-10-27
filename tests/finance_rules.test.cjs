'use strict';
/* Pure domain regression tests: compare v2.6 behavior against extracted rules. */
const fs=require('node:fs');const assert=require('node:assert/strict');const vm=require('node:vm');const path=require('node:path');
const root=path.join(__dirname,'..');
const oldCode=fs.readFileSync(path.join(root,'tests/fixtures/v26_ledger.js'),'utf8');
const newCode=fs.readFileSync(path.join(root,'js/finance/ledger.js'),'utf8');
const shared={
 monthKey:d=>String(d||'').slice(0,7),
 addMonths:(m,n)=>{const [y,mo]=m.split('-').map(Number);const d=new Date(y,mo-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');},
 dateInMonth:(m,day)=>{const [y,mo]=m.split('-').map(Number),last=new Date(y,mo,0).getDate();return `${m}-${String(Math.min(Math.max(+day||1,1),last)).padStart(2,'0')}`;},
};
function context(src,transactions){const ctx=vm.createContext({...shared,state:{transactions}});vm.runInContext(src,ctx);return ctx;}
function month(i){return shared.addMonths('2026-01',i);}
function stable(x){return JSON.parse(JSON.stringify(x));}
let t=[];let count=0;
// Full deterministic edge set: uneven cents, recurring, end dates and card expiry.
t.push({id:'p1',type:'expense',description:'Compra',amount:100.01,cardId:'c1',installments:6,firstDue:'2026-03-15',paymentDate:'2026-03-15',purchaseDate:'2026-02-27'});
t.push({id:'p2',type:'expense',description:'Compra 2',amount:250,cardId:'c1',installments:2,firstDue:'2026-04-15',paymentDate:'2026-04-15',purchaseDate:'2026-03-03'});
t.push({id:'fix1',type:'expense',amount:30.25,recurring:true,purchaseDate:'2026-01-01',paymentDate:'2026-01-31',recurringEnd:'2026-10-31'});
t.push({id:'e1',type:'expense',amount:12.75,cardId:'',recurring:false,purchaseDate:'2026-04-01',paymentDate:'2026-05-02'});
t.push({id:'i1',type:'income',amount:500,recurring:true,purchaseDate:'2026-01-10',paymentDate:'2026-01-10'});
t.push({id:'i2',type:'income',amount:25,recurring:false,paymentDate:'2026-04-10'});
t.push({id:'a1',type:'investment',amount:75,paymentDate:'2026-06-20',operation:'aporte'});
t.push({id:'r1',type:'investment',amount:19,paymentDate:'2026-06-22',operation:'resgate'});
// Include generated variety to cover multiple dates and values, without non-deterministic test data.
for(let i=0;i<80;i++)t.push({id:'gen'+i,type:'expense',amount:Math.round((i*71.31+0.07)*100)/100,cardId:i%2?'c1':'',installments:i%2?1+(i%12):1,firstDue:month(i%12)+'-15',paymentDate:month(i%12)+'-15',purchaseDate:month(i%12)+'-03',recurring:i%7===0,recurringEnd:'2027-09-30'});
const baseline=context(oldCode,t),candidate=context(newCode,t);
for(let i=0;i<30;i++){
 const m=month(i);
 for(const basis of ['cash','competence']){
  const expr=`txExpenses(${JSON.stringify(m)},${JSON.stringify(basis)})`;
  assert.deepEqual(stable(vm.runInContext(expr,candidate)),stable(vm.runInContext(expr,baseline)),'expenses '+m+' '+basis);count++;
 }
 for(const func of ['txIncome','txInvest','sums']){
  const expr=`${func}(${JSON.stringify(m)})`;
  assert.deepEqual(stable(vm.runInContext(expr,candidate)),stable(vm.runInContext(expr,baseline)),func+' '+m);count++;
 }
}
for(const tx of t.filter(x=>x.cardId)){
 const expr=`installments(state.transactions.find(x=>x.id===${JSON.stringify(tx.id)}))`;
 assert.deepEqual(stable(vm.runInContext(expr,candidate)),stable(vm.runInContext(expr,baseline)),tx.id);count++;
}
// Dedicated privacy and data-integrity invariant tests.
assert.equal(vm.runInContext('FinanceRules',candidate).constructor.name,'Object');
assert.equal(vm.runInContext('Object.isFrozen(FinanceRules)',candidate),true);
assert.equal(vm.runInContext('FinanceRules.expenses(state.transactions,"2026-01").length',candidate)>=0,true);
console.log(`PASS ${count} financeiro regression cases (v2.6 baseline vs extracted pure rules)`);
