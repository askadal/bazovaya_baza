(async()=>{
'use strict';
const app=window.CatalogApp;if(!app)return;
const esc=app.escape,ratings=new Map(),bottomIds=new Set(),reactions=new Map(),saving=new Set();
const reactionTypes=app.reactionTypes;
let enabled=sessionStorage.getItem('baza-maf-developer-mode')==='1',inlinePanel=null,ready=false;
const styles=document.createElement('style');styles.textContent=".developer-toggle{position:fixed;z-index:35;right:94px;top:30px;width:42px;height:42px;border:1px solid #141414;border-radius:50%;background:#fff;color:#141414;display:grid;place-items:center;transition:background-color .2s}\n.developer-toggle.enabled{background:#ff00ff}\n.developer-toggle svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.5}\n.developer-edit{position:absolute;z-index:3;left:9px;top:9px;width:34px;height:34px;border:1px solid #141414;border-radius:50%;background:#fff;display:grid;place-items:center}\n.developer-edit:hover{background:#00c2cb}\n.developer-edit svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.5}\n.developer-rating{border-top:1px solid #b5b5b5;padding:14px 0 0;margin-top:23px;background:#fff}\n.developer-hearts{display:flex;align-items:center;gap:3px}\n.developer-heart{width:31px;height:34px;padding:5px;border:0;background:none;display:grid;place-items:center;border-radius:50%;color:#141414}\n.developer-heart svg{width:22px;height:22px;fill:white;stroke:#141414;stroke-width:1.3}\n.developer-heart.filled svg{fill:#ff00ff}\n.developer-heart:hover{background:#e4f8f9}\n.developer-heart:disabled,.developer-bottom:disabled{cursor:wait;opacity:.55}\n.developer-rating small{display:block;font-size:12px;color:#686868}\n.developer-rating-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px}\n.developer-rating-tools small{margin:0}\n.developer-bottom{border:1px solid #b5b5b5;border-radius:99px;background:#fff;color:#141414;padding:5px 13px;font-size:13px;font-weight:400;min-height:32px}\n.developer-bottom:hover{border-color:#141414}\n.developer-bottom.active{background:#141414;border-color:#141414;color:#fff}\n.developer-panel{border:1px solid #b5b5b5;margin-top:30px;padding:22px;background:#fff}\n.developer-panel h3{font-size:18px;font-weight:500;letter-spacing:-.03em;margin:0 0 20px}\n.developer-form{display:grid;gap:18px}\n.developer-form label{display:grid;gap:8px;font-size:14px;font-weight:500}\n.developer-form select{width:100%;min-height:44px;border:1px solid #b5b5b5;padding:10px 34px 10px 12px;font:inherit;border-radius:0}\n.developer-form fieldset{border:0;padding:0;margin:0;min-width:0}\n.developer-form legend{font-size:14px;font-weight:500;margin-bottom:8px}\n.developer-hint,.developer-status{font-size:13px;line-height:1.6;margin:0;color:#686868}\n.developer-status:empty{display:none}\n.developer-actions{display:flex;flex-wrap:wrap;gap:10px}\n.developer-actions button{font-size:14px;min-height:44px;padding:10px 16px}\n.developer-form :disabled{opacity:.55;cursor:wait}\n.developer-inline{margin:20px 0 0;border:0;border-top:1px solid #b5b5b5;padding:20px 0 0}\n.developer-inline-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:19px}\n.developer-inline-heading h3{font-size:14px;font-weight:500;margin:0}\n.developer-inline-heading button{width:28px;height:28px;border:1px solid #b5b5b5;border-radius:50%;background:#fff;font:300 23px/1 Manrope,Arial;flex-shrink:0}\n.developer-inline .developer-form{gap:14px}\n.developer-inline select{min-width:0;font-size:14px}\n.developer-inline .developer-actions{gap:8px}\n.developer-inline .developer-actions button{font-size:13px;padding:9px 13px}\n@media(max-width:1160px){.developer-toggle{right:86px}}\n@media(max-width:760px){.developer-toggle{top:auto;bottom:23px;right:81px;width:42px;height:42px}.developer-edit{left:6px;top:6px;width:30px;height:30px}.developer-edit svg{width:17px;height:17px}.developer-panel{padding:16px}.developer-rating{padding-top:12px;margin-top:18px}.developer-hearts{gap:0;justify-content:space-between}.developer-heart{width:25px;height:32px;padding:3px}.developer-heart svg{width:20px;height:20px}.developer-rating-tools{flex-wrap:wrap;gap:6px}.developer-bottom{font-size:12px;padding:4px 11px;min-height:29px}.developer-rating small{font-size:11px}.developer-inline{padding:18px 0 0}.developer-inline-heading h3{font-size:13px}.developer-inline .developer-actions button{font-size:12px}}\n";styles.textContent+="\n.developer-flags{display:flex;align-items:center;flex-wrap:wrap;gap:6px}\n.developer-rating-tools{flex-wrap:wrap}\n.developer-reactions{margin-top:10px}\n.developer-reactions .reaction-button{width:34px;height:34px}\n.developer-reactions .reaction-emoji{width:25px;height:25px}\n@media(max-width:760px){.developer-reactions .reaction-button{width:29px;height:32px}.developer-reactions .reaction-emoji{width:23px;height:23px}}\n";styles.textContent+="\n.developer-reactions,.developer-form .reaction-palette{display:flex;width:max-content;max-width:100%;flex-wrap:wrap}\n";document.head.append(styles);
const heartSVG='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 3.5 12.8C-2 7.5 5.8-.5 12 6.3 18.2-.5 26 7.5 20.5 12.8Z"/></svg>';
const toggle=document.createElement('button');toggle.id='developerToggle';toggle.className='developer-toggle';toggle.type='button';toggle.disabled=true;toggle.setAttribute('aria-label','Режим разработчика');toggle.title='Режим разработчика';toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/></svg>';document.body.append(toggle);
function modeUI(){toggle.classList.toggle('enabled',enabled);toggle.setAttribute('aria-pressed',String(enabled));document.body.classList.toggle('developer-mode',enabled);}
async function jsonFetch(url,options={}){
 const response=await fetch(url,{cache:'no-store',...options,headers:{...(options.body?{'content-type':'application/json','x-catalog-edit':'1'}:{}),...options.headers}});
 const data=await response.json();if(!response.ok){const error=Error(data.error||'Не удалось сохранить изменения');error.status=response.status;throw error;}return data;
}
const api=(id,options)=>jsonFetch('/api/admin/products/'+encodeURIComponent(id),options);
async function loadRatings(){const data=await jsonFetch('/api/admin/ratings');ratings.clear();bottomIds.clear();reactions.clear();for(const [id,value]of Object.entries(data.ratings))ratings.set(id,value);for(const id of data.bottomIds||[])bottomIds.add(id);for(const r of reactionTypes)for(const id of data.reactionIds?.[r.id]||(r.id==='love'?data.simpIds:[])||[]){if(!reactions.has(id))reactions.set(id,new Set());reactions.get(id).add(r.id);}}
function remember(result){ratings.set(result.id,result.hearts);result.bottom?bottomIds.add(result.id):bottomIds.delete(result.id);reactions.set(result.id,new Set(result.reactions||[]));}
function heartsHtml(value,id=null,name=''){
 return '<div class="developer-hearts" role="group" aria-label="Оценка сердечками">'+[1,2,3,4,5].map(n=>'<button type="button" class="developer-heart '+(n<=value?'filled':'')+'" '+(id?'data-heart-id="'+esc(id)+'" ':'')+'data-heart-count="'+n+'" aria-pressed="'+(n<=value)+'" aria-label="'+n+' из 5 сердечек'+(name?' — '+esc(name):'')+'" title="'+n+' из 5; повторный щелчок снимает оценку" '+(id&&saving.has(id)?'disabled':'')+'>'+heartSVG+'</button>').join('')+'</div>';
}
function cardButton(p){return enabled&&ready?'<button class="developer-edit" type="button" data-developer-edit="'+esc(p.id)+'" aria-label="Изменить '+esc(p.name)+'" title="Изменить раздел и категорию"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4M4 16l4 4"/></svg></button>':'';}
function reactionButtons(values,id=null,name=''){return reactionTypes.map(r=>'<button type="button" class="reaction-button '+(values.has(r.id)?'active':'')+'" '+(id?'data-reaction-id="'+esc(id)+'" data-reaction-key="'+r.id+'"':'data-draft-reaction="'+r.id+'"')+' aria-label="'+r.emoji+' '+esc(r.label)+(name?' — '+esc(name):'')+'" aria-pressed="'+values.has(r.id)+'" title="по предвзятому мнению авторов" '+(id&&saving.has(id)?'disabled':'')+'><img class="reaction-emoji" src="images/reactions/'+r.id+'.png" width="26" height="26" alt="" aria-hidden="true"></button>').join('');}
function ratingContents(p){const bottom=bottomIds.has(p.id);return heartsHtml(ratings.get(p.id)||0,p.id,p.name)+'<div class="developer-reactions reaction-palette" role="group" aria-label="Реакции на объект">'+reactionButtons(reactions.get(p.id)||new Set(),p.id,p.name)+'</div><div class="developer-rating-tools"><small>Только для тебя</small><div class="developer-flags"><button type="button" class="developer-bottom '+(bottom?'active':'')+'" data-bottom-id="'+esc(p.id)+'" aria-label="Дно — '+esc(p.name)+'" aria-pressed="'+bottom+'" title="'+(bottom?'Вернуть обычный порядок':'Отправить объект в конец каталога')+'" '+(saving.has(p.id)?'disabled':'')+'>Дно</button></div></div>';}
function cardRating(p){return enabled&&ready?'<div class="developer-rating" data-rating-id="'+esc(p.id)+'">'+ratingContents(p)+'</div>':'';}
function updateCardHearts(id){for(const el of document.querySelectorAll('[data-rating-id]'))if(el.dataset.ratingId===id){const p=app.getProduct(id);if(p)el.innerHTML=ratingContents(p);}}
async function setHearts(id,count){
 if(saving.has(id))return;const hearts=count===(ratings.get(id)||0)?0:count;saving.add(id);updateCardHearts(id);
 try{
  const current=await api(id);
  const result=await api(id,{method:'PATCH',body:JSON.stringify({hearts,revision:current.revision})});
  remember(result);await app.refreshCuration();app.toast(result.hearts?'Сохранено: '+result.hearts+' из 5 сердечек':'Сердечки сняты');
 }catch(error){app.toast(error.message);if(error.status===409){try{await loadRatings();}catch{}}}
 finally{saving.delete(id);updateCardHearts(id);}
}
async function setBottom(id){
 if(saving.has(id))return;const bottom=!bottomIds.has(id);saving.add(id);updateCardHearts(id);
 try{const current=await api(id);const result=await api(id,{method:'PATCH',body:JSON.stringify({bottom,revision:current.revision})});remember(result);await app.refreshCuration();app.toast(result.bottom?'Объект отправлен на дно каталога':'Обычный порядок восстановлен');}
 catch(error){app.toast(error.message);if(error.status===409){try{await loadRatings();}catch{}}}
 finally{saving.delete(id);updateCardHearts(id);}
}
async function setReaction(id,key){
 if(saving.has(id)||!reactionTypes.some(r=>r.id===key))return;const active=!reactions.get(id)?.has(key);saving.add(id);updateCardHearts(id);
 try{const current=await api(id),next=new Set(current.reactions);active?next.add(key):next.delete(key);const result=await api(id,{method:'PATCH',body:JSON.stringify({reactions:[...next],revision:current.revision})});remember(result);await app.refreshCuration();app.toast(active?'Реакция сохранена':'Реакция снята');}
 catch(error){app.toast(error.message);if(error.status===409){try{await loadRatings();}catch{}}}
 finally{saving.delete(id);updateCardHearts(id);}
}
async function mountEditor(p,target=document.querySelector('#productDetail .detail-data'),inline=false){
 if(!enabled||!ready||!target)return;target.querySelector('.developer-panel')?.remove();
 const panel=document.createElement('section');panel.className='developer-panel'+(inline?' developer-inline':'');if(inline){inlinePanel=panel;panel.dataset.inlineEditor=p.id;}
 panel.innerHTML='<p role="status">Загружаю настройки…</p>';target.append(panel);
 try{
  const saved=await api(p.id);if(!enabled||!panel.isConnected)return;
  remember(saved);updateCardHearts(p.id);
  const taxonomy=app.getTaxonomy();
  panel.innerHTML=(inline?'<div class="developer-inline-heading"><h3>ПРАВКА ОБЪЕКТА</h3><button type="button" data-inline-close aria-label="Свернуть редактирование">×</button></div>':'<h3>РЕЖИМ РАЗРАБОТЧИКА</h3>')+'<form class="developer-form"><label>Раздел<select name="section">'+Object.keys(taxonomy).map(s=>'<option value="'+esc(s)+'" '+(s===saved.section?'selected':'')+'>'+esc(app.sectionLabel(s))+'</option>').join('')+'</select></label><label>Категория<select name="category"></select></label><fieldset><legend>Сердечки</legend><div data-draft-hearts>'+heartsHtml(saved.hearts)+'</div></fieldset><p class="developer-hint">Больше сердечек — выше в каталоге. Оценку видишь только ты.</p><fieldset><legend>Реакции</legend><div class="reaction-palette" data-draft-reactions role="group" aria-label="Реакции на объект">'+reactionButtons(new Set(saved.reactions))+'</div></fieldset><p class="developer-hint">Реакции не меняют сердечки и порядок каталога.</p><p class="developer-status" role="status"></p><div class="developer-actions"><button type="submit" class="primary">Сохранить</button><button type="button" class="secondary" data-restore>Сбросить правки</button></div></form>';
  const form=panel.querySelector('form'),section=form.elements.section,category=form.elements.category,status=panel.querySelector('.developer-status'),restore=panel.querySelector('[data-restore]'),draft=panel.querySelector('[data-draft-hearts]');
  let revision=saved.revision,hasEdits=saved.hasEdits,hearts=saved.hearts,draftReactions=new Set(saved.reactions);
  const draftReactionGroup=panel.querySelector('[data-draft-reactions]');
  const updateReactions=()=>{draftReactionGroup.innerHTML=reactionButtons(draftReactions);};
  draftReactionGroup.onclick=event=>{const b=event.target.closest('[data-draft-reaction]');if(!b)return;const key=b.dataset.draftReaction;draftReactions.has(key)?draftReactions.delete(key):draftReactions.add(key);updateReactions();};
  if(inline)panel.querySelector('[data-inline-close]').onclick=()=>{panel.remove();if(inlinePanel===panel)inlinePanel=null;};
  function categories(value){category.innerHTML=taxonomy[section.value].map(c=>'<option value="'+esc(c)+'" '+(c===value?'selected':'')+'>'+esc(c)+'</option>').join('');}
  function busy(value){form.querySelectorAll('button,select').forEach(el=>el.disabled=value);if(!value)restore.disabled=!hasEdits;}
  async function refresh(){await app.refreshCuration();if(inline&&enabled&&inlinePanel===panel){const card=[...document.querySelectorAll('[data-product-id]')].find(el=>el.dataset.productId===p.id);if(card)card.append(panel);else inlinePanel=null;}}
  categories(saved.category);section.onchange=()=>categories();restore.disabled=!hasEdits;
  draft.onclick=event=>{const b=event.target.closest('[data-heart-count]');if(!b)return;const n=Number(b.dataset.heartCount);hearts=hearts===n?0:n;draft.innerHTML=heartsHtml(hearts);};
  form.onsubmit=async event=>{
   event.preventDefault();if(saving.has(p.id)){app.toast('Дождись сохранения');return;}saving.add(p.id);updateCardHearts(p.id);busy(true);status.textContent='Сохраняю…';
   try{const result=await api(p.id,{method:'PUT',body:JSON.stringify({section:section.value,category:category.value,rating:50+hearts,reactions:[...draftReactions],revision})});revision=result.revision;hasEdits=result.hasEdits;remember(result);await refresh();status.textContent='Сохранено';app.toast('Правки сохранены');}catch(error){status.textContent=error.message;}finally{saving.delete(p.id);busy(false);updateCardHearts(p.id);}
  };
  restore.onclick=async()=>{
   if(saving.has(p.id))return;saving.add(p.id);updateCardHearts(p.id);busy(true);status.textContent='Сбрасываю…';
   try{const result=await api(p.id,{method:'DELETE',body:JSON.stringify({revision})});revision=result.revision;hasEdits=result.hasEdits;hearts=result.hearts;draftReactions=new Set(result.reactions);updateReactions();remember(result);section.value=result.section;categories(result.category);draft.innerHTML=heartsHtml(hearts);await refresh();status.textContent='Вернул исходные настройки';app.toast('Правки объекта сброшены');}catch(error){status.textContent=error.message;}finally{saving.delete(p.id);busy(false);updateCardHearts(p.id);}
  };
 }catch(error){if(panel.isConnected)panel.innerHTML='<p role="status">'+esc(error.message)+'</p>';}
}
async function editInline(id,button){
 if(saving.size){app.toast('Дождись сохранения');return;}const card=button.closest('.product-card');if(!card)return;
 const same=inlinePanel?.dataset.inlineEditor===id&&inlinePanel.isConnected;inlinePanel?.remove();inlinePanel=null;if(same)return;
 const p=app.getProduct(id);if(p)await mountEditor(p,card,true);
}
window.CatalogDeveloper={cardButton,cardRating,mountEditor,isEnabled:()=>enabled};
toggle.onclick=()=>{inlinePanel?.remove();inlinePanel=null;enabled=!enabled;sessionStorage.setItem('baza-maf-developer-mode',enabled?'1':'0');modeUI();app.rerender({preserveCount:true});if(app.currentProduct())app.openProduct(app.currentProduct());app.toast(enabled?'Режим разработчика включён':'Режим разработчика выключен');};
document.addEventListener('click',event=>{
 if(!enabled||!ready)return;const reaction=event.target.closest('[data-reaction-id]');if(reaction){event.preventDefault();setReaction(reaction.dataset.reactionId,reaction.dataset.reactionKey);return;}const bottom=event.target.closest('[data-bottom-id]');if(bottom){event.preventDefault();setBottom(bottom.dataset.bottomId);return;}const heart=event.target.closest('[data-heart-id]');if(heart){event.preventDefault();setHearts(heart.dataset.heartId,Number(heart.dataset.heartCount));return;}
 const button=event.target.closest('[data-developer-edit]');if(button){event.preventDefault();editInline(button.dataset.developerEdit,button);}
});
try{await loadRatings();ready=true;toggle.disabled=false;modeUI();app.rerender({preserveCount:true});if(app.currentProduct())app.openProduct(app.currentProduct());}catch(error){app.toast('Не удалось загрузить сердечки. Обнови страницу.');}
})();
