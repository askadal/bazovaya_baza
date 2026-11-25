
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const publicPages=$('meta[name="catalog-runtime"]')?.content==='static';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('ru-RU');
const norm=s=>String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[«»"']/g,'').replace(/\s+/g,' ').trim();
const safeUrl=u=>{try{const x=new URL(u,document.baseURI);return /^https?:$/.test(x.protocol)?x.href:'placeholder.svg';}catch{return 'placeholder.svg';}};
const bookmark='<svg viewBox="0 0 20 20" aria-hidden="true"><path class="save-plus" d="M10 3v14M3 10h14"/><path class="save-check" d="m3 10 5 5 9-10"/></svg>';
let categoryOrder={},products=[],sources=[],lookup=new Map(),currentProduct=null;
const state={q:'',section:'Городская мебель',category:'',brands:new Set(),materials:new Set(),sort:'default',reactions:new Set()};
const reactionTypes=[{id:'love',emoji:'😍',label:'Сердечки в глазах'},{id:'moon',emoji:'🌚',label:'Тёмная луна'},{id:'hide',emoji:'🙈',label:'Обезьянка'},{id:'melt',emoji:'🫠',label:'Тающий смайлик'},{id:'nails',emoji:'💅',label:'Маникюр'}];
let reactionIds=new Map();
const reactionById=id=>reactionTypes.find(r=>r.id===id);
function reactionBadges(p){if(window.CatalogDeveloper?.isEnabled())return '';const active=reactionTypes.filter(r=>reactionIds.get(r.id)?.has(p.id));return active.length?'<div class="card-reactions" aria-label="Реакции авторов">'+active.map(r=>'<span class="reaction-badge" role="img" aria-label="'+r.emoji+' '+r.label+'" title="по предвзятому мнению авторов"><img class="reaction-emoji" src="images/reactions/'+r.id+'.png" width="26" height="26" alt="" aria-hidden="true"></span>').join('')+'</div>':'';}
const pageSize=36;
let selected={};
try {const v=JSON.parse(localStorage.getItem('baza-maf-selection-v1')||'{}');if(v&&typeof v==='object'&&!Array.isArray(v))selected=v;}catch{}
const word=n=>n%100>=11&&n%100<=14?'изделий':n%10===1?'изделие':n%10>=2&&n%10<=4?'изделия':'изделий';
let toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2200);}
function openDialog(id){const d=$(id);if(!d.open)d.showModal();document.body.classList.add('modal-open');}
function saveSelection(persist=true){
  try{if(persist)localStorage.setItem('baza-maf-selection-v1',JSON.stringify(selected));}catch{toast('Браузер не разрешил сохранить подборку');}
  $('#selectionCount').textContent=Object.keys(selected).length;
  $$('[data-save]').forEach(b=>{const yes=!!selected[b.dataset.save];b.classList.toggle('saved',yes);b.setAttribute('aria-pressed',yes);b.setAttribute('aria-label',yes?'Убрать из подборки':'Добавить в подборку');});
  if(currentProduct){const b=$('#detailSave');if(b)b.textContent=selected[currentProduct]?'Убрать из подборки':'Добавить в подборку';}
}
function toggleSelection(id){if(!lookup.has(id))return;if(selected[id])delete selected[id];else selected[id]=1;saveSelection();toast(selected[id]?'Добавлено в подборку':'Убрано из подборки');if($('#collectionDialog').open)renderSelection();}
function match(p,skip=''){
 const words=norm(state.q).split(' ').filter(Boolean);
 return (!state.section||p.section===state.section)
 &&(!state.reactions.size||[...state.reactions].some(key=>reactionIds.get(key)?.has(p.id)))
 &&(skip==='category'||!state.category||p.category===state.category)
 &&(skip==='brand'||!state.brands.size||state.brands.has(p.manufacturerId))
 &&(skip==='material'||!state.materials.size||[...state.materials].every(m=>p.materialGroups.includes(m)))
 &&words.every(w=>p.searchText.includes(w));
}
function filtered(){const a=products.filter(p=>match(p));if(state.sort==='name')a.sort((a,b)=>a.name.localeCompare(b.name,'ru'));if(state.sort==='brand')a.sort((a,b)=>a.manufacturer.localeCompare(b.manufacturer,'ru')||a.name.localeCompare(b.name,'ru'));
 return a;}
function syncUrl(){const p=new URLSearchParams();if(state.q)p.set('q',state.q);if(state.section)p.set('section',state.section);if(state.category)p.set('category',state.category);if(state.brands.size)p.set('brands',[...state.brands].join(','));if(state.materials.size)p.set('materials',[...state.materials].join(','));if(state.sort!=='default')p.set('sort',state.sort);if(state.reactions.size)p.set('reactions',reactionTypes.filter(r=>state.reactions.has(r.id)).map(r=>r.id).join(','));if(currentProduct)p.set('product',currentProduct);history.replaceState(null,'',location.pathname+(p.size?'?'+p:'')+location.hash);}
function facets(){
 const catProducts=products.filter(p=>match(p,'category')), counts=new Map();
 catProducts.forEach(p=>counts.set(p.category,(counts.get(p.category)||0)+1));
 const cats=[...new Set(products.filter(p=>!state.section||p.section===state.section).map(p=>p.category))];
 const priority=categoryOrder[state.section]||['Скамейки','Шезлонги','Кресла и стулья','Столы','Урны','Качели','Навесы, перголы и остановки','Кашпо и вазоны','Велопарковки'];
 const categoryRank=c=>/^Друг(?:ое|ие)/.test(c)?1000:priority.includes(c)?priority.indexOf(c):99;
 cats.sort((a,b)=>categoryRank(a)-categoryRank(b)||a.localeCompare(b,'ru'));
 renderCategories(cats,counts,catProducts.length);
 const bc=new Map();products.filter(p=>match(p,'brand')).forEach(p=>bc.set(p.manufacturerId,(bc.get(p.manufacturerId)||0)+1));
 $('#manufacturerList').innerHTML=sources.map(s=>'<label class="check"><input type="checkbox" data-brand="'+s.id+'" '+(state.brands.has(s.id)?'checked':'')+'>'+esc(s.name)+'<small>'+fmt(bc.get(s.id)||0)+'</small></label>').join('');
 const mc=new Map();products.filter(p=>match(p,'material')).forEach(p=>p.materialGroups.forEach(m=>mc.set(m,(mc.get(m)||0)+1)));
 const mats=[...new Set(products.flatMap(p=>p.materialGroups))].sort((a,b)=>a.localeCompare(b,'ru'));
 $('#materialList').innerHTML=mats.map(m=>'<label class="check"><input type="checkbox" data-material="'+esc(m)+'" '+(state.materials.has(m)?'checked':'')+'>'+esc(m)+'<small>'+fmt(mc.get(m)||0)+'</small></label>').join('');
}
let categorySignature='';
function renderCategories(cats,counts,total){
 const list=$('#categoryList'),signature=JSON.stringify([state.section,...cats]);
 if(signature!==categorySignature){
  categorySignature=signature;
  list.innerHTML=['',...cats].map(c=>'<button role="radio" aria-checked="false" tabindex="-1" data-category="'+esc(c)+'">'+esc(c||'Все категории')+'</button>').join('');
 }
 list.querySelectorAll('[data-category]').forEach(b=>{const yes=b.dataset.category===state.category;b.classList.toggle('active',yes);b.setAttribute('aria-checked',yes);b.tabIndex=yes?0:-1;b.title=fmt(b.dataset.category?counts.get(b.dataset.category)||0:total)+' изделий';});
}
$('#categoryNav').addEventListener('keydown',e=>{
 const tabs=[...document.querySelectorAll('#categoryList [data-category]')],i=tabs.indexOf(document.activeElement);if(i<0)return;
 let next;if(e.key==='ArrowRight'||e.key==='ArrowDown')next=(i+1)%tabs.length;else if(e.key==='ArrowLeft'||e.key==='ArrowUp')next=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;
 e.preventDefault();tabs[next].focus();tabs[next].click();
});


function renderChips(){
 const chips=[];if(state.q)chips.push(['q','Поиск: '+state.q]);for(const id of state.brands)chips.push(['brand:'+id,sources.find(s=>s.id===id)?.name||id]);for(const m of state.materials)chips.push(['material:'+m,m]);
 $('#activeFilters').innerHTML=chips.map(([key,text])=>'<button class="filter-chip" data-remove-filter="'+esc(key)+'">'+esc(text)+'<span aria-hidden="true">×</span></button>').join('');
}
function imageHtml(p,cls='',lazy=true){return '<img '+(cls?'class="'+cls+'" ':'')+'src="'+esc(safeUrl(p.image||'placeholder.svg'))+'" alt="'+esc(p.name)+'" '+(lazy?'loading="lazy" ':'')+'decoding="async" referrerpolicy="no-referrer">';}
function syncTabs(){
 $$('[data-section]').forEach(b=>{const active=b.dataset.section===state.section;b.classList.toggle('selected',active);b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;if(active)$('#catalogPanel').setAttribute('aria-labelledby',b.id);});
}
$('#sections').addEventListener('keydown',e=>{
 const tabs=$$('[data-section]'),i=tabs.indexOf(document.activeElement);if(i<0)return;
 let next;if(e.key==='ArrowRight')next=(i+1)%4;else if(e.key==='ArrowLeft')next=(i+3)%4;else if(e.key==='Home')next=0;else if(e.key==='End')next=3;else return;
 e.preventDefault();tabs[next].focus();state.section=tabs[next].dataset.section;state.category='';changed();
});

let resultRows=[],shownCount=0;
function productUrl(id){const u=new URL(location.href);u.searchParams.set('product',id);return u.pathname+u.search+u.hash;}
function cardHtml(p){
 return '<article class="product-card" data-product-id="'+esc(p.id)+'">'
 +'<div class="card-meta"><span class="card-type" title="'+esc(p.category)+'">'+esc(p.category)+'</span><p class="card-brand">'+esc(p.manufacturer)+'</p></div>'
 +'<div class="card-media">'+(window.CatalogDeveloper?.cardButton(p)||'')
 +'<a class="card-image-button" href="'+esc(productUrl(p.id))+'" data-detail="'+esc(p.id)+'" aria-label="Открыть '+esc(p.name)+'">'+imageHtml(p)+'</a>'
 +'<button data-save="'+esc(p.id)+'" class="save-button '+(selected[p.id]?'saved':'')+'" aria-pressed="'+!!selected[p.id]+'" aria-label="'+(selected[p.id]?'Убрать из подборки':'Добавить в подборку')+'">'+bookmark+'</button></div>'
 +'<div class="card-body"><a class="card-name" href="'+esc(productUrl(p.id))+'" data-detail="'+esc(p.id)+'">'+esc(p.name)+'</a>'
 +'<p class="card-spec" title="'+esc(p.dimensions||p.category)+'">'+esc(p.dimensions||p.category)+'</p>'
 +'<div class="card-bottom"><a class="card-arrow" href="'+esc(productUrl(p.id))+'" data-detail="'+esc(p.id)+'" aria-label="Подробнее: '+esc(p.name)+'">Подробнее</a></div></div>'
 +reactionBadges(p)+(window.CatalogDeveloper?.cardRating(p)||'')+'</article>';
}
function updateLoadMore(){
 const remaining=shownCount<resultRows.length;
 $('#loadMore').hidden=!remaining;
 $('#loadMore').disabled=!remaining;
 $('#loadStatus').textContent=resultRows.length?'Показано '+fmt(shownCount)+' из '+fmt(resultRows.length):'';
}
function loadMore(){
 if(shownCount>=resultRows.length)return;
 const batch=resultRows.slice(shownCount,shownCount+pageSize);
 $('#productGrid').insertAdjacentHTML('beforeend',batch.map(cardHtml).join(''));
 shownCount+=batch.length;updateLoadMore();
}
function render({preserveCount=false}={}){
 const count=preserveCount?Math.max(pageSize,shownCount):pageSize;
 resultRows=filtered();shownCount=0;
 $('#resultCount').textContent=fmt(resultRows.length);$('#resultSuffix').textContent=word(resultRows.length);
 $$('[data-reaction-filter]').forEach(b=>{const active=state.reactions.has(b.dataset.reactionFilter);b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});syncTabs();facets();renderChips();
 $('#productGrid').innerHTML=resultRows.length?'':'<div class="empty-state"><h3>Ничего не нашлось</h3><p>Попробуйте изменить запрос или убрать часть фильтров.</p><button data-reset>Сбросить фильтры</button></div>';
 while(shownCount<Math.min(count,resultRows.length))loadMore();updateLoadMore();syncUrl();
}
if('IntersectionObserver' in window){
 const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&$('#loadMoreArea').getBoundingClientRect().top<innerHeight+600)loadMore();},{rootMargin:'600px 0px'});
 observer.observe($('#loadMoreArea'));
}
function reset(){Object.assign(state,{q:'',category:'',brands:new Set(),materials:new Set(),reactions:new Set()});$('#searchInput').value='';changed();}
function changed(){
 const results=$('.results');if(results.getBoundingClientRect().top<0)results.scrollIntoView({behavior:'instant',block:'start'});
 render();
}
function showDetail(id){
 const p=lookup.get(id);if(!p)return;currentProduct=id;
 const specs=[['Категория',p.category],['Артикул',p.sku||'Не указан'],['Габариты',p.dimensions||'Не указаны'],['Материалы',p.materials?.join(', ')||'Не указаны']];
 for(const [key,val] of Object.entries(p.specifications||{})){if(/зона безопас|высота паден|возраст|тип крепл/i.test(key)&&val)specs.push([key,val]);}
 if(p.modelFormats?.length)specs.push(['Файлы',p.modelFormats.join(', ')+(p.modelsRequireLogin?' · после входа у производителя':'')]);
 $('#productDetail').innerHTML='<div class="detail-layout"><div class="detail-image">'+imageHtml(p,'',false)+'</div><div class="detail-data"><p class="card-brand">'+esc(p.manufacturer)+'</p><h2>'+esc(p.name)+'</h2><dl class="detail-specs">'+specs.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl><div class="detail-actions"><button id="detailSave" class="primary" data-save="'+esc(id)+'">'+(selected[id]?'Убрать из подборки':'Добавить в подборку')+'</button><a class="secondary source-link" href="'+esc(safeUrl(p.url))+'" target="_blank" rel="noopener noreferrer">Открыть у производителя</a></div>'+(p.files?.length?'<p class="detail-footnote">Файлы производителя: '+p.files.map(f=>'<a href="'+esc(safeUrl(f.url))+'" target="_blank" rel="noopener noreferrer">'+esc(f.name||'Скачать')+'</a>').join(' · ')+'</p>':'')+'</div></div>';
 window.CatalogDeveloper?.mountEditor(p);
 openDialog('#productDialog');const u=new URL(location.href);u.searchParams.set('product',id);history.replaceState(null,'',u);
}
function selectionRows(){return Object.keys(selected).map(id=>({product:lookup.get(id),quantity:selected[id]})).filter(r=>r.product);}
let pdfBusy=false;
function renderSelection(){
 const rows=selectionRows();
 $('#drawerCount').textContent=rows.length;
 $('#collectionItems').innerHTML=rows.length?'<div class="spec-scroll" tabindex="0" role="region" aria-label="Спецификация МАФ"><table class="spec-table"><caption class="sr-only">Подборка МАФ</caption><colgroup><col class="spec-image-col"><col class="spec-name-col"><col class="spec-sku-col"><col class="spec-character-col"><col class="spec-qty-col"></colgroup><thead><tr><th scope="col">Изображение</th><th scope="col">Наименование</th><th scope="col">Артикул</th><th scope="col">Характеристика</th><th scope="col">Количество</th></tr></thead><tbody>'+rows.map(({product:p,quantity})=>'<tr><td class="spec-image">'+imageHtml({...p,image:p.thumbnail||p.image},'',false)+'</td><td class="spec-name"><a href="'+esc(safeUrl(p.url))+'" target="_blank" rel="noopener noreferrer">'+esc(p.name)+'</a><span class="spec-brand">'+esc(p.manufacturer)+'</span><button class="remove-item" data-delete="'+esc(p.id)+'" aria-label="Удалить '+esc(p.name)+'">×</button></td><td>'+esc(p.sku||'—')+'</td><td class="spec-character">'+esc(MafSpecification.characteristics(p)).replace(/\n/g,'<br>')+'</td><td><div class="quantity"><button data-qty="'+esc(p.id)+'" data-delta="-1" aria-label="Уменьшить количество" '+(quantity<=1?'disabled':'')+'>−</button><input type="number" min="1" max="9999" step="1" inputmode="numeric" data-quantity="'+esc(p.id)+'" value="'+quantity+'" aria-label="Количество: '+esc(p.name)+'"><button data-qty="'+esc(p.id)+'" data-delta="1" aria-label="Увеличить количество" '+(quantity>=9999?'disabled':'')+'>+</button></div><span class="unit">шт.</span></td></tr>').join('')+'</tbody></table></div>':'<div class="empty-state"><h3>Подборка пока пуста</h3><p>Добавляйте МАФ кнопкой «+» в карточке.</p></div>';
 const quantity=rows.reduce((n,r)=>n+r.quantity,0);
 $('#collectionSummary').textContent=rows.length?'Позиций: '+fmt(rows.length)+' · Всего: '+fmt(quantity)+' шт.':'';
 $('#exportButton').disabled=!rows.length||excelBusy;$('#exportPDF').disabled=!rows.length||pdfBusy;$('#clearSelection').disabled=!rows.length;
}
let pdfLoader;
function loadPdf(){
 if(pdfLoader)return pdfLoader;
 function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>{s.remove();reject(Error('PDF library unavailable'));};document.head.appendChild(s);});}
 pdfLoader=script('vendor/pdfmake.min.js').then(()=>script('vendor/vfs_fonts.js?v=manrope')).catch(e=>{pdfLoader=null;throw e;});
 return pdfLoader;
}
async function exportPDF(){
 const rows=selectionRows();if(!rows.length||pdfBusy)return;
 pdfBusy=true;const button=$('#exportPDF');button.disabled=true;button.textContent='Готовлю PDF…';
 try{
  await loadPdf();
  const definition=MafSpecification.documentDefinition(await withImages(rows),new Date().toLocaleDateString('ru-RU'));
  const blob=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('PDF timeout')),60000);pdfMake.createPdf(definition).getBlob(blob=>{clearTimeout(timeout);resolve(blob);});});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='specification-maf.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('PDF скачан');
 }catch(e){console.error(e);toast('Не удалось создать PDF. Попробуйте ещё раз.');}
 finally{pdfBusy=false;button.textContent='Скачать PDF ↓';button.disabled=!selectionRows().length;}
}
let excelBusy=false,excelLoader;
function loadExcel(){
 if(excelLoader)return excelLoader;
 excelLoader=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/exceljs.min.js';s.onload=resolve;s.onerror=()=>{s.remove();excelLoader=null;reject(Error('Excel library unavailable'));};document.head.appendChild(s);});
 return excelLoader;
}
async function withImages(rows){
 let next=0;const result=rows.map(r=>({...r}));
 await Promise.all(Array.from({length:Math.min(6,rows.length)},async()=>{while(next<result.length){const row=result[next++];if(!row.product.thumbnail)continue;try{
  const response=await fetch(row.product.thumbnail,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(response.status);
  const blob=await response.blob();row.image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
 }catch(e){console.warn('Specification image unavailable',row.product.id);}}}));
 return result;
}
async function exportExcel(){
 const rows=selectionRows();if(!rows.length||excelBusy)return;
 excelBusy=true;const button=$('#exportButton');button.disabled=true;button.textContent='Готовлю Excel…';
 try{
  await loadExcel();const prepared=await withImages(rows);
  const wb=MafSpecification.workbook(prepared,new Date().toLocaleDateString('ru-RU'),ExcelJS);
  const bytes=await wb.xlsx.writeBuffer(),blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='specification-maf.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Excel скачан');
 }catch(e){console.error(e);toast('Не удалось создать Excel. Попробуйте ещё раз.');}
 finally{excelBusy=false;button.textContent='Excel ↓';button.disabled=!selectionRows().length;}
}

document.addEventListener('error',e=>{if(!(e.target instanceof HTMLImageElement))return;if(!e.target.dataset.fallback){e.target.dataset.fallback='1';e.target.src='placeholder.svg';}},true);
document.addEventListener('click',e=>{
 const link=e.target.closest('a[data-detail]');if(link){if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();showDetail(link.dataset.detail);return;}
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-reaction-filter')){const key=b.dataset.reactionFilter;state.reactions.has(key)?state.reactions.delete(key):state.reactions.add(key);changed();return;}
 if(b.dataset.save){toggleSelection(b.dataset.save);return;}
 if(b.dataset.detail){showDetail(b.dataset.detail);return;}
 if(b.hasAttribute('data-category')){state.category=b.dataset.category;changed();return;}
 if(b.hasAttribute('data-section')){state.section=b.dataset.section;state.category='';changed();return;}
 if(b.id==='loadMore'){loadMore();return;}
 if(b.hasAttribute('data-reset')){reset();return;}
 if(b.hasAttribute('data-close')){b.closest('dialog').close();return;}
 if(b.dataset.delete){delete selected[b.dataset.delete];saveSelection();renderSelection();return;}
 if(b.dataset.qty){selected[b.dataset.qty]=Math.max(1,Math.min(9999,Number(selected[b.dataset.qty]||1)+Number(b.dataset.delta)));saveSelection();renderSelection();return;}
 if(b.dataset.removeFilter){const k=b.dataset.removeFilter;if(k.startsWith('brand:'))state.brands.delete(k.slice(6));else if(k.startsWith('material:'))state.materials.delete(k.slice(9));else{state[k]=typeof state[k]==='boolean'?false:'';if(k==='q')$('#searchInput').value='';}changed();}
});
document.addEventListener('change',e=>{const t=e.target;if(t.dataset.quantity){const n=Number(t.value);if(!Number.isInteger(n)||n<1||n>9999){t.value=selected[t.dataset.quantity];toast('Количество — целое число от 1 до 9999');return;}selected[t.dataset.quantity]=n;saveSelection();renderSelection();return;}if(t.dataset.brand){t.checked?state.brands.add(t.dataset.brand):state.brands.delete(t.dataset.brand);changed();}if(t.dataset.material){t.checked?state.materials.add(t.dataset.material):state.materials.delete(t.dataset.material);changed();}});
document.addEventListener('input',e=>{
 const t=e.target;if(!t.dataset.quantity)return;
 const n=Number(t.value);if(!Number.isInteger(n)||n<1||n>9999)return;
 selected[t.dataset.quantity]=n;saveSelection();
 const rows=selectionRows();$('#collectionSummary').textContent='Позиций: '+fmt(rows.length)+' · Всего: '+fmt(rows.reduce((total,r)=>total+r.quantity,0))+' шт.';
});
let searchTimer;
$('#searchInput').addEventListener('input',e=>{state.q=e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(changed,150);});
$('#sort').onchange=e=>{state.sort=e.target.value;changed();};
$('#resetFilters').onclick=reset;
$('#collectionButton').onclick=()=>{renderSelection();openDialog('#collectionDialog');};
$('#exportButton').onclick=exportExcel;
$('#exportPDF').onclick=exportPDF;
$('#clearSelection').onclick=()=>{selected={};saveSelection();renderSelection();toast('Подборка очищена');};
$('#openFilters').onclick=()=>{$('#filters').classList.add('open');$('#closeFilters').focus();};
$('#closeFilters').onclick=()=>{$('#filters').classList.remove('open');$('#openFilters').focus();};
$$('dialog').forEach(d=>{d.addEventListener('close',()=>{if(d.id==='productDialog'){currentProduct=null;const u=new URL(location.href);u.searchParams.delete('product');history.replaceState(null,'',u);}if(!$$('dialog[open]').length)document.body.classList.remove('modal-open');});d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)&&!$$('dialog[open]').length){e.preventDefault();$('#searchInput').focus();}if(e.key==='Escape')$('#filters').classList.remove('open');});
window.addEventListener('storage',event=>{
 if(event.key!=='baza-maf-selection-v1'||!lookup.size)return;
 try{const value=JSON.parse(event.newValue||'{}');if(!value||typeof value!=='object'||Array.isArray(value))return;selected=Object.fromEntries(Object.entries(value).filter(([id,n])=>lookup.has(id)&&Number.isInteger(n)&&n>0&&n<=9999));saveSelection(false);if($('#collectionDialog').open)renderSelection();}catch{}
});
let baseLocations=new Map(),baseOrder=new Map(),catalogTaxonomy={};
function indexSearch(p){p.searchText=norm([p.name,p.sku,p.manufacturer,p.section,p.category,p.sourceCategory,...p.materials,...p.materialGroups,p.category==='Скамейки'?'скамейка скамейки скамья скамьи лавка лавочка':'',p.category==='Урны'?'урна урны':'',p.category==='Навесы, перголы и остановки'?'пергола перголы навес навесы беседка':''].join(' '));}
function applyCuration(data){
 reactionIds=new Map(reactionTypes.map(r=>[r.id,new Set(data.reactionIds?.[r.id]||(r.id==='love'?data.simpIds:[])||[])]));
 const edits=data.overrides||{},featured=new Map((data.featuredIds||[]).map((id,i)=>[id,i])),tail=new Map((data.tailIds||[]).map((id,i)=>[id,i]));
 for(const p of products){const original=baseLocations.get(p.id),edit=edits[p.id];p.section=edit?.section||original.section;p.category=edit?.category||original.category;indexSearch(p);}
 const group=id=>featured.has(id)?-1:tail.has(id)?1:0;
 products.sort((a,b)=>group(a.id)-group(b.id)||(featured.has(a.id)&&featured.has(b.id)?featured.get(a.id)-featured.get(b.id):tail.has(a.id)&&tail.has(b.id)?tail.get(a.id)-tail.get(b.id):baseOrder.get(a.id)-baseOrder.get(b.id)));
}
async function refreshCuration(rerender=true){
 const response=await fetch(publicPages?'catalog-state.json':'/api/catalog-state',{cache:'no-store'});if(!response.ok)throw Error('Не удалось загрузить правки каталога');
 applyCuration(await response.json());
 if(state.category&&!products.some(p=>p.section===state.section&&p.category===state.category))state.category='';
 if(rerender){render({preserveCount:true});if(currentProduct){const dt=[...document.querySelectorAll('#productDetail dt')].find(el=>el.textContent==='Категория');if(dt?.nextElementSibling)dt.nextElementSibling.textContent=lookup.get(currentProduct)?.category||'';}if($('#collectionDialog').open)renderSelection();}
}
window.CatalogApp={escape:esc,toast,reactionTypes,getProduct:id=>lookup.get(id),currentProduct:()=>currentProduct,openProduct:showDetail,rerender:render,refreshCuration,getTaxonomy:()=>catalogTaxonomy,sectionLabel:s=>s==='Городская мебель'?'Городские МАФ':s==='Другие изделия'?'Другое':s};
window.addEventListener('focus',()=>{if(!publicPages&&products.length)refreshCuration().catch(error=>console.warn(error.message));});
async function initializeDeveloper(session){
 if(!session?.canEdit)return;
 await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/api/admin/ui.js';script.onload=resolve;script.onerror=()=>reject(Error('Не удалось загрузить режим разработчика'));document.head.append(script);});
}

async function start(){
 try{
 const sessionPromise=publicPages?null:fetch('/api/session',{cache:'no-store'}).then(r=>r.ok?r.json():{canEdit:false}).catch(()=>({canEdit:false}));
 const r=await fetch('catalog.json');if(!r.ok)throw Error(r.status);const db=await r.json();products=db.products;categoryOrder=db.categoryOrder||{};sources=db.sources.sort((a,b)=>a.name.localeCompare(b.name,'ru',{sensitivity:'base'}));
 products.forEach((p,i)=>{p.materialGroups=p.materialGroups||[];p.materials=p.materials||[];baseLocations.set(p.id,{section:p.section,category:p.category});baseOrder.set(p.id,i);indexSearch(p);lookup.set(p.id,p);});
 for(const section of ['Городская мебель','Детское оборудование','Спортивное оборудование','Другие изделия']){const categories=[...new Set(products.filter(p=>p.section===section).map(p=>p.category))];const order=categoryOrder[section]||[];categories.sort((a,b)=>(order.includes(a)?order.indexOf(a):999)-(order.includes(b)?order.indexOf(b):999)||a.localeCompare(b,'ru'));catalogTaxonomy[section]=categories;}
 await refreshCuration(false);
 try{const latest=JSON.parse(localStorage.getItem('baza-maf-selection-v1')||'{}');if(latest&&typeof latest==='object'&&!Array.isArray(latest))selected=latest;}catch{}
 selected=Object.fromEntries(Object.entries(selected).filter(([id,n])=>lookup.has(id)&&Number.isInteger(n)&&n>0&&n<=9999));
 const p=new URLSearchParams(location.search);for(const k of ['q','section','category','sort'])if(p.has(k))state[k]=p.get(k);state.reactions=new Set((p.get('reactions')||'').split(',').filter(key=>reactionById(key)));if(p.get('simp')==='1')state.reactions.add('love');state.brands=new Set((p.get('brands')||'').split(',').filter(Boolean));state.materials=new Set((p.get('materials')||'').split(',').filter(Boolean));
 if(!$$('[data-section]').some(b=>b.dataset.section===state.section))state.section='Городская мебель';
 state.category=db.categoryAliases?.[state.category]||state.category;
 if(['Остановки','Навесы и перголы'].includes(state.category))state.category='Навесы, перголы и остановки';
 if(state.section==='Другие изделия'&&['Арт-объекты','Скамейки','Качели','Кашпо и вазоны','Ограждение, болларды','Навесы, перголы и остановки'].includes(state.category))state.section='Городская мебель';
 if(state.section==='Городская мебель'&&['Парклеты','Подиумы'].includes(state.category))state.section='Другие изделия';
 if(state.category&&!products.some(p=>p.section===state.section&&p.category===state.category))state.category='';
 if(!['default','name','brand'].includes(state.sort))state.sort='default';
 $('#searchInput').value=state.q;$('#sort').value=state.sort;
 saveSelection();render();if(p.get('product')&&lookup.has(p.get('product')))showDetail(p.get('product'));
 initializeDeveloper(await sessionPromise).catch(error=>toast(error.message));
 }catch(e){$('#resultCount').textContent='Каталог не загрузился';$('#productGrid').innerHTML='<div class="empty-state"><h3>Не удалось открыть базу</h3><p>Проверьте соединение и обновите страницу.</p><button onclick="location.reload()">Попробовать снова</button></div>';console.error(e);}
}
start();

const backToTop=document.querySelector('#backToTop');
function updateBackToTop(){backToTop.hidden=window.scrollY<300;}
window.addEventListener('scroll',updateBackToTop,{passive:true});
backToTop.addEventListener('click',()=>{
 window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 document.querySelector('#sections [aria-selected="true"]')?.focus({preventScroll:true});
});
updateBackToTop();
