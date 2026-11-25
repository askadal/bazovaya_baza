import {canonicalCategory,ratingHearts} from '../shared/catalog-rules.mjs';
const headersJSON={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
function json(value,status=200,privateResponse=false){return new Response(JSON.stringify(value),{status,headers:{...headersJSON,...(privateResponse?{'cache-control':'private, no-store','vary':'Cookie'}:{})}});}
function issue(message,status=400){const error=new Error(message);error.status=status;return error;}
const reactionKeys=['love','moon','hide','melt','nails'];
function readReactionMask(row){return (row?.reaction_mask||0)|(row?.simp?1:0);}
function listReactions(mask){return reactionKeys.filter((key,i)=>mask&(1<<i));}
function updatedReactionMask(data,current){
 let mask=current.reactions.reduce((value,key)=>value|(1<<reactionKeys.indexOf(key)),0);
 if(Object.hasOwn(data,'reactions')){
  if(Object.hasOwn(data,'simp'))throw issue('Укажите реакции или симп');
  if(!Array.isArray(data.reactions)||data.reactions.length>reactionKeys.length||new Set(data.reactions).size!==data.reactions.length||data.reactions.some(key=>!reactionKeys.includes(key)))throw issue('Неверные реакции');
  mask=data.reactions.reduce((value,key)=>value|(1<<reactionKeys.indexOf(key)),0);
 }
 if(Object.hasOwn(data,'simp')){if(typeof data.simp!=='boolean')throw issue('Неверное значение симп');mask=data.simp?mask|1:mask&~1;}
 return mask;
}
async function readJSON(request){let size=0,parts=[];const reader=request.body?.getReader();if(!reader)throw issue('Пустой запрос');try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw issue('Слишком большой запрос',413);}parts.push(value);}}finally{reader.releaseLock();}const raw=new Uint8Array(size);let offset=0;for(const p of parts){raw.set(p,offset);offset+=p.length;}try{return JSON.parse(new TextDecoder().decode(raw));}catch{throw issue('Некорректный JSON');}}
export function createCatalogWorker(index,adminUISource,resolveOwner=async()=>null){
 const locations=index.locations,base=new Map(index.products.map(([id,location],order)=>[id,{section:locations[location][0],category:locations[location][1],order}]));
 const taxonomy=index.taxonomy;
 async function publicState(env){
  const {results}=await env.DB.prepare('SELECT product_id, section, category, rating, bottom, simp, reaction_mask FROM catalog_edits').all();
  const rows=results.filter(row=>base.has(row.product_id)).map(row=>({...row,hearts:ratingHearts(row.rating)}));
  const overrides={};for(const row of rows){if(row.section!==null&&row.category!==null)overrides[row.product_id]={section:row.section,category:canonicalCategory(row.category)};}
  const byPriority=(a,b)=>b.hearts-a.hearts||base.get(a.product_id).order-base.get(b.product_id).order;
  const reactionIds=Object.fromEntries(reactionKeys.map((key,i)=>[key,rows.filter(row=>readReactionMask(row)&(1<<i)).map(row=>row.product_id)]));
  return {overrides,featuredIds:rows.filter(row=>!row.bottom&&row.hearts>0).sort(byPriority).map(row=>row.product_id),tailIds:rows.filter(row=>row.bottom).sort((a,b)=>base.get(a.product_id).order-base.get(b.product_id).order).map(row=>row.product_id),simpIds:reactionIds.love,reactionIds};
 }
 async function privateProduct(id,env){
  const original=base.get(id);if(!original)throw issue('Объект не найден',404);
  const row=await env.DB.prepare('SELECT section, category, rating, bottom, simp, reaction_mask, revision FROM catalog_edits WHERE product_id = ?').bind(id).first();
  const mask=readReactionMask(row);
  return {id,section:row?.section??original.section,category:canonicalCategory(row?.category??original.category),rating:row?.rating??50,hearts:ratingHearts(row?.rating),bottom:!!row?.bottom,simp:!!(mask&1),reactions:listReactions(mask),revision:row?.revision??0,hasEdits:!!row&&(row.section!==null||row.category!==null||row.rating!==50||!!row.bottom||!!mask)};
 }
 return {async fetch(request,env){
  const url=new URL(request.url),pathname=url.pathname;
  if(!pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   if(!env.DB)throw issue('Хранилище правок недоступно',503);
   if(pathname==='/api/session'&&request.method==='GET')return json({canEdit:Boolean(await resolveOwner(request,env))},200,true);
   if(pathname==='/api/catalog-state'&&request.method==='GET')return json(await publicState(env));
   if(pathname.startsWith('/api/admin/')){
    const ownerId=await resolveOwner(request,env);
    if(!ownerId)throw issue('Доступ запрещён',403);
    if(pathname==='/api/admin/ui.js'&&request.method==='GET')return new Response(adminUISource,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'private, no-store','vary':'Cookie','x-content-type-options':'nosniff'}});
    if(pathname==='/api/admin/ratings'&&request.method==='GET'){
     const {results}=await env.DB.prepare('SELECT product_id, rating, bottom, simp, reaction_mask FROM catalog_edits').all();
     const rows=results.filter(row=>base.has(row.product_id));
     const reactionIds=Object.fromEntries(reactionKeys.map((key,i)=>[key,rows.filter(row=>readReactionMask(row)&(1<<i)).map(row=>row.product_id)]));
     return json({ratings:Object.fromEntries(rows.map(row=>[row.product_id,ratingHearts(row.rating)])),bottomIds:rows.filter(row=>row.bottom).map(row=>row.product_id),simpIds:reactionIds.love,reactionIds},200,true);
    }
    const match=pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
    if(!match)throw issue('Не найдено',404);
    let id;try{id=decodeURIComponent(match[1]);}catch{throw issue('Неверный идентификатор');}
    const original=base.get(id);if(!original)throw issue('Объект не найден',404);
    if(request.method==='GET')return json(await privateProduct(id,env),200,true);
    if(!['PUT','PATCH','DELETE'].includes(request.method))throw issue('Метод не поддерживается',405);
    if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('x-catalog-edit')!=='1')throw issue('Неверный источник запроса',403);
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))throw issue('Нужен JSON',415);
    const data=await readJSON(request);if(!data||typeof data!=='object'||Array.isArray(data))throw issue('Некорректные данные');
    if(!Number.isInteger(data.revision)||data.revision<0)throw issue('Неверная версия объекта');
    const current=await privateProduct(id,env);if(current.revision!==data.revision)throw issue('Объект изменён в другой вкладке. Откройте редактор заново.',409);
    if(request.method==='PATCH'){
     if(Object.keys(data).some(k=>!['hearts','bottom','simp','reactions','revision'].includes(k)))throw issue('Неизвестное поле');
     const hasHearts=Object.hasOwn(data,'hearts'),hasBottom=Object.hasOwn(data,'bottom'),hasSimp=Object.hasOwn(data,'simp'),hasReactions=Object.hasOwn(data,'reactions');
     if(Number(hasHearts)+Number(hasBottom)+Number(hasSimp)+Number(hasReactions)!==1)throw issue('Укажите сердечки, Дно или реакции');
     if(hasHearts&&(!Number.isInteger(data.hearts)||data.hearts<0||data.hearts>5))throw issue('От 0 до 5 сердечек');
     if(hasBottom&&typeof data.bottom!=='boolean')throw issue('Неверное значение Дно');
     if(hasSimp&&typeof data.simp!=='boolean')throw issue('Неверное значение симп');
     const mask=updatedReactionMask(data,current),now=new Date().toISOString(),rating=hasHearts?50+data.hearts:current.rating,bottom=Number(hasBottom?data.bottom:current.bottom),simp=Number(!!(mask&1));
     const result=current.revision===0
      ?await env.DB.prepare('INSERT OR IGNORE INTO catalog_edits (product_id, section, category, rating, bottom, simp, reaction_mask, revision, updated_at, updated_by) VALUES (?, NULL, NULL, ?, ?, ?, ?, 1, ?, ?)').bind(id,rating,bottom,simp,mask,now,ownerId).run()
      :await env.DB.prepare('UPDATE catalog_edits SET rating = ?, bottom = ?, simp = ?, reaction_mask = ?, revision = revision + 1, updated_at = ?, updated_by = ? WHERE product_id = ? AND revision = ?').bind(rating,bottom,simp,mask,now,ownerId,id,data.revision).run();
     if(!result.meta.changes)throw issue('Объект изменён в другой вкладке. Повторите оценку.',409);
     return json(await privateProduct(id,env),200,true);
    }
    if(request.method==='DELETE'){
     if(Object.keys(data).some(k=>k!=='revision'))throw issue('Неизвестное поле');
     if(current.revision){const result=await env.DB.prepare('UPDATE catalog_edits SET section = NULL, category = NULL, rating = 50, bottom = 0, simp = 0, reaction_mask = 0, revision = revision + 1, updated_at = ?, updated_by = ? WHERE product_id = ? AND revision = ?').bind(new Date().toISOString(),ownerId,id,data.revision).run();if(!result.meta.changes)throw issue('Объект уже изменён',409);}
     return json(await privateProduct(id,env),200,true);
    }
    if(Object.keys(data).some(k=>!['section','category','rating','simp','reactions','revision'].includes(k)))throw issue('Неизвестное поле');
    if(Object.hasOwn(data,'simp')&&typeof data.simp!=='boolean')throw issue('Неверное значение симп');
    if(typeof data.section!=='string'||typeof data.category!=='string'||!taxonomy[data.section]?.includes(data.category))throw issue('Неверный раздел или категория');
    if(!Number.isInteger(data.rating)||data.rating<0||data.rating>100)throw issue('Рейтинг — целое число от 0 до 100');
    const now=new Date().toISOString();
    const section=data.section===original.section&&data.category===original.category?null:data.section;
    const category=section===null?null:data.category;
    const mask=updatedReactionMask(data,current),simp=Number(!!(mask&1));
    let result;
    if(current.revision===0){
     result=await env.DB.prepare('INSERT OR IGNORE INTO catalog_edits (product_id, section, category, rating, simp, reaction_mask, revision, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)').bind(id,section,category,data.rating,simp,mask,now,ownerId).run();
    }else{
     result=await env.DB.prepare('UPDATE catalog_edits SET section = ?, category = ?, rating = ?, simp = ?, reaction_mask = ?, revision = revision + 1, updated_at = ?, updated_by = ? WHERE product_id = ? AND revision = ?').bind(section,category,data.rating,simp,mask,now,ownerId,id,data.revision).run();
    }
    if(!result.meta.changes)throw issue('Объект изменён в другой вкладке. Откройте редактор заново.',409);
    return json(await privateProduct(id,env),200,true);
   }
   throw issue('Не найдено',404);
  }catch(error){const status=Number.isInteger(error.status)?error.status:500;if(status===500)console.error('Catalog API failure',error.message);return json({error:status===500?'Не удалось сохранить или прочитать данные':error.message},status,true);}
 }};
}
