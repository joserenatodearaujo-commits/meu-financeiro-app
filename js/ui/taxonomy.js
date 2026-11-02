'use strict';
// Apenas estado de visualização; alterações no catálogo continuam no cofre criptografado.
const expandedTaxonomyGroups=new Set();
// Interface do catálogo: um único vínculo macro → micro para todos os tipos de lançamento.
function subcategoryField(macro,micro='Diversos'){
 return '<div class="field taxonomy-subcontrol"><label>Subcategoria</label>'+
 '<select name="micro" aria-label="Subcategoria"></select>'+
 '<button type="button" class="btn small" data-inline-sub>+ Nova subcategoria</button>'+
 '<input name="newMicro" type="text" maxlength="60" placeholder="Nome da nova subcategoria" aria-label="Nova subcategoria" hidden disabled>'+
 '</div>';
}
function connectSubcategory(form,initialMacro,initialMicro){
 const macroField=form.querySelector('select[name="macro"]'),control=form.querySelector('.taxonomy-subcontrol');
 if(!macroField||!control)return;
 const select=control.querySelector('select[name="micro"]'),newField=control.querySelector('input[name="newMicro"]'),btn=control.querySelector('[data-inline-sub]');
 const fill=preferred=>{
  const items=subcategoryList(macroField.value),chosen=items.find(x=>TaxonomyRules.key(x)===TaxonomyRules.key(preferred))||items[0];
  select.innerHTML=items.map(x=>'<option value="'+esc(x)+'" '+(x===chosen?'selected':'')+'>'+esc(x)+'</option>').join('');
 };
 macroField.onchange=()=>{fill('Diversos');newField.hidden=true;newField.disabled=true;newField.value='';select.disabled=false;btn.textContent='+ Nova subcategoria'};
 btn.onclick=()=>{const opened=newField.hidden;newField.hidden=!opened;newField.disabled=!opened;newField.required=opened;select.disabled=opened;btn.textContent=opened?'Usar subcategoria existente':'+ Nova subcategoria';if(opened)newField.focus()};
 fill(initialMicro||'Diversos');
}
function chosenSubcategory(formData,macro){
 if(!TaxonomyRules.find(taxonomyCatalog(),macro))throw Error('Categoria não cadastrada.');
 const newName=String(formData.get('newMicro')||'').trim();
 if(newName){
  const pending=TaxonomyRules.addSub(taxonomyCatalog(),macro,newName);
  return {micro:TaxonomyRules.validate(newName),catalog:pending};
 }
 const existing=String(formData.get('micro')||'');
 const matched=subcategoryList(macro).find(x=>TaxonomyRules.key(x)===TaxonomyRules.key(existing));
 if(!matched)throw Error('Escolha uma subcategoria cadastrada.');
 return {micro:matched,catalog:taxonomyCatalog()};
}
function renderTaxonomy(){
 const target=$('#taxonomyList');if(!target||!state)return;
 target.innerHTML=taxonomyCatalog().entries.map(entry=>{
  const cat=encodeURIComponent(entry.name),subitems=subcategoryList(entry.name);
  const subs=subitems.map(name=>{
   const id=encodeURIComponent(name),referenced=(state.transactions||[]).some(t=>TaxonomyRules.key(t.macro)===TaxonomyRules.key(entry.name)&&TaxonomyRules.key(t.micro)===TaxonomyRules.key(name));
   return '<div class="taxonomy-sub"><span>'+esc(name)+'</span><span class="taxonomy-buttons">'+
    (TaxonomyRules.key(name)!=='diversos'?'<button type="button" class="btn small" data-tax-action="rename-sub" data-tax-category="'+esc(cat)+'" data-tax-sub="'+esc(id)+'">Renomear</button><button type="button" class="btn small danger" data-tax-action="delete-sub" data-tax-category="'+esc(cat)+'" data-tax-sub="'+esc(id)+'" '+(referenced?'disabled title="Vinculada a lançamentos"':'')+'>Excluir</button>':'')+'</span></div>';
  }).join('');
  const linked=state.transactions.some(t=>TaxonomyRules.key(t.macro)===TaxonomyRules.key(entry.name))||state.goals.some(g=>TaxonomyRules.key(g.macro)===TaxonomyRules.key(entry.name));
  return '<details class="taxonomy-group" data-tax-group="'+esc(cat)+'" '+(expandedTaxonomyGroups.has(cat)?'open':'')+'><summary><span class="disclosure-heading">'+esc(entry.name)+'</span><span class="disclosure-meta">'+subitems.length+' subcategorias</span></summary><div class="sectionrow taxonomy-group-actions"><div class="taxonomy-buttons">'+
   '<button type="button" class="btn small" data-tax-action="add-sub" data-tax-category="'+esc(cat)+'">+ Subcategoria</button>'+
   (TaxonomyRules.key(entry.name)!=='outros'?'<button type="button" class="btn small" data-tax-action="rename-cat" data-tax-category="'+esc(cat)+'">Renomear</button><button type="button" class="btn small danger" data-tax-action="delete-cat" data-tax-category="'+esc(cat)+'" '+(linked?'disabled title="Vinculada a lançamentos ou metas"':'')+'>Excluir</button>':'')+
   '</div></div><div class="taxonomy-subs">'+subs+'</div></details>';
 }).join('');
 $$('#taxonomyList details.taxonomy-group').forEach(details=>{
  details.ontoggle=()=>{if(!details.isConnected)return;const key=details.dataset.taxGroup;
   if(details.open)expandedTaxonomyGroups.add(key);else expandedTaxonomyGroups.delete(key)};
 });
}
function taxonomyForm(action,category='',sub=''){
 const caption={create:'Nova categoria','add-sub':'Nova subcategoria', 'rename-cat':'Renomear categoria','rename-sub':'Renomear subcategoria'}[action];
 if(!caption)throw Error('Ação desconhecida.');
 const value=action==='rename-cat'?category:action==='rename-sub'?sub:'';
 modal(caption,
 '<p class="muted">'+(category?'Categoria: '+esc(category):'Defina uma categoria de despesas ou receitas.')+'</p>'+
 field('taxName','Nome',value,'text','required minlength="2" maxlength="60"'),
 async f=>{
  const name=f.get('taxName');let next=taxonomyCatalog();
  if(action==='create')next=TaxonomyRules.addCategory(next,name);
  if(action==='add-sub')next=TaxonomyRules.addSub(next,category,name);
  if(action==='rename-cat')next=TaxonomyRules.renameCategory(next,category,name,state);
  if(action==='rename-sub')next=TaxonomyRules.renameSub(next,category,sub,name,state);
  state.taxonomy=next;
  expandedTaxonomyGroups.add(encodeURIComponent(action==='create'?TaxonomyRules.validate(name):action==='rename-cat'?TaxonomyRules.validate(name):category));
  if(action==='rename-cat')expandedTaxonomyGroups.delete(encodeURIComponent(category));
 });
}
async function taxonomyAction(button){
 const action=button.dataset.taxAction,category=decodeURIComponent(button.dataset.taxCategory||''),sub=decodeURIComponent(button.dataset.taxSub||'');
 if(['add-sub','rename-cat','rename-sub'].includes(action)){taxonomyForm(action,category,sub);return}
 if(action==='delete-cat'||action==='delete-sub'){
  const label=action==='delete-cat'?category:category+' / '+sub;
  if(!confirm('Excluir '+label+' do catálogo? Lançamentos já existentes serão preservados.'))return;
  try{
   const next=action==='delete-cat'?TaxonomyRules.deleteCategory(taxonomyCatalog(),category,state):TaxonomyRules.deleteSub(taxonomyCatalog(),category,sub,state);
   state.taxonomy=next;await save();renderAll();
  }catch(e){alert(e.message||'Não foi possível excluir.')}
 }
}
