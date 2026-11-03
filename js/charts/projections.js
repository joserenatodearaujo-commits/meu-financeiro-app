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
