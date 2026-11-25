import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {ratingHearts,canonicalCategory} from '../shared/catalog-rules.mjs';
import {createGithubCatalog} from '../worker/github-worker.mjs';
import {openCatalogDB} from '../scripts/local-db.mjs';
const root=path.resolve(import.meta.dirname,'..');
const index={locations:[['Городская мебель','Скамейки'],['Детское оборудование','Игровые домики'],['Спортивное оборудование','Турники']],products:[['p-a',0],['p-b',0],['p-c',2]],taxonomy:{'Городская мебель':['Скамейки'],'Детское оборудование':['Игровые домики'],'Спортивное оборудование':['Турники'],'Другие изделия':['Парклеты']}};
const testSession='a'.repeat(43);
const ownerHeaders={cookie:'__Host-maf-owner='+testSession};
const viewerHeaders={'oai-authenticated-user-id':'viewer-id','oai-authenticated-user-email':'viewer@example.test'};
function authEnv(db){
 return {DB:db,AUTH_ORIGIN:'https://catalog.test',GITHUB_OWNER_ID:'12345',GITHUB_CLIENT_ID:'fixture-id',
  GITHUB_CLIENT_SECRET:'fixture-value',ASSETS:{fetch:async()=>new Response('asset')}};
}
async function addOwner(db){
 const hash=createHash('sha256').update(testSession).digest('base64url');
 await db.prepare('INSERT INTO github_owner_sessions (token_hash, owner_id, expires_at) VALUES (?, ?, ?)')
  .bind(hash,'12345',Date.now()+60000).run();
}
function request(url,{headers={},...options}={}){return new Request('https://catalog.test'+url,{...options,headers});}
async function fixture(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'catalog-admin-')),file=path.join(dir,'test.sqlite');
 const connection=await openCatalogDB(file,root),env=authEnv(connection.binding),worker=createGithubCatalog(index,'private editor code');
 await addOwner(connection.binding);
 const call=(url,options)=>worker.fetch(request(url,options),env);
 const put=(id,body,headers=ownerHeaders)=>call('/api/admin/products/'+id,{method:'PUT',headers:{...headers,origin:'https://catalog.test','content-type':'application/json','x-catalog-edit':'1'},body:JSON.stringify(body)});
 return {call,put,connection,env,worker,file};
}
test('only the bound owner receives the editor or private ratings',async()=>{
 const f=await fixture();
 assert.deepEqual(await (await f.call('/api/session',{headers:viewerHeaders})).json(),{canEdit:false});
 for(const headers of [{},viewerHeaders]){assert.equal((await f.call('/api/admin/ui.js',{headers})).status,403);assert.equal((await f.call('/api/admin/ratings',{headers})).status,403);assert.equal((await f.call('/api/admin/products/p-a',{headers})).status,403);assert.equal((await f.put('p-a',{section:'Городская мебель',category:'Скамейки',rating:100,revision:0},headers)).status,403);}
 assert.deepEqual(await (await f.call('/api/session',{headers:ownerHeaders})).json(),{canEdit:true});
 assert.equal(await (await f.call('/api/admin/ui.js',{headers:ownerHeaders})).text(),'private editor code');
 const impostor={cookie:'__Host-maf-owner='+'b'.repeat(43),'oai-authenticated-user-id':'12345'};
 assert.deepEqual(await (await f.call('/api/session',{headers:impostor})).json(),{canEdit:false});
 assert.equal((await f.call('/api/admin/products/p-a',{headers:impostor})).status,403);
 f.connection.db.close();
});
test('category moves and ratings survive reconnect; public responses contain ordering only',async()=>{
 const f=await fixture();
 let response=await f.put('p-a',{section:'Детское оборудование',category:'Игровые домики',rating:100,revision:0});assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
 assert.equal((await f.put('p-b',{section:'Городская мебель',category:'Скамейки',rating:0,revision:0})).status,200);
 const state=await (await f.call('/api/catalog-state')).json();
 assert.deepEqual(state.overrides['p-a'],{section:'Детское оборудование',category:'Игровые домики'});
 assert.deepEqual(state.featuredIds,['p-a']);assert.deepEqual(state.tailIds,[]);
 assert.ok(!JSON.stringify(state).includes('rating'));assert.ok(!JSON.stringify(state).includes('owner'));assert.ok(!JSON.stringify(state).includes('updated_by'));
 const privateRow=await (await f.call('/api/admin/products/p-a',{headers:ownerHeaders})).json();assert.equal(privateRow.rating,100);
 f.connection.db.close();const reopened=await openCatalogDB(f.file,root);
 const env={...f.env,DB:reopened.binding},again=await f.worker.fetch(request('/api/admin/products/p-a',{headers:ownerHeaders}),env);
 assert.deepEqual(await again.json(),privateRow);reopened.db.close();
});
test('invalid scores, foreign origins and unknown categories cannot write',async()=>{
 const f=await fixture(),base={section:'Городская мебель',category:'Скамейки',rating:50,revision:0};
 for(const rating of [-1,101,0.5,'100',null])assert.equal((await f.put('p-a',{...base,rating})).status,400);
 assert.equal((await f.put('p-a',{...base,section:'Спортивное оборудование'})).status,400);
 assert.equal((await f.put('p-a',{...base,category:'<script>'})).status,400);
 assert.equal((await f.put('unknown',base)).status,404);
 assert.equal((await f.put('p-a',{...base,admin:true})).status,400);
 assert.equal((await f.call('/api/admin/products/p-a',{method:'PUT',headers:{...ownerHeaders,origin:'https://foreign.test','content-type':'application/json','x-catalog-edit':'1'},body:JSON.stringify(base)})).status,403);
 assert.equal((await f.call('/api/admin/products/p-a',{method:'PUT',headers:{...ownerHeaders,'content-type':'application/json'},body:JSON.stringify(base)})).status,403);
 assert.deepEqual((await (await f.call('/api/catalog-state')).json()).overrides,{});
 f.connection.db.close();
});
test('stale edits are rejected and reset restores neutral ordering',async()=>{
 const f=await fixture(),base={section:'Городская мебель',category:'Скамейки',rating:100,revision:0};
 const concurrent=await Promise.all([f.put('p-a',base),f.put('p-a',{...base,rating:20})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 const current=await (await f.call('/api/admin/products/p-a',{headers:ownerHeaders})).json();
 assert.equal((await f.put('p-a',{...base,rating:60,revision:0})).status,409);
 const reset=await f.call('/api/admin/products/p-a',{method:'DELETE',headers:{...ownerHeaders,origin:'https://catalog.test','content-type':'application/json','x-catalog-edit':'1'},body:JSON.stringify({revision:current.revision})});
 assert.equal(reset.status,200);assert.deepEqual(await reset.json(),{id:'p-a',section:'Городская мебель',category:'Скамейки',rating:50,hearts:0,bottom:false,simp:false,reactions:[],revision:2,hasEdits:false});
 assert.equal((await f.put('p-a',{...base,rating:60,revision:1})).status,409);
 assert.deepEqual(await (await f.call('/api/catalog-state')).json(),{overrides:{},featuredIds:[],tailIds:[],simpIds:[],reactionIds:{love:[],moon:[],hide:[],melt:[],nails:[]}});
 f.connection.db.close();
});
test('built worker contains private UI outside public client files',async()=>{
 const source=await readFile(path.join(root,'dist/server/index.js'),'utf8');assert.ok(source.includes('createGithubCatalog'));
 const client=await readFile(path.join(root,'dist/client/app.js'),'utf8');assert.ok(!client.includes('type="number" min="0" max="100"'));assert.ok(client.includes("script.src='/api/admin/ui.js'"));
 const worker=await import('../dist/server/index.js');assert.equal(typeof worker.default.fetch,'function');
});

test('legacy ratings map to five hearts and public order uses the same scale',async()=>{
 for(const [old,hearts]of [[0,0],[49,0],[50,0],[51,1],[52,2],[55,5],[100,5]])assert.equal(ratingHearts(old),hearts);
 const f=await fixture();
 for(const [id,rating]of [['p-a',55],['p-b',49],['p-c',100]])assert.equal((await f.put(id,{section:id==='p-c'?'Спортивное оборудование':'Городская мебель',category:id==='p-c'?'Турники':'Скамейки',rating,revision:0})).status,200);
 assert.deepEqual((await (await f.call('/api/admin/ratings',{headers:ownerHeaders})).json()).ratings,{'p-a':5,'p-b':0,'p-c':5});
 const state=await (await f.call('/api/catalog-state')).json();assert.deepEqual(state.featuredIds,['p-a','p-c']);assert.deepEqual(state.tailIds,[]);assert.ok(!JSON.stringify(state).includes('hearts'));
 f.connection.db.close();
});

test('heart-only edits preserve category overrides and reject stale or malformed writes',async()=>{
 const f=await fixture();
 await f.put('p-a',{section:'Детское оборудование',category:'Игровые домики',rating:52,revision:0});
 const patch=(body,headers=ownerHeaders)=>f.call('/api/admin/products/p-a',{method:'PATCH',headers:{...headers,origin:'https://catalog.test','content-type':'application/json','x-catalog-edit':'1'},body:JSON.stringify(body)});
 for(const hearts of [-1,6,1.5,'2',null])assert.equal((await patch({hearts,revision:1})).status,400);
 assert.equal((await patch({hearts:2,revision:1,category:'Турники'})).status,400);
 assert.equal((await patch({hearts:2,revision:1},viewerHeaders)).status,403);
 const response=await patch({hearts:3,revision:1});assert.equal(response.status,200);const row=await response.json();assert.equal(row.hearts,3);assert.equal(row.rating,53);assert.equal(row.category,'Игровые домики');assert.equal(row.section,'Детское оборудование');
 assert.equal((await patch({hearts:4,revision:1})).status,409);
 assert.equal((await patch({hearts:0,revision:2})).status,200);
 const state=await (await f.call('/api/catalog-state')).json();assert.deepEqual(state.featuredIds,[]);assert.equal(state.overrides['p-a'].category,'Игровые домики');
 const fresh=await f.call('/api/admin/products/p-b',{method:'PATCH',headers:{...ownerHeaders,origin:'https://catalog.test','content-type':'application/json','x-catalog-edit':'1'},body:JSON.stringify({hearts:1,revision:0})});assert.equal(fresh.status,200);assert.equal((await fresh.json()).hearts,1);
 f.connection.db.close();
});

test('old category edits are read under merged names without losing their revision',async()=>{
 const f=await fixture();
 await f.put('p-a',{section:'Городская мебель',category:'Скамейки',rating:52,revision:0});
 for(const [old,next]of [['Рукоход','Рукоходы'],['Рукоход-змеевик','Рукоходы'],['Рукоход-молоток','Рукоходы'],['Наклонная скамья','Скамьи для упражнений'],['Ограждения','Ограждение, болларды'],['Ограждение','Ограждение, болларды']]){
  assert.equal(canonicalCategory(old),next);
  await f.env.DB.prepare('UPDATE catalog_edits SET section = ?, category = ? WHERE product_id = ?').bind('Спортивное оборудование',old,'p-a').run();
  const row=await (await f.call('/api/admin/products/p-a',{headers:ownerHeaders})).json();assert.equal(row.category,next);assert.equal(row.revision,1);assert.equal(row.hearts,2);
  assert.equal((await (await f.call('/api/catalog-state')).json()).overrides['p-a'].category,next);
 }
 f.connection.db.close();
});

test('clicking card hearts saves directly without opening the product',async()=>{
 const f=await fixture();await f.put('p-a',{section:'Детское оборудование',category:'Игровые домики',rating:52,revision:0});
 const handlers={},notices=[],created=[];let opened=0,rendered='';
 const document={head:{append(){}},body:{append(el){created.push(el);},classList:{toggle(){}}},createElement(){return {classList:{toggle(){}},setAttribute(){}};},addEventListener(type,fn){handlers[type]=fn;},querySelectorAll(){return [];}};
 const product={id:'p-a',name:'Тестовый объект'},window={CatalogApp:{reactionTypes:[{id:'love',emoji:'😍',label:'Сердечки в глазах'},{id:'moon',emoji:'🌚',label:'Тёмная луна'},{id:'hide',emoji:'🙈',label:'Обезьянка'},{id:'melt',emoji:'🫠',label:'Тающий смайлик'},{id:'nails',emoji:'💅',label:'Маникюр'}],escape:v=>String(v??''),getProduct:()=>product,currentProduct:()=>null,getTaxonomy:()=>index.taxonomy,sectionLabel:v=>v,openProduct(){opened++;},toast:v=>notices.push(v),rerender(){rendered=window.CatalogDeveloper.cardRating(product);},async refreshCuration(){this.rerender();}}};
 const context={window,document,sessionStorage:{getItem:()=> '1',setItem(){}},fetch:async(url,options={})=>f.call(url,{...options,headers:{...ownerHeaders,...options.headers,...(options.body?{origin:'https://catalog.test'}:{})}})};
 await vm.runInNewContext(await readFile(path.join(root,'worker/admin-ui.js'),'utf8'),context);
 assert.equal((rendered.match(/developer-heart filled/g)||[]).length,2);assert.equal((rendered.match(/data-heart-count=/g)||[]).length,5);
 async function click(n){const before=notices.length;handlers.click({preventDefault(){},target:{closest:selector=>selector==='[data-heart-id]'?{dataset:{heartId:'p-a',heartCount:String(n)}}:null}});for(let i=0;i<100&&notices.length===before;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(notices.length>before);}
 await click(3);let saved=await (await f.call('/api/admin/products/p-a',{headers:ownerHeaders})).json();assert.equal(saved.hearts,3);assert.equal(saved.category,'Игровые домики');assert.equal(opened,0);
 assert.ok(rendered.includes('data-bottom-id="p-a"'));
 async function clickBottom(){const before=notices.length;handlers.click({preventDefault(){},target:{closest:selector=>selector==='[data-bottom-id]'?{dataset:{bottomId:'p-a'}}:null}});for(let i=0;i<100&&notices.length===before;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(notices.length>before);}
 await clickBottom();saved=await (await f.call('/api/admin/products/p-a',{headers:ownerHeaders})).json();assert.equal(saved.bottom,true);assert.equal(saved.hearts,3);assert.equal(opened,0);assert.ok(rendered.includes('developer-bottom active'));
 assert.deepEqual((await (await f.call('/api/catalog-state')).json()).tailIds,['p-a']);
 await clickBottom();saved=await (await f.call('/api/admin/products/p-a',{headers:ownerHeaders})).json();assert.equal(saved.bottom,false);assert.equal(saved.hearts,3);assert.equal(opened,0);
 async function clickSimp(){const before=notices.length;handlers.click({preventDefault(){},target:{closest:selector=>selector==='[data-reaction-id]'?{dataset:{reactionId:'p-a',reactionKey:'love'}}:null}});for(let i=0;i<100&&notices.length===before;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(notices.length>before);}
 await clickSimp();saved=await (await f.call('/api/admin/products/p-a',{headers:ownerHeaders})).json();assert.equal(saved.simp,true);assert.equal(saved.hearts,3);assert.equal(opened,0);assert.ok(rendered.includes('reaction-button active'));
 assert.deepEqual((await (await f.call('/api/catalog-state')).json()).simpIds,['p-a']);
 await clickSimp();saved=await (await f.call('/api/admin/products/p-a',{headers:ownerHeaders})).json();assert.equal(saved.simp,false);assert.equal(saved.hearts,3);assert.equal(opened,0);
 await click(3);saved=await (await f.call('/api/admin/products/p-a',{headers:ownerHeaders})).json();assert.equal(saved.hearts,0);assert.equal(opened,0);
 created.find(el=>el.id==='developerToggle').onclick();assert.equal(rendered,'');
 f.connection.db.close();
});

test('simp persists independently of rating, category and bottom; only the owner can change it',async()=>{
 const f=await fixture();
 const patch=(id,body,headers=ownerHeaders,origin='https://catalog.test')=>f.call('/api/admin/products/'+id,{method:'PATCH',headers:{...headers,origin,'content-type':'application/json','x-catalog-edit':'1'},body:JSON.stringify(body)});
 const row=async id=>(await f.call('/api/admin/products/'+id,{headers:ownerHeaders})).json();
 await f.put('p-a',{section:'Детское оборудование',category:'Игровые домики',rating:53,revision:0});
 await patch('p-a',{bottom:true,revision:1});
 const before=await (await f.call('/api/catalog-state')).json();
 for(const simp of [0,1,'true',null,[],{}])assert.equal((await patch('p-a',{simp,revision:2})).status,400);
 assert.equal((await patch('p-a',{simp:true,hearts:5,revision:2})).status,400);
 assert.equal((await patch('p-a',{simp:true,bottom:false,revision:2})).status,400);
 assert.equal((await patch('p-a',{revision:2})).status,400);
 assert.equal((await patch('p-a',{simp:true,revision:2},viewerHeaders)).status,403);
 assert.equal((await patch('p-a',{simp:true,revision:2},ownerHeaders,'https://foreign.test')).status,403);
 assert.equal((await patch('unknown',{simp:true,revision:0})).status,404);
 assert.equal((await patch('p-a',{simp:true,revision:2})).status,200);
 const saved=await row('p-a');assert.equal(saved.simp,true);assert.equal(saved.rating,53);assert.equal(saved.bottom,true);assert.equal(saved.category,'Игровые домики');assert.equal(saved.revision,3);
 const after=await (await f.call('/api/catalog-state')).json();assert.deepEqual(after.simpIds,['p-a']);
 assert.deepEqual(after.featuredIds,before.featuredIds);assert.deepEqual(after.tailIds,before.tailIds);assert.deepEqual(after.overrides,before.overrides);
 assert.ok(!JSON.stringify(after).includes('rating'));assert.ok(!JSON.stringify(after).includes('hearts'));
 assert.equal((await patch('p-a',{simp:false,revision:2})).status,409);
 const reopened=await openCatalogDB(f.file,root);const persisted=await f.worker.fetch(request('/api/admin/products/p-a',{headers:ownerHeaders}),{...f.env,DB:reopened.binding});assert.deepEqual(await persisted.json(),saved);reopened.db.close();
 await patch('p-a',{hearts:5,revision:3});assert.equal((await row('p-a')).simp,true);
 await patch('p-a',{bottom:false,revision:4});assert.equal((await row('p-a')).simp,true);
 await f.put('p-a',{section:'Городская мебель',category:'Скамейки',rating:54,revision:5});assert.equal((await row('p-a')).simp,true);
 assert.equal((await patch('p-b',{simp:true,revision:0})).status,200);const fresh=await row('p-b');assert.equal(fresh.rating,50);assert.equal(fresh.hearts,0);assert.equal(fresh.simp,true);assert.equal(fresh.hasEdits,true);
 const reset=await f.call('/api/admin/products/p-b',{method:'DELETE',headers:{...ownerHeaders,origin:'https://catalog.test','content-type':'application/json','x-catalog-edit':'1'},body:JSON.stringify({revision:1})});assert.equal(reset.status,200);const neutral=await reset.json();assert.equal(neutral.simp,false);assert.equal(neutral.hasEdits,false);
 await patch('p-a',{simp:false,revision:6});assert.deepEqual((await (await f.call('/api/catalog-state')).json()).simpIds,[]);
 const full={section:'Городская мебель',category:'Скамейки',rating:50,simp:true,revision:0};assert.equal((await f.put('p-c',full)).status,200);assert.equal((await row('p-c')).simp,true);
 assert.equal((await f.put('p-c',{...full,simp:'true',revision:1})).status,400);
 f.connection.db.close();
});

test('reaction filters combine with other filters without reordering and preserve legacy simp links',async()=>{
 const client=await readFile(path.join(root,'dist/client/app.js'),'utf8');
 const prefix=client.slice(0,client.indexOf("$('#categoryNav')"));
 const curation=client.slice(client.indexOf('let baseLocations='),client.indexOf('async function refreshCuration'));
 const context=vm.createContext({document:{querySelector(){}},localStorage:{getItem:()=>null},URLSearchParams,location:{pathname:'/',hash:''},history:{replaceState(_a,_b,url){context.url=url;}}});
 vm.runInContext(prefix+'\n'+curation,context);
 vm.runInContext(`products=[
 {id:'a',name:'Ясная скамья',section:'Городская мебель',category:'Скамейки',manufacturer:'А',manufacturerId:'a',materials:[],materialGroups:['Дерево']},
 {id:'b',name:'Алая скамья',section:'Городская мебель',category:'Скамейки',manufacturer:'Б',manufacturerId:'b',materials:[],materialGroups:['Металл']},
 {id:'c',name:'Стул',section:'Городская мебель',category:'Кресла и стулья',manufacturer:'А',manufacturerId:'a',materials:[],materialGroups:['Дерево']},
 {id:'d',name:'Турник',section:'Спортивное оборудование',category:'Турники',manufacturer:'А',manufacturerId:'a',materials:[],materialGroups:['Металл']}
 ];products.forEach((p,i)=>{baseLocations.set(p.id,{section:p.section,category:p.category});baseOrder.set(p.id,i);});applyCuration({featuredIds:['b'],tailIds:['c'],simpIds:['a','c','d']});`,context);
 const ids=()=>Array.from(vm.runInContext('filtered().map(p=>p.id)',context));
 assert.deepEqual(ids(),['b','a','c']);
 vm.runInContext('state.reactions.add("love")',context);assert.deepEqual(ids(),['a','c']);
 vm.runInContext("state.category='Скамейки'",context);assert.deepEqual(ids(),['a']);
 vm.runInContext("state.brands.add('b')",context);assert.deepEqual(ids(),[]);
 vm.runInContext("state.brands.clear();state.materials.add('Металл')",context);assert.deepEqual(ids(),[]);
 vm.runInContext("state.materials.clear();state.q='ясная'",context);assert.deepEqual(ids(),['a']);
 vm.runInContext("state.q='';state.category='';state.section='Спортивное оборудование'",context);assert.deepEqual(ids(),['d']);
 vm.runInContext("state.section='Городская мебель';syncUrl()",context);assert.ok(context.url.includes('reactions=love'));
 vm.runInContext("state.reactions.clear();syncUrl()",context);assert.deepEqual(ids(),['b','a','c']);assert.ok(!context.url.includes('reactions='));
 vm.runInContext('state.reactions.add("love");applyCuration({simpIds:[]})',context);assert.deepEqual(ids(),[]);
 vm.runInContext("applyCuration({featuredIds:['b'],tailIds:['c'],reactionIds:{love:['a','c'],moon:['b','c'],hide:['d'],melt:[]}})",context);
 assert.deepEqual(ids(),['a','c']);
 vm.runInContext("state.reactions.add('moon')",context);assert.deepEqual(ids(),['b','a','c']);
 vm.runInContext("state.reactions.delete('love')",context);assert.deepEqual(ids(),['b','c']);
 vm.runInContext("state.reactions.clear();state.reactions.add('melt')",context);assert.deepEqual(ids(),[]);
});

test('all four reactions persist independently; legacy simp becomes love and owner access is required',async()=>{
 const f=await fixture();
 const patch=(id,data,headers=ownerHeaders)=>f.call('/api/admin/products/'+id,{method:'PATCH',headers:{...headers,origin:'https://catalog.test','content-type':'application/json','x-catalog-edit':'1'},body:JSON.stringify(data)});
 const row=async id=>(await f.call('/api/admin/products/'+id,{headers:ownerHeaders})).json();
 await f.put('p-a',{section:'Детское оборудование',category:'Игровые домики',rating:53,simp:true,revision:0});
 // Simulate an existing production row: simp was set before reaction_mask existed.
 await f.env.DB.prepare('UPDATE catalog_edits SET reaction_mask = 0 WHERE product_id = ?').bind('p-a').run();
 assert.deepEqual((await row('p-a')).reactions,['love']);
 assert.deepEqual((await (await f.call('/api/catalog-state')).json()).reactionIds.love,['p-a']);
 const before=await (await f.call('/api/catalog-state')).json();
 for(const reactions of [null,'moon',1,{},['unknown'],['moon','moon'],['love','moon','hide','melt','moon']])assert.equal((await patch('p-a',{reactions,revision:1})).status,400);
 assert.equal((await patch('p-a',{reactions:['moon'],revision:1},viewerHeaders)).status,403);
 assert.equal((await patch('p-a',{reactions:['moon'],simp:true,revision:1})).status,400);
 assert.equal((await patch('p-a',{reactions:['moon'],hearts:5,revision:1})).status,400);
 assert.equal((await patch('p-a',{reactions:['love','moon','hide','melt'],revision:1})).status,200);
 const saved=await row('p-a');assert.deepEqual(saved.reactions,['love','moon','hide','melt']);assert.equal(saved.rating,53);assert.equal(saved.category,'Игровые домики');assert.equal(saved.simp,true);
 const state=await (await f.call('/api/catalog-state')).json();for(const key of ['love','moon','hide','melt'])assert.deepEqual(state.reactionIds[key],['p-a']);
 assert.deepEqual(state.featuredIds,before.featuredIds);assert.deepEqual(state.tailIds,before.tailIds);assert.ok(!JSON.stringify(state).includes('rating'));
 const reopened=await openCatalogDB(f.file,root);const again=await f.worker.fetch(request('/api/admin/products/p-a',{headers:ownerHeaders}),{...f.env,DB:reopened.binding});assert.deepEqual(await again.json(),saved);reopened.db.close();
 assert.equal((await patch('p-a',{reactions:[],revision:1})).status,409);
 await patch('p-a',{reactions:['moon','melt'],revision:2});let current=await row('p-a');assert.equal(current.simp,false);assert.deepEqual(current.reactions,['moon','melt']);
 await patch('p-a',{hearts:5,revision:3});await patch('p-a',{bottom:true,revision:4});
 await f.put('p-a',{section:'Городская мебель',category:'Скамейки',rating:54,revision:5});current=await row('p-a');assert.deepEqual(current.reactions,['moon','melt']);assert.equal(current.bottom,true);
 await patch('p-a',{simp:true,revision:6});assert.deepEqual((await row('p-a')).reactions,['love','moon','melt']);
 await patch('p-a',{simp:false,revision:7});assert.deepEqual((await row('p-a')).reactions,['moon','melt']);
 const reset=await f.call('/api/admin/products/p-a',{method:'DELETE',headers:{...ownerHeaders,origin:'https://catalog.test','content-type':'application/json','x-catalog-edit':'1'},body:JSON.stringify({revision:8})});assert.equal(reset.status,200);assert.deepEqual((await reset.json()).reactions,[]);
 assert.equal((await patch('p-b',{reactions:['hide'],revision:0})).status,200);current=await row('p-b');assert.equal(current.rating,50);assert.equal(current.hearts,0);assert.deepEqual(current.reactions,['hide']);
 const allFive=['love','moon','hide','melt','nails'];
 assert.equal((await patch('p-b',{reactions:allFive,revision:1})).status,200);current=await row('p-b');assert.deepEqual(current.reactions,allFive);assert.equal(current.rating,50);assert.equal(current.hearts,0);
 assert.deepEqual((await (await f.call('/api/catalog-state')).json()).reactionIds.nails,['p-b']);
 assert.equal((await patch('p-b',{reactions:allFive.filter(key=>key!=='nails'),revision:2})).status,200);assert.deepEqual((await row('p-b')).reactions,['love','moon','hide','melt']);
 assert.deepEqual((await (await f.call('/api/catalog-state')).json()).reactionIds.nails,[]);
 f.connection.db.close();
});

test('reaction migration keeps old simp, ratings, category, bottom and revisions intact',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'catalog-reaction-migration-')),file=path.join(dir,'old.sqlite'),old=new DatabaseSync(file);
 old.exec('CREATE TABLE __local_migrations (name TEXT PRIMARY KEY)');
 for(const name of ['0000_bored_proteus.sql','0001_lean_steve_rogers.sql','0002_regular_princess_powerful.sql']){old.exec(await readFile(path.join(root,'drizzle',name),'utf8'));old.prepare('INSERT INTO __local_migrations (name) VALUES (?)').run(name);}
 old.prepare('INSERT INTO catalog_owner (id,user_id,created_at) VALUES (1,?,?)').run('existing-owner','2026-11-20');
 old.prepare('INSERT INTO catalog_edits (product_id,section,category,rating,bottom,simp,revision,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?)').run('p-a','Детское оборудование','Игровые домики',54,1,1,17,'2026-11-20','existing-owner');old.close();
 const migrated=await openCatalogDB(file,root),db=migrated.db;
 assert.deepEqual({...db.prepare('SELECT section,category,rating,bottom,simp,reaction_mask,revision FROM catalog_edits WHERE product_id = ?').get('p-a')},{section:'Детское оборудование',category:'Игровые домики',rating:54,bottom:1,simp:1,reaction_mask:0,revision:17});
 const worker=createGithubCatalog(index,''),env=authEnv(migrated.binding),state=await (await worker.fetch(request('/api/catalog-state'),env)).json();assert.deepEqual(state.reactionIds,{love:['p-a'],moon:[],hide:[],melt:[],nails:[]});assert.deepEqual(state.tailIds,['p-a']);
 assert.equal((await worker.fetch(request('/api/admin/products/p-a',{headers:{'oai-authenticated-user-id':'existing-owner'}}),env)).status,403);
 await addOwner(migrated.binding);
 const row=await (await worker.fetch(request('/api/admin/products/p-a',{headers:ownerHeaders}),env)).json();assert.deepEqual(row.reactions,['love']);assert.equal(row.revision,17);db.close();
});

test('simp migration preserves existing categories, ratings, bottom flags and owner',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'catalog-migration-')),file=path.join(dir,'old.sqlite');
 const old=new DatabaseSync(file);
 old.exec('CREATE TABLE __local_migrations (name TEXT PRIMARY KEY)');
 for(const name of ['0000_bored_proteus.sql','0001_lean_steve_rogers.sql']){
  old.exec(await readFile(path.join(root,'drizzle',name),'utf8'));
  old.prepare('INSERT INTO __local_migrations (name) VALUES (?)').run(name);
 }
 old.prepare('INSERT INTO catalog_owner (id,user_id,created_at) VALUES (1,?,?)').run('existing-owner','2026-11-20');
 old.prepare('INSERT INTO catalog_edits (product_id,section,category,rating,bottom,revision,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?)').run('p-a','Детское оборудование','Игровые домики',53,1,12,'2026-11-20','existing-owner');old.close();
 const migrated=await openCatalogDB(file,root);
 assert.deepEqual({...migrated.db.prepare('SELECT section,category,rating,bottom,simp,revision,updated_by FROM catalog_edits WHERE product_id = ?').get('p-a')},{section:'Детское оборудование',category:'Игровые домики',rating:53,bottom:1,simp:0,revision:12,updated_by:'existing-owner'});
 assert.equal(migrated.db.prepare('SELECT user_id FROM catalog_owner WHERE id = 1').get().user_id,'existing-owner');migrated.db.close();
});

test('bottom takes precedence over hearts, persists, and restores the previous ranking',async()=>{
 const f=await fixture();
 await f.put('p-a',{section:'Детское оборудование',category:'Игровые домики',rating:53,revision:0});
 await f.put('p-c',{section:'Спортивное оборудование',category:'Турники',rating:55,revision:0});
 const patch=(id,body,headers=ownerHeaders)=>f.call('/api/admin/products/'+id,{method:'PATCH',headers:{...headers,origin:'https://catalog.test','content-type':'application/json','x-catalog-edit':'1'},body:JSON.stringify(body)});
 for(const bottom of [0,1,'true',null])assert.equal((await patch('p-a',{bottom,revision:1})).status,400);
 assert.equal((await patch('p-a',{bottom:true,hearts:2,revision:1})).status,400);
 assert.equal((await patch('p-a',{bottom:true,revision:1},viewerHeaders)).status,403);
 assert.equal((await patch('p-a',{bottom:true,revision:1})).status,200);
 let state=await (await f.call('/api/catalog-state')).json();assert.deepEqual(state.featuredIds,['p-c']);assert.deepEqual(state.tailIds,['p-a']);assert.equal(state.overrides['p-a'].category,'Игровые домики');assert.ok(!JSON.stringify(state).includes('bottom'));
 const row=await (await f.call('/api/admin/products/p-a',{headers:ownerHeaders})).json();assert.equal(row.bottom,true);assert.equal(row.hearts,3);
 const reopened=await openCatalogDB(f.file,root);const persisted=await f.worker.fetch(request('/api/admin/products/p-a',{headers:ownerHeaders}),{...f.env,DB:reopened.binding});assert.deepEqual(await persisted.json(),row);reopened.db.close();
 assert.equal((await patch('p-a',{bottom:false,revision:1})).status,409);
 assert.equal((await patch('p-a',{hearts:5,revision:2})).status,200);
 state=await (await f.call('/api/catalog-state')).json();assert.deepEqual(state.featuredIds,['p-c']);assert.deepEqual(state.tailIds,['p-a']);
 assert.equal((await f.put('p-a',{section:'Детское оборудование',category:'Игровые домики',rating:54,revision:3})).status,200);
 assert.equal((await (await f.call('/api/admin/products/p-a',{headers:ownerHeaders})).json()).bottom,true);
 const restored=await patch('p-a',{bottom:false,revision:4});assert.equal(restored.status,200);assert.equal((await restored.json()).hearts,4);
 state=await (await f.call('/api/catalog-state')).json();assert.deepEqual(state.featuredIds,['p-c','p-a']);assert.deepEqual(state.tailIds,[]);
 const fresh=await patch('p-b',{bottom:true,revision:0});assert.equal(fresh.status,200);const freshRow=await fresh.json();assert.equal(freshRow.bottom,true);assert.equal(freshRow.hearts,0);
 assert.deepEqual((await (await f.call('/api/admin/ratings',{headers:ownerHeaders})).json()).bottomIds,['p-b']);
 const reset=await f.call('/api/admin/products/p-b',{method:'DELETE',headers:{...ownerHeaders,origin:'https://catalog.test','content-type':'application/json','x-catalog-edit':'1'},body:JSON.stringify({revision:1})});assert.equal(reset.status,200);const resetRow=await reset.json();assert.equal(resetRow.bottom,false);assert.equal(resetRow.hasEdits,false);
 f.connection.db.close();
});
