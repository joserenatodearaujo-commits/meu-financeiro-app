'use strict';
// Interface de conciliação cruzada: apenas sugestões e conferências de saldo bancário.
const reconcileSession={month:'',opening:'',closing:'',coverage:false,accountBySource:{}};
const reconcileMoney=c=>Number(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const reconcileLabel={review:'Classificar',duplicate:'Possível repetição',transfer:'Transferência provável',cash:'Saque / espécie',pix:'Pix a identificar',invoice:'Pagamento de fatura?',existing:'Possível lançamento já cadastrado'};
function renderImportReconciliation(){
 const holder=$('#importReview');if(!holder)return;
 const files=importSession.files||[],rows=ReconcileRules.review(files,state),months=ReconcileRules.monthly(files,state);
 if(!months.length){
  holder.innerHTML=files.length?'<p class="muted">Nenhum mês disponível para conciliação. Confira as origens e os formatos dos arquivos.</p>':'';
  return;
 }
 const activeMonths=[...new Set(months.map(x=>x.month))];
 if(!activeMonths.includes(reconcileSession.month))reconcileSession.month=activeMonths[0];
 const selected=reconcileSession.month,monthly=months.filter(x=>x.month===selected),review=rows.filter(x=>x.date.startsWith(selected));
 const statuses=new Map();
 for(const r of review)statuses.set(r.status,(statuses.get(r.status)||0)+1);
 const summaryRows=monthly.map(m=>{
  const saved=(state?.importCheckpoints||[]).find(x=>x.month===m.month&&x.source===m.source);
  const stillValid=saved&&saved.count===m.count&&saved.positive===m.positive&&saved.negative===m.negative;
  return [esc(ImportRules.source(m.source)?.label||m.source),m.count.toLocaleString('pt-BR'),
   reconcileMoney(m.positive),reconcileMoney(m.negative),reconcileMoney(m.net),
   m.unreadable?'Rever '+m.unreadable+' linha(s)':
   stillValid?'Saldo conferido anteriormente · classificação pendente':saved?'Conferência antiga (movimentos diferentes)':'Conferência pendente'];
 });
 const bank=monthly.filter(x=>x.kind==='bank');
 const accountOptions='<option value="">Selecione a conta do extrato</option>'+
  (state?.accounts||[]).filter(a=>a.type==='bank').map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
 const banks=bank.length?'<div class="field"><label for="reconcileBankSource">Conta a conferir</label><select id="reconcileBankSource">'+
  bank.map(x=>'<option value="'+esc(x.source)+'">'+esc(ImportRules.source(x.source)?.label||x.source)+'</option>').join('')+'</select></div>'+
  '<div class="field"><label for="reconcileAccount">Conta bancária cadastrada</label><select id="reconcileAccount">'+accountOptions+'</select></div>'+
  '<p class="muted">Janeiro usa o saldo oficial de 01/01 da conta; os demais meses usam o saldo final conferido no mês anterior. Edite o saldo em Contas e cartões.</p>'+
  '<div class="formgrid reconcile-inputs"><div class="field"><label for="reconcileOpening">Saldo de abertura do mês, antes das movimentações (R$)</label>'+
  '<input type="text" id="reconcileOpening" inputmode="decimal" readonly placeholder="Saldo de janeiro obrigatório"></div>'+
  '<div class="field"><label for="reconcileClosing">Saldo no último dia do mês (R$)</label>'+
  '<input type="text" id="reconcileClosing" inputmode="decimal" placeholder="0,00" autocomplete="off"></div></div>'+
  '<label class="reconcile-check"><input id="reconcileCoverage" type="checkbox"> Confirmo que o extrato cobre o mês inteiro e que os saldos informados são oficiais.</label>'+
  '<div class="actions"><button class="btn" type="button" id="reconcileCheck">Conferir diferença</button><button class="btn primary" type="button" id="reconcileSave">Salvar conferência no cofre</button></div>'+
  '<p id="reconcileMessage" class="muted" role="status">A conferência bancária é separada da classificação das despesas. Não altera o saldo do aplicativo.</p>'
  :'<p class="muted">Não há linhas bancárias reconhecidas neste mês para confrontar saldos.</p>';
 const statusCount=[...statuses.entries()].map(([k,n])=>esc(reconcileLabel[k]||k)+': '+n).join(' · ');
 const list=review.slice(0,100).map(r=>{
  const related=r.related?.map(id=>rows.find(x=>x.id===id)).filter(Boolean).map(x=>esc(x.source)+' · '+esc(x.date)).join(', ')||'';
  const cat=r.category?esc(r.category.macro+' / '+r.category.micro):'A definir';
  return '<div class="reconcile-row"><div class="reconcile-row-title"><b>'+esc(r.date)+' · '+esc(r.description)+'</b>'+
   '<span class="'+(r.amountCents<0?'amountneg':'amountpos')+'">'+reconcileMoney(r.amountCents)+'</span></div>'+
   '<div class="muted">'+esc(ImportRules.source(r.source)?.label||r.source)+' · '+esc(r.filename)+' · '+esc(r.reference)+'</div>'+
   '<p><strong>'+esc(reconcileLabel[r.status]||'Conferir')+'</strong> — '+esc(r.reason)+(related?' · possível par: '+related:'')+'</p>'+
   '<div class="muted">Categoria sugerida: '+cat+' (não gravada)</div></div>';
 }).join('');
 holder.innerHTML='<section class="import-reconcile-section"><div class="sectionrow"><h2>Conciliação e fechamento por mês</h2>'+
 '<label class="field"><span>Mês</span><select id="reconcileMonth">'+activeMonths.map(m=>'<option value="'+esc(m)+'" '+(m===selected?'selected':'')+'>'+esc(m)+'</option>').join('')+'</select></label></div>'+
 '<div class="notice warning">Correspondências são <strong>possibilidades, não confirmações</strong>. Nenhum movimento é importado, transferido, classificado ou pago automaticamente. Um saldo bancário conferido não significa fechamento financeiro definitivo.</div>'+
 '<h3>Movimentações identificadas por origem</h3>'+
 table(['Fonte','Registros','Valores positivos','Valores negativos','Variação','Conferência'],summaryRows)+
 '<h3>Conferir saldo de cada conta corrente</h3>'+banks+
 '<h3>Correspondências e pendências</h3><p class="muted">'+esc(statusCount)+' · '+review.length+' registro(s) no mês. Exibindo até 100 movimentações.</p>'+
 '<div class="reconcile-list">'+(list||'<p class="empty">Nenhuma movimentação reconhecida.</p>')+'</div>'+
 '<p class="muted">Diferenças de dinheiro físico precisam de contagem da carteira; saques e Pix não são despesas ou receitas por presunção.</p>'+
 '</section>';
 if(bank.length)reconcileBindBank(monthly,rows);
 $('#reconcileMonth').onchange=e=>{reconcileSession.month=e.target.value;renderImportReconciliation()};
}
function reconcileBindBank(monthly,rows){
 const source=$('#reconcileBankSource'),account=$('#reconcileAccount'),
  opening=$('#reconcileOpening'),closing=$('#reconcileClosing'),
  coverage=$('#reconcileCoverage'),msg=$('#reconcileMessage');
 const current=()=>monthly.find(x=>x.source===source.value);
 const baseline=()=>ReconcileRules.openingForMonth(state,account.value,current()?.month||'');
 const update=()=>{
  const data=current();if(!data)return;
  const previous=(state?.importCheckpoints||[]).find(x=>x.month===data.month&&x.source===data.source);
  const id=reconcileSession.accountBySource[data.source]||previous?.accountId||'';
  account.value=[...account.options].some(o=>o.value===id)?id:'';
  const saved=previous?.accountId===account.value?previous:null;
  const start=baseline();
  opening.value=start.ok?reconcileMoney(start.opening).replace(/[^\\d.,-]/g,'').trim():'';
  closing.value=saved?reconcileMoney(saved.closing).replace(/[^\\d.,-]/g,'').trim():'';
  coverage.checked=!!saved?.coverage;
  msg.textContent=start.ok?start.origin+'. Informe o saldo final oficial e confirme cobertura completa.':start.reason;
  $('#reconcileSave').disabled=!start.ok;
 };
 const test=()=>{
  const data=current(),start=baseline(),cl=ImportRules.cents(closing.value);
  if(!start.ok){msg.textContent=start.reason;return {data,check:{ok:false,reason:start.reason}}}
  const duplicates=rows.filter(r=>r.source===data.source&&r.date.slice(0,7)===data.month&&r.status==='duplicate').length;
  const check=ReconcileRules.checkBankMonth(data,start.opening,cl,coverage.checked,duplicates);
  msg.textContent=check.reason+(check.expected!==undefined?' · Saldo esperado: '+reconcileMoney(check.expected)+' · Diferença: '+reconcileMoney(check.difference):'');
  return {data,op:start.opening,cl,check};
 };
 source.onchange=update;
 account.onchange=()=>{reconcileSession.accountBySource[source.value]=account.value;update()};
 update();
 $('#reconcileCheck').onclick=test;
 $('#reconcileSave').onclick=async()=>{
  if(!state){msg.textContent='Desbloqueie o cofre antes de salvar.';return}
  const {data,op,cl,check}=test();
  if(!check.ok)return;
  if(!account.value){msg.textContent='Escolha a conta bancária correspondente.';return}
  if(!confirm('Salvar conferência da conta selecionada? Não cria despesas nem altera o saldo inicial.'))return;
  const record={id:uid(),accountId:account.value,source:data.source,month:data.month,
   opening:op,closing:cl,positive:data.positive,negative:data.negative,count:data.count,
   coverage:true,checkedAt:new Date().toISOString(),status:'bank-balance-checked'};
  const prev=state.importCheckpoints||[];
  state.importCheckpoints=[...prev.filter(x=>x.source!==record.source||x.month!==record.month),record];
  const btn=$('#reconcileSave');btn.disabled=true;
  try{await save();renderImportReconciliation()}
  catch(e){state.importCheckpoints=prev;msg.textContent='Falha ao salvar conferência: '+(e?.message||'erro');btn.disabled=false}
 };
}
