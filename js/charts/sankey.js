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


// V2.28 — Compact responsive 3-stage flow. No fixed-width SVG or nested scrolling.
// The center represents period cash flow, not a fictitious bank account.
function compactSankey(m,basis='cash',depth='macro'){
 const months=Array.isArray(m)?m:[m],model=sankeyGroups(months,basis,sankeyView),all=model.groups;
 const incomeGroups=new Map();
 months.forEach(month=>txIncome(month).forEach(t=>{
  const label=t.macro||'Outras receitas';
  incomeGroups.set(label,(incomeGroups.get(label)||0)+sankeyCents(t.amount));
 }));
 const origins=Array.from(incomeGroups,([name,value])=>({name,value})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value);
 const originTop=origins.slice(0,2);
 if(origins.length>2)originTop.push({name:'Outras receitas',value:origins.slice(2).reduce((n,x)=>n+x.value,0)});
 if(!originTop.length)originTop.push({name:'Sem receitas',value:0});
 const grouped=sankeyShowAll?all:all.slice(0,4);
 const displayed=grouped.slice();
 if(!sankeyShowAll&&all.length>4)displayed.push({name:'Outras categorias',value:all.slice(4).reduce((n,x)=>n+x.value,0),children:all.slice(4).flatMap(x=>x.children),grouped:true});
 if(model.investments>0)displayed.push({name:'Investimentos',value:model.investments,type:'investment'});
 if(model.balance>0)displayed.push({name:'Saldo do período',value:model.balance,type:'balance'});
 if(!displayed.length)displayed.push({name:'Sem saídas',value:0,type:'balance'});
 const selected=grouped.find(x=>x.name===sankeyChosen);
 const colors=['#e34d51','#f38c2f','#eaba2d','#f4b957','#d68c4a'];
 const nameShort=(v,max=18)=>String(v).length>max?String(v).slice(0,max-1)+'…':String(v);
 const nodeColor=(r,i)=>r.type==='investment'?'#3289db':r.type==='balance'?'#7896bb':colors[Math.min(i,4)];
 const svgH=Math.max(345,Math.min(425,displayed.length*55+45)),centerY=svgH/2-58;
 const originH=svgH/originTop.length;
 let paths='',nodes='',labels='';
 const incomeDenom=Math.max(1,model.income),outDenom=Math.max(1,model.spending+Math.max(0,model.investments)+Math.max(0,model.balance));
 const ribbons=(x1,y1,x2,y2,h,color)=>sankeyPath(x1,y1-h/2,x2,y2-h/2,h,color,'.35');
 originTop.forEach((o,i)=>{
  const y=(i+.5)*originH,h=Math.max(5,Math.min(36,o.value/incomeDenom*48));
  paths+=ribbons(196,y,405,svgH/2,h,'#24a569');
  nodes+='<rect x="8" y="'+(y-32)+'" width="188" height="64" rx="13" fill="#e3f5e9" stroke="#bfe9ce"/>';
  labels+='<text x="20" y="'+(y-8)+'" font-size="14" font-weight="700" fill="#184f34">'+esc(nameShort(o.name,23))+'</text>'+
    '<text x="20" y="'+(y+16)+'" font-size="15" font-weight="700" fill="#154f32">'+esc(fmt(o.value/100))+'</text>';
 });
 displayed.forEach((d,i)=>{
  const y=(i+.5)*(svgH/displayed.length),h=Math.max(4,Math.min(36,d.value/outDenom*85)),color=nodeColor(d,i);
  paths+=ribbons(549,svgH/2,728,y,h,color);
  const isPicked=selected?.name===d.name,clickable=!d.type;
  nodes+='<rect x="728" y="'+(y-22)+'" width="208" height="44" rx="10" fill="'+(d.type==='investment'?'#e5f1fe':d.type==='balance'?'#eef2fb':'#fff4f2')+'" stroke="'+(isPicked?'#15803d':'#dce5eb')+'" stroke-width="'+(isPicked?3:1)+'"/>';
  labels+='<text x="741" y="'+(y-4)+'" font-size="13" font-weight="650" fill="#26364a">'+esc(nameShort(d.name,22))+'</text>'+
   '<text x="741" y="'+(y+13)+'" font-size="13" font-weight="700" fill="'+color+'">'+esc(fmt(d.value/100))+'</text>';
  if(clickable){
   const idx=displayed.findIndex(x=>x.name===d.name);
   labels+='<rect data-sankey-pick="'+idx+'" x="728" y="'+(y-22)+'" width="208" height="44" rx="10" fill="transparent" tabindex="0" role="button" aria-label="Detalhar '+esc(d.name)+'"><title>Ver '+esc(d.name)+'</title></rect>';
  }
 });
 const desktop='<div class="sankey-compact-desktop"><svg viewBox="0 0 944 '+svgH+'" role="img" aria-label="Fluxo financeiro compacto, origem, fluxo do período e destinos" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">'+
  '<text x="8" y="18" font-size="14" font-weight="750" fill="#344459">Origem</text><text x="418" y="18" font-size="14" font-weight="750" fill="#344459">Fluxo</text><text x="728" y="18" font-size="14" font-weight="750" fill="#344459">Destino</text>'+
  paths+'<rect x="405" y="'+centerY+'" width="144" height="116" rx="14" fill="#cae3ff" stroke="#80b8f9"/>'+
  '<text x="477" y="'+(centerY+30)+'" text-anchor="middle" font-size="15" font-weight="700" fill="#225587">Fluxo do</text>'+
  '<text x="477" y="'+(centerY+49)+'" text-anchor="middle" font-size="15" font-weight="700" fill="#225587">período</text>'+
  '<text x="477" y="'+(centerY+76)+'" text-anchor="middle" font-size="15" font-weight="800" fill="#1d4f80">'+esc(fmt(model.income/100))+'</text>'+
  '<text x="477" y="'+(centerY+96)+'" text-anchor="middle" font-size="11" fill="#305b87">Receitas totais</text>'+
  nodes+labels+'</svg></div>';
 const mobile='<div class="sankey-compact-mobile" aria-label="Fluxo de origem, período e destinos sem rolagem horizontal">'+
  '<div class="sankey-mobile-sources"><strong>Origem</strong><div>'+originTop.map(x=>'<div><span>'+esc(nameShort(x.name,19))+'</span><b>'+fmt(x.value/100)+'</b></div>').join('')+'</div></div>'+
  '<div class="sankey-mobile-middle"><span aria-hidden="true">↓</span><div>Fluxo do período <strong>'+fmt(model.income/100)+'</strong></div><span aria-hidden="true">↓</span></div>'+
  '<div class="sankey-mobile-destinations"><strong>Destino</strong><div>'+displayed.map((x,i)=>'<button type="button" '+(x.type?'disabled':'data-sankey-pick="'+i+'"')+' class="sankey-mobile-destination" style="--accent:'+nodeColor(x,i)+'"><span>'+esc(nameShort(x.name,28))+'</span><b>'+fmt(x.value/100)+'</b></button>').join('')+'</div></div></div>';
 const selectedDetails=selected?'<div class="sankey-selected-detail"><div class="sectionrow"><strong>'+esc(selected.name)+' — detalhamento</strong><button type="button" class="btn small" data-sankey-clear>Fechar</button></div>'+
  selected.children.slice(0,12).map(x=>'<div class="sankey-detail-line"><span>'+esc(x.name)+'</span><b>'+fmt(x.value/100)+'</b></div>').join('')+
  (selected.children.length>12?'<small>Exibindo as 12 maiores subcategorias.</small>':'')+'</div>':'';
 const tabs=[['category','Por categoria'],['account','Por conta'],['card','Por cartão']].map(([id,name])=>'<button class="sankey-tab'+(sankeyView===id?' active':'')+'" type="button" data-sankey-view="'+id+'" aria-pressed="'+(sankeyView===id)+'">'+name+'</button>').join('');
 const side='<aside class="sankey-compact-side"><div><h3>Resumo do período</h3>'+
  '<p>Receitas <strong class="amountpos">'+fmt(model.income/100)+'</strong></p>'+
  '<p>Despesas <strong class="amountneg">'+fmt(model.spending/100)+'</strong></p>'+
  '<p>Investimentos <strong>'+fmt(model.investments/100)+'</strong></p>'+
  '<p>Saldo do período <strong>'+fmt(model.balance/100)+'</strong></p></div>'+
  '<div><h3>Maior saída</h3><p>'+(all.length?esc(all[0].name)+' <strong>'+fmt(all[0].value/100)+'</strong>':'Nenhuma despesa no período')+'</p></div></aside>';
 const warn=model.balance<0?'<p class="sankey-hint">As saídas superam as receitas. A diferença pode ser coberta por saldo anterior; saldo inicial não é tratado como receita.</p>':'';
 return '<div class="sankey-ui sankey-compact"><div class="sankey-toolbar"><div class="sankey-tabs" role="group" aria-label="Agrupar o fluxo">'+tabs+'</div></div>'+
  '<div class="sankey-compact-layout"><div class="sankey-compact-flow">'+desktop+mobile+
  '<p class="sankey-hint">Visão condensada. O fluxo central é uma representação do período, não uma conta bancária. Toque em um destino para ver detalhes.</p>'+
  (all.length>4?'<button class="btn small" type="button" data-sankey-more>'+(sankeyShowAll?'Mostrar principais':'Mostrar todas as '+all.length+' categorias')+'</button>':'')+
  selectedDetails+warn+'</div>'+side+'</div></div>';
}
sankey=function(m,basis,depth){return compactSankey(m,basis,depth)};
document.addEventListener('click',e=>{if(e.target.closest('[data-sankey-clear]')){sankeyChosen='';renderAll()}});
