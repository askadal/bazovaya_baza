import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),work=process.argv[2]||path.resolve(root,'../../work/richter'),base='https://richterrus.ru';
await fs.mkdir(path.join(work,'pages'),{recursive:true});
const decode=s=>String(s||'').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n));
const clean=s=>decode(String(s||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const abs=u=>new URL(u,base).href;
async function get(url){const file=path.join(work,'pages',crypto.createHash('sha1').update(url).digest('hex')+'.html');try{return await fs.readFile(file,'utf8')}catch{}let last;for(let a=0;a<3;a++){try{const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status);const h=await r.text();await fs.writeFile(file,h);return h}catch(e){last=e}}throw last}
function classify(name,source){
 const n=name.toLowerCase().replace(/ё/g,'е'),s=source.toLowerCase(),child='Детское оборудование',city='Городская мебель',sport='Спортивное оборудование';
 const r=(category,section=child)=>({category,section});
 if(/^амфитеатр/.test(n))return r('Амфитеатры',city);
 if(/^стол(?:ик|\s)/.test(n)&&!/игра.*пес|вод/.test(s))return r('Столы',city);
 if(/^скам|^лавк/.test(n))return r('Скамейки',city);
 if(/^навес|^веранд/.test(n))return r('Навесы и веранды');
 if(/^домик/.test(n))return r('Игровые домики');
 if(/^пирамида веревоч|^лес лазател/.test(n))return r('Лазалки и скалодромы');
 if(/^самосвал для песка/.test(n))return r('Игры с песком и водой');
 if(/^качели-маятник/.test(n))return r('Детские качели');
 if(/качал|балансир|балансирован/.test(s))return r('Балансиры');
 if(/карусел/.test(s)||/вращающ.*тарелк|тарелк.*вращающ/.test(n))return r('Карусели');
 if(/качел/.test(s))return r('Детские качели');
 if(/горк/.test(s))return r('Горки');
 if(/лазан/.test(s)||/^структура лазател|^бревна лазател/.test(n))return r('Лазалки и скалодромы');
 if(/домик/.test(s))return r('Игровые домики');
 if(/песком|водой|^водн/.test(s)||/^(?:канал водяной|плотина|насос|водян|водоворот|водопровод|желоб|водное|песоч)/.test(n))return r('Игры с песком и водой');
 if(/башн|игровые комплекс/.test(s))return r('Игровые комплексы');
 if(/бизиборд/.test(s))return r('Развивающее оборудование');
 if(/^турник/.test(n))return r('Воркаут',sport);
 if(/^батут/.test(n))return r('Батуты');
 return r('Другие игровые элементы');
}
function parse(h,url){
 const ld=[...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>{try{return JSON.parse(m[1])}catch{return null}}).filter(Boolean);
 const product=ld.find(p=>p['@type']==='Product');if(!product||!product.sku)return null;
 const breadcrumb=ld.find(p=>p['@type']==='BreadcrumbList');const sourceCategory=breadcrumb?.itemListElement?.slice(2,-1).map(x=>x.name).join(' / ')||'';
 const start=h.indexOf('<h1'),end=h.indexOf('Смотрите также',start),main=h.slice(start,end<0?h.indexOf('</main>'):end);
 const specs={};for(const m of main.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g)){const k=clean(m[1]),v=clean(m[2]);if(k&&v)specs[k]=v;}
 const raw=product.description||'',materials=[];
 for(const [label,re]of [['Нержавеющая сталь',/нержавеющ[а-я]*\s+стал/],['Дерево',/древесин|дерев[а-я]*|бр[уёе]в[ен]/],['Канат',/канат/],['Сталь',/(?<!нержавеющ[а-я]*\s)сталь|стальн/],['Резина',/резин/]])if(re.test(raw.toLowerCase()+' '+product.name.toLowerCase()))materials.push(label);
 const dimensions=specs['Габариты']||null;
 const image=Array.isArray(product.image)?product.image[0]:product.image||'';
 const files=[...main.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*download[^>]*>([\s\S]*?)<\/a>/g)].map(m=>({url:abs(m[1]),name:clean(m[2])}));
 const modelFormats=[...new Set(files.map(f=>f.url.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]?.toUpperCase()).filter(x=>['DWG','DXF','OBJ','FBX','SKP','MAX'].includes(x)))];
 return {id:'richter-'+product.sku.replace(/[^a-zA-Z0-9а-яА-Я.-]/g,'-'),manufacturer:'Рихтер',manufacturerId:'richter',name:product.name,url:product.url||url,image:image?abs(image):'',images:image?[abs(image)]:[],sourceCategory,...classify(product.name,sourceCategory),price:null,sku:product.sku,dimensions,materials,description:[sourceCategory,dimensions,materials.length?'Материалы: '+materials.join(', '):''].filter(Boolean).join(' · '),specifications:specs,files,modelFormats,checkedAt:'2026-11-18'};
}
const sitemap=await get(base+'/sitemap.xml'),urls=[...new Set([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>decode(m[1])).filter(u=>u.startsWith(base+'/catalog/')&&u!==base+'/catalog/'))];
let next=0,done=0;const products=[],errors=[],skipped=[];
async function checkpoint(){await fs.writeFile(path.join(root,'data/richter.json'),JSON.stringify(products.sort((a,b)=>a.name.localeCompare(b.name,'ru')),null,2));await fs.writeFile(path.join(work,'progress.json'),JSON.stringify({done,total:urls.length,products:products.length,errors:errors.length}));}
await checkpoint();await Promise.all(Array.from({length:4},async()=>{while(next<urls.length){const url=urls[next++];try{const p=parse(await get(url),url);p?products.push(p):skipped.push(url)}catch(e){errors.push({url,error:e.message})}done++;if(done%25===0)await checkpoint()}}));const unique=[...new Map(products.map(p=>[p.id,p])).values()];await fs.writeFile(path.join(root,'data/richter.json'),JSON.stringify(unique.sort((a,b)=>a.name.localeCompare(b.name,'ru')),null,2));
const meta={manufacturer:'Рихтер',url:base+'/catalog/',checkedAt:'2026-11-18',discovered:urls.length,count:unique.length,errors,skipped,duplicates:products.length-unique.length,status:errors.length?'Частичное покрытие':'Все найденные изделия',note:'Все адреса каталога из карты сайта проверены. Включены только индивидуальные страницы Product с собственным артикулом. Размеры, возраст и документы взяты из карточек; материалы сохранены только при прямом указании в описании изделия.'};await fs.writeFile(path.join(root,'data/richter-meta.json'),JSON.stringify(meta,null,2));await fs.writeFile(path.join(work,'progress.json'),JSON.stringify({done,total:urls.length,products:unique.length,errors:errors.length,complete:true}));console.log(JSON.stringify({count:unique.length,errors,skipped:skipped.length}));
