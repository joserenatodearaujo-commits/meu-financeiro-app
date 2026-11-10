'use strict';
// Meu Financeiro • Approval card, validation, duplicate prevention, encrypted write verification.
function openApproval(a){stopVoice();cleanAgentImage();
 const opts=(list,current)=>list.map(([v,label])=>`<option value="${esc(v)}" ${String(v)===String(current)?'selected':''}>${esc(label)}</option>`).join('');
 const as=(name,label,value,attrs='')=>`<div class="field"><label>${label}</label><input class="agent-input" name="${name}" value="${esc(value)}" ${attrs}></div>`;
 const catOpt=opts(categoryList().map(x=>[x,x]),recognizedCategory(a.macro));
 const cards=state.accounts.filter(x=>x.type==='card');
 const pay=[['unspecified','Escolha como foi pago'],['pix','Conta corrente / Pix'],['cash','Dinheiro / carteira'],['credit','Cartão de crédito']];
 const activeAccounts=state.accounts.filter(a=>a.type==='bank'||a.type==='cash');const accountOpts=opts(activeAccounts.map(x=>[x.id,x.name]),activeAccounts.find(x=>x.type===(a.paymentMethod==='cash'?'cash':'bank'))?.id||'cash-default');
 const purchaseToday=agentDate();
 const warning=a.amount<=0?'Valor não identificado. Informe manualmente.':a.amountIssue|| (a.paymentMethod==='unspecified'?'Selecione a forma de pagamento antes de gravar.':'Confirme os dados identificados; a interpretação pode cometer erros.');
 const requireCheck=!!(a.fromVoice||a.fromPhoto||a.amountUncertain);
 const valueReview=requireCheck?`<div class="amount-confirm"><label><input type="checkbox" name="amountConfirmed" id="amountConfirmed" required> <span>Conferi o valor da despesa em reais e centavos</span></label></div>`:'';
 const originalVoice=a.fromVoice?`<div class="agent-original"><strong>Você disse (transcrição do Android):</strong><div>${esc(a.sourceText||'')}</div><small>Se a transcrição estiver errada, corrija o campo Valor abaixo.</small></div>`:'';
 modal('Confirmar lançamento',`<div class="agent-preview"><div class="muted">Prévia • nenhum dado foi gravado</div><div class="agent-value">${fmt(a.amount)}</div><b>${esc(a.description)}</b><div class="agent-warning">${esc(warning)}</div>${originalVoice}${valueReview}</div><div class="entry-payment-first"><div class="field"><label>Como foi pago / recebido?</label><select name="paymentMethod">${opts(pay,a.paymentMethod)}</select></div></div><div class="formgrid">
 <div class="field"><label>Tipo</label><select name="type">${opts([['expense','Despesa'],['income','Receita']],a.type)}</select></div>
 ${as('description','Descrição',a.description,'required maxlength="120"')}
 ${as('amount','Valor R$',a.amount||'','type="number" min="0.01" step="0.01" required')}
 <div class="field"><label>Macro</label><select name="macro">${catOpt}</select></div>
 ${subcategoryField(a.macro,a.micro)}
 ${as('purchaseDate','Data da compra / operação',purchaseToday,'type="date" required')}
 <div class="entry-credit">${as('paymentDate','Desembolso previsto na fatura',a.paymentDate||purchaseToday,'type="date" readonly')}</div>
 <div class="field" id="agentAccountField"><label>Conta corrente / carteira</label><select name="accountId">${accountOpts}</select></div>
 <div class="entry-credit"><div class="field"><label>Cartão de crédito</label><select name="cardId">${opts([['','Selecione seu cartão'],...cards.map(c=>[c.id,c.name])],a.cardId)}</select></div></div>
 <div class="entry-credit">${as('installments','Parcelas',a.installments,'type="number" min="1" max="120"')}</div>
 <div class="field"><label>Recorrência</label><select name="recurring">${opts([['no','Não'],['yes','Mensal']],a.recurring?'yes':'no')}</select></div>
 </div><div class="agent-note">Compras no cartão exigem cadastro do cartão. O vencimento da primeira parcela será calculado pelo fechamento cadastrado; revise em Cartões. O original da foto não é salvo.</div>`,async f=>{
 const v=Object.fromEntries(f.entries());const tx={id:uid(),type:v.type,description:v.description.trim(),amount:Number(v.amount),macro:v.macro,micro:v.micro.trim(),purchaseDate:v.purchaseDate,paymentDate:v.paymentDate,paymentMethod:v.paymentMethod,
 accountId:v.accountId||'cash-default',cardId:v.cardId||'',installments:Number(v.installments)||1,firstDue:v.paymentDate,recurring:v.recurring==='yes',recurringEnd:'',asset:'',operation:'aporte'};
 if(!tx.description||!Number.isFinite(tx.amount)||tx.amount<=0)throw Error('Verifique descrição e valor positivo.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(tx.purchaseDate))throw Error('Informe uma data válida.');
 if(!['income','expense'].includes(tx.type))throw Error('Este card é para receitas e despesas. Use o card separado de investimentos ou transferências.');
 if(tx.paymentMethod==='unspecified')throw Error('Escolha a forma de pagamento.');if(tx.paymentMethod==='cash'&&!state.accounts.some(x=>x.id===tx.accountId&&x.type==='cash'))throw Error('Cadastre e selecione uma carteira em Contas e cartões para pagamentos em dinheiro.');if(tx.paymentMethod==='pix'&&!state.accounts.some(x=>x.id===tx.accountId&&x.type==='bank'))throw Error('Selecione uma conta bancária para Pix ou débito.');
 if(!Number.isInteger(tx.installments)||tx.installments<1||tx.installments>120)throw Error('Parcelamento inválido.');
 if(tx.paymentMethod==='credit'){
  const card=state.accounts.find(c=>c.type==='card'&&c.id===tx.cardId);
  if(!card)throw Error('Cadastre e selecione um cartão de crédito antes de salvar.');
  if(tx.type!=='expense'||tx.recurring)throw Error('Cartão de crédito aceita apenas despesas não recorrentes.');
  tx.firstDue=firstDueForCard(tx.purchaseDate,card);tx.dueDay=Number(tx.firstDue.slice(-2));tx.paymentDate=tx.firstDue;
 }else{tx.cardId='';tx.paymentDate=tx.purchaseDate;tx.firstDue='';tx.installments=1;}
 if(tx.type==='investment'){tx.macro='Investimentos';tx.asset=tx.description;}
 const dup=state.transactions.some(t=>t.type===tx.type&&simplify(t.description)===simplify(tx.description)&&Math.abs(+t.amount-tx.amount)<0.001&&t.purchaseDate===tx.purchaseDate&&String(t.cardId||'')===String(tx.cardId||''));
 if(dup)throw Error('Possível lançamento duplicado encontrado. Confira o histórico antes de salvar.');
 const selected=chosenSubcategory(f,tx.macro);tx.micro=selected.micro;const previousState=state;
 state={...state,taxonomy:selected.catalog,transactions:[...state.transactions,tx]};
 try{
  // Use the same encrypted save path as traditional entries, including sync dirty tracking.
  await save();
  const readback=await readVault(),decrypted=await decryptData(readback,passphrase);
  if(!decrypted.transactions.some(x=>x.id===tx.id))throw Error('Não consegui confirmar a gravação no cofre.');
  state=ensureFinancialState(decrypted);
 }catch(error){state=previousState;throw error;}
 agentDraft=null;$('#modalRoot').innerHTML='';renderAll();
 const msg=document.getElementById('saveToast');if(msg){msg.textContent='✓ Lançamento salvo e verificado: '+fmt(tx.amount)+' · '+tx.description;msg.hidden=false;setTimeout(()=>msg.hidden=true,7000)}
 return false;
 });
 const paymentSelect=$('#modalForm select[name="paymentMethod"]'),accountSelect=$('#modalForm select[name="accountId"]');
 const syncAccount=()=>{
  const method=paymentSelect.value,credit=method==='credit',type=method==='cash'?'cash':'bank';
  $('#agentAccountField').hidden=credit;
  accountSelect.disabled=credit;
  document.querySelectorAll('#modalForm .entry-credit').forEach(el=>{el.hidden=!credit;el.querySelectorAll('input,select').forEach(input=>input.disabled=!credit)});
  const keep=accountSelect.value;
  accountSelect.innerHTML=state.accounts.filter(a=>a.type===type).map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
  if([...accountSelect.options].some(o=>o.value===keep))accountSelect.value=keep;
  if(!credit&&!accountSelect.options.length)$('#modalError').textContent=type==='cash'?'Cadastre uma carteira de dinheiro físico em Contas e cartões.':'Cadastre uma conta bancária.';
  else $('#modalError').textContent='';
 };
 const cardSelect=$('#modalForm select[name="cardId"]'),purchaseInput=$('#modalForm input[name="purchaseDate"]'),dueInput=$('#modalForm input[name="paymentDate"]');
 const updateDue=()=>{if(paymentSelect.value!=='credit')return;const card=cards.find(c=>c.id===cardSelect?.value);if(card&&purchaseInput?.value&&dueInput)dueInput.value=firstDueForCard(purchaseInput.value,card)};
 paymentSelect.onchange=()=>{syncAccount();updateDue()};
 if(cardSelect)cardSelect.onchange=updateDue;
 if(purchaseInput)purchaseInput.onchange=updateDue;
 syncAccount();updateDue();
 connectSubcategory($('#modalForm'),recognizedCategory(a.macro),a.micro);
 const action=$('#modalForm button[type="submit"]');action.textContent='✓ Confirmar e gravar';
 const amountBox=$('#modalForm input[name="amount"]');
 if(amountBox)amountBox.addEventListener('input',()=>{const v=Number(amountBox.value),preview=$('#modalForm .agent-value');if(preview)preview.textContent=Number.isFinite(v)&&v>0?fmt(v):'Valor a corrigir';const cb=$('#amountConfirmed');if(cb)cb.checked=false;});
}
