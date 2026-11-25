import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),id='newhorizons',name='Новые горизонты',origin='https://www.newhorizons.ru/';
const work=process.argv[2]||path.resolve(root,'../../work',id);await fs.mkdir(path.join(work,'pages'),{recursive:true});
const decode=s=>String(s||'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):+n)).replace(/&(?:nbsp|emsp|quot|apos|amp|lt|gt);/g,e=>({'&nbsp;':' ','&emsp;':' ','&quot;':'"','&apos;':"'",'&amp;':'&','&lt;':'<','&gt;':'>'}[e]));
const clean=s=>decode(String(s||'').replace(/<br\s*\/?\s*>/gi,'; ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const abs=u=>u?new URL(decode(u),origin).href:'';
async function get(url){const file=path.join(work,'pages',crypto.createHash('sha1').update(url).digest('hex')+'.json');try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{}
 let last;for(let attempt=0;attempt<2;attempt++){try{const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status);const data={url:r.url,html:await r.text()};await fs.writeFile(file,JSON.stringify(data));return data;}catch(e){last=e;}}throw last;}
function classify(n,url,source){
 n=n.toLowerCase().replace(/ё/g,'е');const s=source.toLowerCase(),head=n.split(/[«"“(]/)[0],city='Городская мебель',kids='Детское оборудование',sport='Спортивное оборудование',other='Другие изделия',r=(category,section=kids)=>({category,section});
 if(/собак|dog|oborudovanie-dlya-sobak/.test(n+' '+url))return r('Площадки для собак',other);
 if(/парклет|parklet/.test(head+' '+url))return r('Парклеты',other);
 if(/подиум/.test(head))return r('Подиумы',other);
 if(/велопарк|велостойк|velopark/.test(head+' '+url))return r('Велопарковки',city);
 if(/навес|веранд/.test(head)&&!/пергол/.test(head))return /детск|теневой|веранд/.test(n+' '+s)?r('Навесы и веранды'):r('Навесы, перголы и остановки',city);
 if(/пергол|беседк|останов/.test(head))return r('Навесы, перголы и остановки',city);
 if(/шезлонг|лежак/.test(head))return r('Шезлонги',city);
 if(/скам|диван|лавк|лавоч|банкет/.test(head))return /тренаж|спорт|пресс/.test(n+' '+s)?r('Другое спортивное оборудование',sport):r('Скамейки',city);
 if(/стул|кресл|табурет|пуф/.test(head))return r('Кресла и стулья',city);
 if(/стол(?:\s|$)|столик/.test(head))return /теннис/.test(n)?r('Теннисные столы',sport):r('Столы',city);
 if(/урн|пепельниц/.test(head))return r('Урны',city);
 if(/кашпо|вазон|цветочниц/.test(head))return r('Кашпо и вазоны',city);
 if(/огражден|забор/.test(head))return r('Ограждения',city);
 if(/светиль|фонар/.test(head))return r('Освещение',other);
 if(/трибун|амфитеатр/.test(head))return r('Амфитеатры',city);
 if(/раздевалк/.test(head))return r('Другое',other);
 if(/информацион|навигац/.test(head))return r('Навигация',city);
 if(/канатн.*комплекс|лазан|лазал|скалодром|pyramid|globus|kanatnie|lago/.test(n+' '+url))return r('Лазалки и скалодромы');
 if(/игровой комплекс|игровая площадка|игровой городок|лабиринт|комплекс детский|детский комплекс|^комплекс|дизайнерск.*комплекс|gorodok/.test(n+' '+s))return r('Игровые комплексы');
 if(/балансир/.test(n)||/\/balance(?:\/|$)/.test(url))return r('Балансиры');
 if(/пружин/.test(n)||/\/kachalki-na-prujine(?:\/|$)/.test(url))return r('Качалки на пружине');
 if(/карусел/.test(n)||/\/lineyka-karuseli(?:\/|$)/.test(url))return r('Карусели');
 if(/качел|kacheli/.test(n+' '+url))return r('Детские качели');
 if(/песоч|вод[аыо]|sandboxes|water-play/.test(n+' '+url))return r('Игры с песком и водой');
 if(/батут|trampolin|batuty/.test(n+' '+url))return r('Батуты');
 if(/домик|шалаш/.test(head))return r('Игровые домики');
 if(/горк|скат|gorki/.test(head+' '+url))return r('Горки');
 if(/музык|интерактив|иллюзи|ди-джей|music|interactiv|optic/.test(n+' '+url))return r('Развивающее оборудование');
 if(/workout|воркаут|турник|брусь|рукоход/.test(n+' '+url+' '+s))return r('Воркаут',sport);
 if(/тренаж|trenaj/.test(n+' '+url))return r('Уличные тренажёры',sport);
 if(/sportivnoe|sportivnye|спорт/.test(url+' '+head))return r('Другое спортивное оборудование',sport);
 if(/parkovaya-mebel|ulichnaya-mebel/.test(url))return r('Другое',city);
 return r('Другие игровые элементы');
}
function parse(h,url){
 const isShelby=id==='shelby';if(!/class="product__title/.test(h))return null;
 const productJson=[...h.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m=>{try{return JSON.parse(m[1]);}catch{return null;}}).find(j=>j&&j['@type']==='Product');
 const title=clean(h.match(/<h1\b[^>]*class="product__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/)?.[1]);if(!title)return null;
 const native=isShelby?h.match(/data-product-item-favorite="(\d+)"/)?.[1]:h.match(/class="product__main"\s+data-id=['"](\d+)/)?.[1];
 if(!native)return null;
 const sku=isShelby?decode(h.match(/data-article="([^"]+)"/)?.[1]||''):productJson?.sku||clean(h.match(/class="product__article">Артикул:\s*([^<]+)/)?.[1]||'');
 const specs={};
 if(isShelby){const block=h.match(/<dl class="product__props">([\s\S]*?)<\/dl>/)?.[1]||'';for(const m of block.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)){const k=clean(m[1]),v=clean(m[2]);if(k&&v)specs[k]=v;}}
 else {for(const m of h.matchAll(/<li class="product__cell[\s\S]*?<\/li>/g)){const k=clean(m[0].match(/class="cell-product__title">([\s\S]*?)<\/p>/)?.[1]),v=clean(m[0].match(/class="cell-product__value">([\s\S]*?)<\/p>/)?.[1]);if(k&&v)specs[k]=v;}}
 const dims=Object.entries(specs).filter(([k])=>/габарит/i.test(k)).map(([,v])=>v).join('; ');
 const materials=[...new Set(Object.entries(specs).filter(([k])=>/материал/i.test(k)).flatMap(([,v])=>v.split(';').map(x=>x.trim())).filter(Boolean))];
 let source='';if(isShelby){const crumb=[...h.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m=>{try{return JSON.parse(m[1]);}catch{return null;}}).find(j=>j&&j['@type']==='BreadcrumbList');source=(crumb?.itemListElement||[]).slice(2,-1).map(x=>x.item?.name).filter(Boolean).join(' / ');}
 else{source=[...h.matchAll(/<a\b[^>]*class="list-crumbs__link"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>clean(m[1])).filter(x=>!/^главная|оборудование для улицы/i.test(x)).join(' / ');}
 const region=isShelby?h.slice(h.indexOf('class="product__gallery"'),h.indexOf('class="product__info"')):h.slice(h.indexOf('class="product__'),h.indexOf('class="product__main"'));
 let images=isShelby?[...region.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*data-fancybox="product-gallery"/g)].map(m=>abs(m[1])):[productJson?.image,...[...region.matchAll(/<img\b[^>]*(?:src|data-src)="([^"]+)"[^>]*>/g)].map(m=>abs(m[1]))];
 images=[...new Set(images.filter(u=>u&&/\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(u)))];
 const files=[...new Map([...h.matchAll(/<a\b[^>]*href="([^"]+\.(?:dwg|pdf|zip|obj|fbx|max))(?:\?[^"]*)?"[^>]*>/gi)].map(m=>[abs(m[1]),{url:abs(m[1]),name:m[1].split('.').pop().toUpperCase()+' производителя'}])).values()];
 return {id:id+'-'+native,manufacturer:name,manufacturerId:id,name:title,url,image:images[0]||'',images:images.slice(0,12),sourceCategory:source,...classify(title,url,source),price:null,sku:sku||null,dimensions:dims||null,materials,description:[source,dims,materials.length?'Материалы: '+materials.join(', '):''].filter(Boolean).join(' · '),specifications:specs,files,modelFormats:[...new Set(files.map(f=>f.url.split('.').pop().toUpperCase()))],checkedAt:'2026-11-18'};
}
const urls=JSON.parse(await fs.readFile(path.join(work,'urls.json'),'utf8'));let next=0,done=0;const products=[],errors=[],excluded=[],redirects=[];
const save=async()=>{const unique=[...new Map(products.map(p=>[p.id,p])).values()];await fs.writeFile(path.join(root,'data',id+'.json'),JSON.stringify(unique,null,2));await fs.writeFile(path.join(work,'progress.json'),JSON.stringify({done,total:urls.length,products:unique.length,errors:errors.length}));};
await save();await Promise.all(Array.from({length:5},async()=>{while(next<urls.length){const url=urls[next++];try{const d=await get(url);if(d.url!==url)redirects.push({from:url,to:d.url});if(id==='newhorizons'&&!d.url.includes('/catalog/igrovye-prostranstva-dlya-ulitsy/')){excluded.push({url,reason:'Outside outdoor catalog'});}else{const p=parse(d.html,d.url);p?products.push(p):excluded.push({url,reason:'No individual product card'});}}catch(e){errors.push({url,error:e.message});}done++;if(done%100===0)await save();}}));await save();
const unique=[...new Map(products.map(p=>[p.id,p])).values()];
await fs.writeFile(path.join(root,'data',id+'-meta.json'),JSON.stringify({manufacturer:name,url:origin,checkedAt:'2026-11-18',discovered:urls.length,processed:done,count:unique.length,duplicates:products.length-unique.length,errors,excluded,redirects,status:errors.length?'Частичное покрытие':'Все найденные товарные карточки',note:id==='newhorizons'?'Импортирована только ветка уличного оборудования. Категории и внутреннее оборудование исключены.':'Адреса каталога сверены с картой сайта. Включены отдельные карточки с собственным ID, категории исключены.'},null,2));console.log(JSON.stringify({id,count:unique.length,errors:errors.length,excluded:excluded.length}));
