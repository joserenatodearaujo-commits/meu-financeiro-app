'use strict';
// Catálogo único. Formato aditivo no cofre: state.taxonomy = {version:1, entries:[{name, subcategories:[]}]}
const TaxonomyRules=Object.freeze({
 clean(value){return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ');},
 key(value){return TaxonomyRules.clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');},
 validate(value){const name=TaxonomyRules.clean(value);if(name.length<2||name.length>60)throw Error('Informe um nome entre 2 e 60 caracteres.');if(/[<>{}]/.test(name))throw Error('Nome contém caracteres inválidos.');return name;},
 defaults(){return {version:1,entries:categories.map(name=>({name,subcategories:[...(microbes[name]||[])]}))};},
 find(catalog,name){return (catalog?.entries||[]).find(x=>TaxonomyRules.key(x.name)===TaxonomyRules.key(name));},
 addCategory(catalog,value){
  const name=TaxonomyRules.validate(value);
  if(TaxonomyRules.find(catalog,name))throw Error('Esta categoria já existe.');
  return {...catalog,entries:[...catalog.entries,{name,subcategories:['Diversos']}]};
 },
 renameCategory(catalog,previous,value,financial){
  const name=TaxonomyRules.validate(value),old=TaxonomyRules.find(catalog,previous);
  if(!old)throw Error('Categoria não encontrada.');
  if(TaxonomyRules.key(previous)==='outros')throw Error('A categoria Outros é necessária para lançamentos não classificados.');
  if((financial.transactions||[]).some(t=>TaxonomyRules.key(t.macro)===TaxonomyRules.key(previous))||(financial.goals||[]).some(g=>TaxonomyRules.key(g.macro)===TaxonomyRules.key(previous)))throw Error('Há lançamentos ou metas vinculados. Reclassifique-os antes de renomear.');
  if(TaxonomyRules.find(catalog,name)&&TaxonomyRules.key(name)!==TaxonomyRules.key(previous))throw Error('Categoria já existente.');
  return {...catalog,entries:catalog.entries.map(e=>e===old?{...e,name}:e)};
 },
 deleteCategory(catalog,value,financial){
  const old=TaxonomyRules.find(catalog,value);if(!old)throw Error('Categoria não encontrada.');
  if(TaxonomyRules.key(value)==='outros')throw Error('A categoria Outros não pode ser excluída.');
  if((financial.transactions||[]).some(t=>TaxonomyRules.key(t.macro)===TaxonomyRules.key(value))||(financial.goals||[]).some(g=>TaxonomyRules.key(g.macro)===TaxonomyRules.key(value)))throw Error('Existem lançamentos ou metas vinculados. Reclassifique-os antes de excluir.');
  return {...catalog,entries:catalog.entries.filter(e=>e!==old)};
 },
 addSub(catalog,category,value){
  const name=TaxonomyRules.validate(value),entry=TaxonomyRules.find(catalog,category);
  if(!entry)throw Error('Escolha uma categoria cadastrada.');
  if(TaxonomyRules.key(name)==='diversos'||entry.subcategories.some(x=>TaxonomyRules.key(x)===TaxonomyRules.key(name)))throw Error('Esta subcategoria já existe.');
  return {...catalog,entries:catalog.entries.map(e=>e===entry?{...e,subcategories:[...e.subcategories,name]}:e)};
 },
 renameSub(catalog,category,previous,value,financial){
  const name=TaxonomyRules.validate(value),entry=TaxonomyRules.find(catalog,category);
  if(!entry||!entry.subcategories.some(x=>TaxonomyRules.key(x)===TaxonomyRules.key(previous)))throw Error('Subcategoria não encontrada.');
  if(TaxonomyRules.key(previous)==='diversos')throw Error('A subcategoria Diversos é reservada.');
  if((financial.transactions||[]).some(t=>TaxonomyRules.key(t.macro)===TaxonomyRules.key(category)&&TaxonomyRules.key(t.micro)===TaxonomyRules.key(previous)))throw Error('Há lançamentos vinculados. Reclassifique-os antes de renomear.');
  if(entry.subcategories.some(x=>TaxonomyRules.key(x)===TaxonomyRules.key(name)&&TaxonomyRules.key(x)!==TaxonomyRules.key(previous)))throw Error('Subcategoria já cadastrada.');
  return {...catalog,entries:catalog.entries.map(e=>e===entry?{...e,subcategories:e.subcategories.map(x=>TaxonomyRules.key(x)===TaxonomyRules.key(previous)?name:x)}:e)};
 },
 deleteSub(catalog,category,value,financial){
  const entry=TaxonomyRules.find(catalog,category);
  if(!entry||!entry.subcategories.some(x=>TaxonomyRules.key(x)===TaxonomyRules.key(value)))throw Error('Subcategoria não encontrada.');
  if(TaxonomyRules.key(value)==='diversos')throw Error('A subcategoria Diversos é reservada.');
  if((financial.transactions||[]).some(t=>TaxonomyRules.key(t.macro)===TaxonomyRules.key(category)&&TaxonomyRules.key(t.micro)===TaxonomyRules.key(value)))throw Error('Há lançamentos vinculados. Reclassifique-os antes de excluir.');
  return {...catalog,entries:catalog.entries.map(e=>e===entry?{...e,subcategories:e.subcategories.filter(x=>TaxonomyRules.key(x)!==TaxonomyRules.key(value))}:e)};
 }
});
// Ao abrir um cofre legado, incorporar rótulos já usados SEM alterar históricos ou metas.
function ensureTaxonomy(financial){
 if(financial.taxonomy?.version===1&&Array.isArray(financial.taxonomy.entries))return financial.taxonomy;
 let catalog=TaxonomyRules.defaults();
 for(const item of [...(financial.transactions||[]),...(financial.goals||[])]){
  const macro=TaxonomyRules.clean(item.macro),micro=TaxonomyRules.clean(item.micro);
  if(!macro)continue;
  let entry=TaxonomyRules.find(catalog,macro);
  if(!entry){catalog={...catalog,entries:[...catalog.entries,{name:macro,subcategories:[]}]};entry=TaxonomyRules.find(catalog,macro);}
  if(micro&&!entry.subcategories.some(s=>TaxonomyRules.key(s)===TaxonomyRules.key(micro))){
   catalog={...catalog,entries:catalog.entries.map(e=>e===entry?{...e,subcategories:[...e.subcategories,micro]}:e)};
  }
 }
 financial.taxonomy=catalog;return catalog;
}
function taxonomyCatalog(){return state?ensureTaxonomy(state):TaxonomyRules.defaults()}
function categoryList(){return taxonomyCatalog().entries.map(e=>e.name)}
function subcategoryList(macro){const entry=TaxonomyRules.find(taxonomyCatalog(),macro);const arr=[...(entry?.subcategories||[])];if(!arr.some(x=>TaxonomyRules.key(x)==='diversos'))arr.push('Diversos');return arr}
function recognizedCategory(macro){return TaxonomyRules.find(taxonomyCatalog(),macro)?.name||'Outros'}
function recognizedSubcategory(macro,micro){return subcategoryList(macro).find(x=>TaxonomyRules.key(x)===TaxonomyRules.key(micro))||'Diversos'}
