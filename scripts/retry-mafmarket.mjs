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
const old=JSON.parse(await fs.readFile(path.join(root,'data/mafmarket.json'),'utf8')); const products=new Map(old.map(p=>[p.id,p])), errors=[], pages=[], skipped=[];
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

const oldMeta=JSON.parse(await fs.readFile(path.join(root,'data/mafmarket-meta.json'),'utf8')); for(const e of oldMeta.errors){try{const t=await get(e.url);const n=parseModels(t,e.url);pages.push({url:e.url,models:n});}catch(err){errors.push({url:e.url,error:err.message});}} await fs.writeFile(path.join(root,'data/mafmarket.json'),JSON.stringify([...products.values()],null,2)); oldMeta.errors=errors;oldMeta.imported=products.size;oldMeta.retryPages=pages; await fs.writeFile(path.join(root,'data/mafmarket-meta.json'),JSON.stringify(oldMeta,null,2)); console.log('Retry complete',products.size,errors.length);