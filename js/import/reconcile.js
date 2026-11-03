'use strict';
// Motor puro de conciliação PROVISÓRIA. Nunca classifica um pagamento como confirmado sem aprovação.
const ReconcileRules=Object.freeze({
 day(d){return Math.round(Date.parse(d+'T12:00:00Z')/86400000)},
 norm(s){return ImportRules.norm(s).replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim()},
 flatten(files){
  const out=[];
  files.forEach((f,fi)=>{
   const source=ImportRules.source(f.source);
   if(f.status!=='ok'||!source)return;
   (f.rows||[]).forEach((r,ri)=>{
    if(!ImportRules.date(r.date)||!Number.isSafeInteger(r.amountCents)||!r.description)return;
    out.push({id:fi+':'+ri,fileIndex:fi,rowIndex:ri,source:f.source,kind:source.kind,date:r.date,description:String(r.description),amountCents:r.amountCents,reference:r.reference||'',filename:f.name});
   });
  });
  return out;
 },
 category(desc){
  const s=ReconcileRules.norm(desc);
  const rules=[
   ['Transporte','Combustível',/\b(combustivel|abastec|gasolina|etanol|posto)\b/],
   ['Transporte','Manutenção',/\b(oficina|pneu|mecanico|revisao)\b/],
   ['Alimentação','Supermercado',/\b(supermercado|atacadao|mercearia|mercado)\b/],
   ['Alimentação','Restaurante',/\b(restaurante|almoco|jantar|lanchonete)\b/],
   ['Alimentação','Delivery',/\b(ifood|delivery)\b/],
   ['Moradia','Energia',/\b(energia|eletricidade)\b/],
   ['Moradia','Água',/\b(saneamento|companhia de agua)\b/],
   ['Moradia','Internet',/\b(internet|banda larga)\b/],
   ['Saúde','Farmácia',/\b(farmacia|drogaria)\b/],
   ['Educação','Cursos',/\b(curso|faculdade)\b/],
   ['Financeiro','Juros',/\b(juros|encargos)\b/],
  ];
  const found=rules.find(x=>x[2].test(s));return found?{macro:found[0],micro:found[1]}:null;
 },
 review(files,financial){
  const rows=ReconcileRules.flatten(files),map=new Map(rows.map(r=>[r.id,{...r,status:'review',reason:'Conferir descrição e classificação',related:[],category:ReconcileRules.category(r.description)}]));
  const byKey=new Map();
  for(const r of rows){
   const key=[r.source,r.date,r.amountCents,ReconcileRules.norm(r.description)].join('|');
   const matches=byKey.get(key)||[];matches.push(r);byKey.set(key,matches);
  }
  // Mesmo lançamento em PDFs sobrepostos: ALERTAR, não excluir (transações legítimas podem ser idênticas).
  for(const matches of byKey.values())if(matches.length>1&&new Set(matches.map(x=>x.fileIndex)).size>1){
   for(const r of matches){const x=map.get(r.id);x.status='duplicate';x.reason='Possível repetição entre arquivos da mesma origem';x.related=matches.filter(p=>p.id!==r.id).map(p=>p.id)}
  }
  // Conciliar somente pares 1:1 inequívocos em origens bancárias distintas.
  const banks=rows.filter(r=>r.kind==='bank');
  const lookup=new Map();
  for(const b of banks){
   const key=b.amountCents+'|'+ReconcileRules.day(b.date),items=lookup.get(key)||[];
   items.push(b);lookup.set(key,items);
  }
  const opposite=new Map();
  for(const a of banks){
   const candidates=[],day=ReconcileRules.day(a.date);
   for(let delta=-2;delta<=2;delta++){
    const key=(-a.amountCents)+'|'+(day+delta);
    for(const b of lookup.get(key)||[]){
     if(b.id!==a.id&&b.source!==a.source){candidates.push(b);if(candidates.length>1)break}
    }
    if(candidates.length>1)break;
   }
   opposite.set(a.id,candidates);
  }
  for(const a of banks){
   if(map.get(a.id).status==='duplicate')continue;
   const c=opposite.get(a.id);
   if(c.length===1&&opposite.get(c[0].id).length===1&&map.get(c[0].id).status!=='duplicate'){
    const x=map.get(a.id);x.status='transfer';x.reason='Possível transferência entre contas próprias (mesmo valor, sinais opostos, até 2 dias)';x.related=[c[0].id];
   }
  }
  // Não inferir que saques e Pix de terceiros são receita ou despesa.
  for(const a of banks){
   const x=map.get(a.id),d=ReconcileRules.norm(a.description);
   if(x.status!=='review')continue;
   if(a.amountCents<0&&/\b(saque|atm|retirada em dinheiro)\b/.test(d)){
    x.status='cash';x.reason='Possível saque para carteira: conferir destino do dinheiro';continue;
   }
   if(a.amountCents>0&&/\bpix\b/.test(d)){
    x.status='pix';x.reason='Pix recebido: verificar se é receita, transferência ou troca por espécie';continue;
   }
   if(a.amountCents<0&&/\b(fatura|pagamento cartao|cartao credito|pgto cartao)\b/.test(d)){
    x.status='invoice';x.reason='Possível pagamento de fatura; conferir cartão e mês, sem gerar nova despesa';continue;
   }
   // Independente de classificação, nunca marcar automaticamente como liquidado.
  }
  // Correspondências aproximadas com registros já existentes: alerta para não duplicar importações.
  const existing=new Set();
  for(const t of financial?.transactions||[]){
   if(t.recurring)continue;
   const dt=t.purchaseDate||t.paymentDate;if(!ImportRules.date(dt))continue;
   const key=[t.cardId?'card':'bank',Math.round(Number(t.amount)*100),ReconcileRules.norm(t.description)].join('|');
   for(let diff=-1;diff<=1;diff++)existing.add(key+'|'+(ReconcileRules.day(dt)+diff));
  }
  for(const r of rows){
   const x=map.get(r.id);
   if(x.status!=='review')continue;
   const key=[r.kind,Math.abs(r.amountCents),ReconcileRules.norm(r.description)].join('|')+'|'+ReconcileRules.day(r.date);
   if(existing.has(key)){x.status='existing';x.reason='Possível lançamento já presente no cofre: verificar antes de importar'}
  }
  return rows.map(r=>map.get(r.id));
 },
 monthly(files,financial){
  const matched=ReconcileRules.review(files,financial),monthMap=new Map();
  for(const f of files){
   const source=ImportRules.source(f.source);
   if(f.status!=='ok'||!source)continue;
   for(const r of f.rows||[]){
    const month=r.date.slice(0,7),key=f.source+'|'+month;
    if(!monthMap.has(key))monthMap.set(key,{month,source:f.source,kind:source.kind,count:0,positive:0,negative:0,flagged:0,unreadable:0,files:new Set()});
    const item=monthMap.get(key);item.count++;item.files.add(f.name);
    if(r.amountCents>0)item.positive+=r.amountCents;else item.negative+=-r.amountCents;
   }
  }
  for(const row of matched){
   const rec=monthMap.get(row.source+'|'+row.date.slice(0,7));
   if(rec&&row.status!=='review')rec.flagged++;
  }
  // Linhas não reconhecidas sem data segura bloqueiam o fechamento de TODOS os meses dessa fonte.
  for(const f of files){
   const source=ImportRules.source(f.source);if(!source||f.status!=='ok')continue;
   if((f.unreadable||[]).length||(f.issues||[]).length){
    for(const rec of monthMap.values())if(rec.source===f.source)rec.unreadable+=(f.unreadable||[]).length+(f.issues||[]).length;
   }
  }
  return [...monthMap.values()].map(x=>({...x,net:x.positive-x.negative,files:[...x.files]})).sort((a,b)=>a.month.localeCompare(b.month)||a.source.localeCompare(b.source));
 },
 openingForMonth(financial,accountId,month){
  const account=(financial?.accounts||[]).find(a=>a.id===accountId&&(a.type==='bank'||a.type==='cash'));
  if(!account||!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month))return {ok:false,reason:'Selecione a conta bancária correspondente ao extrato.'};
  const january=month.slice(0,4)+'-01';
  if(month===january){
   if(account.openingDate!==january||!Number.isFinite(Number(account.openingBalance)))
    return {ok:false,reason:'Cadastre na conta o saldo oficial de 01/01/'+month.slice(0,4)+' antes de conciliar janeiro.'};
   return {ok:true,opening:Math.round(Number(account.openingBalance)*100),origin:'Saldo inicial oficial em '+january};
  }
  const [year,m]=month.split('-').map(Number);
  const previous=m===1?(year-1)+'-12':year+'-'+String(m-1).padStart(2,'0');
  const matching=(financial?.importCheckpoints||[]).filter(c=>c.accountId===accountId&&c.month===previous&&c.status==='bank-balance-checked'&&c.coverage===true);
  if(matching.length!==1||!Number.isSafeInteger(matching[0].closing))
   return {ok:false,reason:'Conclua a conferência de '+previous+' desta mesma conta antes de avançar para '+month+'.'};
  return {ok:true,opening:matching[0].closing,origin:'Saldo final conferido em '+previous};
 },
 checkBankMonth(summary,openingCents,closingCents,coverage,unresolved=0){
  if(!summary||summary.kind!=='bank')return {ok:false,reason:'Somente contas correntes possuem conferência de saldo bancário.'};
  if(!Number.isSafeInteger(openingCents)||!Number.isSafeInteger(closingCents))return {ok:false,reason:'Informe os saldos de abertura e encerramento.'};
  if(!coverage)return {ok:false,reason:'Confirme que o arquivo cobre o mês inteiro antes de conferir.'};
  if(summary.unreadable>0||unresolved>0)return {ok:false,reason:'Existem linhas não reconhecidas; revise o arquivo antes de conferir o saldo.'};
  const expected=openingCents+summary.net,difference=closingCents-expected;
  return {ok:difference===0,reason:difference===0?'Saldo bancário conferido; classificação das operações ainda pendente.':'Há diferença entre o saldo informado e a movimentação lida.',expected,difference};
 }
});
