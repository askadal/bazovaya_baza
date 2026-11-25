import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),cache=path.resolve(root,'../../work/leber');
await fs.mkdir(path.join(cache,'products'),{recursive:true});
const urls=JSON.parse(await fs.readFile(path.join(cache,'urls.json'),'utf8'));
const seed=await fs.readFile(path.join(cache,'product.html'),'utf8');
const initial=JSON.parse(seed.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/)[1]);
let version=initial.version,done=0,index=0;const errors=[],products=[],redirects=[];
function clean(s){return String(s??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
function absolute(s){return s?new URL(s,'https://leber.ru').href:null;}
function slim(p){return Object.fromEntries(['uuid','slug','title','cover','article','path','materials','width','length','height','fall_height','age_from','age_to','side_view','top_view','uploaded_files','available','sold_in_viewing_region'].map(k=>[k,p[k]]));}
function classify(p){
 const n=clean(p.title).toLowerCase().replace(/ё/g,'е'),head=n.split(/[«"“(]/)[0].split(/\s(?:с|со|для|из|на|под|без)\s/)[0];
 const cats=(p.path||[]).map(x=>x.title).join(' / ').toLowerCase(),slug=(p.path||[]).map(x=>x.nested_slug).join('/');
 const city='Городская мебель',child='Детское оборудование',sport='Спортивное оборудование',other='Другие изделия';
 const out=(section,category)=>({section,category});
 if(/собак|sobak/.test(cats+slug))return out(other,'Площадки для собак');
 if(/парклет/.test(head))return out(other,'Парклеты');
 if(/подиум/.test(head)&&!/гимнаст|спорт/.test(head))return out(other,'Подиумы');
 if(/информацион|навигац/.test(head+' '+cats))return out(city,'Навигация');
 if(/прист[а-я]* решет|pristvolnye-resetki/.test(head+slug))return out(city,'Приствольные решётки');
 if(/контейнерн.*площад|konteinernye/.test(head+slug))return out(other,'Контейнерные площадки');
 if(/газонн.*огражден|ограждения|столбик|ограждение/.test(head+' '+cats))return out(city,'Ограждения');
 if(/пергол|навес|беседк/.test(head))return out(city,'Навесы, перголы и остановки');
 if(/спорт|sportivnoe/.test(cats+slug)){
  if(/теннис/.test(n))return out(sport,'Теннисные столы');
  if(/тренажер|trenazery/.test(n+slug))return out(sport,'Уличные тренажёры');
  if(/воркаут|vorkaut/.test(n+slug))return out(sport,'Воркаут');
  if(/паркур/.test(n+cats))return out(sport,'Паркур');
  return out(sport,'Другое спортивное оборудование');
 }
 if(/улица и парк|ulica-i-park/.test(cats+slug)){
  if(/качел/.test(head)||/kaceli-parkovye/.test(slug))return out(city,'Качели');
  if(/шезлонг|лежак|sezlongi/.test(head+slug))return out(city,'Шезлонги');
  if(/^(?:[а-я-]+\s+)?(?:кресло|стул|табурет|пуф)(?:\s|$)/.test(head))return out(city,'Кресла и стулья');
  if(/^(?:[а-я-]+\s+)?(?:стол|столик)(?:\s|$)/.test(head)||/ulicnye-stoly/.test(slug))return out(city,'Столы');
  if(/урн|urny/.test(head+slug))return out(city,'Урны');
  if(/велопарков|veloparkov/.test(head+slug))return out(city,'Велопарковки');
  if(/цветочниц|кашпо|вазон|cvetocnicy/.test(head+slug))return out(city,'Кашпо и вазоны');
  if(/скам|диван|лавоч|skameiki/.test(head+slug))return out(city,'Скамейки');
  return out(city,'Другое');
 }
 if(/научн|naucnye/.test(cats+slug)){
  if(/карусел/.test(head)||/karuseli/.test(slug))return out(child,'Карусели');
  if(/качел/.test(head)||/kaceli/.test(slug))return out(child,'Детские качели');
  if(/комплекс/.test(head))return out(child,'Игровые комплексы');
  return out(child,'Развивающее оборудование');
 }
 if(/игров|igrovoe/.test(cats+slug)){
  if(/балансир/.test(head)||/balansiry/.test(slug))return out(child,'Балансиры');
  if(/качалк/.test(head)||/kacalki/.test(slug))return out(child,'Качалки на пружине');
  if(/качел/.test(head)||/kaceli/.test(slug))return out(child,'Детские качели');
  if(/карусел/.test(head)||/karuseli/.test(slug))return out(child,'Карусели');
  if(/батут/.test(head)||/batuty/.test(slug))return out(child,'Батуты');
  if(/песоч|водой|pesoc|vodoi/.test(head+' '+cats+' '+slug))return out(child,'Игры с песком и водой');
  if(/канатн.*комплекс|лазател|лазал|скалодром|kanatnye|lazatelnye/.test(head+slug))return out(child,'Лазалки и скалодромы');
  if(/игровой комплекс|igrovye-kompleksy/.test(head+slug))return out(child,'Игровые комплексы');
  if(/домик|domiki/.test(head+slug))return out(child,'Игровые домики');
  if(/^горк/.test(head)||/\/gorki/.test(slug))return out(child,'Горки');
  if(/музык|развива|muzykalnye|razvivaiushhie/.test(head+' '+cats+' '+slug))return out(child,'Развивающее оборудование');
  if(/скам|лавоч/.test(head))return out(city,'Скамейки');
  if(/^стол(?:ик)?(?:\s|$)/.test(head))return out(city,'Столы');
  return out(child,'Другие игровые элементы');
 }
 return out(other,'Другое');
}
function normalize(p,url){
 if(!p?.uuid||!p.title)throw Error('Not an individual product');
 const dims=[['Длина',p.length],['Ширина',p.width],['Высота',p.height]].filter(([,v])=>Number(v)>0).map(([k,v])=>k+': '+v+' мм').join('; ')||null;
 const materials=(p.materials||[]).map(x=>clean(x.name)).filter(Boolean),sourceCategory=(p.path||[]).map(x=>clean(x.title)).join(' / ');
 const images=[...new Set((p.cover||[]).map(x=>absolute(x.image?.src||x.original)).filter(Boolean))];
 const specs={};if(p.age_from!==null&&p.age_from!==undefined&&String(p.age_from)!=='')specs['Возраст']=String(p.age_from)+(p.age_to!==null&&p.age_to!==undefined?'–'+p.age_to:'+')+' лет';
 if(Number(p.fall_height)>0)specs['Высота падения']=p.fall_height+' мм';
 const files=[];if(p.side_view)files.push({name:'Вид сбоку',url:absolute(p.side_view)});if(p.top_view)files.push({name:'Вид сверху',url:absolute(p.top_view)});
 return {id:'leber-'+p.uuid,manufacturer:'Leber',manufacturerId:'leber',name:clean(p.title),url,image:images[0]||null,images,sourceCategory,...classify(p),price:null,sku:clean(p.article)||null,dimensions:dims,materials,description:[sourceCategory,dims,materials.length?'Материалы: '+materials.join(', '):null].filter(Boolean).join(' · '),specifications:specs,files,modelFormats:[...new Set((p.uploaded_files||[]).map(f=>f.type?.toUpperCase()).filter(Boolean))],checkedAt:'2026-11-18'};
}
async function load(url){
 const file=path.join(cache,'products',crypto.createHash('sha256').update(url).digest('hex')+'.json');
 try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{}
 let last;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const r=await fetch(url,{headers:{'X-Inertia':'true','X-Inertia-Version':version,'X-Inertia-Partial-Component':'ProductShow','X-Inertia-Partial-Data':'product'},signal:AbortSignal.timeout(25000)});
   if(r.status===409){const h=await fetch(url,{signal:AbortSignal.timeout(25000)}).then(r=>r.text());const pg=JSON.parse(h.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/)[1]);version=pg.version;const p=slim(pg.props.product);await fs.writeFile(file,JSON.stringify(p));return p;}
   if(!r.ok)throw Error('HTTP '+r.status);
   const pg=await r.json(),p=slim(pg.props.product);if(!p.uuid)throw Error('Missing product UUID');
   if(r.url!==url)redirects.push({from:url,to:r.url});
   await fs.writeFile(file,JSON.stringify(p));return p;
  }catch(e){last=e;if(attempt<2)await new Promise(r=>setTimeout(r,600*(attempt+1)));}
 }
 throw last;
}
async function progress(){await fs.writeFile(path.join(cache,'progress.json'),JSON.stringify({done,total:urls.length,products:products.length,errors:errors.length}));}
await progress();
await Promise.all(Array.from({length:6},async()=>{while(index<urls.length){const url=urls[index++];try{products.push(normalize(await load(url),url));}catch(e){errors.push({url,error:e.message});}done++;if(done%50===0)await progress();}}));
const unique=[...new Map(products.map(p=>[p.id,p])).values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'));
await fs.writeFile(path.join(root,'data/leber.json'),JSON.stringify(unique,null,2));
const meta={manufacturer:'Leber',url:'https://leber.ru/ru',checkedAt:'2026-11-18',discovered:urls.length,processed:done,count:unique.length,duplicates:products.length-unique.length,errors,redirects,status:errors.length?'Частичное покрытие':'Все найденные изделия',note:'Товарные адреса из карты сайта; поля карточек получены из публичной структурированной выдачи. Цветовые варианты не считаются отдельными изделиями. Размеры и материалы взяты из полей производителя.'};
await fs.writeFile(path.join(root,'data/leber-meta.json'),JSON.stringify(meta,null,2));await progress();console.log(JSON.stringify({count:unique.length,errors:errors.length,duplicates:meta.duplicates}));
