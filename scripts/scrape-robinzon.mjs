import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),work=process.argv[2]||path.resolve(root,'../../work/robinzon'),origin='https://robinzon-maf.ru';
await fs.mkdir(path.join(work,'pages'),{recursive:true});
const decode=s=>String(s||'').replace(/&quot;/g,'"').replace(/&#039;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n));
const clean=s=>decode(s).replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const abs=s=>s?new URL(decode(s),origin).href:'';
let errors=[],excluded=[],products=[],next=0,done=0;
async function get(url){
 const file=path.join(work,'pages',crypto.createHash('sha1').update(url).digest('hex')+'.html');
 try{return await fs.readFile(file,'utf8')}catch{}
 let err;for(let i=0;i<2;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);const h=await r.text();await fs.writeFile(file,h);return h;}catch(e){err=e;}}
 throw err;
}
function classify(name,url,source){
 const n=name.toLowerCase().replace(/ё/g,'е'),s=source.toLowerCase(),u=url.toLowerCase();
 const city='Городская мебель',child='Детское оборудование',sport='Спортивное оборудование',other='Другие изделия';
 const r=(category,section)=>({category,section});
 if(/собак|dog|adzhiliti/.test(n+' '+s+' '+u))return r('Площадки для собак',other);
 if(/парклет/.test(n+' '+s))return r('Парклеты',other);
 if(/подиум/.test(n)&&!u.includes('sportivnoe-'))return r('Подиумы',other);
 if(/веранд/.test(n)||(/навес/.test(n)&&/\/(?:5k|7k0-03)/.test(u)))return r('Навесы и веранды',child);
 if(u.includes('/sportivnoe-oborudovanie/')){
  if(/теннис/.test(n))return r('Теннисные столы',sport);
  if(/тренажер/.test(n+' '+s))return r('Уличные тренажёры',sport);
  if(/vorkaut|турник|брусь|рукоход|шведск|гимнастическ/.test(u+' '+n))return r('Воркаут',sport);
  return r('Другое спортивное оборудование',sport);
 }
 if(u.includes('/malye-arhitekturnye-formy/')){
  const rules=[[/велопарков|велостойк/,'Велопарковки'],[/скам|лавк|диван/,'Скамейки'],[/шезлонг|лежак/,'Шезлонги'],[/кресл|стул|табурет/,'Кресла и стулья'],[/кашпо|вазон|цветочниц/,'Кашпо и вазоны'],[/урн/,'Урны'],[/стол(?:\s|$|ик)/,'Столы'],[/качел/,'Качели'],[/навес|пергол|беседк|останов/,'Навесы, перголы и остановки'],[/огражден|забор/,'Ограждения'],[/стенд|информацион|указател/,'Навигация']];
  const head=n.split(/[«"(]/)[0].split(/\s(?:с|со|для|из|без)\s/)[0];
  for(const[re,c]of rules)if(re.test(head))return r(c,city);
  for(const[re,c]of rules)if(re.test(s))return r(c,city);
  return r('Другое',city);
 }
 if(/навес|веранд/.test(n+' '+s))return r('Навесы и веранды',child);
 if(/комплекс|городок|геокомплекс/.test(n+' '+s))return r('Игровые комплексы',child);
 if(/качалк.*пружин|пружин.*качалк/.test(n+' '+s))return r('Качалки на пружине',child);
 if(/балансир/.test(n+' '+s))return r('Балансиры',child);
 if(/качел/.test(n+' '+s))return r('Детские качели',child);
 if(/карусел/.test(n+' '+s))return r('Карусели',child);
 if(/песочниц|песк|водой|ручей/.test(n+' '+s))return r('Игры с песком и водой',child);
 if(/горк/.test(n+' '+s))return r('Горки',child);
 if(/батут/.test(n+' '+s))return r('Батуты',child);
 if(/лазал|лазани|скалодром|канатн/.test(n+' '+s))return r('Лазалки и скалодромы',child);
 if(/домик|шалаш/.test(n+' '+s))return r('Игровые домики',child);
 if(/развива|музык|бизиборд|переговор/.test(n+' '+s))return r('Развивающее оборудование',child);
 return r('Другие игровые элементы',child);
}
function parse(h,url){
 const article=h.match(/<article\b[^>]*id="node-(\d+)"[^>]*class="[^"]*node-product[\s\S]*?<\/article>/i);if(!article)return null;
 const main=article[0],id=article[1];
 let ld;for(const m of h.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)){try{const x=JSON.parse(m[1]);if(x['@type']==='Product'){ld=x;break;}}catch{}}
 const name=clean(h.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||ld?.name||'');if(!name)throw Error('No product name');
 const sku=ld?.sku||clean(h.match(/views-field-sku">[\s\S]*?<span class="field-content">([\s\S]*?)<\/span>/)?.[1])||null;
 const breadcrumb=h.match(/class="breadcrumb">([\s\S]*?)<\/div>/)?.[1]||'';
 const crumbs=[...breadcrumb.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map(m=>clean(m[1]));const sourceCategory=crumbs.slice(1).join(' / ');
 const specs={};for(const m of main.matchAll(/<div class="field field-name-[^"]*field-label-inline[^"]*">\s*<div class="field-label">([\s\S]*?)<\/div>\s*<div class="field-items">([\s\S]*?)<\/div><\/div>/g)){const k=clean(m[1]).replace(/[:\s]+$/,''),v=clean(m[2]);if(k&&v)specs[k]=v;}
 const materials=Object.entries(specs).filter(([k])=>/материал/i.test(k)).map(([,v])=>v);
 const dimensions=Object.entries(specs).filter(([k])=>/^(длина|ширина|высота|диаметр|глубина)$/.test(k.toLowerCase())).map(([k,v])=>k+': '+v).join('; ');
 const images=[...new Set((Array.isArray(ld?.image)?ld.image:ld?.image?[ld.image]:[...main.matchAll(/class="colorbox"[^>]*|<a\b[^>]*href="([^"]+)"[^>]*class="colorbox"/g)].map(m=>m[1]).filter(Boolean)).map(abs))];
 return {id:'robinzon-'+id,manufacturer:'Робинзон',manufacturerId:'robinzon',name,url,image:images[0]||'',images,sku,dimensions:dimensions||null,materials,description:[sourceCategory,dimensions,materials.length?'Материалы: '+materials.join(', '):''].filter(Boolean).join(' · '),sourceCategory,...classify(name,url,sourceCategory),price:null,specifications:specs,modelFormats:[...(/3D модел/.test(h)?['3D']:[]),...(/доступ к DWG/.test(h)?['DWG']:[])],modelsRequireLogin:/Зарегистрируйтесь чтобы получить доступ/.test(h),checkedAt:'2026-11-18'};
}
let xml;try{xml=await fs.readFile(work+'/sitemap.xml','utf8')}catch{xml=await fetch(origin+'/sitemap.xml').then(r=>r.text());await fs.writeFile(work+'/sitemap.xml',xml);}
const allUrls=[...new Set([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>decode(m[1])))];
const urls=allUrls.filter(u=>/^\/(detskie-ploshchadki|sportivnoe-oborudovanie|igrovye-elementy|malye-arhitekturnye-formy|geoplastika|kacheli|igrovye-kompleksy|gorki|pesochnicy|sportivnye-elementy|element-dlya-lazaniya|lazalki|tematicheskie-kompleksy|besedki|navesy|pergoly)\//.test(new URL(u).pathname));
async function checkpoint(final=false){
 const unique=[...new Map(products.map(p=>[p.id,p])).values()].sort((a,b)=>a.url.localeCompare(b.url));
 await fs.writeFile(path.join(root,'data/robinzon.json'),JSON.stringify(unique,null,2));
 await fs.writeFile(path.join(root,'data/robinzon-meta.json'),JSON.stringify({manufacturer:'Робинзон',url:origin,checkedAt:'2026-11-18',sitemapUrls:allUrls.length,discovered:urls.length,processed:done,count:unique.length,errors,excludedCount:excluded.length,excluded,complete:final,status:final?(errors.length?'Частичное покрытие':'Все найденные изделия'):'Сбор продолжается',note:'Включены отдельные страницы node-product. Цветовые варианты представлены отдельными карточками производителя; артикул сохранён с цветовым обозначением, когда оно указано. Категории и страницы подбора исключены. Модели DWG/3D требуют регистрации у производителя.'},null,2));
 await fs.writeFile(path.join(work,'progress.json'),JSON.stringify({done,total:urls.length,products:unique.length,errors:errors.length,complete:final}));
}
await checkpoint();
await Promise.all(Array.from({length:4},async()=>{while(next<urls.length){const url=urls[next++];try{const p=parse(await get(url),url);p?products.push(p):excluded.push(url);}catch(e){errors.push({url,error:e.message});}done++;if(done%50===0)await checkpoint();if(!process.argv.includes('--reparse'))await new Promise(r=>setTimeout(r,250));}}));
await checkpoint(true);console.log(JSON.stringify({products:products.length,errors:errors.length,excluded:excluded.length}));
