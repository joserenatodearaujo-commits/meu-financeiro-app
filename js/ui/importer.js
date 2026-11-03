'use strict';
// Área de conferência temporária. Nenhuma informação financeira é persistida ou enviada à rede.
const importSession={files:[],reading:false};
const importFormatMoney=cents=>Number(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function importPdfTextLines(items,pageNumber){
 const lines=[];
 for(const item of items){
  const text=String(item.str||'').trim();if(!text)continue;
  const x=Number(item.transform?.[4]||0),y=Number(item.transform?.[5]||0);
  let line=lines.find(l=>Math.abs(l.y-y)<=2);
  if(!line){line={y,parts:[]};lines.push(line)}
  line.parts.push({x,text});
 }
 lines.sort((a,b)=>b.y-a.y);
 return lines.map(l=>({page:pageNumber,text:l.parts.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' ')}));
}
async function importReadPdf(file){
 if(!globalThis.pdfjsLib)throw Error('Leitor de PDF local indisponível.');
 pdfjsLib.GlobalWorkerOptions.workerSrc='./js/vendor/pdf.worker.min.js';
 const bytes=new Uint8Array(await file.arrayBuffer());
 const task=pdfjsLib.getDocument({data:bytes,disableFontFace:true,isEvalSupported:false,stopAtErrors:true});
 let pdf;
 try{
  pdf=await task.promise;
  if(pdf.numPages>150)throw Error('PDF com mais de 150 páginas: divida por períodos.');
  const lines=[];let chars=0;
  for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i),items=await page.getTextContent({disableCombineTextItems:false});
   const pageLines=importPdfTextLines(items.items,i);
   chars+=pageLines.reduce((a,r)=>a+r.text.length,0);
   if(chars>4e6)throw Error('PDF excede o limite de texto para esta sessão.');
   lines.push(...pageLines);page.cleanup();
  }
  if(chars<20)throw Error('PDF sem texto selecionável. Exige OCR local; nenhum lançamento será criado.');
  return {...ImportRules.fromPdfLines(lines),pdfLines:lines,scanned:false,pages:pdf.numPages,lines:lines.length};
 }finally{try{await pdf?.destroy()}catch(_){try{await task.destroy()}catch(__){}}}
}
async function importReadText(file){
 const buffer=await file.arrayBuffer();
 const utf=new TextDecoder('utf-8').decode(buffer);
 const text=(utf.match(/\uFFFD/g)||[]).length>3?new TextDecoder('windows-1252').decode(buffer):utf;
 return file.name.toLowerCase().endsWith('.csv')?ImportRules.fromCsv(text):ImportRules.fromText(text);
}
function importReparsePdf(item){
 if(item.type!=='pdf'||!item.pdfLines)return;
 const parsed=ImportRules.fromPdfLines(item.pdfLines,{referenceMonth:item.referenceMonth||'',kind:ImportRules.source(item.source)?.kind||''});
 item.rows=parsed.rows;item.unreadable=parsed.unreadable;item.issues=parsed.issues;
}
function importFileSourceSelector(file,i){
 const period=file.type==='pdf'?'<label class="field import-file-source"><span>Mês de referência da fatura (confirme no PDF)</span><input type="month" data-import-month="'+i+'" value="'+esc(file.referenceMonth||'')+'"><small>Necessário para lançamentos com data DD/MM sem ano. Para janeiro, dezembro pertence ao ano anterior.</small></label>':'';
 return '<label class="field import-file-source"><span>Origem</span><select data-import-source="'+i+'" aria-label="Origem do arquivo '+esc(file.name)+'">'+
  '<option value="" '+(!file.source?'selected':'')+'>Selecionar instituição e tipo</option>'+
  ImportRules.sources.map(s=>'<option value="'+esc(s.id)+'" '+(file.source===s.id?'selected':'')+'>'+esc(s.label)+'</option>').join('')+
  '</select></label>'+period;
}
function renderImport(){
 const target=$('#importResults');if(!target)return;
 const files=importSession.files;
 $('#importClear').disabled=importSession.reading||!files.length;
 $('#importAnalyze').disabled=importSession.reading;
 $('#importAnalyze').textContent=importSession.reading?'Analisando localmente…':'Ler e organizar os arquivos';
 if(!files.length){target.innerHTML='<p class="empty">Selecione arquivos PDF, CSV ou TXT. A prévia é local e não altera o cofre.</p>';renderImportReconciliation();return}
 const summaries=ImportRules.monthly(files);
 const totals={read:files.filter(f=>f.status==='ok').length,rows:files.reduce((n,f)=>n+f.rows.length,0),issues:files.reduce((n,f)=>n+f.unreadable.length,0)+files.filter(f=>f.status!=='ok').length};
 const missingSource=files.filter(f=>f.status==='ok'&&!ImportRules.source(f.source)).length;
 const monthTable=summaries.length?'<div class="tablewrap">'+table(['Mês','Tipo','Linhas reconhecidas','Entradas/valores positivos','Saídas/valores negativos'],summaries.map(s=>[
  esc(s.month),s.kind==='bank'?'Conta corrente':'Cartão de crédito',String(s.count),importFormatMoney(s.credit),importFormatMoney(s.debit)
 ]))+'</div>':'<p class="muted">Selecione a origem dos arquivos para visualizar o resumo por mês e por tipo.</p>';
 const cards=files.map((f,i)=>{
  const status=f.status==='ok'?'Texto processado para revisão':'Revisão necessária';
  const statusClass=f.status==='ok'?'amountpos':'amountneg';
  const rows=f.rows.slice(0,30);
  const preview=rows.length?'<div class="tablewrap">'+table(['Data','Descrição original','Valor','Referência'],rows.map(r=>[
   esc(r.date),esc(r.description),'<span class="'+(r.amountCents<0?'amountneg':'amountpos')+'">'+importFormatMoney(r.amountCents)+'</span>',esc(r.reference)
  ]))+'</div>':'<p class="muted">Nenhum lançamento reconhecido automaticamente neste arquivo.</p>';
  const issue=f.error?'<p class="amountneg">'+esc(f.error)+'</p>':
   (f.issues||[]).map(x=>'<p class="amountneg">'+esc(x)+'</p>').join('');
  const example=(f.unreadable||[]).slice(0,3).map(x=>'<li><span class="muted">'+esc(x.line)+'</span> · '+esc(x.text)+'</li>').join('');
  return '<details class="import-file-group" '+(i===0?'open':'')+'><summary><b>'+esc(f.name)+'</b><span class="'+statusClass+'">'+status+' · '+f.rows.length+' linhas</span></summary>'+
   '<div class="import-file-body">'+importFileSourceSelector(f,i)+
   '<p class="muted">'+esc(f.type.toUpperCase())+' · '+Number(f.size/1024).toFixed(0)+' KB · '+(f.pages?f.pages+' páginas · ':'')+
   f.rows.length+' movimentações reconhecidas · '+f.unreadable.length+' linhas para revisão. Mostrando até 30 movimentos.</p>'+issue+
   preview+(example?'<details class="import-unreadable"><summary>Exemplos de linhas não reconhecidas</summary><ul>'+example+'</ul></details>':'')+'</div></details>';
 }).join('');
 target.innerHTML='<div class="import-summary"><span><b>'+files.length+'</b> arquivos</span><span><b>'+totals.rows+'</b> linhas reconhecidas</span><span><b>'+totals.issues+'</b> alertas/linhas para revisar</span></div>'+
 '<p class="notice warning">Esta é uma <b>prévia de leitura</b>, não uma conciliação aprovada. Não se somam compras de cartões com saídas bancárias. Nenhuma movimentação foi gravada ou enviada. '+(missingSource?'Há '+missingSource+' arquivo(s) sem origem atribuída.':'')+'</p>'+
 '<h3>Resumo preliminar por mês</h3>'+monthTable+
 '<h3>Prévia de cada arquivo</h3>'+cards+
 '<p class="muted">Revise a conciliação provisória abaixo. PDFs digitalizados ou datas incompletas exigem conferência.</p>';
 renderImportReconciliation();
}
async function importAnalyzeFiles(){
 if(importSession.reading)return;
 const selected=Array.from($('#importFiles').files||[]);
 if(!selected.length){$('#importStatus').textContent='Selecione um ou mais arquivos antes de analisar.';return}
 if(selected.length>100){$('#importStatus').textContent='Limite de 100 arquivos por sessão.';return}
 if(selected.some(f=>f.size>20*1024*1024)||selected.reduce((a,f)=>a+f.size,0)>100*1024*1024){$('#importStatus').textContent='Limite: 20 MB por arquivo e 100 MB no total. Divida arquivos maiores.';return}
 importSession.reading=true;importSession.files=[];renderImport();
 try{
  for(const [i,file] of selected.entries()){
   $('#importStatus').textContent='Analisando arquivo '+(i+1)+' de '+selected.length+' no navegador…';
   const extension=String(file.name).split('.').pop().toLowerCase();
   const item={name:file.name,size:file.size,type:extension,source:ImportRules.sourceHint(file.name),referenceMonth:'',rows:[],unreadable:[],issues:[],status:'error'};
   try{
    if(!['csv','txt','pdf'].includes(extension))throw Error('Formato inválido. Use PDF, CSV ou TXT.');
    const result=extension==='pdf'?await importReadPdf(file):await importReadText(file);
    item.rows=result.rows||[];item.unreadable=result.unreadable||[];item.issues=result.issues||[];
    item.pages=result.pages||0;item.pdfLines=result.pdfLines||null;item.status='ok';
    if(extension==='pdf')importReparsePdf(item);
   }catch(e){item.error=e?.message||'Falha ao ler arquivo';item.status='error'}
   importSession.files.push(item);
  }
  $('#importStatus').textContent='Leitura local concluída. Confira a origem, os valores e as linhas não reconhecidas.';
 }finally{importSession.reading=false;renderImport()}
}
function initImporter(){
 $('#importAnalyze').onclick=()=>importAnalyzeFiles().catch(e=>{$('#importStatus').textContent=e.message||'Falha de leitura';importSession.reading=false;renderImport()});
 $('#importClear').onclick=()=>{importSession.files=[];$('#importFiles').value='';$('#importStatus').textContent='Prévia descartada. Nenhum dado foi gravado.';renderImport()};
 $('#importFiles').onchange=()=>{$('#importStatus').textContent=$('#importFiles').files?.length+' arquivo(s) selecionado(s). Clique em Ler e organizar.'};
 $('#importResults').addEventListener('change',e=>{
  const sourceIndex=e.target.dataset.importSource,monthIndex=e.target.dataset.importMonth;
  const index=sourceIndex!==undefined?Number(sourceIndex):monthIndex!==undefined?Number(monthIndex):-1;
  const f=importSession.files[index];if(!f)return;
  if(sourceIndex!==undefined)f.source=e.target.value;
  if(monthIndex!==undefined)f.referenceMonth=e.target.value;
  importReparsePdf(f);renderImport();
 });
 renderImport();
}
