import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const cache=process.argv[2]||path.resolve(root,'../../work/punto');
await fs.mkdir(path.join(cache,'pages'),{recursive:true});
const errors=[],skipped=[],products=[],discovered=new Set(),visited=new Set(),redirects=[];
const decode=s=>String(s||'').replace(/&quot;/g,'"').replace(/&#039;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n));
const clean=s=>decode(s).replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const attr=(s,k)=>decode(s.match(new RegExp('(?:^|\\s)'+k+'=["\x27]([^"\x27]*)["\x27]','i'))?.[1]||'');
const abs=u=>u?new URL(decode(u),'https://puntogroup.ru').href:'';
const meta=(h,k)=>{const tag=[...h.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]).find(t=>attr(t,'itemprop')===k);return tag?attr(tag,'content'):'';};
async function get(url){
 const file=path.join(cache,'pages',crypto.createHash('sha1').update(url).digest('hex')+'.json');
 try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{}
 let last;for(let i=0;i<2;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status);const data={url:r.url,html:await r.text()};await fs.writeFile(file,JSON.stringify(data));return data;}catch(e){last=e;}}
 throw last;
}
function classify(name,source,url){
 const n=name.toLowerCase().replace(/ё/g,'е'), head=n.split(/[«"“(]/)[0],s=source.toLowerCase();
 const city='Городская мебель',sport='Спортивное оборудование',child='Детское оборудование',other='Другие изделия';
 const r=(category,section=city)=>({category,section});
 if(/парклет/.test(head))return r('Парклеты',other);
 if(/подиум/.test(head))return r('Подиумы',other);
 if(/детские качели|\/detskie_kacheli\//.test(s+' '+url))return r('Детские качели',child);
 if(/собак|аджилити|agility/.test(n+' '+s+' '+url))return r('Площадки для собак',other);
 if(/kenguru|кенгуру/.test(s+' '+url))return /kids|детск/.test(n+' '+url)?r('Другие игровые элементы',child):r('Воркаут',sport);
 if(/теннис/.test(n+' '+s))return r('Теннисные столы',sport);
 if(/smart_tekhnologii/.test(url))return /освещен|светодиод/.test(n)?r('Освещение',other):r('Другое',other);
 if(/амфитеатр|трибуна/.test(head))return r('Амфитеатры');
 if(/раздевалк/.test(head))return r('Другое',other);
 if(/зонт/.test(head))return r('Навесы, перголы и остановки');
 if(/пикников|гриль зон/.test(n+' '+s))return r('Барбекю-зоны');
 if(/информацион|навигацион/.test(head))return r('Навигация');
 if(/велопоруч|веллопарков|парковка для самокат/.test(head))return r('Велопарковки');
 const rules=[[/скам|cкам|диван|банкет|лавоч|лавка/,'Скамейки'],[/шезлонг|лежак/,'Шезлонги'],[/стул|cтул|кресл|табурет|пуф/,'Кресла и стулья'],[/стол(?!б)/,'Столы'],[/урна|пепельниц/,'Урны'],[/качел/,'Качели'],[/навес|пергол|беседк|останов/,'Навесы, перголы и остановки'],[/кашпо|вазон|цветочниц|цветник|клумб/,'Кашпо и вазоны'],[/велопарков|велостойк/,'Велопарковки'],[/огражден|забор|столбик/,'Ограждения'],[/арт-объект|скульптур/,'Арт-объекты'],[/приствольн/,'Приствольные решётки'],[/стенд|указател/,'Навигация']];
 const matches=rules.map(([re,c])=>({m:re.exec(head),c})).filter(r=>r.m).sort((a,b)=>a.m.index-b.m.index);
 // An ordinary bench/table remains furniture even inside a manufacturer's sports collection.
 if(matches.length)return r(matches[0].c);
 if(/арт-объект/.test(s))return r('Арт-объекты');
 if(/уличные столы/.test(s))return r('Столы');
 if(/спортив|воркаут|тренаж|паркour|паркур|спорт|\/sport-oborudovaniye\//.test(s+' '+url)){
  if(/паркур|parkour/.test(s+' '+url))return r('Паркур',sport);
  if(/тренажер/.test(n)||/уличные тренаж/.test(s))return r('Уличные тренажёры',sport);
  if(/теннис/.test(n))return r('Теннисные столы',sport);
  if(/воркаут|турник|брусь|рукоход|рама |комплекс/.test(n+' '+s))return r('Воркаут',sport);
  return r('Другое спортивное оборудование',sport);
 }
 if(/светильник|освещен|фонарь/.test(n+' '+s))return r('Освещение',other);
 if(/контейнер|мусорн.*площадк/.test(n+' '+s))return r('Контейнерные площадки',other);
 if(/подлокот|спинка|основан|сиденье|опора/.test(head))return r('Комплектующие');
 if(/умн|smart_/.test(s+' '+url))return r('Другое',other);
 return r('Другое');
}
function parse(html,url){
 const start=html.search(/<div\b[^>]*class="catalog_detail\s/);
 if(start<0)return null;
 const main=html.slice(start);
 if(!/itemtype="https?:\/\/schema.org\/Product"/.test(main.slice(0,300)))return null;
 const name=clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||meta(main,'name'));
 const native=main.match(/class="item_main_info[^"]*" id="bx_\d+_(\d+)"/)?.[1]||main.match(/data-item="(\d+)"/)?.[1];
 if(!name||!native)throw Error('Missing product name/id');
 const specs={};for(const match of main.matchAll(/<tr\b[^>]*itemprop="additionalProperty"[\s\S]*?<\/tr>/gi)){
  const row=match[0],key=clean(row.match(/<span\b[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/span>/)?.[1]),value=clean(row.match(/<span\b[^>]*itemprop="value"[^>]*>([\s\S]*?)<\/span>/)?.[1]);
  if(key&&value)specs[key]=value;
 }
 const sourceCategory=meta(main,'category');
 const sku=specs['Артикул']||clean(main.match(/<div class="article iblock"[\s\S]*?<span class="value"[^>]*>([\s\S]*?)<\/span>/)?.[1]);
 const imageTag=main.match(/<img\b[^>]*itemprop="image"[^>]*>/i)?.[0];let image=abs(attr(imageTag||'','src'));
 if(!image){const region=main.slice(0,main.indexOf('item_main_info'));const found=[...region.matchAll(/(?:src|data-src|href)=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi)].map(m=>abs(m[1])).filter(u=>u.includes('/upload/'));image=found[0]||'';}
 const dim=Object.entries(specs).filter(([k])=>/длина|ширина|высота|диаметр|габарит|размер/i.test(k)).map(([k,v])=>k+': '+v).join('; ');
 const materials=Object.entries(specs).filter(([k])=>/материал/i.test(k)).map(([,v])=>v);
 const description=[sourceCategory,dim,materials.length?'Материалы: '+materials.join(', '):''].filter(Boolean).join(' · ');
 const gallery=main.slice(main.indexOf('<div class="slides"'),main.indexOf('<div class="wrapp_thumbs'));
 const images=[...gallery.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/g)].map(m=>abs(m[1]));
 return {id:'punto-'+native,manufacturer:'Punto Group',manufacturerId:'punto',name,url,image,images:[...new Set([image,...images].filter(Boolean))].slice(0,12),sourceCategory,...classify(name,sourceCategory,url),price:null,sku:sku||null,dimensions:dim||null,materials,description,specifications:specs,checkedAt:'2026-11-18'};
}
const index=await get('https://puntogroup.ru/sitemap.xml');
const mapUrls=[...index.html.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>decode(m[1]));
for(const u of mapUrls){const data=await get(u);for(const m of data.html.matchAll(/<loc>(.*?)<\/loc>/g)){const v=decode(m[1]);if(v.includes('/catalog/'))discovered.add(v)}}
const queue=[...discovered];let cursor=0,done=0;
function links(html){return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map(m=>abs(m[1])).filter(u=>u.startsWith('https://puntogroup.ru/catalog/')&&!/[?#]/.test(u)&&!u.endsWith('.php')&&!/\.(?:pdf|zip|jpg|png)$/i.test(u));}
await fs.writeFile(path.join(cache,'discovered.json'),JSON.stringify(queue));
await Promise.all(Array.from({length:5},async()=>{while(cursor<queue.length){const url=queue[cursor++];if(visited.has(url))continue;visited.add(url);try{
 const data=await get(url);if(data.url!==url)redirects.push({from:url,to:data.url});const product=parse(data.html,data.url);
 if(product)products.push(product);else skipped.push({url,title:clean(data.html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]),reason:'No individual product detail'});
 // Related and category links catch products introduced since the last sitemap.
 for(const next of links(data.html)){if(!discovered.has(next)){discovered.add(next);queue.push(next);}}
 }catch(e){errors.push({url,error:e.message})}done++;if(done%20===0)await fs.writeFile(path.join(cache,'progress.json'),JSON.stringify({done,total:queue.length,products:products.length,errors:errors.length}));}}));
const unique=new Map();for(const p of products)if(!unique.has(p.id))unique.set(p.id,p);
const output=[...unique.values()].sort((a,b)=>a.id.localeCompare(b.id));
await fs.writeFile(path.join(root,'data/punto.json'),JSON.stringify(output,null,2));
const metaData={manufacturer:'Punto Group',url:'https://puntogroup.ru/',checkedAt:'2026-11-18',count:output.length,discovered:queue.length,processed:done,sitemapCatalogUrls:JSON.parse(await fs.readFile(path.join(cache,'discovered.json'),'utf8')).length,errors,skipped,redirects,duplicateProducts:products.length-output.length,status:errors.length?'Частичное покрытие':'Обход каталога завершён',note:'Отдельные товарные страницы с микроразметкой Product и артикулом/идентификатором. Категории и коллекции исключены. Цены не используются.'};
await fs.writeFile(path.join(root,'data/punto-meta.json'),JSON.stringify(metaData,null,2));await fs.writeFile(path.join(cache,'progress.json'),JSON.stringify({done,total:queue.length,products:output.length,errors:errors.length,complete:true}));console.log(JSON.stringify({count:output.length,errors,skipped:skipped.length,redirects:redirects.length}));
