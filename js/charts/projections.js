'use strict';
// Meu Financeiro • Recurring/card forecast charts (no speculative projected Sankey).
function projectionMonths(n){return Array.from({length:n},(_,i)=>addMonths(selectedMonth,i))}function future(m){const grp={};FinanceRules.commitments(state,m).forEach(t=>{if(!t.recurring&&!t.cardId)return;const cat=t.macro||'Outros';grp[cat]=(grp[cat]||0)+Number(t.amount)});return grp}function groupedChart(months){const data=months.map(m=>({m,data:future(m)})),cats=[...new Set(data.flatMap(d=>Object.keys(d.data)))],totals=Object.fromEntries(cats.map(c=>[c,data.reduce((a,d)=>a+(d.data[c]||0),0)])),maxCat=Math.max(...Object.values(totals),1);cats.sort((a,b)=>totals[b]-totals[a]);const max=Math.max(...data.map(d=>Object.values(d.data).reduce((a,b)=>a+b,0)),1)*1.15;const W=Math.max(690,months.length*(cats.length*15+40)),H=320,base=267,left=48,groupW=(W-left-10)/months.length,barW=Math.max(4,Math.min(16,(groupW-14)/Math.max(1,cats.length)));let g='';for(let k=0;k<=4;k++){const y=base-k*220/4;g+=`<line x1="${left}" y1="${y}" x2="${W-5}" y2="${y}" stroke="#e5e9ed"/><text x="${left-6}" y="${y+4}" text-anchor="end" font-size="10" fill="#637086">${svgText(fmt(max*k/4))}</text>`}data.forEach((d,i)=>{cats.forEach((c,j)=>{const val=d.data[c]||0,h=val/max*220,x=left+i*groupW+7+j*barW;g+=`<rect x="${x}" y="${base-h}" width="${barW-2}" height="${h}" rx="2" fill="${colorExpense(totals[c],maxCat)}"><title>${svgText(c)} — ${d.m}: ${svgText(fmt(val))}</title></rect>`});g+=`<text x="${left+i*groupW+groupW/2}" y="286" text-anchor="middle" font-size="11" fill="#637086">${d.m.slice(5)}/${d.m.slice(2,4)}</text>`});const mobileBars=data.map(d=>{const sum=Object.values(d.data).reduce((a,b)=>a+b,0);return `<div class="mobile-month"><div class="mobile-bars">${cats.map(c=>{const value=d.data[c]||0;const ht=Math.max(0,value/max*108);return `<div class="mobile-bar" title="${esc(c)}: ${fmt(value)}" style="height:${ht.toFixed(1)}px;background:${colorExpense(totals[c],maxCat)}"></div>`}).join('')}</div><div class="mobile-month-label">${esc(d.m.slice(5))}/${esc(d.m.slice(2,4))}</div><div class="mobile-month-value">${fmt(sum)}</div></div>`}).join('');
return `<div class="chart-scroll is-projection"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Projeção mensal agrupada por categoria">${g}</svg></div><div class="mobile-projection">${cats.length?`<div class="mobile-month-grid">${mobileBars}</div>`:`<p class="empty">Cadastre despesas recorrentes ou parcelas do cartão.</p>`}</div><div class="legend">${cats.map(c=>`<span><i class="dot" style="background:${colorExpense(totals[c],maxCat)}"></i>${esc(c)}</span>`).join('')||'<span>Cadastre despesas recorrentes ou compras parceladas para visualizar.</span>'}</div>`}


// Compact future commitments widget (v2.23). Read-only and shared by desktop / Android.
let projectionSummaryHorizon=3;
let projectionSelectedMonth='';
function compactProjection(months){
 const data=months.map(m=>{
  const commitments=FinanceRules.commitments(state,m).filter(t=>t.recurring||t.cardId);
  const groups={};
  for(const t of commitments){const cat=t.macro||'Outros';groups[cat]=(groups[cat]||0)+Number(t.amount)}
  const total=Object.values(groups).reduce((sum,v)=>sum+v,0);
  return {month:m,commitments,groups,total};
 });
 const categories=[...new Set(data.flatMap(x=>Object.keys(x.groups)))];
 const categoryTotals=Object.fromEntries(categories.map(c=>[c,data.reduce((s,d)=>s+(d.groups[c]||0),0)]));
 categories.sort((a,b)=>categoryTotals[b]-categoryTotals[a]);
 const maxCategory=Math.max(1,...Object.values(categoryTotals));
 const maxMonth=Math.max(1,...data.map(d=>d.total));
 const allTotal=data.reduce((s,d)=>s+d.total,0);
 const totalCount=data.reduce((s,d)=>s+d.commitments.length,0);
 const topCategory=categories[0]||'—';
 const peak=data.reduce((a,b)=>b.total>a.total?b:a,data[0]);
 const formatMonth=m=>m.slice(5)+'/'+m.slice(2,4);
 const h=280,base=232,chartTop=28,chartH=base-chartTop,chartLeft=48,chartRight=10,w=720,plotWidth=w-chartLeft-chartRight;
 const groupWidth=plotWidth/data.length,innerWidth=groupWidth*.76;
 const barWidth=Math.min(30,innerWidth/Math.max(1,categories.length));
 let svg='';
 for(let tick=0;tick<=4;tick++){
  const v=maxMonth*tick/4,y=base-chartH*tick/4;
  svg+='<line x1="'+chartLeft+'" y1="'+y+'" x2="'+(w-chartRight)+'" y2="'+y+'" stroke="#e1e8ef" stroke-dasharray="4 4"/>'+
    '<text x="'+(chartLeft-6)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="#6b7787">'+esc(v.toLocaleString('pt-BR',{maximumFractionDigits:0}))+'</text>';
 }
 data.forEach((d,i)=>{
  const xGroup=chartLeft+i*groupWidth+groupWidth/2;
  const actualWidth=barWidth*categories.length;
  categories.forEach((c,j)=>{
   const value=d.groups[c]||0;
   if(value<=0)return;
   const bh=value/maxMonth*chartH;
   const x=xGroup-actualWidth/2+j*barWidth;
   svg+='<rect x="'+x+'" y="'+(base-bh)+'" width="'+Math.max(2,barWidth-3)+'" height="'+bh+'" rx="4" fill="'+colorExpense(categoryTotals[c],maxCategory)+'"><title>'+esc(c+' · '+formatMonth(d.month)+' · '+fmt(value))+'</title></rect>';
  });
  svg+='<text x="'+xGroup+'" y="'+(base+22)+'" text-anchor="middle" font-weight="650" font-size="13" fill="#334155">'+formatMonth(d.month)+'</text>';
 });
 const monthCards=data.map(d=>'<button type="button" class="projection-month'+(projectionSelectedMonth===d.month?' active':'')+'" data-projection-month="'+esc(d.month)+'" aria-label="Detalhar '+esc(formatMonth(d.month))+'"><strong>'+fmt(d.total)+'</strong><span>'+formatMonth(d.month)+'</span></button>').join('');
 const selected=data.find(d=>d.month===projectionSelectedMonth);
 const monthlyDetails=selected?'<div class="projection-detail"><div class="sectionrow"><strong>Compromissos de '+formatMonth(selected.month)+'</strong><button type="button" class="btn small" data-projection-close>Fechar</button></div>'+
  (selected.commitments.length?selected.commitments.map(t=>'<div class="projection-detail-row"><span>'+esc(t.description||t.macro||'Compromisso')+' · '+esc(t.macro||'Outros')+'</span><strong>'+fmt(t.amount)+'</strong></div>').join(''):'<p class="muted">Não há compromissos cadastrados para este mês.</p>')+'</div>':'';
 const categoriesLegend=categories.length?categories.map(c=>'<span><i class="dot" style="background:'+colorExpense(categoryTotals[c],maxCategory)+'"></i>'+esc(c)+'</span>').join(''):'<span>Sem compromissos cadastrados para o período.</span>';
 return '<section class="projection-compact" aria-label="Projeção dos compromissos futuros">'+
  '<div class="projection-switch"><span class="muted">A partir de '+formatMonth(data[0].month)+' · compromissos previstos · v2.24</span><div class="projection-toggle" role="group" aria-label="Horizonte da projeção">'+
  [3,6].map(n=>'<button type="button" data-projection-horizon="'+n+'" aria-pressed="'+(projectionSummaryHorizon===n)+'" class="'+(projectionSummaryHorizon===n?'active':'')+'">'+n+' meses</button>').join('')+'</div></div>'+
  '<div class="projection-plot" role="group" aria-label="Gráfico de despesas futuras por categoria">'+
  (categories.length?'<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Colunas agrupadas de compromissos previstos nos próximos '+months.length+' meses" xmlns="http://www.w3.org/2000/svg">'+svg+'</svg>':'<div class="projection-empty">Nenhuma despesa recorrente ou fatura futura registrada.</div>')+'</div>'+
  '<div class="projection-months">'+monthCards+'</div><div class="legend projection-legend">'+categoriesLegend+'</div>'+
  '<div class="projection-kpis"><div><small>Total projetado</small><strong>'+fmt(allTotal)+'</strong></div><div><small>Maior categoria</small><strong>'+esc(topCategory)+'</strong></div><div><small>Mês de maior gasto</small><strong>'+formatMonth(peak.month)+'</strong></div><div><small>Compromissos previstos</small><strong>'+totalCount+'</strong></div></div>'+
  monthlyDetails+'<button type="button" class="btn projection-details-button" data-go="projecoes">Ver detalhamento completo por mês ›</button></section>';
}
document.addEventListener('click',e=>{
 const horizon=e.target.closest('[data-projection-horizon]');
 if(horizon){projectionSummaryHorizon=Number(horizon.dataset.projectionHorizon)===6?6:3;projectionSelectedMonth='';summary();return}
 const month=e.target.closest('[data-projection-month]');
 if(month){projectionSelectedMonth=projectionSelectedMonth===month.dataset.projectionMonth?'':month.dataset.projectionMonth;summary();return}
 if(e.target.closest('[data-projection-close]')){projectionSelectedMonth='';summary();return}
 if(e.target.closest('.projection-compact [data-go="projecoes"]')){page('projecoes')}
});
