'use strict';
// Regras financeiras puras: compras, faturas, pagamentos reais, caixa, contas e compromissos.
const FinanceRules=Object.freeze({
 installments(t){
  const count=Math.max(1,Math.min(120,Number(t.installments)||1)),cents=Math.round(Number(t.amount)*100);
  const each=Math.floor(cents/count),extra=cents-each*count;
  const date=t.firstDue||t.paymentDate||t.purchaseDate;
  const first=monthKey(date),out=[];
  for(let i=0;i<count;i++){
   const month=addMonths(first,i);
   out.push({due:dateInMonth(month,t.dueDay||Number(date.slice(-2))) ,amount:(each+(i<extra?1:0))/100,num:i+1});
  }
  return out;
 },
 expenses(transactions,m,basis='cash'){
  // 'competence': compra integral na data original; 'cash' para despesas sem cartão.
  // Cartões só entram no caixa através do pagamento da fatura.
  return transactions.filter(t=>t.type==='expense').flatMap(t=>{
   if(t.cardId)return basis==='competence'&&monthKey(t.purchaseDate)===m?[{...t,when:t.purchaseDate,amount:+t.amount}]:[];
   if(t.recurring){
    const start=monthKey(t.purchaseDate);
    if(m<start||(t.recurringEnd&&m>monthKey(t.recurringEnd)))return [];
    return [{...t,amount:+t.amount,when:dateInMonth(m,t.day||Number((t.paymentDate||t.purchaseDate).slice(-2)))}];
   }
   return monthKey(basis==='competence'?t.purchaseDate:t.paymentDate)===m?[t]:[];
  });
 },
 income(transactions,m){
  return transactions.filter(t=>t.type==='income'&&(t.recurring?
   m>=monthKey(t.paymentDate)&&(!t.recurringEnd||m<=monthKey(t.recurringEnd)):
   monthKey(t.paymentDate)===m));
 },
 investments(transactions,m){return transactions.filter(t=>t.type==='investment'&&monthKey(t.paymentDate)===m)},
 invoiceRows(transactions,cardId,month){
  const rows=[];for(const t of transactions){
   if(t.type!=='expense'||t.cardId!==cardId)continue;
   for(const p of FinanceRules.installments(t))if(monthKey(p.due)===month){
    rows.push({id:t.id,description:t.description,macro:t.macro||'Outros',micro:t.micro||'Diversos',purchaseDate:t.purchaseDate,amount:p.amount,num:p.num,totalInstallments:Number(t.installments)||1,due:p.due});
   }
  }return rows;
 },
 invoice(state,cardId,month){
  const rows=FinanceRules.invoiceRows(state.transactions||[],cardId,month);
  const due=rows.length?rows.reduce((a,b)=>a.due<b.due?a:b).due:month+'-01';
  const total=Math.round(rows.reduce((a,r)=>a+r.amount,0)*100)/100;
  const payments=(state.invoicePayments||[]).filter(p=>p.cardId===cardId&&p.month===month).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const paid=Math.round(payments.reduce((a,p)=>a+Number(p.amount),0)*100)/100;
  const outstanding=Math.max(0,Math.round((total-paid)*100)/100);
  const today=new Date().toISOString().slice(0,10);
  const status=!rows.length?'empty':outstanding<0.005?'paid':paid>0?'partial':due<today?'unreconciled':'open';
  return {cardId,month,due,rows,total,payments,paid,outstanding,status};
 },
 invoices(state){
  const keys=new Set();for(const t of state.transactions||[]){
   if(t.type==='expense'&&t.cardId)for(const p of FinanceRules.installments(t))keys.add(t.cardId+'|'+monthKey(p.due));
  }
  return [...keys].map(k=>{const i=k.lastIndexOf('|');return FinanceRules.invoice(state,k.slice(0,i),k.slice(i+1))}).sort((a,b)=>a.month.localeCompare(b.month)||a.cardId.localeCompare(b.cardId));
 },
 paymentAllocations(invoice,payment){
  // Centavos exatos por categoria, sem tratar o pagamento como nova compra.
  const grouped={};
  for(const row of invoice.rows){const k=(row.macro||'Outros')+'\u0000'+(row.micro||'Diversos');grouped[k]=(grouped[k]||0)+Math.round(row.amount*100)}
  const keys=Object.keys(grouped),sum=keys.reduce((a,k)=>a+grouped[k],0);
  if(!sum)return[];
  const cents=Math.round(Number(payment.amount)*100);
  let remaining=cents;
  return keys.map((key,i)=>{
   const share=i===keys.length-1?remaining:Math.floor(cents*grouped[key]/sum);
   remaining-=share;const [macro,micro]=key.split('\u0000');
   return {id:payment.id,cardId:invoice.cardId,description:'Pagamento fatura · '+macro,macro,micro,amount:share/100,when:payment.date,accountId:payment.accountId,kind:'invoice-payment'};
  }).filter(x=>x.amount>0);
 },
 cashExpenses(state,m){
  const output=FinanceRules.expenses(state.transactions||[],m,'cash');
  const byKey=new Map();
  for(const p of state.invoicePayments||[]){
   if(monthKey(p.date)!==m)continue;
   const key=p.cardId+'|'+p.month;
   if(!byKey.has(key))byKey.set(key,FinanceRules.invoice(state,p.cardId,p.month));
   output.push(...FinanceRules.paymentAllocations(byKey.get(key),p));
  }
  return output;
 },
 commitments(state,m){
  const output=FinanceRules.expenses(state.transactions||[],m,'cash').filter(t=>t.recurring);
  for(const inv of FinanceRules.invoices(state)){
   if(inv.month!==m||inv.outstanding<=0)continue;
   const unpaidRatio=inv.total>0?inv.outstanding/inv.total:0;
   let remaining=Math.round(inv.outstanding*100);
   inv.rows.forEach((r,i)=>{
    const c=i===inv.rows.length-1?remaining:Math.floor(Math.round(r.amount*100)*unpaidRatio);
    remaining-=c;if(c>0)output.push({...r,type:'expense',amount:c/100,when:inv.due,cardId:inv.cardId});
   });
  }
  return output;
 },
 accountBalance(state,accountId,asOf){
  const account=(state.accounts||[]).find(a=>a.id===accountId);
  if(!account||account.type==='card')return null;
  const first=account.openingDate||'0000-01-01',last=asOf||'9999-12-31';
  let cents=Math.round(Number(account.openingBalance||0)*100);
  if(last<first)return null;
  const valid=d=>d&&d>=first&&d<=last;
  for(const t of state.transactions||[]){
   if(t.accountId!==accountId||t.cardId)continue;
   const d=t.paymentDate||t.purchaseDate;if(!valid(d))continue;
   if(t.type==='income')cents+=Math.round(Number(t.amount)*100);
   if(t.type==='expense')cents-=Math.round(Number(t.amount)*100);
   if(t.type==='investment')cents+=(t.operation==='resgate'?1:-1)*Math.round(Number(t.amount)*100);
  }
  for(const t of state.transfers||[]){
   if(!valid(t.date))continue;
   if(t.fromAccountId===accountId)cents-=Math.round(t.amount*100);
   if(t.toAccountId===accountId)cents+=Math.round(t.amount*100);
  }
  for(const p of state.invoicePayments||[])if(p.accountId===accountId&&valid(p.date))cents-=Math.round(p.amount*100);
  return cents/100;
 },
 summary(state,m){
  const ins=FinanceRules.income(state.transactions||[],m).reduce((a,t)=>a+Number(t.amount),0);
  const expenses=FinanceRules.cashExpenses(state,m).reduce((a,t)=>a+Number(t.amount),0);
  const invest=FinanceRules.investments(state.transactions||[],m).reduce((a,t)=>a+(t.operation==='resgate'?-1:1)*Number(t.amount),0);
  return {ins,expenses,invest,left:ins-expenses-invest};
 }
});

function accountStatementEntries(financial){
 const rows=[];
 const byId=id=>(financial.accounts||[]).find(a=>a.id===id)?.name||'Conta não encontrada';
 for(const t of financial.transactions||[]){
  if(t.cardId||!['income','expense','investment'].includes(t.type))continue;
  const amount=Number(t.amount)*(t.type==='income'?1:t.type==='investment'&&t.operation==='resgate'?1:-1);
  rows.push({date:t.paymentDate||t.purchaseDate,accountId:t.accountId,description:t.description+(t.recurring?' · registro recorrente':''),amount,kind:t.type});
 }
 for(const tr of financial.transfers||[]){
  rows.push({date:tr.date,accountId:tr.fromAccountId,description:'Transferência para '+byId(tr.toAccountId),amount:-Number(tr.amount),kind:'transfer'});
  rows.push({date:tr.date,accountId:tr.toAccountId,description:'Transferência de '+byId(tr.fromAccountId),amount:Number(tr.amount),kind:'transfer'});
 }
 for(const p of financial.invoicePayments||[]){
  rows.push({date:p.date,accountId:p.accountId,description:'Pagamento da fatura '+byId(p.cardId)+' / '+p.month,amount:-Number(p.amount),kind:'invoice-payment'});
 }
 return rows.sort((a,b)=>b.date.localeCompare(a.date));
}
function inMonth(d,m){return monthKey(d)===m}
function installments(t){return FinanceRules.installments(t)}
function txExpenses(m,basis='cash'){return basis==='competence'?FinanceRules.expenses(state.transactions,m,'competence'):FinanceRules.cashExpenses(state,m)}
function txIncome(m){return FinanceRules.income(state.transactions,m)}
function txInvest(m){return FinanceRules.investments(state.transactions,m)}
function sums(m){return FinanceRules.summary(state,m)}
