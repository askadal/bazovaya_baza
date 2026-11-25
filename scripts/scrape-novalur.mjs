import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {primaryCategory} from './classify-primary.mjs';
const root=path.resolve(import.meta.dirname,'..'),work=process.argv[2]||path.join(root,'work/novalur');await fs.mkdir(work,{recursive:true});
const origin='https://novalur.ru/';
const decode=s=>String(s||'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&(?:nbsp|quot|apos|amp|lt|gt);/g,e=>({'&nbsp;':' ','&quot;':'"','&apos;':"'",'&amp;':'&','&lt;':'<','&gt;':'>'}[e]));
const clean=s=>decode(s.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const absolute=u=>u?new URL(decode(u),origin).href:'';
const get=async(url)=>{const file=path.join(work,createHash('sha1').update(url).digest('hex')+'.html');try{return await fs.readFile(file,'utf8')}catch{}let error;for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);const text=await r.text();await fs.writeFile(file,text);return text;}catch(e){error=e;if(attempt<2)await new Promise(r=>setTimeout(r,500*(attempt+1)));}}throw error;};
function categoryFor(url,name){
 const city='Городская мебель',kids='Детское оборудование',sport='Спортивное оборудование',other='Другие изделия';
 let section=url.includes('/detskie-ploshhadki/')?kids:url.includes('/sportivnyie-trenazheryi/')?sport:url.includes('/ulichnoe-osveshhenie/')?other:city,category=section===kids?'Другие игровые элементы':section===sport?'Другое спортивное оборудование':'Другое';
 const rules=[['/parkletyi','Парклеты',other],['/kontejnernyie-ploshhadki','Контейнерные площадки',other],['/ulichnoe-osveshhenie','Освещение',other],['/prazdnichnoe-oformlenie','Праздничное оформление',other],['/ploshhadki-dlya-sobak','Площадки для собак',other],['/skamejki','Скамейки',city],['/urnyi','Урны',city],['/czvetochnyie-vazonyi','Кашпо и вазоны',city],['/kacheli','Качели',city],['/lezhaki-shezlongi','Шезлонги',city],['/parkovyie-navesyi-pergolyi','Навесы, перголы и остановки',city],['/sovremennyie-besedki','Навесы, перголы и остановки',city],['/ostanovki-obshhestvennogo-transporta','Навесы, перголы и остановки',city],['/informaczionnyie-stendyi','Навигация',city],['/parkovki-dlya-velosipedov','Велопарковки',city],['/parkovochnyie-peshexodnyie-ograzhdeniya','Ограждения',city],['/pristvolnyie-reshetki','Приствольные решётки',city],['/art-obektyi','Арт-объекты',city],['/vorkaut-ploshhadki','Воркаут',sport],['/trenazhyoryi','Уличные тренажёры',sport],['/tennisnyie-stolyi','Теннисные столы',sport]];
 for(const [pattern,c,s]of rules)if(url.includes(pattern)){category=c;section=s;break;}
 return {section,category};
}
function parse(html,url){
 if(!/id="product"[^>]*itemtype="http[s]?:\/\/schema.org\/Product"/.test(html))return null;
 const name=clean(html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/)?.[1]||'');if(!name)return null;
 const id=html.match(/class="shk-item"\s+data-id="(\d+)"/)?.[1];if(!id)throw Error('No product ID');
 const bc=html.match(/<nav class="breadcrumbs[\s\S]*?<\/nav>/)?.[0]||'';
 const crumbs=[...bc.matchAll(/<span itemprop="name">([\s\S]*?)<\/span>/g)].map(m=>clean(m[1]));
 const sourceCategory=crumbs.slice(2,-1).join(' / ');
 const sku=clean(html.match(/class="prdt_ean_value">([\s\S]*?)<\/span>/)?.[1]||'');
 const specifications={};for(const m of html.matchAll(/class="prdt_props_(?:main|item)_title">([\s\S]*?)<\/span>\s*<span class="prdt_props_(?:main|item)_value">([\s\S]*?)<\/span>/g)){const k=clean(m[1]).replace(/:$/,'');const v=clean(m[2]);if(k&&v)specifications[k]=v;}
 const materials=[...new Set(Object.entries(specifications).filter(([k])=>/материал/i.test(k)).flatMap(([,v])=>v.split(/[,;]/).map(s=>s.trim())).filter(Boolean))];
 const dimensions=Object.entries(specifications).filter(([k])=>/^(?:длина|ширина|высота|диаметр|глубина|габарит)/i.test(k)).map(([k,v])=>k+': '+v).join('; ');
 const imgRegion=html.slice(html.indexOf('id="prdt_imgs"'),html.indexOf('class="prdt_col prdt_col_info'));
 const images=[...new Set([...imgRegion.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m=>absolute(m[1])))];
 const description=[dimensions,materials.length?'Материалы: '+materials.join(', '):''].filter(Boolean).join(' · ');
 const fileRegion=html.slice(html.indexOf('class="prdt_props_main"'),html.indexOf('id="prdt_examples"'));
 const files=[...new Map([...fileRegion.matchAll(/<a\b([^>]+)>([\s\S]*?)<\/a>/g)].flatMap(m=>{const u=m[1].match(/href="([^"]+)"/)?.[1];return u&&(/\.pdf(?:$|\?)/i.test(u)||/disk\.yandex/.test(u))?[[absolute(u),{url:absolute(u),name:/\.pdf/.test(u)?'PDF производителя':'Материалы для проектирования'}]]:[]})).values()];
 const modelFormats=[...new Set([...fileRegion.matchAll(/class="format_block_title">([\s\S]*?)<\/div>/g)].map(m=>clean(m[1])))];
 const cat=categoryFor(url,name),p={id:'novalur-'+id,manufacturer:'Новалур',manufacturerId:'novalur',name,url,image:images[0]||'',images,sourceCategory,...cat,price:null,priceNote:'Цена по запросу',sku,dimensions,materials,description,specifications,files,modelFormats,checkedAt:'2026-11-18'};
 const primary=primaryCategory(p);if(primary)Object.assign(p,primary);
 const head=name.toLowerCase().split(/[«"(]/)[0].trim();
 if(url.includes('/detskie-ploshhadki/')){
  if(/^(?:детский\s+)?городок|^игровая площадка/.test(head)){p.section='Детское оборудование';p.category='Игровые комплексы';}
  if(/^качели/.test(head)){p.section='Детское оборудование';p.category=/балансир/.test(head)?'Балансиры':'Детские качели';}
  if(/^панель игровая/.test(head)){p.section='Детское оборудование';p.category='Развивающее оборудование';}
  if(/^шалаш/.test(head)){p.section='Детское оборудование';p.category='Игровые домики';}
  // These eleven ECO rockers have springs visible in their product photographs.
  if(/^ЭКО\.КЛ(?:[1-9]|1[01])$/.test(sku)){p.section='Детское оборудование';p.category='Качалки на пружине';}
 }
 return p;
}
const xml=await get(origin+'sitemap.xml');const discovered=[...new Set([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>decode(m[1])))];
const urls=discovered.filter(u=>u.startsWith(origin+'produkcziya/')&&u.endsWith('.html'));
let next=0,done=0;const products=[],errors=[],excluded=[];const report=()=>fs.writeFile(path.join(work,'progress.json'),JSON.stringify({done,total:urls.length,products:products.length,errors:errors.length}));await report();
await Promise.all(Array.from({length:6},async()=>{while(next<urls.length){const url=urls[next++];try{const p=parse(await get(url),url);p?products.push(p):excluded.push(url);}catch(e){errors.push({url,error:e.message});}done++;if(done%50===0)await report();}}));
const ids=new Set(),duplicates=[];const unique=products.sort((a,b)=>a.url.localeCompare(b.url)).filter(p=>{if(ids.has(p.id)){duplicates.push(p.url);return false;}ids.add(p.id);return true;});
await fs.writeFile(path.join(root,'data/novalur.json'),JSON.stringify(unique,null,2));const meta={manufacturer:'Новалур',manufacturerId:'novalur',url:origin,catalogUrl:origin+'produkcziya/',checkedAt:'2026-11-18',sitemapUrls:discovered.length,discoveredProductUrls:urls.length,products:unique.length,errors,excluded,duplicateProductUrls:duplicates,status:errors.length?'Частичное покрытие':'Все найденные карточки обработаны',note:'Карта сайта проверена целиком. Включены только страницы с разметкой Product и собственным ID. Категории и серии не считаются товарами. Характеристики взяты из карточек; отсутствующие значения не додумывались.'};await fs.writeFile(path.join(root,'data/novalur-meta.json'),JSON.stringify(meta,null,2));await report();console.log(JSON.stringify({products:unique.length,errors,excluded,duplicates}));
