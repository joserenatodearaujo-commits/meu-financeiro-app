'use strict';
// Meu Financeiro • Sankey rendering (desktop and Android).
const colorExpense=(v,max)=>v>=max*.68?'#e34d51':v>=max*.34?'#f38c2f':'#eaba2d';function breakdown(m,basis='cash',depth='macro'){const result={};txExpenses(m,basis).forEach(t=>{const cat=depth==='micro'?`${t.macro||'Outros'} / ${t.micro||'Diversos'}`:t.macro||'Outros';result[cat]=(result[cat]||0)+Number(t.amount)});return Object.entries(result).sort((a,b)=>b[1]-a[1])}function mobileSankey(m,basis,depth){
 const months=Array.isArray(m)?m:[m],rows=periodBreakdown(months,basis,depth),income=months.reduce((v,mo)=>v+txIncome(mo).reduce((a,t)=>a+Number(t.amount),0),0),invested=months.reduce((v,mo)=>v+txInvest(mo).reduce((a,t)=>a+(t.operation==='resgate'?-1:1)*Number(t.amount),0),0);
 const expenses=rows.reduce((a,r)=>a+r[1],0),investment=Math.max(0,invested),balance=income-expenses-invested;
 const dest=[...rows.map(([name,value])=>({name,value,type:'expense'})),...(investment?[{name:'Investimentos',value:investment,type:'investment'}]:[]),...(balance>0?[{name:'Saldo disponível',value:balance,type:'balance'}]:[])];
 const largestExpense=Math.max(1,...rows.map(r=>r[1])),largest=Math.max(1,income,...dest.map(d=>d.value));
 if(!income&&!dest.length)return '<div class="mobile-sankey"><div class="mobile-income">Entradas <strong>R$ 0,00</strong></div><p class="mobile-flow-caption">Cadastre receitas e despesas para visualizar o fluxo.</p></div>';
 return `<div class="mobile-sankey" aria-label="Resumo móvel do Sankey">
 <div class="mobile-income"><span>Entradas (receitas)</span><strong>${fmt(income)}</strong></div>
 <div class="mobile-flow-arrow" aria-hidden="true">↓</div>
 <div class="mobile-flow-list">${dest.map(d=>{const color=d.type==='investment'?'#3289db':d.type==='balance'?'#98a4ad':colorExpense(d.value,largestExpense);return `<div class="mobile-flow-row"><div class="mobile-flow-label"><span class="mobile-flow-name">${esc(d.name)}</span><strong>${fmt(d.value)}</strong></div><div class="mobile-flow-track"><div style="width:${Math.max(1,100*d.value/largest).toFixed(2)}%;background:${color}"></div></div></div>`}).join('')}</div>
 ${balance<0?'<p class="mobile-flow-caption">Saídas superam receitas; a diferença exige saldo inicial ou financiamento.</p>':''}
 <p class="mobile-flow-caption">Fluxos proporcionais. No computador, o diagrama completo continua disponível.</p></div>`;
}
function svgText(s){return esc(s).slice(0,55)}function sankey(m,basis,depth){const months=Array.isArray(m)?m:[m],rows=periodBreakdown(months,basis,depth),income=months.reduce((v,mo)=>v+txIncome(mo).reduce((a,t)=>a+Number(t.amount),0),0),inv=months.reduce((v,mo)=>v+txInvest(mo).reduce((a,t)=>a+(t.operation==='resgate'?-1:1)*Number(t.amount),0),0),totalExp=rows.reduce((a,r)=>a+r[1],0),positiveInvest=Math.max(0,inv),left=income-totalExp-inv;const arr=[...rows.map(([name,value])=>({name,value,type:'expense'})),...(positiveInvest?[{name:'Investimentos',value:positiveInvest,type:'investment'}]:[]),...(left>0?[{name:'Saldo disponível',value:left,type:'balance'}]:[])];const grand=Math.max(income,totalExp+positiveInvest,1),mx=Math.max(...rows.map(r=>r[1]),1),svgH=Math.max(340,arr.length*45+55),ys=45,usable=svgH-ys-20;let offset=ys;const h=v=>Math.max(3,v/grand*(usable-Math.max(0,arr.length-1)*5));const chunks=arr.map(r=>{let k={...r,y:offset,h:h(r.value)};offset+=k.h+5;return k});let inputTop=ys;const inputHeight=Math.max(3,income/grand*(usable-Math.max(0,arr.length-1)*5));let paths='';let from=ys;for(const r of chunks){const color=r.type==='investment'?'#3289db':r.type==='balance'?'#98a4ad':colorExpense(r.value,mx);const hh=r.h;paths+=`<path d="M65 ${from} C260 ${from} 280 ${r.y} 455 ${r.y} L455 ${r.y+hh} C280 ${r.y+hh} 260 ${from+hh} 65 ${from+hh} Z" fill="${color}" fill-opacity=".53"/><rect x="455" y="${r.y}" width="12" height="${hh}" rx="2" fill="${color}"/><text x="475" y="${r.y+Math.min(Math.max(12,hh/2),18)}" font-size="12" fill="#334155">${svgText(r.name)} · ${svgText(fmt(r.value))}</text>`;from+=hh}const incBar=Math.max(3,inputHeight);const svg=`<svg viewBox="0 0 930 ${svgH}" role="img" aria-label="Fluxo financeiro de ${Array.isArray(m)?m[0]+' a '+m[m.length-1]:m}" xmlns="http://www.w3.org/2000/svg"><text x="15" y="21" fill="#334155" font-weight="700" font-size="14">Entradas: ${svgText(fmt(income))}</text><text x="455" y="21" fill="#334155" font-weight="700" font-size="14">Destinos</text><rect x="51" y="${inputTop}" width="14" height="${incBar}" rx="3" fill="#24a569"/>${paths}<text x="17" y="${Math.min(svgH-6,inputTop+incBar+22)}" fill="#158753" font-size="12">Receitas</text></svg>`;const note=income<totalExp+positiveInvest?'<p class="muted">⚠ Saídas acima das receitas: a diferença está sendo coberta por saldo anterior ou financiamento. O diagrama mostra o desequilíbrio, sem tratar saldo inicial como receita.</p>':'';return `<div class="chart-scroll is-sankey">${svg}</div>${mobileSankey(m,basis,depth)}${note}<div class="legend"><span><i class="dot" style="background:#24a569"></i>Receitas</span><span><i class="dot" style="background:#3289db"></i>Investimentos</span><span><i class="dot" style="background:#eaba2d"></i>Despesa menor</span><span><i class="dot" style="background:#f38c2f"></i>Intermediária</span><span><i class="dot" style="background:#e34d51"></i>Maior despesa</span></div>`}


// Interactive Sankey v2.22. Read-only visualization: no vault or sync mutations.
const sankeyLegacy=sankey;
let sankeyView='category',sankeyChosen='',sankeyShowAll=false;
function sankeyCents(v){return Math.round((Number(v)||0)*100)}
function sankeyPct(v,total){return total>0?(100*v/total).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—'}
function sankeyGroups(months,basis,mode){
 const grouped=new Map(),details=new Map(),income=months.reduce((sum,m)=>sum+txIncome(m).reduce((s,t)=>s+sankeyCents(t.amount),0),0);
 let investments=0;
 function add(name,value,child){
  if(value<=0)return;
  grouped.set(name,(grouped.get(name)||0)+value);
  if(!details.has(name))details.set(name,new Map());
  const children=details.get(name);children.set(child,(children.get(child)||0)+value);
 }
 const accName=id=>state.accounts.find(a=>a.id===id)?.name||'Conta não identificada';
 months.forEach(m=>{
  txExpenses(m,basis).forEach(t=>{
   const value=sankeyCents(t.amount);if(value<=0)return;
   const macro=t.macro||'Outros',micro=t.micro||'Diversos';
   if(mode==='category')add(macro,value,micro);
   else if(mode==='account')add(accName(t.accountId),value,macro);
   else{
    const card=t.cardId||(t.kind==='invoice-payment'?t.cardId:null);
    add(card?accName(card):'Sem cartão',value,macro);
   }
  });
  txInvest(m).forEach(t=>{investments+=(t.operation==='resgate'?-1:1)*sankeyCents(t.amount)});
 });
 const list=Array.from(grouped,([name,value])=>({name,value,children:Array.from(details.get(name),([child,cents])=>({name:child,value:cents})).sort((a,b)=>b.value-a.value)})).sort((a,b)=>b.value-a.value);
 const spending=list.reduce((s,r)=>s+r.value,0);
 return {income,investments,spending,balance:income-spending-investments,groups:list};
}
function sankeyPath(x1,y1,x2,y2,h,color,opacity){
 if(h<=0)return '';
 const ctrl=(x2-x1)*.48;
 return '<path d="M'+x1+' '+y1+' C'+(x1+ctrl)+' '+y1+' '+(x2-ctrl)+' '+y2+' '+x2+' '+y2+' L'+x2+' '+(y2+h)+' C'+(x2-ctrl)+' '+(y2+h)+' '+(x1+ctrl)+' '+(y1+h)+' '+x1+' '+(y1+h)+' Z" fill="'+color+'" fill-opacity="'+opacity+'"/>';
}
function interactiveSankey(months,basis,depth){
 const model=sankeyGroups(months,basis,sankeyView),all=model.groups;
 const groups=sankeyShowAll?all:all.slice(0,5);
 if(!sankeyShowAll&&all.length>5){
  const rest=all.slice(5);
  groups.push({name:'Outras categorias',value:rest.reduce((s,r)=>s+r.value,0),children:rest.flatMap(r=>r.children.map(c=>({name:r.name+' / '+c.name,value:c.value}))),grouped:true});
 }
 if(sankeyChosen&&!groups.some(g=>g.name===sankeyChosen))sankeyChosen='';
 const selected=groups.find(g=>g.name===sankeyChosen);
 const totalOut=model.spending+Math.max(0,model.investments)+Math.max(0,model.balance);
 const largest=Math.max(1,...all.map(r=>r.value));
 const destinations=groups.map(g=>({...g,type:'expense'}));
 if(model.investments>0)destinations.push({name:'Investimentos',value:model.investments,type:'investment'});
 if(model.balance>0)destinations.push({name:'Saldo disponível',value:model.balance,type:'balance'});
 const svgHeight=Math.max(355,destinations.length*55+80,selected?selected.children.length*38+105:0);
 const top=45, bottom=svgHeight-35,area=bottom-top;
 // Compute flow widths proportional to cents, reserving space for labels.
 const sumThickness=Math.max(1,totalOut);
 const available=Math.max(120,area-(destinations.length-1)*8);
 const thickness=v=>Math.max(2,v/sumThickness*available);
 const nodes=[];let rightY=top;
 destinations.forEach(d=>{const h=thickness(d.value);nodes.push({...d,y:rightY,h});rightY+=h+8});
 let sourceY=top,paths='',blocks='',labels='';
 const maxSourceHeight=Math.max(2,model.income/sumThickness*available);
 const sourceHeight=Math.min(area,maxSourceHeight);
 const usableSource=destinations.reduce((sum,d)=>sum+d.value,0);
 nodes.forEach((d,i)=>{
  const color=d.type==='investment'?'#3289db':d.type==='balance'?'#98a4ad':colorExpense(d.value,largest);
  const sourceH=d.h;
  paths+=sankeyPath(108,sourceY,360,d.y,d.h,color,'.52');
  sourceY+=sourceH;
  const selectedNode=selected&&d.name===selected.name;
  const label=esc(d.name)+' · '+fmt(d.value/100)+' ('+sankeyPct(d.value,model.income)+')';
  blocks+='<rect x="360" y="'+d.y+'" width="10" height="'+d.h+'" rx="2" fill="'+color+'"/>';
  labels+='<text x="380" y="'+(d.y+Math.min(20,Math.max(14,d.h/2+4)))+'" font-size="13" font-weight="'+(selectedNode?700:500)+'" fill="#243449">'+label+'</text>';
  if(d.type==='expense'){
   const idx=groups.findIndex(g=>g.name===d.name);
   labels+='<rect data-sankey-pick="'+idx+'" x="354" y="'+(d.y-8)+'" width="290" height="'+Math.max(32,d.h+16)+'" rx="7" fill="transparent" tabindex="0" role="button" aria-label="Detalhar '+esc(d.name)+'"/>';
  }
 });
 let detailPaths='',detailNodes='',detailNote='';
 if(selected&&selected.children.length){
  const selectedNode=nodes.find(n=>n.name===selected.name);
  let dy=top,from=selectedNode.y;
  const children=selected.children.slice(0,12);
  const detailedSum=children.reduce((s,x)=>s+x.value,0);
  children.forEach(c=>{
   const h=Math.max(3,selectedNode.h*c.value/Math.max(1,selected.value));
   const col=colorExpense(selected.value,largest);
   detailPaths+=sankeyPath(660,from,735,dy,h,col,'.55');
   detailNodes+='<rect x="735" y="'+dy+'" width="7" height="'+h+'" fill="'+col+'"/><text x="749" y="'+(dy+Math.min(16,Math.max(12,h/2+3)))+'" font-size="12" fill="#243449">'+esc(c.name)+' · '+fmt(c.value/100)+'</text>';
   from+=h;dy+=Math.max(h,28)+6;
  });
  if(selected.children.length>12)detailNote='<p class="sankey-hint">Exibindo as 12 maiores subcategorias deste grupo.</p>';
 }
 const title=sankeyView==='category'?'Categorias':sankeyView==='account'?'Contas de pagamento':'Cartões / sem cartão';
 const svg='<svg class="sankey-interactive-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 '+svgHeight+'" width="1120" height="'+svgHeight+'" role="group" aria-label="Sankey financeiro interativo"><text x="12" y="23" font-size="15" font-weight="700" fill="#168652">Receitas · '+fmt(model.income/100)+'</text><text x="360" y="23" font-size="15" font-weight="700" fill="#344459">'+title+'</text>'+(selected?'<text x="735" y="23" font-size="15" font-weight="700" fill="#344459">Detalhamento</text>':'')+'<rect x="91" y="'+top+'" width="17" height="'+Math.max(3,sourceHeight)+'" rx="4" fill="#24a569"/>'+paths+blocks+labels+detailPaths+detailNodes+'</svg>';
 const warning=model.balance<0?'<p class="sankey-hint">⚠ As saídas superam as receitas no período. Saldo inicial não foi considerado como receita.</p>':'';
 const tabs=[['category','Por categoria'],['account','Por conta'],['card','Por cartão']].map(([id,label])=>'<button type="button" class="sankey-tab'+(id===sankeyView?' active':'')+'" data-sankey-view="'+id+'" aria-pressed="'+(id===sankeyView)+'">'+label+'</button>').join('');
 const nodesList=groups.map((g,i)=>'<button type="button" class="sankey-chip'+(sankeyChosen===g.name?' active':'')+'" data-sankey-pick="'+i+'">'+esc(g.name)+' · '+fmt(g.value/100)+'</button>').join('');
 const distribution=groups.filter(g=>g.value>0).map(g=>'<div class="sankey-distribution-row"><span>'+esc(g.name)+'</span><strong>'+fmt(g.value/100)+' · '+sankeyPct(g.value,Math.max(1,model.spending))+'</strong></div>').join('');
 return '<div class="sankey-ui"><div class="sankey-toolbar"><div class="sankey-tabs" role="group" aria-label="Agrupar o fluxo">'+tabs+'</div><button type="button" class="btn small" data-sankey-expand aria-label="Expandir ou reduzir Sankey">⛶ Expandir</button></div>'+
  '<div class="sankey-stats"><span>Receitas <b>'+fmt(model.income/100)+'</b></span><span>Despesas <b>'+fmt(model.spending/100)+'</b></span><span>Investimentos <b>'+fmt(model.investments/100)+'</b></span><span>Saldo do período <b>'+fmt(model.balance/100)+'</b></span></div>'+
  '<div class="sankey-canvas chart-scroll is-sankey" tabindex="0">'+svg+'</div><p class="sankey-hint">Deslize para visualizar o gráfico. Toque numa categoria para detalhar os fluxos.</p>'+
  '<div class="sankey-chips">'+nodesList+'</div>'+(all.length>5?'<button type="button" class="btn small" data-sankey-more>'+(sankeyShowAll?'Mostrar 5 maiores':'Exibir todas as '+all.length+' categorias')+'</button>':'')+
  detailNote+warning+'<div class="sankey-bottom"><div><h3>Distribuição das despesas</h3>'+ (distribution||'<p class="muted">Sem despesas no período.</p>')+'</div><div><h3>Resumo do período</h3><p>Entradas: <strong>'+fmt(model.income/100)+'</strong></p><p>Saídas: <strong>'+fmt(model.spending/100)+'</strong></p><p>Aportes líquidos: <strong>'+fmt(model.investments/100)+'</strong></p><p>Saldo do período: <strong>'+fmt(model.balance/100)+'</strong></p></div></div></div>';
}
sankey=function(m,basis,depth){return interactiveSankey(Array.isArray(m)?m:[m],basis,depth)};
document.addEventListener('click',e=>{
 const tab=e.target.closest('[data-sankey-view]');
 if(tab){sankeyView=tab.dataset.sankeyView;sankeyChosen='';sankeyShowAll=false;renderAll();return}
 const chip=e.target.closest('[data-sankey-pick]');
 if(chip){const root=chip.closest('.sankey-ui');const months=viewedMonths();const basis=root.closest('#sankeyFull')?document.querySelector('#flowBasis').value:'cash';const groups=sankeyGroups(months,basis,sankeyView).groups;let shown=sankeyShowAll?groups:groups.slice(0,5);if(!sankeyShowAll&&groups.length>5)shown=shown.concat([{name:'Outras categorias'}]);const current=shown[Number(chip.dataset.sankeyPick)];if(current){sankeyChosen=sankeyChosen===current.name?'':current.name;renderAll()}return}
 const more=e.target.closest('[data-sankey-more]');
 if(more){sankeyShowAll=!sankeyShowAll;sankeyChosen='';renderAll();return}
 const expand=e.target.closest('[data-sankey-expand]');
 if(expand){const root=expand.closest('.sankey-ui');const expanded=root.classList.toggle('sankey-expanded');expand.textContent=expanded?'✕ Fechar':'⛶ Expandir';document.body.classList.toggle('sankey-is-expanded',expanded)}
});
document.addEventListener('keydown',e=>{
 if(e.key!=='Enter'&&e.key!==' ')return;
 const el=e.target.closest('[data-sankey-pick]');
 if(el&&el.tagName.toLowerCase()!=='button'){e.preventDefault();el.dispatchEvent(new MouseEvent('click',{bubbles:true}))}
});
