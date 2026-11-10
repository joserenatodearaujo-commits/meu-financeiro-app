'use strict';
// Meu Financeiro • Entry, account, goal and editing forms.
function modal(title,content,submit){const approval=title==='Confirmar lançamento';const controls=`<div class="${approval?'modal-actions-top':'modalfoot'}"${approval?' role="group" aria-label="Ações do lançamento"':''}><button class="btn" type="button" id="cancelModal">Cancelar</button><button class="btn primary" type="submit">${approval?'✓ Confirmar e gravar':'Salvar'}</button></div>`;const error='<div id="modalError" role="alert" class="amountneg"></div>';$('#modalRoot').innerHTML=`<div class="modalback"><div class="modal" role="dialog" aria-modal="true"><div class="sectionrow"><h2>${title}</h2><button class="btn small" id="closeModal" aria-label="Fechar janela">✕</button></div><form id="modalForm">${approval?controls+error+content:content+controls+error}</form></div></div>`;$('#closeModal').onclick=$('#cancelModal').onclick=()=>$('#modalRoot').innerHTML='';$('#modalRoot .modalback').onclick=e=>{if(e.target.classList.contains('modalback'))$('#modalRoot').innerHTML=''};$('#modalForm').onsubmit=async e=>{e.preventDefault();const submitButton=$('#modalForm button[type="submit"]');if(submitButton.disabled)return;submitButton.disabled=true;try{const outcome=await submit(new FormData(e.currentTarget));if(outcome===false)return;await save();$('#modalRoot').innerHTML='';renderAll()}catch(err){$('#modalError').textContent=err.message||'Não foi possível salvar'}finally{if(submitButton.isConnected)submitButton.disabled=false}}}
const field=(name,label,value='',type='text',rest='')=>`<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(value)}" ${rest}></div>`;const selectField=(name,label,options,value='')=>`<div class="field"><label>${label}</label><select name="${name}">${options.map(([v,l])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(l)}</option>`).join('')}</select></div>`;function entryToday(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function entryForm(existing=null,force='',draft=null){
 const old=existing||draft||{},investment=force==='investment'||(!force&&old.type==='investment'),type=investment?'investment':force||old.type||'expense';
 const today=entryToday(),purchase=old.purchaseDate||today;
 const cards=state.accounts.filter(a=>a.type==='card'),accounts=state.accounts.filter(a=>a.type==='bank'||a.type==='cash');
 const method=investment?(old.paymentMethod==='cash'?'cash':'pix'):(old.cardId?'credit':old.paymentMethod==='cash'?'cash':old.accountId&&state.accounts.find(a=>a.id===old.accountId)?.type==='cash'?'cash':'pix');
 const card=cards.find(a=>a.id===old.cardId)||cards[0];
 const due=card?firstDueForCard(purchase,card):purchase;
 const methodChoices=investment?[['pix','Conta corrente / Pix'],['cash','Dinheiro / carteira']]:[['pix','Conta corrente / Pix'],['cash','Dinheiro / carteira'],['credit','Cartão de crédito']];
 const body='<div class="entry-payment-first">'+selectField('paymentMethod','Como foi '+(type==='income'?'recebido':'pago')+'?',methodChoices,method)+'</div>'+
 '<div class="formgrid">'+
 (investment?'<input type="hidden" name="type" value="investment">':selectField('type','Tipo de lançamento',[['expense','Despesa'],['income','Receita']],type))+
 field('description','Descrição',old.description||'','text','required maxlength="200"')+
 field('amount','Valor (R$)',old.amount??'','number','min="0.01" step="0.01" required')+
 field('purchaseDate',investment?'Data da operação':'Data da compra / operação',purchase,'date','required')+
 '<div class="entry-account">'+selectField('accountId','Conta / carteira',accounts.filter(a=>a.type===(method==='cash'?'cash':'bank')).map(a=>[a.id,a.name]),old.accountId||'')+'</div>'+
 '<div class="entry-credit">'+selectField('cardId','Cartão de crédito',cards.map(a=>[a.id,a.name]),old.cardId||card?.id||'')+'</div>'+
 '<div class="entry-credit">'+field('paymentDate','Desembolso previsto na fatura',due,'date','readonly')+'</div>'+
 '<div class="entry-credit">'+field('installments','Quantidade de parcelas',old.installments||1,'number','min="1" max="120" required')+'</div>'+
 (investment?field('asset','Código do investimento',old.asset||'','text','maxlength="60"')+
 selectField('operation','Operação',[['aporte','Aporte / compra'],['resgate','Resgate / venda']],old.operation||'aporte'):
 '<div class="entry-category">'+selectField('macro','Categoria',categoryList().map(c=>[c,c]),old.macro||'Outros')+subcategoryField(old.macro||'Outros',old.micro||'Diversos')+'</div>'+
 '<div class="entry-recurring">'+selectField('recurring','Recorrência mensal',[['','Não'],['yes','Sim']],old.recurring?'yes':'')+'</div>'+
 '<div class="entry-recurring">'+field('recurringEnd','Fim da recorrência (opcional)',old.recurringEnd||'','date')+'</div>')+
 '</div><p class="muted">A data inicial é hoje e pode ser corrigida. Conta/Pix ou carteira: desembolso na data da operação. Cartão: a data prevista é calculada por fechamento e vencimento, sem registrar pagamento de fatura automaticamente.</p>';
 modal(existing?'Editar lançamento':investment?'Registrar investimento':'Novo lançamento tradicional',body,async f=>{
  const x=Object.fromEntries(f.entries()),pay=x.paymentMethod;
  const form=$('#modalForm');
  x.type=investment?'investment':x.type;
  x.description=String(x.description||'').trim();
  x.amount=Number(x.amount);x.installments=pay==='credit'?Number(x.installments)||1:1;
  x.recurring=pay!=='credit'&&x.recurring==='yes';x.recurringEnd=x.recurring?x.recurringEnd||'':'';
  if(!x.description||!Number.isFinite(x.amount)||x.amount<=0)throw Error('Informe descrição e valor positivo.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(x.purchaseDate)||!Number.isFinite(new Date(x.purchaseDate+'T12:00:00').getTime()))throw Error('Informe uma data de compra válida.');
  if(!['expense','income','investment'].includes(x.type))throw Error('Tipo de lançamento inválido.');
  if(!investment&&x.type==='income'&&pay==='credit')throw Error('Recebimentos não podem ser lançados em cartão de crédito.');
  if(pay==='credit'){
   const chosen=cards.find(a=>a.id===x.cardId);
   if(!chosen)throw Error('Cadastre e selecione um cartão de crédito.');
   if(!Number.isInteger(x.installments)||x.installments<1||x.installments>120)throw Error('Parcelas devem estar entre 1 e 120.');
   x.paymentDate=firstDueForCard(x.purchaseDate,chosen);
   x.firstDue=x.paymentDate;x.dueDay=Number(x.firstDue.slice(-2));
   x.accountId='';x.recurring=false;x.recurringEnd='';
  }else{
   const chosen=state.accounts.find(a=>a.id===x.accountId&&a.type===(pay==='cash'?'cash':'bank'));
   if(!chosen)throw Error(pay==='cash'?'Selecione uma carteira cadastrada.':'Selecione uma conta corrente / Pix cadastrada.');
   x.cardId='';x.installments=1;x.firstDue='';x.dueDay=Number(x.purchaseDate.slice(-2));
   x.paymentDate=x.purchaseDate;
  }
  x.paymentMethod=pay;
  if(x.type==='investment'){x.macro='Investimentos';x.micro='Diversos';x.asset=String(x.asset||'').trim()||x.description;x.operation=x.operation==='resgate'?'resgate':'aporte';x.recurring=false;}
  else{
   const chosen=chosenSubcategory(new FormData(form),String(f.get('macro')||'Outros'));
   x.micro=chosen.micro;x.macro=String(f.get('macro'));state.taxonomy=chosen.catalog;
   x.asset='';x.operation='aporte';
  }
  if(existing?.cardId&&installments(existing).some(p=>(state.invoicePayments||[]).some(pay=>pay.cardId===existing.cardId&&pay.month===monthKey(p.due))))throw Error('Há pagamentos vinculados a esta compra. Exclua-os antes de alterar a compra.');
  if(existing)state.transactions=state.transactions.map(t=>t.id===existing.id?{...x,id:existing.id}:t);
  else state.transactions.push({...x,id:uid()});
 });
 const form=$('#modalForm'),payment=form.querySelector('[name="paymentMethod"]'),account=form.querySelector('[name="accountId"]'),cardSelect=form.querySelector('[name="cardId"]'),date=form.querySelector('[name="purchaseDate"]'),dueInput=form.querySelector('[name="paymentDate"]'),typeSelect=form.querySelector('[name="type"]');
 const update=()=>{
  const credit=!investment&&payment.value==='credit',cash=payment.value==='cash';
  const currentType=investment?'investment':typeSelect?.value;
  if(credit&&currentType==='income'){payment.value='pix';return update();}
  form.querySelectorAll('.entry-account').forEach(el=>{el.hidden=credit;el.querySelectorAll('select').forEach(x=>x.disabled=credit)});
  form.querySelectorAll('.entry-credit').forEach(el=>{el.hidden=!credit;el.querySelectorAll('input,select').forEach(x=>x.disabled=!credit)});
  form.querySelectorAll('.entry-recurring').forEach(el=>{el.hidden=credit;el.querySelectorAll('input,select').forEach(x=>x.disabled=credit)});
  if(!credit){
   const previous=account.value;
   account.innerHTML=state.accounts.filter(a=>a.type===(cash?'cash':'bank')).map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
   if([...account.options].some(o=>o.value===previous))account.value=previous;
   else if(old.accountId&&[...account.options].some(o=>o.value===old.accountId))account.value=old.accountId;
  }else{
   const selected=state.accounts.find(a=>a.id===cardSelect.value&&a.type==='card');
   if(selected)dueInput.value=firstDueForCard(date.value,selected);
  }
 };
 payment.onchange=update;cardSelect.onchange=update;date.onchange=update;
 if(typeSelect)typeSelect.onchange=update;
 update();
 if(!investment)connectSubcategory(form,old.macro||'Outros',old.micro||'Diversos');
}
function accountForm(existingId=''){
 const original=state.accounts.find(a=>a.id===existingId),editing=!!original;
 const typ=original?.type||'bank';
 const opts=[['bank','Conta bancária / Pix'],['cash','Carteira / Dinheiro em espécie'],['card','Cartão de crédito']];
 const label=opts.map(([v,l])=>'<option value="'+v+'" '+(v===typ?'selected':'')+'>'+l+'</option>').join('');
 const today=new Date().toISOString().slice(0,10);
 const opening=Number(original?.openingBalance??0);
 modal(editing?'Editar conta / cartão':'Adicionar conta ou cartão',
  '<div class="formgrid">'+
  field('name','Apelido',original?.name||'','text','maxlength="70" required')+
  '<div class="field"><label>Tipo</label><select id="accountType" name="type" '+(editing?'disabled':'')+'>'+label+'</select></div>'+
  '<div class="field account-opening"><label>Saldo oficial de abertura (R$)</label><input name="openingBalance" type="number" step="0.01" value="'+opening+'" required></div>'+
  '<div class="field account-opening"><label>Data de referência do saldo</label><input name="openingDate" type="date" value="'+esc(original?.openingDate||'2026-01-01')+'" required></div>'+
  '<div class="field account-card"><label>Fechamento (dia)</label><input name="closing" type="number" min="1" max="28" value="'+(original?.closing||5)+'"></div>'+
  '<div class="field account-card"><label>Vencimento (dia)</label><input name="due" type="number" min="1" max="28" value="'+(original?.due||15)+'"></div></div>'+
  '<p class="muted">Para conciliar 2026 desde janeiro, informe o saldo oficial da conta em 01/01/2026, antes da primeira movimentação. Pode ser negativo se o extrato indicar saldo devedor. Saldo inicial não é receita e não altera movimentações antigas.</p>',
  async f=>{
   const x=Object.fromEntries(f.entries());x.name=x.name.trim();x.type=editing?typ:x.type;
   if(!x.name||!['bank','cash','card'].includes(x.type))throw Error('Informe nome e tipo válidos.');
   if(state.accounts.some(a=>a.name.toLowerCase()===x.name.toLowerCase()&&a.id!==existingId))throw Error('Já existe uma conta com esse nome.');
   if(x.type==='card'){
    x.closing=Number(x.closing);x.due=Number(x.due);
    if(!Number.isInteger(x.closing)||!Number.isInteger(x.due)||x.closing<1||x.closing>28||x.due<1||x.due>28)throw Error('Fechamento e vencimento devem ser entre 1 e 28.');
    x.openingBalance=0;x.openingDate='';
   }else{
    x.openingBalance=Math.round(Number(x.openingBalance)*100)/100;
    if(!Number.isFinite(x.openingBalance)||!/^\d{4}-\d{2}-\d{2}$/.test(x.openingDate))throw Error('Informe um saldo inicial válido e a data de referência.');
    x.closing=1;x.due=10;
   }
   if(editing)state.accounts=state.accounts.map(a=>a.id===existingId?{...a,...x,id:existingId}:a);
   else state.accounts.push({...x,id:uid()});
   expandedAccountGroups.add(x.type);
  });
 const typeselect=$('#accountType'),setFields=()=>{
  const card=typeselect.value==='card';
  document.querySelectorAll('.account-opening').forEach(e=>{e.hidden=card;e.querySelectorAll('input').forEach(i=>i.disabled=card)});
  document.querySelectorAll('.account-card').forEach(e=>{e.hidden=!card;e.querySelectorAll('input').forEach(i=>i.disabled=!card)});
 };
 typeselect.onchange=setFields;setFields();
}

function goalForm(existingMacro=''){
 const startMonth=selectedMonth,months=Array.from({length:12},(_,i)=>addMonths(startMonth,i));
 const active=state.goals.find(g=>g.macro===existingMacro),baseline=active?goalTarget(active,startMonth):0;
 const label=m=>{const [y,n]=m.split('-').map(Number);return new Date(y,n-1,1).toLocaleDateString('pt-BR',{month:'short',year:'numeric'})};
 const inputs=months.map((m,i)=>`<div class="field"><label for="goal-${i}">${esc(label(m))}</label><input id="goal-${i}" data-goal-month="${esc(m)}" type="number" inputmode="decimal" step="0.01" min="0" max="999999999" required value="${active?goalTarget(active,m):baseline}" name="goal_${m}" aria-label="Meta para ${esc(label(m))}"></div>`).join('');
 modal('Meta por mês',`<p class="muted">Escolha a categoria e defina a meta do primeiro mês. O valor será repetido nos próximos 11 meses, mas cada mês poderá ser alterado.</p><div class="field"><label for="goalMacro">Categoria</label><select id="goalMacro" name="macro">${categoryList().map(c=>`<option value="${esc(c)}" ${c===existingMacro?'selected':''}>${esc(c)}</option>`).join('')}</select></div><div class="goal-month-toolbar"><span>Período: ${esc(label(months[0]))} a ${esc(label(months[11]))}</span><button type="button" class="btn small" id="goalRepeat">Repetir primeiro mês</button></div><div class="goal-months">${inputs}</div><p class="muted">Metas já salvas em outros meses não serão apagadas. Valor zero é permitido para meses sem orçamento.</p>`,async f=>{
  const macro=String(f.get('macro')||'');if(!categoryList().includes(macro))throw Error('Categoria inválida.');
  const prev=state.goals.find(g=>g.macro===macro),monthly={...(prev?.monthly||{})};
  for(const m of months){const v=Number(f.get('goal_'+m));if(!Number.isFinite(v)||v<0)throw Error('Informe metas válidas para todos os meses.');monthly[m]=Math.round(v*100)/100}
  const g={id:prev?.id||uid(),macro,amount:monthly[months[0]],monthly};state.goals=state.goals.filter(x=>x.macro!==macro);state.goals.push(g);
 });
 const first=$('#goal-0'),others=Array.from(document.querySelectorAll('[data-goal-month]')).slice(1);
 first.addEventListener('input',()=>{for(const el of others)if(el.dataset.edited!=='true')el.value=first.value});
 others.forEach(el=>el.addEventListener('input',()=>el.dataset.edited='true'));
 $('#goalRepeat').onclick=()=>{for(const el of others){el.value=first.value;delete el.dataset.edited}};
 $('#goalMacro').onchange=e=>{const g=state.goals.find(x=>x.macro===e.target.value);const b=g?goalTarget(g,months[0]):0;first.value=String(b);others.forEach((el,i)=>{el.value=String(g?goalTarget(g,months[i+1]):b);delete el.dataset.edited})};
}
function structuredForm(){modal('Colar lançamento em JSON',`<div class="field"><label>Registro JSON único (sem senha ou dados bancários)</label><textarea rows="11" name="json" required placeholder='{"type":"expense","description":"Exemplo","amount":25,"purchaseDate":"2026-11-05","paymentDate":"2026-11-05","macro":"Alimentação"}'></textarea></div>`,async f=>{let x;try{x=JSON.parse(f.get('json'))}catch{throw Error('JSON inválido')}if(!x||Array.isArray(x)||!['income','expense','investment','transfer'].includes(x.type)||typeof x.description!=='string'||!x.description.trim()||!Number.isFinite(Number(x.amount))||+x.amount<=0||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(x.purchaseDate||'')||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(x.paymentDate||''))throw Error('Campos inválidos: type, description, amount, purchaseDate e paymentDate são obrigatórios');if(x.cardId&&!state.accounts.some(a=>a.id===x.cardId&&a.type==='card'))throw Error('Cartão não cadastrado');if(x.installments&&(!Number.isInteger(+x.installments)||+x.installments>120||+x.installments<1))throw Error('Parcelamento inválido');const clean={id:uid(),type:x.type,description:x.description.slice(0,200),amount:+x.amount,purchaseDate:x.purchaseDate,paymentDate:x.paymentDate,macro:x.macro||'Outros',micro:x.micro||'Diversos',accountId:state.accounts.find(a=>a.name===x.account)?.id||'cash-default',cardId:x.cardId||'',installments:+x.installments||1,firstDue:x.firstDue||x.paymentDate,recurring:!!x.recurring,recurringEnd:x.recurringEnd||'',asset:x.asset||'',operation:x.operation||'aporte'};if(clean.cardId&&clean.recurring)throw Error('Parcelamento e recorrência não podem ser combinados');if(['expense','income'].includes(clean.type)&&(!categoryList().includes(clean.macro)||!subcategoryList(clean.macro).includes(clean.micro)))throw Error('Categoria ou subcategoria não cadastrada. Cadastre a classificação em Configurações antes de importar.');const duplicate=state.transactions.some(t=>t.type===clean.type&&t.description===clean.description&&t.amount===clean.amount&&t.purchaseDate===clean.purchaseDate&&t.cardId===clean.cardId);if(duplicate)throw Error('Possível duplicidade identificada; revise a transação existente');state.transactions.push(clean)})}
