import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),cache=process.argv[2]||path.resolve(root,'../../work/detkki');
await fs.mkdir(cache,{recursive:true});await fs.mkdir(path.join(cache,'pages'),{recursive:true});
const origin='https://detkki.ru',checkedAt='2026-11-18';
const decode=s=>String(s||'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&(?:nbsp|quot|apos|amp|lt|gt);/g,e=>({'&nbsp;':' ','&quot;':'"','&apos;':"'",'&amp;':'&','&lt;':'<','&gt;':'>'}[e]));
const clean=s=>decode(String(s||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const abs=u=>u?new URL(decode(u),origin).href:'';
async function get(url){const file=path.join(cache,'pages',crypto.createHash('sha1').update(url).digest('hex')+'.html');try{return await fs.readFile(file,'utf8')}catch{}let last;for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);const h=await r.text();await fs.writeFile(file,h);return h;}catch(e){last=e;}}throw last;}
function classify(name,source,sourceUrls){
 const city='Городская мебель',kids='Детское оборудование',sport='Спортивное оборудование',other='Другие изделия';
 const n=name.toLowerCase().replace(/ё/g,'е'),h=n.split(/[«"“(]/)[0],s=source.toLowerCase(),all=n+' '+s+' '+sourceUrls;
 const r=(category,section=city)=>({category,section});
 if(/собак|собач|аджилити|agility/.test(all))return r('Площадки для собак',other);
 if(/парклет/.test(h))return r('Парклеты',other);
 if(/подиум/.test(h))return r('Подиумы',other);
 if(/велопарков|велостойк|велонавес|велосипед.*парков/.test(h))return r('Велопарковки');
 const child=/детск|игров|песоч|геопласт|detsk|igrov/.test(s+' '+sourceUrls),sports=/спорт|воркаут|тренаж|sport|vorkaut/.test(s+' '+sourceUrls);
 if(child){
  if(/навес|веранд/.test(h))return r('Навесы и веранды',kids);
  if(/игров[а-я -]*комплекс|игров[а-я -]*городок|детск[а-я -]*городок|^игровая площадка/.test(h))return r('Игровые комплексы',kids);
  if(/качалк/.test(h)&&/пружин/.test(all))return r('Качалки на пружине',kids);
  if(/балансир/.test(h))return r('Балансиры',kids);
  if(/качел/.test(h))return r('Детские качели',kids);
  if(/карусел/.test(h))return r('Карусели',kids);
  if(/песоч|песк|вод[аы]/.test(h))return r('Игры с песком и водой',kids);
  if(/батут/.test(h))return r('Батуты',kids);
  if(/лазал|скалодром|канатн.*комплекс/.test(h))return r('Лазалки и скалодромы',kids);
  if(/горк/.test(h))return r('Горки',kids);
  if(/домик|шалаш/.test(h))return r('Игровые домики',kids);
  if(/музык|панел|развива|интерактив/.test(h))return r('Развивающее оборудование',kids);
  return r('Другие игровые элементы',kids);
 }
 if(sports){
  if(/теннис/.test(all))return r('Теннисные столы',sport);
  if(/тренаж/.test(all))return r('Уличные тренажёры',sport);
  if(/воркаут|турник|брус|рукоход|press|vorkaut/.test(all))return r('Воркаут',sport);
  return r('Другое спортивное оборудование',sport);
 }
 if(/^гамак/.test(h))return r('Качели');
 if(/парковк[а-я]* для (?:самокат|колясок)/.test(h))return r('Велопарковки');
 if(/^(?:опорное полусиденье|сиденье)/.test(h))return r('Кресла и стулья');
 if(/контейнер|площадк.*мусор/.test(h))return r('Контейнерные площадки',other);
 if(/светильник|фонар|освещен/.test(h))return r('Освещение',other);
 const rules=[[/скам|лавоч|лавк|диван|банкет/,'Скамейки'],[/шезлонг|лежак/,'Шезлонги'],[/кресл|стул|табурет|пуф/,'Кресла и стулья'],[/стол(?!б)/,'Столы'],[/урн|пепельниц/,'Урны'],[/качел/,'Качели'],[/навес|веранд|пергол|беседк|останов/,'Навесы, перголы и остановки'],[/кашпо|вазон|цветочниц|клумб/,'Кашпо и вазоны'],[/велопарков|велостойк/,'Велопарковки'],[/огражден|забор|боллард|парковочн.*столбик/,'Ограждения'],[/приствольн/,'Приствольные решётки'],[/информацион|навигац|указател/,'Навигация'],[/арт-объект|скульптур/,'Арт-объекты']];
 const matches=rules.map(([re,c])=>({m:re.exec(h),c})).filter(r=>r.m).sort((a,b)=>a.m.index-b.m.index);
 if(matches.length)return r(matches[0].c);
 return r('Другое');
}
function parse(html,url){
 const main=html.slice(html.indexOf('<main'),html.indexOf('class="same block')>=0?html.indexOf('class="same block'):html.indexOf('<footer'));
 const bc=main.match(/<div class="breadcrumbs">([\s\S]*?)<div class="catalog-item/)?.[1]||'';
 const links=[...bc.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].filter(m=>m[1].includes('/category/'));
 const sourceCategory=links.map(m=>clean(m[2])).join(' / '),sourceUrls=links.map(m=>m[1]).join(' ');
 const pageName=clean(main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]);
 const forms=[...main.matchAll(/<form\b[^>]*id="form_model_(\d+)"[\s\S]*?<\/form>/g)];
 const pageImages=[...new Set([...main.slice(0,main.indexOf('<form id="form_model_')).matchAll(/class="gallery__img"[^>]*href="([^"]+)"/g)].map(m=>abs(m[1])))];
 return forms.map(m=>{
  const id=m[1],f=m[0],name=clean(f.match(/class="text32">([\s\S]*?)<\/div>/)?.[1])||pageName;
  const sku=clean(f.match(/id="sku_span_\d+">([\s\S]*?)<\/span>/)?.[1]);
  const specs={};for(const v of f.matchAll(/class="model-prop__title[^"]*">([\s\S]*?)<\/span>\s*<span class="model-prop__desc">([\s\S]*?)<\/span>/g)){const k=clean(v[1]),value=clean(v[2]);if(k&&value)specs[k]=value;}
  const material=Object.entries(specs).filter(([k])=>/материал/i.test(k)).flatMap(([,v])=>v.split(/[,;]/).map(s=>s.trim())).filter(Boolean);
  const dimensions=Object.entries(specs).filter(([k])=>/^(длина|ширина|высота|диаметр|габарит|глубина)/i.test(k)&&!/^высота (?:сиденья|падения)/i.test(k)).map(([k,v])=>k+': '+v).join('; ');
  const imgRegion=f.slice(f.indexOf('class="model-media__content"'),f.indexOf('class="model-info"'));
  const images=[...new Set([...imgRegion.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map(v=>abs(v[1])).filter(u=>/\/upload\//.test(u)))];
  const ownImages=images.length?images:forms.length===1?pageImages:[];
  return {id:'detkki-'+id,manufacturer:'Деткки',manufacturerId:'detkki',name,url:forms.length>1?url+'#form_model_'+id:url,image:ownImages[0]||'',images:ownImages,sourceCategory,...classify(name,sourceCategory,sourceUrls),price:null,sku:sku||null,dimensions:dimensions||null,materials:[...new Set(material)],description:[sourceCategory,dimensions,material.length?'Материалы: '+material.join(', '):''].filter(Boolean).join(' · '),specifications:specs,modelFormats:[...new Set([...main.matchAll(/class="docs__link-format">([\s\S]*?)<\/span>/g)].map(v=>clean(v[1])))],modelsRequireLogin:/docs__link--login-required/.test(main),checkedAt};
 });
}
const xml=await get(origin+'/sitemap.xml'),urls=[...new Set([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>decode(m[1])).filter(u=>u.startsWith(origin+'/product/')))];
let index=0,done=0,duplicates=0;const products=new Map(),errors=[],excluded=[];
async function checkpoint(){await fs.writeFile(path.join(root,'data/detkki.json'),JSON.stringify([...products.values()],null,2));await fs.writeFile(path.join(cache,'progress.json'),JSON.stringify({done,total:urls.length,products:products.size,errors:errors.length}));}
await Promise.all(Array.from({length:5},async()=>{while(index<urls.length){const url=urls[index++];try{const rows=parse(await get(url),url);if(!rows.length)excluded.push(url);for(const p of rows){if(products.has(p.id))duplicates++;else products.set(p.id,p);}}catch(e){errors.push({url,error:e.message});}done++;if(done%100===0)await checkpoint();}}));
await checkpoint();
const meta={manufacturer:'Деткки',url:origin,checkedAt,discovered:urls.length,processed:done,count:products.size,duplicates,errors,excluded,status:errors.length?'Частичное покрытие':'Все найденные изделия',note:'Все товарные адреса карты сайта обработаны. Отдельные модели коллекций извлечены по собственным ID и артикулам. Разделы и повторяющиеся модели исключены. 3D-файлы требуют входа у производителя.'};
await fs.writeFile(path.join(root,'data/detkki-meta.json'),JSON.stringify(meta,null,2));console.log(JSON.stringify({count:products.size,errors,excluded:excluded.length,duplicates}));
