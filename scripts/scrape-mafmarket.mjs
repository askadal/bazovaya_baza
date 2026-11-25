import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname,'..');
const cache=path.join(root,'data/cache-mafmarket');
await fs.mkdir(cache,{recursive:true});
const origin='https://mafmarket.ru';
const decode=t=>t.replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
const clean=t=>decode(t.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
const abs=u=>new URL(decode(u),origin).href;
const key=u=>decodeURIComponent(new URL(u).pathname).toLowerCase().replace(/\/+$/,'');
let lastRequest=0;
async function get(url){const file=path.join(cache,crypto.createHash('sha1').update(key(url)).digest('hex')+'.html');try{return await fs.readFile(file,'utf8')}catch{};for(let attempt=0;attempt<4;attempt++){await new Promise(r=>setTimeout(r,Math.max(0,2200-(Date.now()-lastRequest))));lastRequest=Date.now();const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(r.status===503||r.status===429){console.log('Rate limited; pausing 30 seconds',url);await new Promise(r=>setTimeout(r,30000));continue;}if(!r.ok)throw Error(`${r.status} ${url}`);const t=await r.text();await fs.writeFile(file,t);return t;}throw Error('Rate limit persisted '+url);}
const categories={skami:['Скамьи','Скамейки','Городская мебель'],stoly:['Столы','Столы','Городская мебель'],urny:['Урны и пепельницы','Урны','Городская мебель'],veloparkovki:['Велопарковки','Велопарковки','Городская мебель'],'navesy-dlya-veloparkovok':['Навесы для велопарковок','Велопарковки','Городская мебель'],'pavilony-navesy-i-pergoly':['Павильоны, навесы и перголы','Навесы и перголы','Городская мебель'],'ostanovki-obshchestvennogo-transporta':['Остановки общественного транспорта','Другое','Городская мебель'],'pavilony-dlya-kureniya':['Павильоны для курения','Навесы и перголы','Городская мебель'],vazony:['Вазоны','Кашпо и вазоны','Городская мебель'],'reshyetki-dlya-derevev':['Решётки для деревьев','Другое','Городская мебель'],'ograzhdayushchie-stolbiki':['Ограждающие столбики','Ограждения','Городская мебель'],ograzhdeniya:['Ограждения','Ограждения','Городская мебель'],installyatsii:['Инсталляции и скульптуры','Арт-объекты','Другие изделия'],'sportivnoe-ulichnoe-oborudovanie':['Спортивное оборудование','Спортивное оборудование','Спортивное оборудование'],'detskoe-igrovoe-oborudovanie':['Детское игровое оборудование','Детское оборудование','Детское оборудование'],'opory-osveshcheniya':['Опоры освещения','Освещение','Другие изделия'],navigatsiya:['Навигация','Другое','Городская мебель']};
categories['urny-i-pepelnitsy']=categories.urny;categories['installyatsii-i-skulptury']=categories.installyatsii;
const products=new Map(), errors=[], pages=[], skipped=[];
function parseModels(t,url){const sectionSlug=key(url).split('/')[2],cat=categories[sectionSlug];if(!cat)return 0;const cards=[...t.matchAll(/<div class="dp-model-card" id="([^"]+)">([\s\S]*?)(?=<div class="dp-model-card" id="|<\/form>|<div class="dp-catalog-related|$)/g)];let count=0;
 for (const [,anchor,b] of cards){const name=clean(b.match(/<h3 class="dp-model-card__title">([\s\S]*?)<\/h3>/)?.[1]||'');if(!name)continue;
 const gallery=b.match(/<div class="dp-model-card__block dp-model-card__gallery">([\s\S]*?)<div class="dp-model-card__samples-wrapper">/)?.[1]||'';
 const images=[...gallery.matchAll(/<a[^>]*href="([^"]+)"/g)].map(m=>abs(m[1]));
 const chars=b.match(/<ul class="dp-model-card__chars-list">([\s\S]*?)<\/ul>/)?.[1]||'';
 const specs=[...chars.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m=>clean(m[1]));
 const sizes=['Длина','Ширина','Высота'].map(label=>specs.find(s=>s.startsWith(label))?.split(':').slice(1).join(':').trim());
 const labels=[...b.matchAll(/<label class="dp-form-control-label">([\s\S]*?)<\/label>/g)].map(m=>clean(m[1])).join(' ');
 const materials=[];if(/пород[уы] дерева|древесин/i.test(labels))materials.push('Дерево');if(/металл/i.test(labels))materials.push('Металл');if(/бетон/i.test(labels))materials.push('Бетон');if(/пластик/i.test(labels))materials.push('Пластик');
 const filesBlock=b.match(/<div class="dp-model-card__block dp-model-card__files">([\s\S]*?)<div class="dp-model-card__block dp-model-card__gallery">/)?.[1]||'';
 const files=[...filesBlock.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>({url:abs(m[1]),name:clean(m[2])}));
 const sku=clean(b.match(/<div class="dp-model-card__subtitle">([\s\S]*?)<\/div>/)?.[1]||anchor.split('-').slice(0,-1).join('-'));
 let category=cat[1];if(cat[1]==='Скамейки'&&/шезлонг|лежак/i.test(name))category='Шезлонги';
 const p={id:'mafmarket-'+anchor.toLowerCase(),manufacturer:'МАФ маркет',manufacturerId:'mafmarket',name,url:url.split('#')[0]+'#'+anchor,image:images[0]||null,images,sourceCategory:cat[0],category,section:cat[2],price:null,priceNote:'Цена не опубликована. Запросить у производителя.',sku,dimensions:sizes.every(Boolean)?sizes.join(' × ')+' мм':specs.filter(s=>/^(Длина|Ширина|Высота)/.test(s)).join('; ')||null,materials,description:specs.join('; '),checkedAt:'2026-11-16',files};
 products.set(p.id,p);count++;
 }return count;
}
// The published sitemap contains many obsolete category slugs. Discover current links from catalog navigation instead.
const sitemap=await get(origin+'/sitemap.xml');
const pending=new Map(),visited=new Set();
function enqueue(u){const url=abs(u),k=key(url);if(new URL(url).origin!==origin||new URL(url).search||!k.startsWith('/catalog')||/^\/catalog\/(mars|proekty|ulichnaya-mebel|skolkovo)(\/|$)/.test(k)||visited.has(k))return;if(k==='/catalog'||categories[k.split('/')[2]])pending.set(k,url);}
enqueue('/catalog/');
console.log('Initial catalog pages',pending.size);
while(pending.size){const batch=[...pending.entries()].slice(0,1);for(const [k] of batch){pending.delete(k);visited.add(k);}
 await Promise.all(batch.map(async([k,url])=>{try{const t=await get(url);const count=parseModels(t,url);pages.push({url,models:count,pagination:[...new Set(t.match(/PAGEN_\d+=[0-9]+/g)||[])]});
 for(const m of t.matchAll(/<a[^>]*class="dp-catalog-item"[^>]*href="([^"]+)"/g))enqueue(m[1]);
 // Site navigation and catalog breadcrumb contain categories absent in old sitemaps.
 if(k==='/catalog')for(const m of t.matchAll(/href="(\/catalog\/[^"?#]+)"/g))enqueue(m[1]);
 if(!count&&!t.includes('dp-catalog-item'))skipped.push({url,reason:'No individual model cards'});
 }catch(e){errors.push({url,error:e.message});}}));
 if(visited.size%20===0||!pending.size){console.log(`Pages ${visited.size}; pending ${pending.size}; models ${products.size}; errors ${errors.length}`);await fs.writeFile(path.join(root,'data/mafmarket.json'),JSON.stringify([...products.values()],null,2));}
}
const data=[...products.values()].sort((a,b)=>a.category.localeCompare(b.category,'ru')||a.name.localeCompare(b.name,'ru'));
await fs.writeFile(path.join(root,'data/mafmarket.json'),JSON.stringify(data,null,2));
const meta={manufacturer:'МАФ маркет',checkedAt:'2026-11-16',source:origin,discovery:'Public sitemap and all linked category/series pages; individual model cards with share anchors',pages:pages.length,candidates:products.size,imported:data.length,withImage:data.filter(p=>p.image).length,withPrice:data.filter(p=>p.price!==null).length,withDimensions:data.filter(p=>p.dimensions).length,errors,skipped,paginationPages:pages.filter(p=>p.pagination.length),coverage:pages,limitations:['Prices were not published in model cards. Material tags reflect explicit configuration options, not a fixed selected variant.']};
await fs.writeFile(path.join(root,'data/mafmarket-meta.json'),JSON.stringify(meta,null,2));
console.log(JSON.stringify({...meta,coverage:undefined,errors:errors.length,skipped:skipped.length},null,2));
