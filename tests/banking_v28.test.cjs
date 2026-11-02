'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const ctx=vm.createContext({
 monthKey:d=>String(d||'').slice(0,7),
 addMonths:(m,n)=>{const [y,mo]=m.split('-').map(Number);const d=new Date(y,mo-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');},
 dateInMonth:(m,day)=>{const [y,mo]=m.split('-').map(Number),last=new Date(y,mo,0).getDate();return m+'-'+String(Math.min(Math.max(+day||1,1),last)).padStart(2,'0');}
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js/finance/ledger.js'),'utf8'),ctx);
const R=vm.runInContext('FinanceRules',ctx),statement=vm.runInContext('accountStatementEntries',ctx);let n=0;
function check(a,b,label){assert.deepEqual(a,b,label);n++}
const state={
 accounts:[{id:'bank',type:'bank',name:'Banco',openingBalance:1000,openingDate:'2026-11-01'},{id:'wallet',type:'cash',name:'Carteira',openingBalance:100,openingDate:'2026-11-01'},{id:'card',type:'card',name:'Cartão'}],
 transactions:[{id:'super',type:'expense',cardId:'card',amount:600,description:'Supermercado',macro:'Alimentação',micro:'Supermercado',installments:3,purchaseDate:'2026-11-08',firstDue:'2026-12-10'},{id:'gas',type:'expense',cardId:'',accountId:'wallet',amount:15,description:'Combustível',macro:'Transporte',micro:'Combustível',purchaseDate:'2026-11-13',paymentDate:'2026-11-13'}],
 transfers:[{id:'t1',fromAccountId:'bank',toAccountId:'wallet',date:'2026-11-10',amount:50}],
 invoicePayments:[]
};
check(R.invoices(state).length,3,'faturas de três meses');
check(R.expenses(state.transactions,'2026-11','competence').reduce((a,t)=>a+t.amount,0),615,'compras por competência');
check(R.cashExpenses(state,'2026-11').reduce((a,t)=>a+t.amount,0),15,'sem débito bancário antes da fatura');
check(R.accountBalance(state,'wallet','2026-11-30'),135,'saldo carteira');
check(R.accountBalance(state,'bank','2026-11-30'),950,'transferência não gera despesa');
check(R.invoice(state,'card','2026-12').total,200,'fatura dezembro');
check(R.commitments(state,'2027-01').reduce((a,t)=>a+t.amount,0),200,'parcela futura');
state.invoicePayments.push({id:'pay1',cardId:'card',month:'2026-12',amount:125,date:'2026-12-11',accountId:'bank'});
check(R.invoice(state,'card','2026-12').outstanding,75,'pagamento parcial');
check(R.invoice(state,'card','2026-12').status,'partial','situação parcial');
check(R.cashExpenses(state,'2026-12')[0].macro,'Alimentação','categoria preservada');
check(R.cashExpenses(state,'2026-12').reduce((a,t)=>a+t.amount,0),125,'somente pagamento efetivo');
check(R.accountBalance(state,'bank','2026-12-31'),825,'débito real no banco');
check(R.commitments(state,'2026-12').reduce((a,t)=>a+t.amount,0),75,'compromisso não pago');
state.invoicePayments.push({id:'pay2',cardId:'card',month:'2026-12',amount:75,date:'2026-12-20',accountId:'bank'});
check(R.invoice(state,'card','2026-12').status,'paid','fatura quitada');
check(R.accountBalance(state,'bank','2026-12-31'),750,'saldo bancário');
check(R.commitments(state,'2026-12').length,0,'não projeta pagamento já feito');
check(R.expenses(state.transactions,'2026-12','competence').length,0,'não repete compra após o mês original');
check(statement(state).filter(x=>x.kind==='transfer').reduce((a,t)=>a+t.amount,0),0,'transferência interna neutra');
check(statement(state).filter(x=>x.kind==='invoice-payment').length,2,'extrato registra quitações');
check(R.accountBalance(state,'wallet','2026-10-31'),null,'sem saldo histórico antes da abertura');
const cents={...state,invoicePayments:[],transactions:[{id:'cents',type:'expense',cardId:'card',amount:100.01,purchaseDate:'2026-11-01',firstDue:'2026-12-10',installments:3}]};
check(R.invoices(cents).map(i=>i.total).join(','),'33.34,33.34,33.33','precisão de centavos');
const mixed={...state,invoicePayments:[{id:'m',cardId:'card',month:'2026-12',amount:50,date:'2026-12-10',accountId:'bank'}],transactions:[{id:'food',type:'expense',cardId:'card',amount:60,purchaseDate:'2026-11-01',firstDue:'2026-12-10',installments:1,macro:'Alimentação'},{id:'fuel',type:'expense',cardId:'card',amount:40,purchaseDate:'2026-11-01',firstDue:'2026-12-10',installments:1,macro:'Transporte'}]};
check(R.cashExpenses(mixed,'2026-12').map(x=>x.amount).join(','),'30,20','proporção entre categorias');
check(R.invoice(mixed,'card','2026-12').outstanding,50,'saldo parcial da fatura mista');
console.log('PASS '+n+' account, cash, invoice, payment and reconciliation tests');
