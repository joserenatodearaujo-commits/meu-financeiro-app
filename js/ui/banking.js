'use strict';
// Movimentações internas e quitação de faturas. Dados são gravados somente após aprovação.
const bankingDate=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
function transferForm(){
 const accounts=state.accounts.filter(a=>a.type==='bank'||a.type==='cash');
 if(accounts.length<2){alert('Cadastre pelo menos duas contas (banco ou carteira) antes de transferir.');return}
 const options=accounts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
 modal('Transferir entre contas',
  '<p class="muted">Saque e depósito entre suas próprias contas não são receita nem despesa.</p>'+
  '<div class="formgrid"><div class="field"><label>Origem</label><select name="fromAccountId" required>'+options+'</select></div>'+
  '<div class="field"><label>Destino</label><select name="toAccountId" required>'+options+'</select></div>'+
  field('amount','Valor transferido (R$)','','number','min="0.01" step="0.01" required')+
  field('date','Data efetiva',bankingDate(),'date','required')+
  field('description','Descrição','Transferência entre contas','text','maxlength="100" required')+
  '</div>',async f=>{
   const x=Object.fromEntries(f.entries());x.amount=Math.round(Number(x.amount)*100)/100;
   if(!Number.isFinite(x.amount)||x.amount<=0)throw Error('Valor deve ser positivo.');
   if(x.fromAccountId===x.toAccountId)throw Error('Selecione contas diferentes.');
   if(!accounts.some(a=>a.id===x.fromAccountId)||!accounts.some(a=>a.id===x.toAccountId))throw Error('Origem ou destino inválido.');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||x.date>bankingDate())throw Error('Informe uma data efetiva válida, não futura.');
   if(!x.description.trim())throw Error('Informe a descrição.');
   state.transfers.push({...x,id:uid(),description:x.description.trim()});
  });
 const fields=$$('#modalForm select');if(fields.length>1)fields[1].selectedIndex=1;
}
function invoicePaymentForm(cardId,month){
 const inv=FinanceRules.invoice(state,cardId,month);
 if(!inv.rows.length||inv.outstanding<=0){alert('Esta fatura está integralmente paga ou não tem compras.');return}
 const bank=state.accounts.filter(a=>a.type==='bank');
 if(!bank.length){alert('Cadastre uma conta bancária para registrar o pagamento da fatura.');return}
 const opts=bank.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
 const card=state.accounts.find(a=>a.id===cardId);
 modal('Pagar fatura · '+esc(card?.name||'Cartão'),
  '<div class="agent-preview"><b>Fatura '+esc(month)+'</b>'+
  '<div>Valor original: <b>'+fmt(inv.total)+'</b></div>'+
  '<div>Já pago: <b>'+fmt(inv.paid)+'</b></div>'+
  '<div>Em aberto: <b>'+fmt(inv.outstanding)+'</b></div>'+
  '<div>Vencimento: '+esc(inv.due)+'</div></div>'+
  '<div class="formgrid"><div class="field"><label>Conta debitada</label><select name="accountId" required>'+opts+'</select></div>'+
  field('amount','Valor efetivamente pago',inv.outstanding,'number','min="0.01" step="0.01" required')+
  field('date','Data do pagamento',bankingDate(),'date','required')+'</div>'+
  '<p class="muted">Registra a saída real do banco e reduz a dívida. Não cria uma nova despesa de consumo. Pagamentos parciais são permitidos.</p>',
  async f=>{
   const x=Object.fromEntries(f.entries()),fresh=FinanceRules.invoice(state,cardId,month);
   x.amount=Math.round(Number(x.amount)*100)/100;
   if(!fresh.rows.length||fresh.outstanding<=0)throw Error('Fatura já está paga.');
   if(!Number.isFinite(x.amount)||x.amount<=0||x.amount>fresh.outstanding+0.001)throw Error('O pagamento deve estar entre R$ 0,01 e '+fmt(fresh.outstanding)+'.');
   if(!state.accounts.some(a=>a.id===x.accountId&&a.type==='bank'))throw Error('Selecione uma conta bancária válida.');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||x.date>bankingDate())throw Error('Informe a data real do pagamento (não futura).');
   state.invoicePayments.push({id:uid(),cardId,month,accountId:x.accountId,amount:x.amount,date:x.date});
  });
}
function invoiceDetails(cardId,month){
 const inv=FinanceRules.invoice(state,cardId,month),card=state.accounts.find(a=>a.id===cardId);
 const type={paid:'Paga',partial:'Parcialmente paga',open:'Em aberto',unreconciled:'Não conciliada',empty:'Vazia'};
 const rows=inv.rows.map(r=>'<div class="sectionrow"><span>'+esc(r.description)+' · '+esc(r.macro)+' / '+esc(r.micro)+' ('+r.num+'/'+r.totalInstallments+')</span><b>'+fmt(r.amount)+'</b></div>').join('');
 const payments=inv.payments.map(p=>'<div class="sectionrow"><span>'+esc(p.date)+' · '+esc(state.accounts.find(a=>a.id===p.accountId)?.name||'Conta não encontrada')+'</span><span><b>'+fmt(p.amount)+'</b> <button class="btn small danger" type="button" data-invoice-payment-delete="'+esc(p.id)+'">Excluir</button></span></div>').join('');
 modal('Fatura · '+esc(card?.name||'Cartão')+' · '+esc(month),
 '<p><b>Situação: '+type[inv.status]+'</b> · Vencimento '+esc(inv.due)+'</p>'+
 '<div class="agent-preview"><div>Total: <b>'+fmt(inv.total)+'</b></div><div>Pago: <b>'+fmt(inv.paid)+'</b></div><div>Em aberto: <b>'+fmt(inv.outstanding)+'</b></div></div>'+
 '<h3>Compras e parcelas</h3>'+rows+
 '<h3>Pagamentos registrados</h3>'+(payments||'<p class="muted">Nenhum pagamento confirmado. Se a fatura antiga já foi paga, registre a quitação para conciliá-la.</p>')+
 '<p class="muted">Pagamento da fatura é transferência de recursos ao credor, não segunda despesa.</p>',
 async()=>{$('#modalRoot').innerHTML='';return false});
 $('#modalForm button[type="submit"]').textContent='Fechar';
}
