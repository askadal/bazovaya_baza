import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),work=process.argv[2]||path.resolve(root,'../../work/igratex');
await fs.mkdir(path.join(work,'pages'),{recursive:true});
const decode=s=>String(s||'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#039;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n));
const clean=s=>decode(s).replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const abs=u=>new URL(decode(u),'https://igratex.ru').href;
async function get(url){
 const file=path.join(work,'pages',crypto.createHash('sha1').update(url).digest('hex')+'.json');
 try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{}
 let last;for(let i=0;i<2;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);const data={url:r.url,html:await r.text()};await fs.writeFile(file,JSON.stringify(data));return data;}catch(e){last=e;}}
 throw last;
}
function classify(name,source,url){
 const n=name.toLowerCase().replace(/ё/g,'е'),s=source.toLowerCase(),head=n.split(/[«"(]/)[0];
 const city='Городская мебель',child='Детское оборудование',sport='Спортивное оборудование',other='Другие изделия';
 const r=(category,section=child)=>({category,section});
 if(/собак|гавпарк/.test(s)||/\/eko\//.test(url))return r('Площадки для собак',other);
 if(/парклет/.test(head))return r('Парклеты',other);
 if(/подиум/.test(head))return r('Подиумы',other);
 if(/велопарков/.test(n+' '+s))return r('Велопарковки',city);
 if(/паркфит|фитнес|воркаут|йога|тренажер|детский спорт/.test(s)){
  if(/тренажер/.test(s))return r('Уличные тренажёры',sport);
  if(/воркаут/.test(s))return r('Воркаут',sport);
  return r('Другое спортивное оборудование',sport);
 }
 if(/пергол/.test(head)||/пергол/.test(s))return r('Навесы, перголы и остановки',city);
 if(/навес|веранд|беседк|тенев.*парус/.test(n+' '+s))return /городск/.test(s)||/\/besedki-i-navesy\//.test(url)?r('Навесы, перголы и остановки',city):r('Навесы и веранды',child);
 if(/урна|^урны$/.test(n+' '+s))return r('Урны',city);
 if(/информацион|навигац/.test(s))return r('Навигация',city);
 if(/^скам|^лавк|^диван/.test(head)||/скамейки/.test(s))return r('Скамейки',city);
 if(/шезлонг|лежак/.test(head))return r('Шезлонги',city);
 if(/кресло|стул|пуф|табурет/.test(head))return r('Кресла и стулья',city);
 if(/стол/.test(head))return /песоч|песком|водой/.test(s)?r('Игры с песком и водой'):r('Столы',city);
 if(/урн/.test(head))return r('Урны',city);
 if(/кашпо|вазон|цветочниц/.test(head))return r('Кашпо и вазоны',city);
 if(/^песочниц/.test(head))return r('Игры с песком и водой');
 if(/^(?:детская )?лазал|^лазатель|^большая сеть|^канатный комплекс/.test(head))return r('Лазалки и скалодромы');
 if(/^домик|^игровой домик|^шалаш/.test(head))return r('Игровые домики');
 if(/^трубы переговорные|^меловая доска|^интерактив|^зеркало/.test(head))return r('Развивающее оборудование');
 if(/балансов/.test(s))return r('Балансиры');
 if(/на пружин/.test(n)||/кача.*пружин/.test(n+' '+s))return r('Качалки на пружине');
 if(/балансир|качалки-балансиры|баланс$/.test(n+' '+s))return r('Балансиры');
 if(/качели|подвес.*качел/.test(n+' '+s))return r('Детские качели');
 if(/карусел/.test(n+' '+s))return r('Карусели');
 if(/батут/.test(n+' '+s))return r('Батуты');
 if(/песоч|песком|водой/.test(s))return r('Игры с песком и водой');
 if(/игров.*домик|домики|шалаш/.test(n+' '+s))return r('Игровые домики');
 if(/^горк|горки/.test(head+' '+s)&&!/игровой комплекс/.test(head))return r('Горки');
 if(/лазатель|канатн.*комплекс|пирамид/.test(n+' '+s))return r('Лазалки и скалодромы');
 if(/игров.*комплекс|игров.*городок|башн/.test(n+' '+s))return r('Игровые комплексы');
 if(/музыкал|панели|переговор|развива|оптическ/.test(s))return r('Развивающее оборудование');
 if(/решетк/.test(s))return r('Приствольные решётки',city);
 if(/боллард|огражд/.test(s))return r('Ограждения',city);
 return r('Другие игровые элементы');
}
function parse(h,url){
 if(!/\bproduct-page\b/.test(h))return null;
 const h1=h.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]||'';
 const parts=h1.split(/<br\s*\/?>/i);const name=clean(parts[0]),sku=clean(parts.slice(1).join(' '));
 if(!name||!sku)throw Error('Missing name or SKU');
 const main=h.slice(h.indexOf('<main'),h.indexOf('warranty-info'));
 const specs={};for(const m of main.matchAll(/<div class=["']name["']>([\s\S]*?)<\/div>\s*<div class=["']value[^"']*["']>([\s\S]*?)<\/div>/g)){const k=clean(m[1]),v=clean(m[2]);if(k&&v)specs[k]=v;}
 const sourceCategory=specs['Категория']||'';
 const gallery=main.slice(main.indexOf('id="mainCarousel"'),main.indexOf('id="mainCarousel"')+main.slice(main.indexOf('id="mainCarousel"')).indexOf('</picture>')+3000);
 const images=[...new Set([...main.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map(m=>abs(m[1])).filter(u=>u.includes('/storage-place/catalog/')))];
 const image=images[0]||'';const native=image.match(/\/catalog\/(\d+)\//)?.[1]||crypto.createHash('sha1').update(url).digest('hex').slice(0,16);
 const dimensions=specs['Габариты']||null,materials=Object.entries(specs).filter(([k])=>/материал/i.test(k)).map(([,v])=>v);
 const design=h.slice(h.indexOf('class="card materials"'),h.indexOf('class="card materials"')+3500);
 const files=[...new Map([...design.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].filter(m=>/^(SKP|DWG|OBJ|MAX|BIM|PDF|3DS)$/i.test(clean(m[2]))).map(m=>[m[1],{url:abs(m[1]),name:'Материалы для проектирования'}])).values()];
 const modelFormats=[...new Set([...design.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>clean(m[2])).filter(s=>/^(SKP|DWG|OBJ|MAX|BIM|PDF|3DS)$/i.test(s)))];
 return {id:'igratex-'+native,manufacturer:'Игратекс',manufacturerId:'igratex',name,url,image,images,sourceCategory,...classify(name,sourceCategory,url),price:null,sku,dimensions,materials,description:[sourceCategory,dimensions,materials.length?'Материалы: '+materials.join(', '):''].filter(Boolean).join(' · '),specifications:specs,files,modelFormats,checkedAt:'2026-11-18'};
}
const home=await get('https://igratex.ru/catalog');
const links=h=>[...h.matchAll(/href="([^"]+)"/g)].map(m=>abs(m[1])).filter(u=>u.startsWith('https://igratex.ru/catalog/')&&!/[?#]/.test(u)&&!u.includes('/files/download/')&&!/\.(?:zip|rar|pdf|jpg|jpeg|png|webp|gif)$/i.test(u));
const queue=[...new Set(links(home.html))],seen=new Set(queue),products=new Map(),errors=[],categories=[],duplicates=[];
let next=0,done=0;
async function checkpoint(complete=false){await fs.writeFile(path.join(root,'data/igratex.json'),JSON.stringify([...products.values()],null,2));await fs.writeFile(path.join(work,'progress.json'),JSON.stringify({done,total:queue.length,products:products.size,errors:errors.length,complete}));}
await checkpoint();
await Promise.all(Array.from({length:5},async()=>{while(next<queue.length){const url=queue[next++];try{const d=await get(url),p=parse(d.html,d.url);if(p){if(products.has(p.id))duplicates.push(url);else products.set(p.id,p);}else categories.push(url);for(const u of links(d.html)){if(!seen.has(u)){seen.add(u);queue.push(u);}}}catch(e){errors.push({url,error:e.message});}done++;if(done%50===0)await checkpoint();}}));
await checkpoint(true);
const meta={manufacturer:'Игратекс',url:'https://igratex.ru/catalog',checkedAt:'2026-11-18',discovered:queue.length,processed:done,count:products.size,errors,skippedCategories:categories,duplicateUrls:duplicates,status:errors.length?'Частичное покрытие':'Все найденные изделия',note:'Актуальная навигация каталога проверена обходом разделов и товарных ссылок. Старая карта сайта содержит устаревшие адреса и не использовалась как показатель ассортимента. Сохранены собственные изображения, артикулы, размеры и доступные характеристики. Отсутствующие материалы не выводились из общего гарантийного текста.'};
await fs.writeFile(path.join(root,'data/igratex-meta.json'),JSON.stringify(meta,null,2));console.log(JSON.stringify({count:products.size,errors:errors.length,categories:categories.length,duplicates:duplicates.length}));
