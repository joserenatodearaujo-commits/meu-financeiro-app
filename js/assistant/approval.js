'use strict';
// Meu Financeiro • Approval card, validation, duplicate prevention, encrypted write verification.
function openApproval(a){stopVoice();cleanAgentImage();
 const opts=(list,current)=>list.map(([v,label])=>`<option value="${esc(v)}" ${String(v)===String(current)?'selected':''}>${esc(label)}</option>`).join('');
 const as=(name,label,value,attrs='')=>`<div class="field"><label>${label}</label><input class="agent-input" name="${name}" value="${esc(value)}" ${attrs}></div>`;
 const catOpt=opts(categoryList().map(x=>[x,x]),recognizedCategory(a.macro));
 const cards=state.accounts.filter(x=>x.type==='card');
 const pay=[['unspecified','Escolher pagamento'],['pix','Pix'],['cash','Dinheiro'],['debit','Cartão de débito'],['credit','Cartão de crédito']];
 const activeAccounts=state.accounts.filter(a=>a.type==='bank'||a.type==='cash');const accountOpts=opts(activeAccounts.map(x=>[x.id,x.name]),activeAccounts.find(x=>x.type===(a.paymentMethod==='cash'?'cash':'bank'))?.id||'cash-default');
 const warning=a.amount<=0?'Valor não identificado. Informe manualmente.':a.amountIssue|| (a.paymentMethod==='unspecified'?'Selecione a forma de pagamento antes de gravar.':'Confirme os dados identificados; a interpretação pode cometer erros.');
 const requireCheck=!!(a.fromVoice||a.fromPhoto||a.amountUncertain);
 const valueReview=requireCheck?`<div class="amount-confirm"><label><input type="checkbox" name="amountConfirmed" id="amountConfirmed" required> <span>Conferi o valor da despesa em reais e centavos</span></label></div>`:'';
 const originalVoice=a.fromVoice?`<div class="agent-original"><strong>Você disse (transcrição do Android):</strong><div>${esc(a.sourceText||'')}</div><small>Se a transcrição estiver errada, corrija o campo Valor abaixo.</small></div>`:'';
 modal('Confirmar lançamento',`<div class="agent-preview"><div class="muted">Prévia • nenhum dado foi gravado</div><div class="agent-value">${fmt(a.amount)}</div><b>${esc(a.description)}</b><div class="agent-warning">${esc(warning)}</div>${originalVoice}${valueReview}</div><div class="formgrid">
 <div class="field"><label>Tipo</label><select name="type">${opts([['expense','Despesa'],['income','Receita'],['investment','Investimento'],['transfer','Transferência']],a.type)}</select></div>
 ${as('description','Descrição',a.description,'required maxlength="120"')}
 ${as('amount','Valor R$',a.amount||'','type="number" min="0.01" step="0.01" required')}
 <div class="field"><label>Macro</label><select name="macro">${catOpt}</select></div>
 ${subcategoryField(a.macro,a.micro)}
 ${as('purchaseDate','Data da compra',a.purchaseDate,'type="date" required')}
 ${as('paymentDate','Data do desembolso',a.paymentDate,'type="date" required')}
 <div class="field"><label>Pagamento</label><select name="paymentMethod">${opts(pay,a.paymentMethod)}</select></div>
 <div class="field" id="agentAccountField"><label>Conta debitada ou creditada</label><select name="accountId">${accountOpts}</select></div>
 <div class="field"><label>Cartão cadastrado</label><select name="cardId">${opts([['','Sem cartão selecionado'],...cards.map(c=>[c.id,c.name])],a.cardId)}</select></div>
 ${as('installments','Parcelas',a.installments,'type="number" min="1" max="120"')}
 <div class="field"><label>Recorrência</label><select name="recurring">${opts([['no','Não'],['yes','Mensal']],a.recurring?'yes':'no')}</select></div>
 </div><div class="agent-note">Compras no cartão exigem cadastro do cartão. O vencimento da primeira parcela será calculado pelo fechamento cadastrado; revise em Cartões. O original da foto não é salvo.</div>`,async f=>{
 const v=Object.fromEntries(f.entries());const tx={id:uid(),type:v.type,description:v.description.trim(),amount:Number(v.amount),macro:v.macro,micro:v.micro.trim(),purchaseDate:v.purchaseDate,paymentDate:v.paymentDate,paymentMethod:v.paymentMethod,
 accountId:v.accountId||'cash-default',cardId:v.cardId||'',installments:Number(v.installments)||1,firstDue:v.paymentDate,recurring:v.recurring==='yes',recurringEnd:'',asset:'',operation:'aporte'};
 if(!tx.description||!Number.isFinite(tx.amount)||tx.amount<=0)throw Error('Verifique descrição e valor positivo.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(tx.purchaseDate)||!/^\d{4}-\d{2}-\d{2}$/.test(tx.paymentDate))throw Error('Informe datas válidas.');
 if(!['income','expense','investment','transfer'].includes(tx.type))throw Error('Tipo inválido.');
 if(tx.paymentMethod==='unspecified')throw Error('Escolha a forma de pagamento.');if(tx.paymentMethod==='cash'&&!state.accounts.some(x=>x.id===tx.accountId&&x.type==='cash'))throw Error('Cadastre e selecione uma carteira em Contas e cartões para pagamentos em dinheiro.');if(['pix','debit'].includes(tx.paymentMethod)&&!state.accounts.some(x=>x.id===tx.accountId&&x.type==='bank'))throw Error('Selecione uma conta bancária para Pix ou débito.');
 if(!Number.isInteger(tx.installments)||tx.installments<1||tx.installments>120)throw Error('Parcelamento inválido.');
 if(tx.paymentMethod==='credit'){
  const card=state.accounts.find(c=>c.type==='card'&&c.id===tx.cardId);
  if(!card)throw Error('Cadastre e selecione um cartão de crédito antes de salvar.');
  if(tx.type!=='expense'||tx.recurring)throw Error('Cartão de crédito aceita apenas despesas não recorrentes.');
  tx.firstDue=firstDueForCard(tx.purchaseDate,card);tx.dueDay=Number(tx.firstDue.slice(-2));tx.paymentDate=tx.firstDue;
 }else{tx.cardId='';if(tx.installments>1)throw Error('Parcelamento exige um cartão de crédito.');}
 if(tx.type==='investment'){tx.macro='Investimentos';tx.asset=tx.description;}
 const dup=state.transactions.some(t=>t.type===tx.type&&simplify(t.description)===simplify(tx.description)&&Math.abs(+t.amount-tx.amount)<0.001&&t.purchaseDate===tx.purchaseDate&&String(t.cardId||'')===String(tx.cardId||''));
 if(dup)throw Error('Possível lançamento duplicado encontrado. Confira o histórico antes de salvar.');
 const selected=chosenSubcategory(f,tx.macro);tx.micro=selected.micro;const newState={...state,taxonomy:selected.catalog,transactions:[...state.transactions,tx]};
 const encrypted=await encryptData(newState,passphrase,salt);
 await writeVault(encrypted); // gravação durável antes de atualizar interface
 const readback=await readVault(),decrypted=await decryptData(readback,passphrase);
 if(!decrypted.transactions.some(x=>x.id===tx.id))throw Error('Não consegui confirmar a gravação no cofre.');
 state=decrypted;agentDraft=null;$('#modalRoot').innerHTML='';renderAll();
 const msg=document.getElementById('saveToast');if(msg){msg.textContent='✓ Lançamento salvo e verificado: '+fmt(tx.amount)+' · '+tx.description;msg.hidden=false;setTimeout(()=>msg.hidden=true,7000)}
 return false;
 });
 const paymentSelect=$('#modalForm select[name="paymentMethod"]'),accountSelect=$('#modalForm select[name="accountId"]');
 const syncAccount=()=>{
  const method=paymentSelect.value,credit=method==='credit',type=method==='cash'?'cash':'bank';
  $('#agentAccountField').hidden=credit;
  accountSelect.disabled=credit;
  const keep=accountSelect.value;
  accountSelect.innerHTML=state.accounts.filter(a=>a.type===type).map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
  if([...accountSelect.options].some(o=>o.value===keep))accountSelect.value=keep;
  if(!credit&&!accountSelect.options.length)$('#modalError').textContent=type==='cash'?'Cadastre uma carteira de dinheiro físico em Contas e cartões.':'Cadastre uma conta bancária.';
  else $('#modalError').textContent='';
 };
 paymentSelect.onchange=syncAccount;syncAccount();
 connectSubcategory($('#modalForm'),recognizedCategory(a.macro),a.micro);
 const action=$('#modalForm button[type="submit"]');action.textContent='✓ Confirmar e gravar';
 const amountBox=$('#modalForm input[name="amount"]');
 if(amountBox)amountBox.addEventListener('input',()=>{const v=Number(amountBox.value),preview=$('#modalForm .agent-value');if(preview)preview.textContent=Number.isFinite(v)&&v>0?fmt(v):'Valor a corrigir';const cb=$('#amountConfirmed');if(cb)cb.checked=false;});
}
