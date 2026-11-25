import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const cache = path.join(root, 'data', 'cache-aira');
await fs.mkdir(cache,{recursive:true});
const errors=[];
async function get(url) {
  const file=path.join(cache,crypto.createHash('sha1').update(url).digest('hex')+'.html');
  try { return await fs.readFile(file,'utf8'); } catch {}
  const r=await fetch(url,{signal:AbortSignal.timeout(45000)});
  if(!r.ok)throw new Error(`${r.status}: ${url}`);
  const text=await r.text();await fs.writeFile(file,text);return text;
}
const decode=s=>(s||'').replace(/&quot;/g,'"').replace(/&#039;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));
const clean=s=>decode(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const attr=(s,n)=>decode(s.match(new RegExp(`${n}="([^"]*)"`))?.[1]||'');
const abs=u=>u?new URL(u,'https://aira.ru').href:null;
function classify(url,cat,name){
  let section='Городская мебель', category='Другое';
  if(url.includes('/detskie-ploshchadki/'))return {section:'Детское оборудование',category:'Детское оборудование'};
  if(url.includes('/sports-equipment/'))return {section:'Спортивное оборудование',category:'Спортивное оборудование'};
  if(/\/aira-homes\/|\/tur-derevni\/|\/gorodskie-prazdniki\/|\/novogodnee-oformlenie\//.test(url))section='Другие изделия';
  if(/\/osveshchenie\//.test(url))return {section:'Другие изделия',category:'Освещение'};
  if(/\/art-obekty\//.test(url))return {section:'Другие изделия',category:'Арт-объекты'};
  let t=(cat+' '+name).toLowerCase();
  if(/шезлонг|лежак/.test(t))category='Шезлонги';
  else if(/скаме|скамь|диван|кресло|стул|пуф/.test(t))category='Скамейки';
  else if(/урн|пепельниц/.test(t))category='Урны';
  else if(/кашпо|цветочниц|вазон|цветник/.test(t))category='Кашпо и вазоны';
  else if(/велопарков|велоинфраструкт/.test(t))category='Велопарковки';
  else if(/навес|пергол|беседк|парклет/.test(t))category='Навесы и перголы';
  else if(/качел/.test(t))category='Качели';
  else if(/стол(?!б)/.test(t))category='Столы';
  else if(/огражден/.test(t))category='Ограждения';
  else if(/арт-объект|скульптур/.test(t))category='Арт-объекты';
  else if(section==='Другие изделия')category='Другое';
  return {section,category};
}
function parse(html,source){
  const result=[];
  const blocks=html.split(/<div class="s-products-contant-block\s/).slice(1);
  for(const block of blocks){
    const url=abs(block.match(/<a itemprop="url" href="([^"]+)"/)?.[1]);
    const name=clean(block.match(/<meta itemprop="name" content="([^"]+)"/)?.[1]);
    const image=abs(block.match(/<meta itemprop="image" content="([^"]+)"/)?.[1] || block.match(/data-src="([^"]+)"/)?.[1]);
    if(!url||!name||!image){errors.push({source,error:'Unparsed product card'});continue;}
    const nativeId=block.match(/s-goods-like[^>]*data-id="([^"]+)"/)?.[1];
    const sourceCategory=clean(block.match(/<div class="s-goods-cat">([\s\S]*?)<\/div>/)?.[1]);
    const titleBlock=block.match(/<div class="s-goods-title">([\s\S]*?)<\/div>/)?.[1]||'';
    const sku=clean(titleBlock.match(/<span>([\s\S]*?)<\/span>/)?.[1]);
    const dimensions=clean(block.match(/<div class="ownd-catalog-product-size">([\s\S]*?)<\/div>/)?.[1]).replace(/^Габариты:\s*/,'')||null;
    const materials=attr(block.slice(0,block.indexOf('itemscope')),'data-materials').split(',').map(s=>s.trim()).filter(Boolean);
    const priceValue=Number(block.match(/<meta itemprop="price" content="([^"]+)"/)?.[1]);
    const price=Number.isFinite(priceValue)&&priceValue>0?priceValue:null;
    result.push({id:'aira-'+(nativeId||crypto.createHash('sha1').update(url).digest('hex').slice(0,12)),manufacturer:'Айра',manufacturerId:'aira',name,url,image,sourceCategory,...classify(url,sourceCategory,name),price,priceNote:price?'Цена из каталога производителя; комплектацию уточнять':'По запросу',sku,dimensions,materials,description:dimensions?`Габариты: ${dimensions}.`:'',checkedAt:'2026-11-16'});
  }
  return result;
}

const robots=await get('https://aira.ru/robots.txt');
const index=await get('https://aira.ru/sitemap.xml');
const sitemapUrls=[...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
const sitemapContents=await Promise.all(sitemapUrls.map(get));
const allSitemap=[...new Set(sitemapContents.flatMap(x=>[...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>decode(m[1]))))];
const catalogSitemap=allSitemap.filter(u=>u.includes('/produktsiya/'));
const sections=catalogSitemap.filter(u=>new URL(u).pathname.split('/').filter(Boolean).length===2 && !u.includes('%'));
const sources=['https://aira.ru/produktsiya/',...sections,'https://aira.ru/produktsiya/malye-arkhitekturnye-formy/inklyuzivnaya-mebel/'];
const products=new Map();
const sourceStats=[];
let cursor=0;
async function worker(){while(cursor<sources.length){const url=sources[cursor++];try{const html=await get(url),rows=parse(html,url);for(const p of rows){if(!products.has(p.id))products.set(p.id,p);}sourceStats.push({url,count:rows.length});console.log(url,rows.length,'total',products.size);}catch(e){errors.push({url,error:String(e)});}}}
await Promise.all(Array.from({length:3},worker));
const result=[...products.values()];
const knownUrls=new Set(result.map(p=>p.url));
const missingFromCatalog=catalogSitemap.filter(u=>!knownUrls.has(u) && new URL(u).pathname.split('/').filter(Boolean).length>=4);
const metadata={manufacturer:'Айра',source:'https://aira.ru/produktsiya/',checkedAt:'2026-11-16',imported:result.length,priceCount:result.filter(p=>p.price).length,imageCount:result.filter(p=>p.image).length,dimensionsCount:result.filter(p=>p.dimensions).length,materialsCount:result.filter(p=>p.materials.length).length,sitemapUrls:catalogSitemap.length,sourceStats,errors,missingFromCatalog,scope:'All product cards from catalog and each top-level public catalog section, including seasonal decoration and modular buildings. No product descriptions copied.',robotsChecked:true};
await fs.writeFile(path.join(root,'data','aira.json'),JSON.stringify(result,null,2));
await fs.writeFile(path.join(root,'data','aira-meta.json'),JSON.stringify(metadata,null,2));
console.log(JSON.stringify({...metadata,sourceStats:undefined,missingFromCatalog:missingFromCatalog.length},null,2));
