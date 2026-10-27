'use strict';
// Meu Financeiro • Portuguese amount parser, categorizer, structured local drafts.
/* ASSISTENTE V2: interpretação local e card obrigatório, sem API externa */

let agentDraft=null, agentImageUrl=null, agentRecognizer=null;
const agentDate=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
function simplify(t){return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
/* v2.4: parser determinístico para valores falados em português brasileiro.
   Prefere valores monetários explícitos; datas, parcelas e quantidades NÃO são preços. */
const ptUnits={zero:0,um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,quatorze:14,catorze:14,quinze:15,dezesseis:16,dezassete:17,dezessete:17,dezoito:18,dezenove:19,vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90,cem:100,cento:100,duzentos:200,duzentas:200,trezentos:300,trezentas:300,quatrocentos:400,quatrocentas:400,quinhentos:500,quinhentas:500,seiscentos:600,seiscentas:600,setecentos:700,setecentas:700,oitocentos:800,oitocentas:800,novecentos:900,novecentas:900};
function ptWordsToNumber(s){
 const words=simplify(s).trim().split(/\s+/).filter(Boolean);if(!words.length)return null;
 let partial=0,total=0,seen=false;
 for(const w of words){if(w==='e')continue;if(w==='mil'){total+=Math.max(1,partial)*1000;partial=0;seen=true;continue;}if(!Object.hasOwn(ptUnits,w))return null;partial+=ptUnits[w];seen=true;}
 return seen?total+partial:null;
}
function brNumeric(n){
 const raw=String(n).trim();if(!/^\d[\d.,]*$/.test(raw))return null;
 if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw))return Number(raw.replaceAll('.','').replace(',','.'));
 if(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(raw))return null; // Pontuação ambígua, não assumir.
 if(/^\d+(?:,\d{1,2})$/.test(raw))return Number(raw.replace(',','.'));
 if(/^\d+(?:\.\d{1,2})$/.test(raw))return Number(raw);
 if(/^\d+$/.test(raw))return Number(raw);
 return null;
}
function ptSmallNumber(s){const raw=simplify(s).trim();return /^\d{1,2}$/.test(raw)?Number(raw):ptWordsToNumber(raw);}
function appendCents(full,start,value){
 // Ex.: 15 reais e cinquenta centavos; vinte reais e dez; 30 reais e 20 centavos.
 const tail=simplify(full.slice(start));const re=/^\s*(?:e|com)\s+([a-z\s]+?|\d{1,2})\s*centavos?\b/i;
 const explicit=tail.match(re);if(explicit){const cents=ptSmallNumber(explicit[1]);if(cents!=null&&cents>=0&&cents<100)return value+cents/100;}
 const short=tail.match(/^\s*e\s+(\d{1,2}|[a-z]+(?:\s+e\s+[a-z]+)?)\b/);
 if(short){const cents=ptSmallNumber(short[1]);if(cents!=null&&cents>=0&&cents<100)return value+cents/100;}
 return value;
}
function guessAmountDetailed(txt){
 const src=simplify(txt),candidates=[];
 const add=(value,index,end,score,explicit,origin)=>{if(Number.isFinite(value)&&value>0&&value<1e12)candidates.push({value:Math.round(value*100)/100,index,end,score,explicit,origin})};
 const N='(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[,.]\\d{1,2})?)';
 const withCurrency=new RegExp('(?:r\\s*\\$\\s*('+N+')|('+N+')\\s*(?:reais|real|rs)\\b)','gi');
 for(const m of src.matchAll(withCurrency)){
   const n=brNumeric(m[1]||m[2]);if(n!==null)add(appendCents(src,m.index+m[0].length,n),m.index,m.index+m[0].length,110,true,'moeda');
 }
 const words=[...src.matchAll(/[a-z]+/g)].map(m=>({s:m[0],i:m.index,end:m.index+m[0].length}));
 for(let i=0;i<words.length;i++){
   if(!Object.hasOwn(ptUnits,words[i].s)&&words[i].s!=='mil')continue;
   let j=i;while(j<words.length && (Object.hasOwn(ptUnits,words[j].s)||words[j].s==='mil'||words[j].s==='e') && (j===i||/^\s*$/.test(src.slice(words[j-1].end,words[j].i))))j++;
   const phrase=src.slice(words[i].i,words[j-1].end),val=ptWordsToNumber(phrase);
   const after=src.slice(words[j-1].end).match(/^\s*(reais|real|centavos?)\b/);
   if(val!==null && after?.[1].startsWith('rea')){
     const end=words[j-1].end+after[0].length;
     add(appendCents(src,end,val),words[i].i,end,105,true,'por extenso');
   }else if(val!==null&&after?.[1].startsWith('centavo'))add(val/100,words[i].i,words[j-1].end+after[0].length,95,true,'centavos');
   else if(val!==null){
     const before=src.slice(Math.max(0,words[i].i-35),words[i].i),afterText=src.slice(words[j-1].end,words[j-1].end+28);
     const moneyContext=/(?:gastei|paguei|comprei|custou|custo|valor|recebi|ganhei|cobrou|deu|saiu|total|por|abasteci|investi)\s*(?:de\s*)?$/.test(before);
     const invalid=/\b(?:dia|numero|nro|parcelas?|vezes|em|litros?|kg)\s*$/.test(before)||/^\s*(?:vezes|parcelas|litros?|kg|dias|centavos)\b/.test(afterText);
     if(moneyContext&&!invalid&&/^(?:\s*(?:no|na|num|numa|de|do|da|com|por|pelo|pela|em|pix|cartao|credito)\b|\s*[.,;!?]?$)/.test(afterText))add(val,words[i].i,words[j-1].end,60,false,'valor por extenso sem moeda');
   }
   i=j-1;
 }
 // Expressão coloquial: "quinze e cinquenta" = R$ 15,50. Marcada como ambígua.
 const short=/\b(\d{1,3}|[a-z]+)\s+e\s+(\d{1,2}|[a-z]+)\b/g;
 for(const m of src.matchAll(short)){
   const a=brNumeric(m[1])??ptWordsToNumber(m[1]),b=brNumeric(m[2])??ptWordsToNumber(m[2]);
   if(a>=10&&a<100&&b>=10&&b<100){
      const before=src.slice(Math.max(0,m.index-32),m.index);
      if(/(?:gastei|paguei|comprei|custou|valor|deu|total|por)\s*(?:de\s*)?$/.test(before))add(a+b/100,m.index,m.index+m[0].length,65,false,'expressão informal ambígua');
   }
 }
 const numeric=new RegExp(N,'g');
 for(const m of src.matchAll(numeric)){
   if(candidates.some(c=>m.index>=c.index && m.index<c.end))continue;
   const nearBefore=src.slice(Math.max(0,m.index-25),m.index),nearAfter=src.slice(m.index+m[0].length,m.index+m[0].length+22);
   if(/[/\-]$/.test(nearBefore)||/^\s*[/\-]/.test(nearAfter)||/\b(?:dia|em|parcela|parcelas|vez|vezes|numero|nro)\s*$/.test(nearBefore)||/^\s*(?:x\b|vezes\b|parcelas?\b|litros?\b|kg\b|km\b|%)/.test(nearAfter))continue;
   const n=brNumeric(m[0]);if(n===null)continue;
   const hasVerb=/(?:gastei|paguei|comprei|custou|valor|preco|recebi|cobrou|total|deu|abasteci|investi|por)\s*(?:de\s*)?$/.test(nearBefore);
   const score=hasVerb?55:15;
   add(n,m.index,m.index+m[0].length,score,false,'número sem moeda');
 }
 // Mesmo valor em interpretações equivalentes não configura conflito.
 candidates.sort((a,b)=>b.score-a.score||a.index-b.index);
 const choice=candidates[0];if(!choice)return {value:null,uncertain:true,reason:'Não foi possível identificar um valor em reais.',origin:'nenhum'};
 const different=candidates.filter(c=>Math.abs(c.value-choice.value)>0.009 && !(c.origin==='centavos'&&choice.explicit&&c.index>choice.end&&c.index-choice.end<12));
 const competing=different.some(c=>c.score>=choice.score-30);
 const uncertain=!choice.explicit||competing||choice.origin.includes('ambígua');
 const reason=competing?'Existem valores diferentes na frase. Confira o total da despesa.':choice.origin.includes('ambígua')?'Expressão informal: confirme os reais e centavos.':!choice.explicit?'Valor sem indicação explícita de reais: confira a transcrição.':'';
 return {value:choice.value,uncertain,reason,origin:choice.origin};
}
function guessAmount(txt){return guessAmountDetailed(txt).value;}

function autoClassify(text){
 const t=simplify(text); const checks=[
  ['Transporte','Combustível',/combust|abastec|gasolina|etanol|diesel|posto de /],
  ['Transporte','Manutenção',/mecanico|oficina|pneu|revisao|oleo de motor/],
  ['Alimentação','Supermercado',/supermercado|mercado|atacadao|mercearia|compras do mes/],
  ['Alimentação','Restaurante',/restaurante|almoco|jantar|lanche|cafe da manha/],
  ['Alimentação','Delivery',/delivery|ifood|entrega de comida/],
  ['Moradia','Aluguel',/aluguel/],['Moradia','Energia',/energia|conta de luz|eletricidade/],
  ['Moradia','Água',/conta de agua|saneamento/],['Moradia','Internet',/internet|banda larga/],
  ['Saúde','Farmácia',/farmacia|remedio|medicamento/],['Saúde','Consultas',/consulta medica|dentista|medico/],
  ['Educação','Escola',/escola|mensalidade escolar/],['Educação','Cursos',/curso|faculdade/],
  ['Lazer','Assinaturas',/netflix|spotify|assinatura|streaming/],['Lazer','Viagens',/viagem|hotel|passagem/],
  ['Família','Vestuário',/roupa|calcado|tenis/],['Financeiro','Juros',/juros|multa|encargos/]
 ];for(const [macro,micro,re] of checks)if(re.test(t))return {macro,micro};return {macro:'Outros',micro:'Diversos'};
}
function extractLocal(text,fromPhoto=false){
 const norm=simplify(text),today=agentDate(),detectedAmount=guessAmountDetailed(text);let value=detectedAmount.value;
 // OCR and some tickets have many numeric totals: favor explicit TOTAL or VALOR A PAGAR when present.
 if(fromPhoto){const matched=String(text).match(/(?:total\s*(?:a\s*pagar)?|valor\s*(?:total)?|pago)\s*[:\-\s]*r?\$?\s*(\d{1,6}(?:\.\d{3})*,\d{2})/ig);
  if(matched?.length){const m=matched[matched.length-1].match(/(\d{1,6}(?:\.\d{3})*,\d{2})/);if(m)value=Number(m[1].replaceAll('.','').replace(',','.'));}
 }
 let type=/\b(recebi|receita|salario|ganhei|pagamento recebido|renda extra)\b/.test(norm)?'income':'expense';
 if(/\b(aporte|investi|comprei acoes|aplicacao financeira)\b/.test(norm))type='investment';
 if(/\b(transferi para minha conta|transferencia entre contas)\b/.test(norm))type='transfer';
 const c=autoClassify(text);
 const installmentMatch=norm.match(/(?:em\s*)?(\d{1,3})\s*(?:x|vezes|parcelas)\b/);
 const installments=Math.max(1,Math.min(120,Number(installmentMatch?.[1])||1));
 const card=state.accounts.find(a=>a.type==='card'&&simplify(text).includes(simplify(a.name)));
 let paymentMethod=/\bpix\b/.test(norm)?'pix':/\bdinheiro\b|especie/.test(norm)?'cash':/\bdebito\b/.test(norm)?'debit':/\bcartao|credito|parcel/.test(norm)?'credit':(card?'credit':'unspecified');
 const rdate=norm.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
 let date=today;if(rdate){let y=Number(rdate[3]||today.slice(0,4));if(y<100)y+=2000;const mo=Number(rdate[2]),d=Number(rdate[1]);if(mo>=1&&mo<=12&&d>=1&&d<=new Date(y,mo,0).getDate())date=`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
 else if(/\bontem\b/.test(norm)){const z=new Date(today+'T12:00:00');z.setDate(z.getDate()-1);date=z.getFullYear()+'-'+String(z.getMonth()+1).padStart(2,'0')+'-'+String(z.getDate()).padStart(2,'0')}
 let description=(text||'').trim().replace(/^\s*(?:paguei|gastei|comprei|recebi|investi|abasteci|foi|deu)\b\s*/i,'').replace(/^r\$\s*[\d.,]+\s*(?:reais?)?\s*(?:de|em|no|na)?\s*/i,'').slice(0,90).trim();
 if(c.micro==='Combustível')description='Combustível';else if(c.micro==='Supermercado')description='Supermercado';else if(c.micro==='Aluguel')description='Aluguel';
 if(!description||description.length<3)description=fromPhoto?'Despesa de comprovante':'Despesa informada';
 const recurring=/\b(todo mes|todos os meses|mensalmente|recorrente|fixa mensal)\b/.test(norm);
 return {type,description,amount:value||0,macro:c.macro,micro:c.micro,purchaseDate:date,paymentDate:date,
  paymentMethod,accountId:'cash-default',cardId:card?.id||'',installments,firstDue:date,recurring,recurringEnd:'',asset:'',operation:'aporte',
  confidence:value?'revisar':'incompleto',fromPhoto,amountIssue:detectedAmount.reason||'',amountUncertain:detectedAmount.uncertain,amountOrigin:detectedAmount.origin};
}
function firstDueForCard(date,card){const close=Number(card.closing)||5,due=Number(card.due)||15;let m=monthKey(date);
 if(Number(date.slice(-2))>close)m=addMonths(m,1);if(due<=close)m=addMonths(m,1);
 return dateInMonth(m,due);
}
