import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cache=path.join(root,'data','cache-megapolis');
await fs.mkdir(cache,{recursive:true});
const origin='https://megapolisgroup.spb.ru';
const decode=s=>String(s??'').replace(/&#(x?[\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n[0].toLowerCase()==='x'?n.slice(1):n,n[0].toLowerCase()==='x'?16:10))).replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'");
const plain=s=>decode(String(s??'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
async function get(url,key){
 const p=path.join(cache,key+'.html');
 try{return await fs.readFile(p,'utf8')}catch{}
 for(let attempt=0;attempt<3;attempt++){
  try{const r=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'Mozilla/5.0 (compatible; CatalogResearch/1.0)'}});if(!r.ok)throw Error('HTTP '+r.status);const html=await r.text();await fs.writeFile(p,html);return html}
  catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,500*(attempt+1)))}
 }
}
const xml=await get(origin+'/product-sitemap.xml','sitemap');
const entries=[...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m=>({url:decode(m[1].match(/<loc>(.*?)<\/loc>/)?.[1]),image:decode(m[1].match(/<image:loc>(.*?)<\/image:loc>/)?.[1])})).filter(x=>/\/product\/[^/]+\/$/.test(x.url));
console.log('Discovered '+entries.length+' product URLs');
function classify(name,cat,season){
 const n=name.toLowerCase(),c=cat.toLowerCase(),s=n+' '+c;
 if(/зима/i.test(season))return ['Праздничное оформление','Другие изделия'];
 if(/останов/.test(c))return ['Остановки','Другие изделия'];
 if(/собак/.test(c))return ['Площадки для собак','Другие изделия'];
 if(/светильник/.test(c))return ['Освещение','Другие изделия'];
 if(/барбекю/.test(c))return ['Барбекю','Городская мебель'];
 if(/навес|беседк/.test(c))return ['Навесы и перголы','Городская мебель'];
 if(/арт-объект|арки|тоннел/.test(c))return ['Арт-объекты','Другие изделия'];
 if(/велопарк/.test(c))return ['Велопарковки','Городская мебель'];
 if(/парклет/.test(c))return ['Парклеты','Городская мебель'];
 if(/шезлонг|лежак/.test(n))return ['Шезлонги','Городская мебель'];
 if(/подиум/.test(name.toLowerCase()))return ['Подиумы','Городская мебель'];
 if(/скам|лавоч|диван|кресл|пуф/.test(s))return ['Скамейки','Городская мебель'];
 if(/урн|контейнер/.test(s))return ['Урны','Городская мебель'];
 if(/качел/.test(s))return ['Качели','Городская мебель'];
 if(/навес|беседк|пергол/.test(s))return ['Навесы и перголы','Городская мебель'];
 if(/парклет/.test(s))return ['Парклеты','Городская мебель'];
 if(/стол/.test(s))return ['Столы','Городская мебель'];
 if(/велопарк/.test(s))return ['Велопарковки','Городская мебель'];
 if(/вазон|кашпо|цветочниц/.test(s))return ['Кашпо и вазоны','Городская мебель'];
 if(/светильник|освещен/.test(s))return ['Освещение','Другие изделия'];
 if(/собак/.test(s))return ['Площадки для собак','Другие изделия'];
 if(/останов/.test(s))return ['Остановки','Другие изделия'];
 if(/барбекю|мангал/.test(s))return ['Барбекю','Городская мебель'];
 if(/арт|арки|тоннел/.test(s))return ['Арт-объекты','Другие изделия'];
 return ['Другое','Другие изделия'];
}
function parse(entry,html){
 const graphs=[...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)].flatMap(m=>{try{const j=JSON.parse(m[1]);return j['@graph']||[j]}catch{return []}});
 const product=graphs.find(j=>j['@type']==='Product');
 const name=plain(product?.name||html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]);
 if(!name)throw Error('No product name');
 const specs={};
 for(const m of html.matchAll(/<li class="c-product-info--spec">([\s\S]*?)<\/li>/g)){
   const label=plain(m[1].match(/class="c-product-info--spec-label">([\s\S]*?)<\/span>/)?.[1]).replace(/:$/,'');
   const value=plain(m[1].match(/class="c-product-info--spec-value">([\s\S]*?)<\/span>/)?.[1]);
   if(label&&value)specs[label]=value;
 }
 const sourceCategory=specs['Категория']||product?.category||'';
 const [category,section]=classify(name,sourceCategory,specs['Сезон']);
 const mat=specs['Материал']||specs['Материалы']||'';
 const materials=mat.split(/[,;/]/).map(s=>s.trim()).filter(Boolean);
 const dimensions=specs['Размер']||specs['Габариты']||null;
 const offer=Array.isArray(product?.offers)?product.offers[0]:product?.offers;
 const price=(offer?.priceCurrency==='RUB'&&Number(offer?.price)>0)?Number(offer.price):null;
 const image=(Array.isArray(product?.image)?product.image[0]:product?.image)||entry.image||null;
 const slug=entry.url.split('/').filter(Boolean).at(-1);
 return {id:'megapolis-'+slug,manufacturer:'Мегаполис',manufacturerId:'megapolis',name,url:entry.url,image,sourceCategory,category,section,price,priceNote:price?'Цена на сайте производителя':'Цена по запросу',sku:product?.sku||null,dimensions,materials,description:[sourceCategory,dimensions,mat].filter(Boolean).join(' · '),checkedAt:'2026-11-16',season:specs['Сезон']||null,specifications:specs};
}
let cursor=0,done=0;
const items=[],errors=[];
async function worker(){while(cursor<entries.length){const entry=entries[cursor++];try{const slug=entry.url.split('/').filter(Boolean).at(-1);const html=await get(entry.url,slug);items.push(parse(entry,html));}catch(e){errors.push({url:entry.url,error:e.message})}done++;if(done%50===0)console.log('Imported '+done+'/'+entries.length);await new Promise(r=>setTimeout(r,100));}}
await Promise.all(Array.from({length:4},worker));
items.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
const counts={};for(const p of items)counts[p.category]=(counts[p.category]||0)+1;
await fs.writeFile(path.join(root,'data','megapolis.json'),JSON.stringify(items,null,2));
const meta={manufacturer:'Мегаполис',checkedAt:'2026-11-16',source:origin,discovery:origin+'/product-sitemap.xml',discovered:entries.length,imported:items.length,errors,omissions:['Portfolio, collections, blog articles and category landing pages are not product records.'],scope:'All product URLs in the public product sitemap, including winter decoration.',categories:counts,withPrice:items.filter(x=>x.price).length,withImage:items.filter(x=>x.image).length,withDimensions:items.filter(x=>x.dimensions).length,withMaterials:items.filter(x=>x.materials.length).length};
await fs.writeFile(path.join(root,'data','megapolis-meta.json'),JSON.stringify(meta,null,2));
console.log(JSON.stringify(meta,null,2));
