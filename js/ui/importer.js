'use strict';
// Área de conferência temporária. Nenhuma informação financeira é persistida ou enviada à rede.
const importSession={files:[],reading:false,categoryOverrides:new Map(),previewFilter:'all',previewSearch:''};
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
 const out=[];
 for(const row of lines){
  const parts=row.parts.sort((a,b)=>a.x-b.x);
  // Some PDFs have two independent columns of purchases sharing the same Y.
  // Split only when a second date starts well to the right of the first.
  let section=[],startX=parts[0]?.x||0;
  for(const part of parts){
   const isDate=/^(?:\d{1,2}[/-]\d{1,2}|\d{1,2}\s+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ))\b/i.test(part.text);
   if(section.length&&isDate&&part.x-startX>145){
    out.push({page:pageNumber,text:section.map(p=>p.text).join(' ')});
    section=[];startX=part.x;
   }
   section.push(part);
  }
  if(section.length)out.push({page:pageNumber,text:section.map(p=>p.text).join(' ')});
 }
 return out;
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
// Classification suggestions are local preview data. Never write them to the financial vault.
function importPreviewClassification(row){
 const id=row.id,override=importSession.categoryOverrides.get(id),catalog=taxonomyCatalog();
 const proposed=override||row.category;
 const entry=proposed?TaxonomyRules.find(catalog,proposed.macro):null;
 const sub=entry?.subcategories?.find(x=>TaxonomyRules.key(x)===TaxonomyRules.key(proposed.micro));
 const category=entry&&sub?{macro:entry.name,micro:sub}:null;
 // A duplicate, suspected transfer, cash movement, invoice payment or existing item
 // must remain pending even when a spending category can be suggested.
 const identified=!!category&&row.status==='review';
 return {category,identified,reason:row.status==='review'?(category?'Classificação sugerida, ainda não aprovada.':'Categoria e subcategoria precisam de revisão.'):row.reason};
}
function importPreviewSelectOptions(entries,selected,label){
 return '<option value="">'+esc(label)+'</option>'+entries.map(x=>
  '<option value="'+esc(x)+'" '+(x===selected?'selected':'')+'>'+esc(x)+'</option>').join('');
}
function importPreviewRows(rows){
 return rows.map(row=>{
  const status=importPreviewClassification(row),cat=status.category;
  const categories=taxonomyCatalog().entries.map(x=>x.name);
  const subcategories=cat?(TaxonomyRules.find(taxonomyCatalog(),cat.macro)?.subcategories||[]):[];
  const source=ImportRules.source(row.source)?.label||row.source;
  const reason=status.identified?'Identificação sugerida — confirme antes de importar.':status.reason;
  return '<tr data-preview-row="'+esc(row.id)+'" data-preview-status="'+(status.identified?'identified':'pending')+'">'+
   '<td><span class="preview-dot '+(status.identified?'preview-dot-green':'preview-dot-red')+'" role="img" aria-label="'+(status.identified?'Identificado':'Pendente de análise')+'" title="'+esc(reason)+'"></span></td>'+
   '<td>'+esc(row.date)+(row.invoiceMonth?'<small class="preview-invoice">Fatura '+esc(row.invoiceMonth)+'</small>':'')+'</td>'+
   '<td><strong>'+esc(row.description)+'</strong><small class="preview-origin">'+esc(source)+' · '+esc(row.reference||row.filename)+'</small>'+
   (status.identified?'':'<small class="preview-pending-note">'+esc(reason)+'</small>')+'</td>'+
   '<td class="'+(row.amountCents<0?'amountneg':'amountpos')+'">'+importFormatMoney(row.amountCents)+'</td>'+
   '<td><select class="preview-category" data-preview-category="'+esc(row.id)+'" aria-label="Categoria de '+esc(row.description)+'">'+importPreviewSelectOptions(categories,cat?.macro||'','A definir')+'</select></td>'+
   '<td><select class="preview-subcategory" data-preview-subcategory="'+esc(row.id)+'" aria-label="Subcategoria de '+esc(row.description)+'" '+(!cat?'disabled':'')+'>'+
    importPreviewSelectOptions(subcategories,cat?.micro||'','A definir')+'</select></td></tr>';
 }).join('');
}
function importPreviewTable(rows){
 const evaluated=rows.map(row=>({row,...importPreviewClassification(row)}));
 const identified=evaluated.filter(x=>x.identified).length,pending=rows.length-identified;
 const shown=evaluated.filter(x=>(importSession.previewFilter==='all'||(importSession.previewFilter==='identified')===x.identified)&&
  (!importSession.previewSearch||[x.row.date,x.row.description,x.row.source,x.category?.macro,x.category?.micro].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(importSession.previewSearch.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))).map(x=>x.row);
 const opts=[['all','Todos'],['identified','Identificados'],['pending','Pendentes']];
 return '<section class="import-preview-panel" aria-label="Prévia de lançamentos identificados">'+
  '<div class="sectionrow"><h3>Prévia de lançamentos identificados</h3></div>'+
  '<div class="preview-stats">'+
   '<div><small>Identificados</small><strong class="amountpos">'+identified+'</strong></div>'+
   '<div><small>Pendentes</small><strong class="amountneg">'+pending+'</strong></div>'+
   '<div><small>Total analisado</small><strong>'+rows.length+'</strong></div>'+
  '</div>'+
  '<p class="muted">🟢 Categoria e subcategoria sugeridas · 🔴 Precisa de análise ou existe risco de duplicidade/transferência. Verde não significa lançamento aprovado.</p>'+
  '<div class="preview-toolbar"><div class="preview-filters" role="group" aria-label="Filtrar lançamentos">'+
   opts.map(([value,label])=>'<button type="button" class="btn small '+(importSession.previewFilter===value?'primary':'')+'" data-preview-filter="'+value+'" aria-pressed="'+(importSession.previewFilter===value)+'">'+label+' ('+(value==='all'?rows.length:value==='identified'?identified:pending)+')</button>').join('')+
   '</div><label class="preview-search">Buscar <input type="search" id="importPreviewSearch" placeholder="Descrição, categoria, data..." value="'+esc(importSession.previewSearch)+'"></label></div>'+
  '<div class="tablewrap preview-tablewrap"><table class="preview-table"><thead><tr><th>Situação</th><th>Data</th><th>Descrição</th><th>Valor</th><th>Categoria</th><th>Subcategoria</th></tr></thead><tbody>'+
   (shown.length?importPreviewRows(shown):'<tr><td colspan="6">Nenhum lançamento encontrado para este filtro.</td></tr>')+
  '</tbody></table></div>'+
  '<p class="muted">Mostrando '+shown.length+' de '+rows.length+' linhas reconhecidas. Classificações editadas são sugestões temporárias; nenhum valor é gravado no cofre.</p>'+
 '</section>';
}
function renderImport(){
 const target=$('#importResults');if(!target)return;
 const files=importSession.files;
 $('#importClear').disabled=importSession.reading||!files.length;
 $('#importAnalyze').disabled=importSession.reading;
 $('#importAnalyze').textContent=importSession.reading?'Analisando localmente…':'Ler e organizar os arquivos';
 if(!files.length){target.innerHTML='<p class="empty">Selecione arquivos PDF, CSV ou TXT. A prévia é local e não altera o cofre.</p>';renderImportReconciliation();return}
 const rows=ReconcileRules.review(files,state);
 const missingSource=files.filter(f=>f.status==='ok'&&!ImportRules.source(f.source)).length;
 const summary=files.map((f,i)=>{
  const issues=f.error?'<p class="amountneg">'+esc(f.error)+'</p>':
   (f.issues||[]).map(x=>'<p class="amountneg">'+esc(x)+'</p>').join('');
  const examples=(f.unreadable||[]).slice(0,5).map(x=>'<li>'+esc(x.text)+'</li>').join('');
  return '<details class="import-file-group"><summary><b>'+esc(f.name)+'</b> · '+f.rows.length+' identificadas · '+f.unreadable.length+' linhas para revisão</summary>'+
   '<div class="import-file-body">'+importFileSourceSelector(f,i)+issues+
   (examples?'<details class="import-unreadable"><summary>Linhas não reconhecidas</summary><ul>'+examples+'</ul></details>':'')+
   '</div></details>';
 }).join('');
 const alerts=files.reduce((total,f)=>total+f.unreadable.length+f.issues.length+(f.status==='error'?1:0),0);
 target.innerHTML='<p class="notice warning">Esta é uma prévia local de leitura. Classificações verdes são <b>sugestões</b> e continuam exigindo sua aprovação. Transferências, saques e pagamentos de fatura não são despesas por presunção. Nenhum lançamento é gravado automaticamente.</p>'+
  importPreviewTable(rows)+
  '<details class="import-files-details"><summary>Configurar os '+files.length+' arquivos e revisar '+alerts+' alertas de leitura</summary>'+
  '<div class="import-summary"><span><b>'+files.length+'</b> arquivos</span><span><b>'+rows.length+'</b> movimentos lidos</span><span><b>'+alerts+'</b> alertas de extração</span></div>'+summary+'</details>'+
  (missingSource?'<p class="amountneg">Há '+missingSource+' arquivo(s) sem origem selecionada. Informe a instituição antes de conciliar.</p>':'');

 renderImportReconciliation();
}
async function importAnalyzeFiles(){
 if(importSession.reading)return;
 const selected=Array.from($('#importFiles').files||[]);
 if(!selected.length){$('#importStatus').textContent='Selecione um ou mais arquivos antes de analisar.';return}
 if(selected.length>100){$('#importStatus').textContent='Limite de 100 arquivos por sessão.';return}
 if(selected.some(f=>f.size>20*1024*1024)||selected.reduce((a,f)=>a+f.size,0)>100*1024*1024){$('#importStatus').textContent='Limite: 20 MB por arquivo e 100 MB no total. Divida arquivos maiores.';return}
 importSession.reading=true;importSession.files=[];importSession.categoryOverrides.clear();importSession.previewFilter='all';importSession.previewSearch='';renderImport();
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
 $('#importClear').onclick=()=>{importSession.categoryOverrides.clear();importSession.previewSearch='';importSession.previewFilter='all';importSession.files=[];$('#importFiles').value='';$('#importStatus').textContent='Prévia descartada. Nenhum dado foi gravado.';renderImport()};
 $('#importFiles').onchange=()=>{$('#importStatus').textContent=$('#importFiles').files?.length+' arquivo(s) selecionado(s). Clique em Ler e organizar.'};
 $('#importResults').addEventListener('click',e=>{
  const filter=e.target.closest('[data-preview-filter]')?.dataset.previewFilter;
  if(!filter)return;
  if(!['all','identified','pending'].includes(filter))return;
  importSession.previewFilter=filter;renderImport();
 });
 $('#importResults').addEventListener('input',e=>{
  if(e.target.id!=='importPreviewSearch')return;
  importSession.previewSearch=e.target.value;
  const cursor=e.target.selectionStart;
  renderImport();
  const input=$('#importPreviewSearch');input?.focus();if(input)input.setSelectionRange(cursor,cursor);
 });
 $('#importResults').addEventListener('change',e=>{
  const sourceIndex=e.target.dataset.importSource,monthIndex=e.target.dataset.importMonth;
  const id=e.target.dataset.previewCategory??e.target.dataset.previewSubcategory;
  if(id!==undefined){
   const row=ReconcileRules.review(importSession.files,state).find(r=>r.id===id);
   if(!row)return;
   const current=importSession.categoryOverrides.get(id)||row.category;
   const macro=e.target.dataset.previewCategory!==undefined?e.target.value:current?.macro||'';
   const entry=TaxonomyRules.find(taxonomyCatalog(),macro);
   const micro=e.target.dataset.previewCategory!==undefined?'':e.target.value;
   if(entry&&entry.subcategories.some(x=>TaxonomyRules.key(x)===TaxonomyRules.key(micro)))
    importSession.categoryOverrides.set(id,{macro:entry.name,micro});
   else if(entry)importSession.categoryOverrides.set(id,{macro:entry.name,micro:''});
   else importSession.categoryOverrides.delete(id);
   renderImport();return;
  }
  const index=sourceIndex!==undefined?Number(sourceIndex):monthIndex!==undefined?Number(monthIndex):-1;
  const f=importSession.files[index];if(!f)return;
  if(sourceIndex!==undefined)f.source=e.target.value;
  if(monthIndex!==undefined)f.referenceMonth=e.target.value;
  importSession.categoryOverrides.clear();importReparsePdf(f);renderImport();
 });
 renderImport();
}
