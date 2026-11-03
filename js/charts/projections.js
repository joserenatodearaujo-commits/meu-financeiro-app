'use strict';
// Meu Financeiro • Recurring/card forecast charts (no speculative projected Sankey).
function projectionMonths(n){return Array.from({length:n},(_,i)=>addMonths(selectedMonth,i))}function future(m){const grp={};FinanceRules.commitments(state,m).forEach(t=>{if(!t.recurring&&!t.cardId)return;const cat=t.macro||'Outros';grp[cat]=(grp[cat]||0)+Number(t.amount)});return grp}function groupedChart(months){const data=months.map(m=>({m,data:future(m)})),cats=[...new Set(data.flatMap(d=>Object.keys(d.data)))],totals=Object.fromEntries(cats.map(c=>[c,data.reduce((a,d)=>a+(d.data[c]||0),0)])),maxCat=Math.max(...Object.values(totals),1);cats.sort((a,b)=>totals[b]-totals[a]);const max=Math.max(...data.map(d=>Object.values(d.data).reduce((a,b)=>a+b,0)),1)*1.15;const W=Math.max(690,months.length*(cats.length*15+40)),H=320,base=267,left=48,groupW=(W-left-10)/months.length,barW=Math.max(4,Math.min(16,(groupW-14)/Math.max(1,cats.length)));let g='';for(let k=0;k<=4;k++){const y=base-k*220/4;g+=`<line x1="${left}" y1="${y}" x2="${W-5}" y2="${y}" stroke="#e5e9ed"/><text x="${left-6}" y="${y+4}" text-anchor="end" font-size="10" fill="#637086">${svgText(fmt(max*k/4))}</text>`}data.forEach((d,i)=>{cats.forEach((c,j)=>{const val=d.data[c]||0,h=val/max*220,x=left+i*groupW+7+j*barW;g+=`<rect x="${x}" y="${base-h}" width="${barW-2}" height="${h}" rx="2" fill="${colorExpense(totals[c],maxCat)}"><title>${svgText(c)} — ${d.m}: ${svgText(fmt(val))}</title></rect>`});g+=`<text x="${left+i*groupW+groupW/2}" y="286" text-anchor="middle" font-size="11" fill="#637086">${d.m.slice(5)}/${d.m.slice(2,4)}</text>`});const mobileBars=data.map(d=>{const sum=Object.values(d.data).reduce((a,b)=>a+b,0);return `<div class="mobile-month"><div class="mobile-bars">${cats.map(c=>{const value=d.data[c]||0;const ht=Math.max(0,value/max*108);return `<div class="mobile-bar" title="${esc(c)}: ${fmt(value)}" style="height:${ht.toFixed(1)}px;background:${colorExpense(totals[c],maxCat)}"></div>`}).join('')}</div><div class="mobile-month-label">${esc(d.m.slice(5))}/${esc(d.m.slice(2,4))}</div><div class="mobile-month-value">${fmt(sum)}</div></div>`}).join('');
return `<div class="chart-scroll is-projection"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Projeção mensal agrupada por categoria">${g}</svg></div><div class="mobile-projection">${cats.length?`<div class="mobile-month-grid">${mobileBars}</div>`:`<p class="empty">Cadastre despesas recorrentes ou parcelas do cartão.</p>`}</div><div class="legend">${cats.map(c=>`<span><i class="dot" style="background:${colorExpense(totals[c],maxCat)}"></i>${esc(c)}</span>`).join('')||'<span>Cadastre despesas recorrentes ou compras parceladas para visualizar.</span>'}</div>`}


// Compact future commitments widget (v2.23). Read-only and shared by desktop / Android.
let projectionSummaryHorizon=3;
let projectionSelectedMonth='';
function compactProjection(months){
 const formatMonth=m=>m.slice(5)+'/'+m.slice(2,4);
 const cents=v=>Math.round((Number(v)||0)*100);
 const money=v=>fmt(v/100);
 const data=months.map(month=>{
  const entries=FinanceRules.commitments(state,month).filter(t=>t.recurring||t.cardId);
  const cards=new Map(),categories=new Map(),allRows=[];
  for(const e of entries){
   const amount=cents(e.amount);if(amount<=0)continue;
   const cat=e.macro||'Outros';
   const name=e.cardId?(state.accounts||[]).find(a=>a.id===e.cardId)?.name||'Cartão não identificado':'Fora dos cartões';
   const row={name,category:cat,description:e.description||cat,amount,cardId:e.cardId||'',when:e.when||month};
   allRows.push(row);
   if(e.cardId)cards.set(name,(cards.get(name)||0)+amount);
   categories.set(cat,(categories.get(cat)||0)+amount);
  }
  const cardsTotal=[...cards.values()].reduce((a,b)=>a+b,0);
  const outsideTotal=allRows.filter(x=>!x.cardId).reduce((a,b)=>a+b.amount,0);
  return {month,rows:allRows,cards,categories,cardsTotal,outsideTotal,total:cardsTotal+outsideTotal};
 });
 const totals={cards:data.reduce((s,x)=>s+x.cardsTotal,0),outside:data.reduce((s,x)=>s+x.outsideTotal,0)};
 const grand=totals.cards+totals.outside;
 const peak=data.reduce((a,b)=>b.total>a.total?b:a,data[0]);
 const selected=data.find(x=>x.month===projectionSelectedMonth)||data[0];
 const categoryTotals=new Map();
 for(const d of data)for(const [cat,value] of d.categories)categoryTotals.set(cat,(categoryTotals.get(cat)||0)+value);
 const sortedCats=[...categoryTotals.entries()].sort((a,b)=>b[1]-a[1]);
 const maxCat=Math.max(1,...sortedCats.map(x=>x[1]));
 const maxMonth=Math.max(1,...data.map(x=>x.total));
 const w=720,h=305,left=52,right=16,top=48,bottom=256,plotH=bottom-top;
 const groupWidth=(w-left-right)/months.length;
 let drawing='';
 for(let n=0;n<=4;n++){
  const val=maxMonth*n/4,y=bottom-plotH*n/4;
  drawing+='<line x1="'+left+'" y1="'+y+'" x2="'+(w-right)+'" y2="'+y+'" stroke="#e2e8f0" stroke-dasharray="4 4"/>'+
   '<text x="'+(left-6)+'" y="'+(y+4)+'" fill="#64748b" text-anchor="end" font-size="11">'+esc(Math.round(val/100).toLocaleString('pt-BR'))+'</text>';
 }
 data.forEach((d,i)=>{
  const x=left+groupWidth*(i+.5),barW=Math.min(95,groupWidth*.49);
  const hc=d.cardsTotal/maxMonth*plotH,ho=d.outsideTotal/maxMonth*plotH;
  if(hc>0)drawing+='<rect x="'+(x-barW/2)+'" y="'+(bottom-hc)+'" width="'+barW+'" height="'+hc+'" rx="3" fill="#237ddd"><title>Cartões: '+esc(money(d.cardsTotal))+'</title></rect>';
  if(ho>0)drawing+='<rect x="'+(x-barW/2)+'" y="'+(bottom-hc-ho)+'" width="'+barW+'" height="'+ho+'" rx="3" fill="#ee942f"><title>Fora dos cartões: '+esc(money(d.outsideTotal))+'</title></rect>';
  drawing+='<text x="'+x+'" y="'+Math.max(18,bottom-hc-ho-10)+'" fill="#243449" font-size="13" font-weight="700" text-anchor="middle">'+esc(money(d.total))+'</text>'+
  '<text x="'+x+'" y="'+(bottom+22)+'" fill="#344459" font-size="13" font-weight="700" text-anchor="middle">'+formatMonth(d.month)+'</text>';
 });
 const monthsControls=data.map(d=>'<button type="button" class="projection-month'+(selected.month===d.month?' active':'')+'" data-projection-month="'+d.month+'" aria-pressed="'+(selected.month===d.month)+'"><strong>'+money(d.total)+'</strong><span>'+formatMonth(d.month)+'</span></button>').join('');
 const cardList=[...selected.cards.entries()].sort((a,b)=>b[1]-a[1]);
 const maxCard=Math.max(1,...cardList.map(x=>x[1]));
 const cardRows=cardList.map(([name,value])=>'<div class="future-card-row"><span>'+esc(name)+'</span><div class="future-bar-track"><div style="width:'+(value/maxCard*100).toFixed(1)+'%"></div></div><strong>'+money(value)+'</strong></div>').join('');
 const catRows=sortedCats.slice(0,6).map(([name,value])=>'<button class="future-category-row" type="button" data-future-category="'+esc(name)+'" aria-pressed="'+(projectionCategory===name)+'"><span>'+esc(name)+'</span><span class="future-bar-track"><span style="width:'+(value/maxCat*100).toFixed(1)+'%;background:'+colorExpense(value,maxCat)+'"></span></span><strong>'+money(value)+'</strong><em>'+(grand?((value/grand)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'0%')+'</em></button>').join('');
 const categoryRows=projectionCategory?data.flatMap(d=>d.rows.filter(r=>r.category===projectionCategory).map(r=>({...r,month:d.month}))):[];
 const breakdown=projectionCategory?'<div class="projection-detail"><div class="sectionrow"><strong>'+esc(projectionCategory)+' — compras e vencimentos</strong><button type="button" class="btn small" data-future-category-close>Fechar</button></div>'+categoryRows.map(r=>'<div class="projection-detail-row"><span>'+formatMonth(r.month)+' · '+esc(r.description)+' · '+esc(r.name)+'</span><strong>'+money(r.amount)+'</strong></div>').join('')+'</div>':'';
 const pct=grand?(totals.cards/grand*100).toLocaleString('pt-BR',{maximumFractionDigits:0}):'0';
 const cards=cardRows||'<p class="muted">Nenhuma fatura pendente cadastrada neste mês.</p>';
 const categories=catRows||'<p class="muted">Nenhum compromisso previsto no período.</p>';
 return '<section class="projection-compact future-overview" aria-label="Impacto de despesas futuras">'+
 '<div class="projection-switch"><span class="muted">Previsão por vencimento · a partir de '+formatMonth(data[0].month)+'</span><div class="projection-toggle" role="group" aria-label="Horizonte da projeção">'+
 [3,6].map(n=>'<button type="button" data-projection-horizon="'+n+'" aria-pressed="'+(projectionSummaryHorizon===n)+'" class="'+(projectionSummaryHorizon===n?'active':'')+'">'+n+' meses</button>').join('')+'</div></div>'+
 '<div class="future-kpis"><div><small>Total previsto</small><strong>'+money(grand)+'</strong></div><div><small>Todos os cartões</small><strong>'+money(totals.cards)+'</strong></div><div><small>Fora dos cartões</small><strong>'+money(totals.outside)+'</strong></div><div><small>Maior mês</small><strong>'+formatMonth(peak.month)+'</strong></div></div>'+
 '<div class="future-section"><h3>Desembolso mensal</h3><div class="future-chart-legend"><span><i style="background:#237ddd"></i>Cartões (faturas)</span><span><i style="background:#ee942f"></i>Outras despesas</span></div>'+
 '<div class="projection-plot"><svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Desembolso previsto por mês, dividido entre cartões de crédito e outras despesas" xmlns="http://www.w3.org/2000/svg">'+drawing+'</svg></div>'+
 '<div class="projection-months">'+monthsControls+'</div></div>'+
 '<div class="future-two-columns"><div class="future-section"><div class="future-section-header"><h3>Faturas por cartão</h3><span class="muted">Mês: '+formatMonth(selected.month)+'</span></div>'+cards+
 '<div class="future-card-total"><span>Total de todos os cartões</span><strong>'+money(selected.cardsTotal)+'</strong></div></div>'+
 '<div class="future-section"><h3>Despesas por categoria</h3><p class="muted future-note">Todo o período selecionado · cartões e despesas fora dos cartões</p>'+categories+breakdown+'</div></div>'+
 '<div class="future-period-summary"><strong>Resumo do período</strong><span>Cartões: '+money(totals.cards)+' ('+pct+'%)</span><span>Outras despesas: '+money(totals.outside)+'</span><span>Total: '+money(grand)+'</span></div>'+
 '<p class="muted future-note">Estimativas baseadas nas despesas recorrentes e parcelas ainda pendentes. Faturas já pagas não entram novamente na previsão. Não inclui compras futuras ainda não registradas.</p>'+
 '<button type="button" class="btn projection-details-button" data-go="projecoes">Ver vencimentos e detalhamento ›</button></section>';
}
let projectionCategory='';

document.addEventListener('click',e=>{
 const horizon=e.target.closest('[data-projection-horizon]');
 if(horizon){projectionSummaryHorizon=Number(horizon.dataset.projectionHorizon)===6?6:3;projectionSelectedMonth='';summary();return}
 const month=e.target.closest('[data-projection-month]');
 if(month){projectionSelectedMonth=projectionSelectedMonth===month.dataset.projectionMonth?'':month.dataset.projectionMonth;summary();return}
 if(e.target.closest('[data-projection-close]')){projectionSelectedMonth='';summary();return}
 const category=e.target.closest('[data-future-category]');
 if(category){projectionCategory=projectionCategory===category.dataset.futureCategory?'':category.dataset.futureCategory;summary();return}
 if(e.target.closest('[data-future-category-close]')){projectionCategory='';summary();return}
 if(e.target.closest('.projection-compact [data-go="projecoes"]')){page('projecoes')}
});


// v2.26 — Two focused views for the Projeções page. No persisted state changes.
let cardForecastSelection='all',cardForecastCategory='';
function cardForecastModel(months){
 const invoices=FinanceRules.invoices(state),cardAccounts=(state.accounts||[]).filter(a=>a.type==='card');
 const period=new Set(months),byId=new Map();
 for(const a of cardAccounts)byId.set(a.id,{id:a.id,name:a.name||'Cartão',total:0,months:new Map(),cats:new Map(),nextDue:null,rows:[]});
 // Existing invoice engine already applies card installments and paid amounts,
 // including partially paid invoices. Never add card purchases a second time.
 for(const inv of invoices){
  if(!period.has(inv.month)||inv.outstanding<=0)continue;
  if(!byId.has(inv.cardId))byId.set(inv.cardId,{id:inv.cardId,name:'Cartão não identificado',total:0,months:new Map(),cats:new Map(),nextDue:null,rows:[]});
  const card=byId.get(inv.cardId),amount=Math.round(inv.outstanding*100);
  card.total+=amount;card.months.set(inv.month,(card.months.get(inv.month)||0)+amount);
  if(!card.nextDue||inv.due<card.nextDue)card.nextDue=inv.due;
  const positiveRows=inv.rows.filter(r=>r.amount>0);
  const base=positiveRows.reduce((s,r)=>s+Math.round(r.amount*100),0);
  let remaining=amount;
  positiveRows.forEach((r,i)=>{
   const share=i===positiveRows.length-1?remaining:Math.floor(amount*Math.round(r.amount*100)/Math.max(1,base));
   remaining-=share;
   if(share<=0)return;
   const cat=r.macro||'Outros';
   card.cats.set(cat,(card.cats.get(cat)||0)+share);
   card.rows.push({cat,micro:r.micro||'Diversos',name:r.description||cat,amount:share,month:inv.month,due:r.due});
  });
 }
 const cards=[...byId.values()].filter(c=>c.total>0).sort((a,b)=>b.total-a.total);
 const total=cards.reduce((s,c)=>s+c.total,0);
 const byMonth=months.map(month=>({month,total:cards.reduce((s,c)=>s+(c.months.get(month)||0),0)}));
 return {cards,total,byMonth,months};
}
function cardForecastPage(months){
 const model=cardForecastModel(months),{cards,total,byMonth}=model;
 if(cardForecastSelection!=='all'&&!cards.some(c=>c.id===cardForecastSelection))cardForecastSelection='all';
 const card=cards.find(c=>c.id===cardForecastSelection);
 const picked=card?[card]:cards;
 const filteredTotal=picked.reduce((s,c)=>s+c.total,0);
 const categories=new Map();
 for(const c of picked)for(const [name,value] of c.cats)categories.set(name,(categories.get(name)||0)+value);
 const catList=[...categories].sort((a,b)=>b[1]-a[1]);
 const cent=v=>fmt(v/100);
 const monthLabel=m=>m.slice(5)+'/'+m.slice(2,4);
 const dateLabel=d=>d?d.split('-').reverse().join('/'):'—';
 const percent=(v,base)=>base?((100*v/base).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'):'0%';
 const options=[3,6].map(n=>'<button type="button" data-forecast-horizon="'+n+'" class="'+(months.length===n?'active':'')+'" aria-pressed="'+(months.length===n)+'">'+n+' meses</button>').join('');
 const monthPeak=byMonth.reduce((a,b)=>b.total>a.total?b:a,byMonth[0]);
 const cardRows=cards.map(c=>{
  const avg=c.total/months.length;
  const active=cardForecastSelection===c.id;
  return '<button type="button" class="forecast-card-line'+(active?' active':'')+'" data-forecast-card="'+esc(c.id)+'" aria-pressed="'+active+'">'+
   '<span class="forecast-card-name">'+esc(c.name)+'</span><strong>'+cent(c.total)+'</strong><span>'+cent(avg)+'</span><span>'+dateLabel(c.nextDue)+'</span><span aria-hidden="true">›</span></button>';
 }).join('');
 const cardsBox='<section class="forecast-box"><div class="forecast-box-heading"><h3>Faturas por cartão</h3><span class="muted">Valores pendentes no período</span></div>'+
  '<div class="forecast-metrics"><div><small>Todos os cartões</small><strong>'+cent(total)+'</strong></div><div><small>Maior cartão</small><strong>'+esc(cards[0]?.name||'—')+'</strong><span>'+cent(cards[0]?.total||0)+'</span></div><div><small>Maior mês</small><strong>'+monthLabel(monthPeak.month)+'</strong><span>'+cent(monthPeak.total)+'</span></div></div>'+
  '<div class="forecast-card-table"><div class="forecast-card-head"><span>Cartão</span><span>Total ('+months.length+' meses)</span><span>Média/mês</span><span>Próx. fatura</span><span></span></div>'+
  (cardRows||'<p class="muted forecast-empty">Nenhuma fatura pendente registrada para este período.</p>')+'</div>'+
  '<div class="forecast-total-line"><span>Total de todos os cartões</span><strong>'+cent(total)+'</strong></div>'+
  '<div class="forecast-monthly"><h4>Faturas previstas por mês</h4>'+byMonth.map(d=>'<div><span>'+monthLabel(d.month)+'</span><strong>'+cent(d.total)+'</strong></div>').join('')+'</div></section>';
 const colors=['#24a569','#3289db','#f38c2f','#9658db','#e34d51','#98a4ad','#22aaa1','#d5a02e'];
 let angle=0;const segments=catList.map(([name,value],i)=>{const start=angle;angle+=filteredTotal?value/filteredTotal*360:0;return {name,value,color:colors[i%colors.length],start,end:angle}});
 const gradient=segments.length?'conic-gradient('+segments.map(s=>s.color+' '+s.start.toFixed(3)+'deg '+s.end.toFixed(3)+'deg').join(',')+')':'conic-gradient(#e7edf2 0deg 360deg)';
 const filters=[{id:'all',name:'Todos os cartões'},...cards.map(c=>({id:c.id,name:c.name}))].map(c=>'<button type="button" data-forecast-card="'+esc(c.id)+'" class="'+(cardForecastSelection===c.id?'active':'')+'" aria-pressed="'+(cardForecastSelection===c.id)+'">'+esc(c.name)+'</button>').join('');
 const categoryRows=segments.map(s=>'<button type="button" class="forecast-category-row'+(cardForecastCategory===s.name?' active':'')+'" data-forecast-category="'+esc(s.name)+'">'+
 '<i style="background:'+s.color+'"></i><span>'+esc(s.name)+'</span><strong>'+cent(s.value)+'</strong><em>'+percent(s.value,filteredTotal)+'</em></button>').join('');
 const matching=cardForecastCategory?picked.flatMap(c=>c.rows.filter(r=>r.cat===cardForecastCategory).map(r=>({...r,cardName:c.name}))):[];
 const categoryDetails=cardForecastCategory?'<div class="forecast-category-details"><div class="sectionrow"><strong>'+esc(cardForecastCategory)+' — parcelas previstas</strong><button type="button" class="btn small" data-forecast-category-clear>Fechar</button></div>'+
 matching.map(r=>'<div class="projection-detail-row"><span>'+esc(r.cardName)+' · '+esc(r.micro)+' · '+esc(r.name)+' · '+dateLabel(r.due)+'</span><strong>'+cent(r.amount)+'</strong></div>').join('')+'</div>':'';
 const catsBox='<section class="forecast-box"><div class="forecast-box-heading"><h3>Despesas por categoria</h3><span class="muted">Somente faturas pendentes dos cartões</span></div>'+
 '<div class="forecast-card-filters"><strong>Filtrar por cartão</strong><div>'+filters+'</div></div>'+
 '<div class="forecast-donut-layout"><div class="forecast-donut" role="img" aria-label="Distribuição das despesas por categoria: '+esc(cardForecastSelection==='all'?'todos os cartões':card?.name)+'" style="background:'+gradient+'"><div><strong>'+cent(filteredTotal)+'</strong><span>Total previsto<br>('+months.length+' meses)</span></div></div>'+
 '<div class="forecast-category-list"><div class="forecast-category-header"><span>Categoria</span><span>Valor</span><span>%</span></div>'+
 (categoryRows||'<p class="muted forecast-empty">Nenhuma despesa prevista neste filtro.</p>')+'</div></div>'+categoryDetails+'</section>';
 return '<div class="forecast-page"><div class="forecast-header"><span>Faturas pendentes por vencimento · '+monthLabel(months[0])+' a '+monthLabel(months[months.length-1])+'</span><div class="projection-toggle">'+options+'</div></div>'+
 '<div class="forecast-two-views">'+cardsBox+catsBox+'</div>'+
 '<p class="muted forecast-disclaimer">A soma considera as parcelas das faturas cadastradas, descontando pagamentos já registrados. Compras de cartão não são contadas novamente. Não inclui compras futuras ainda não realizadas nem despesas fora dos cartões.</p></div>';
}
document.addEventListener('click',e=>{
 const horizon=e.target.closest('[data-forecast-horizon]');
 if(horizon){const select=document.querySelector('#projHorizon');select.value=horizon.dataset.forecastHorizon;cardForecastCategory='';renderProjection();return}
 const card=e.target.closest('[data-forecast-card]');
 if(card){cardForecastSelection=card.dataset.forecastCard;cardForecastCategory='';renderProjection();return}
 const category=e.target.closest('[data-forecast-category]');
 if(category){cardForecastCategory=cardForecastCategory===category.dataset.forecastCategory?'':category.dataset.forecastCategory;renderProjection();return}
 if(e.target.closest('[data-forecast-category-clear]')){cardForecastCategory='';renderProjection()}
});
