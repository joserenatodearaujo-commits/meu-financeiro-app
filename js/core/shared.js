'use strict';
// Meu Financeiro • Utility functions and shared application state. Loading order matters until future dependency injection.

'use strict';
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const fmt=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const uid=()=>crypto.randomUUID();const monthKey=d=>String(d||'').slice(0,7);const now=new Date(),currentMonth=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');const addMonths=(m,n)=>{const [y,mo]=m.split('-').map(Number);const d=new Date(y,mo-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};const dateInMonth=(m,day)=>{const [y,mo]=m.split('-').map(Number),last=new Date(y,mo,0).getDate();return `${m}-${String(Math.min(Math.max(+day||1,1),last)).padStart(2,'0')}`};const categories=['Moradia','Alimentação','Transporte','Saúde','Educação','Lazer','Família','Financeiro','Outros'];const microbes={Moradia:['Aluguel','Financiamento','Energia','Água','Internet','Condomínio'],Alimentação:['Supermercado','Restaurante','Delivery'],Transporte:['Combustível','Manutenção','Seguro','IPVA'],Saúde:['Consultas','Farmácia','Plano de saúde'],Educação:['Escola','Cursos','Material'],Lazer:['Passeios','Viagens','Assinaturas'],Família:['Crianças','Vestuário','Diversos'],Financeiro:['Juros','Tarifas'],Outros:['Diversos']};let state=null,passphrase='',salt=null,selectedPage='resumo',selectedMonth='2026-11',periodMonths=1;
const viewedMonths=()=>Array.from({length:periodMonths},(_,i)=>addMonths(selectedMonth,i-periodMonths+1));
const periodLabel=()=>periodMonths===1?selectedMonth:`${viewedMonths()[0]} a ${selectedMonth}`;
const periodSums=months=>months.reduce((a,m)=>{const v=sums(m);a.ins+=v.ins;a.expenses+=v.expenses;a.invest+=v.invest;a.left+=v.left;return a},{ins:0,expenses:0,invest:0,left:0});
function periodBreakdown(months,basis='cash',depth='macro'){const vals={};months.forEach(m=>breakdown(m,basis,depth).forEach(([cat,val])=>{vals[cat]=(vals[cat]||0)+val}));return Object.entries(vals).sort((a,b)=>b[1]-a[1])}const plain=()=>({version:1,accounts:[{id:'cash-default',name:'Dinheiro/Pix',type:'bank',closing:1,due:10}],transactions:[],goals:[],createdAt:new Date().toISOString()});
document.querySelectorAll('[data-toggle-password]').forEach(button=>{
  button.addEventListener('click',()=>{
    const field=document.getElementById(button.dataset.togglePassword);
    const visible=field.type==='password';
    field.type=visible?'text':'password';
    button.textContent=visible?'Ocultar':'Mostrar';
    button.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha');
    button.setAttribute('aria-pressed',String(visible));
    field.focus();
  });
});
