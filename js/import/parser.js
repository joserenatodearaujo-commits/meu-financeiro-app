'use strict';
// Regras de importação: apenas normalizam, não gravam no cofre nem enviam dados.
const ImportRules=Object.freeze({
 sources:[
  {id:'santander-card',label:'Santander • Cartão',kind:'card'},
  {id:'inter-card',label:'Inter • Cartão',kind:'card'},
  {id:'mercadopago-card',label:'Mercado Pago • Cartão',kind:'card'},
  {id:'inter-bank',label:'Inter • Conta corrente',kind:'bank'},
  {id:'itau-bank',label:'Itaú • Conta corrente',kind:'bank'}
 ],
 norm(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');},
 sourceHint(name){
  const n=ImportRules.norm(name);
  if(n.includes('santander'))return 'santander-card';
  if(n.includes('mercado')||n.includes('mpago'))return 'mercadopago-card';
  if(n.includes('itau'))return 'itau-bank';
  if(n.includes('inter'))return /cart|fatura|credito/.test(n)?'inter-card':'inter-bank';
  return '';
 },
 source(id){return ImportRules.sources.find(s=>s.id===id)||null},
 date(str){
  const s=String(str||'').trim();let y,m,d;
  let x=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s.*)?$/);
  if(x){y=+x[1];m=+x[2];d=+x[3]}
  else{ x=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:\s.*)?$/);
   if(!x)return '';
   d=+x[1];m=+x[2];y=+x[3];if(y<100)y+=y>=70?1900:2000;
  }
  if(y<1990||y>2100||m<1||m>12||d<1||d>new Date(y,m,0).getDate())return '';
  return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
 },
 cents(value){
  let s=String(value??'').trim().replace(/[\u00a0\s]/g,'');
  if(!s||s==='—'||s==='-'||s==='–')return null;
  let negative=false;
  if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1)}
  if(/[dD]$/.test(s)){negative=true;s=s.slice(0,-1)}
  if(/[cC]$/.test(s))s=s.slice(0,-1);
  if(s.startsWith('-')||s.endsWith('-')){negative=true;s=s.replace(/^-|-$/g,'')}
  s=s.replace(/^R\$/i,'').replace(/R\$/gi,'').replace(/\+/g,'');
  if(!/^\d[\d.,]*$/.test(s))return null;
  const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.'),last=Math.max(comma,dot);
  let int=s,decimal='';
  if(last!==-1){
   const tail=s.slice(last+1),hasComma=comma>=0;
   const decimalSeparator=hasComma?comma:dot;
   const looksCents=tail.length===1||tail.length===2;
   if(looksCents){int=s.slice(0,decimalSeparator);decimal=tail.padEnd(2,'0')}
   else if(tail.length!==3)return null;
  }
  int=int.replace(/[.,]/g,'');
  if(!/^\d+$/.test(int)|| (decimal&&!/^\d{2}$/.test(decimal)))return null;
  const n=Number(int)*100+(decimal?Number(decimal):0);
  if(!Number.isSafeInteger(n)||n>1e13)return null;
  return negative?-n:n;
 },
 delimiter(text){
  const lines=String(text).split(/\r?\n/).filter(x=>x.trim()).slice(0,8);
  const counts=[';',',','\t'].map(d=>{
   const scored=lines.map(line=>{
    let n=0,quote=false;
    for(let i=0;i<line.length;i++){if(line[i]==='"'){if(quote&&line[i+1]==='"')i++;else quote=!quote;}else if(!quote&&line[i]===d)n++}
    return n;
   });return {d,score:scored.reduce((a,b)=>a+b,0),present:scored.filter(x=>x>0).length};
  }).sort((a,b)=>(b.present-a.present)||(b.score-a.score));
  return counts[0].present?counts[0].d:';';
 },
 csv(text,delimiter){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(c==='"'){
    if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted;
   }else if(!quoted&&c===delimiter){row.push(cell.trim());cell=''}
   else if(!quoted&&(c==='\n'||c==='\r')){
    if(c==='\r'&&text[i+1]==='\n')i++;
    row.push(cell.trim());if(row.some(x=>x))rows.push(row);row=[];cell='';
   }else cell+=c;
   if(rows.length>60000)throw Error('O arquivo excede 60 mil linhas; divida-o em períodos menores.');
  }
  row.push(cell.trim());if(row.some(x=>x))rows.push(row);
  return rows;
 },
 columns(headers){
  const h=headers.map(x=>ImportRules.norm(x));
  const pick=patterns=>h.findIndex(x=>patterns.some(p=>p.test(x)));
  const date=pick([/^data( da)? (transacao|operacao|lancamento|compra|movimento)/,/^data$/,/^dt /,/^date$/]);
  const desc=pick([/historico/,/descric/,/estabelec/,/detalhe/,/^titulo$/,/^merchant$/,/^nome$/,/^lancamento$/]);
  const amount=pick([/^valor( \(r\$\))?$/,/^valor da (transacao|compra|operacao)/,/^montante$/,/^amount$/,/^valor \(/]);
  const debit=pick([/debito/,/^saida/,/^pagamento$/]);
  const credit=pick([/credito/,/^entrada/,/^recebimento$/]);
  const type=pick([/^tipo( de (lancamento|movimentacao|operacao))?$/,/^natureza$/]);
  return {date,desc,amount,debit,credit,type,valid:date>=0&&desc>=0&&(amount>=0||(debit>=0&&credit>=0))};
 },
 fromCsv(text){
  const delimiter=ImportRules.delimiter(text),rows=ImportRules.csv(text.replace(/^\uFEFF/,''),delimiter);
  const start=rows.slice(0,30).findIndex(r=>ImportRules.columns(r).valid);
  if(start<0)return {rows:[],unreadable:rows.slice(0,8),issues:['Cabeçalho não reconhecido. A prévia não será lançada automaticamente.'],delimiter};
  const cols=ImportRules.columns(rows[start]),items=[],unreadable=[];
  for(let i=start+1;i<rows.length;i++){
   const cells=rows[i],d=ImportRules.date(cells[cols.date]);
   const description=String(cells[cols.desc]||'').trim();
   if(!description||!d){if(cells.some(x=>x))unreadable.push({line:i+1,text:cells.join(' | ').slice(0,220)});continue}
   let cents=cols.amount>=0?ImportRules.cents(cells[cols.amount]):null;
   if(cents===null&&cols.debit>=0&&cols.credit>=0){
    const debit=ImportRules.cents(cells[cols.debit]),credit=ImportRules.cents(cells[cols.credit]);
    cents=credit!==null&&credit!==0?Math.abs(credit):debit!==null&&debit!==0?-Math.abs(debit):null;
   }
   if(cents===null){unreadable.push({line:i+1,text:cells.join(' | ').slice(0,220)});continue}
   const kind=cols.type>=0?ImportRules.norm(cells[cols.type]):'';
   if(/^(d|debito|saida)$/.test(kind))cents=-Math.abs(cents);
   if(/^(c|credito|entrada)$/.test(kind))cents=Math.abs(cents);
   items.push({date:d,description,amountCents:cents,reference:'Linha '+(i+1)});
  }
  return {rows:items,unreadable,issues:[],delimiter};
 },
 fromText(text){
  const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/),items=[],unreadable=[];
  for(let i=0;i<lines.length;i++){
   const line=lines[i].trim();if(!line)continue;
   // Data completa + descrição + valor no fim, ou data isolada seguida da descrição.
   const match=line.match(/^\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+?)\s+(?:R\$\s*)?(\(?[-+]?\d[\d.,]*[-]?[cCdD]?\)?)\s*$/);
   if(!match){unreadable.push({line:i+1,text:line.slice(0,220)});continue}
   const date=ImportRules.date(match[1]),amountCents=ImportRules.cents(match[3]);
   if(!date||amountCents===null){unreadable.push({line:i+1,text:line.slice(0,220)});continue}
   items.push({date,description:match[2].trim(),amountCents,reference:'Linha '+(i+1)});
  }
  return {rows:items,unreadable,issues:items.length?[]:['Layout TXT não reconhecido; será necessária adaptação ao arquivo.']};
 },
 fromPdfLines(lines,options={}){
  // Card statements frequently show DD/MM without a year. Only resolve it when
  // the user has explicitly chosen a statement reference month (YYYY-MM).
  const referenceMonth=/^\d{4}-(0[1-9]|1[0-2])$/.test(options.referenceMonth||'')?options.referenceMonth:'';
  const card=options.kind==='card';
  const rows=[],unreadable=[],issues=[],pending=[];
  const skip=/^(?:total(?:\s+(?:da|de|do|dos|das))?\s+(?:fatura|compras|pagamentos|creditos|debitos|lan[cç]amentos)|saldo(?:\s+(?:anterior|atual|final|total))?|pagamento\s+m[ií]nimo|vencimento|limite\s+(?:disponivel|total)|resumo|subtotal|valor\s+total|encargos\s+totais|parcelamento\s+da\s+fatura)/i;
  const datePrefix=/^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s+(.+)$/;
  const valueSuffix=/^(.*?)\s+(?:R\$\s*)?(\(?[-+]?\d[\d.,]*[-]?[cCdD]?\)?)\s*$/;
  for(const item of lines){
   const line=String(item.text||'').trim().replace(/\s+/g,' ');
   if(!line)continue;
   const match=line.match(datePrefix);
   if(!match){if(/(?:\d{1,2}[/-]\d{1,2}|R\$)/.test(line))unreadable.push({line:item.page,text:line.slice(0,220)});continue}
   const remainder=match[2].trim();
   if(skip.test(remainder))continue;
   const money=remainder.match(valueSuffix);
   if(!money||!money[1]?.trim()){unreadable.push({line:item.page,text:line.slice(0,220)});continue}
   let date=ImportRules.date(match[1]);
   if(!date&&/^\d{1,2}[/-]\d{1,2}$/.test(match[1])){
    if(!referenceMonth){unreadable.push({line:item.page,text:line.slice(0,220)});pending.push(line);continue}
    const [day,month]=match[1].split(/[/-]/).map(Number);
    const [year,referenceNumber]=referenceMonth.split('-').map(Number);
    // A fatura may show purchases from the reference month or prior month.
    // For a January statement, December belongs to the preceding year.
    const candidateYear=month>referenceNumber?year-1:year;
    const diff=(year*12+referenceNumber)-(candidateYear*12+month);
    if(diff<0||diff>1){unreadable.push({line:item.page,text:line.slice(0,220)});pending.push(line);continue}
    date=ImportRules.date(String(day).padStart(2,'0')+'/'+String(month).padStart(2,'0')+'/'+candidateYear);
   }
   const amountCents=ImportRules.cents(money[2]);
   if(!date||amountCents===null){unreadable.push({line:item.page,text:line.slice(0,220)});continue}
   // Card charges are shown as positive consumption; leave refunds negative
   // and do not conflate invoice totals with individual purchases.
   const description=money[1].trim();
   if(skip.test(description))continue;
   rows.push({date,description,amountCents,reference:'Página '+item.page});
  }
  if(pending.length)issues.push('Datas sem ano precisam de mês de referência confirmado; movimentos de outros períodos continuam pendentes.');
  if(!rows.length)issues.push('PDF lido, mas nenhuma movimentação segura foi identificada. Confira a fonte, o mês e o layout.');
  if(card&&rows.some(r=>r.amountCents<0))issues.push('Valores negativos em faturas podem representar estornos ou créditos: confira antes de classificar.');
  return {rows,unreadable,issues};
 },
 monthly(files){
  const map=new Map();
  for(const f of files){
   const source=ImportRules.source(f.source);
   if(!source)continue;
   for(const r of f.rows){
    const month=r.date.slice(0,7),key=month+'|'+source.kind;
    if(!map.has(key))map.set(key,{month,kind:source.kind,count:0,credit:0,debit:0});
    const row=map.get(key);row.count++;
    if(r.amountCents>0)row.credit+=r.amountCents;else row.debit+=Math.abs(r.amountCents);
   }
  }
  return [...map.values()].sort((a,b)=>a.month.localeCompare(b.month)||a.kind.localeCompare(b.kind));
 }
});
