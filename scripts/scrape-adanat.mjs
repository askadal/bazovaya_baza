import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const base='https://adanatgroup.ru';
const dir=path.resolve('data/cache-adanat');
fs.mkdirSync(dir,{recursive:true});
const clean=s=>(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/\s+/g,' ').trim();
const abs=u=>u?new URL(u,base).href:null;
const get=async u=>{const r=await fetch(u,{signal:AbortSignal.timeout(40000)});if(!r.ok)throw Error(`${r.status} ${u}`);return r.text()};
const stats={manufacturer:'Аданат',source:base,sitemap:base+'/sitemap.xml',checkedAt:'2026-11-16',candidates:0,imported:0,skipped:[],errors:[],notes:['Цены отсутствуют в открытых карточках.','Размеры и материалы относятся к опубликованному изделию; доступные варианты комплектации могут отличаться.','3D-файлы требуют входа на сайте производителя; они не скачивались.']};

function classify(url,name){
  if(url.includes('/detskoe-igrovoe-oborudovanie/'))return ['Детское оборудование','Детское оборудование'];
  if(url.includes('/sport/'))return ['Спортивное оборудование','Спортивное оборудование'];
  const m=[[/shezlongi|лежак|шезлонг/i,'Шезлонги'],[/ulichnye-skameiki|скам|стул|кресл/i,'Скамейки'],[/ulichnye-stoly|стол\b/i,'Столы'],[/urny-ulichnye|урна|пепельница/i,'Урны'],[/cacheli|качел/i,'Качели'],[/navesy-i-pergoly|навес|пергол|беседк/i,'Навесы и перголы'],[/veloparkovki|велопарков/i,'Велопарковки'],[/vazony-i-cvetochnicy|вазон|кашпо|цветочниц/i,'Кашпо и вазоны'],[/ograzhdeniya|огражден|столбик/i,'Ограждения'],[/светиль|освещен/i,'Освещение'],[/арт-объект|art-ob|скульптур/i,'Арт-объекты']];
  for(const [re,c]of m)if(re.test(url+' '+name))return [c,'Городская мебель'];
  return ['Другое',url.includes('/ulichnaya-mebel/')?'Городская мебель':'Другие изделия'];
}
function extract(url,html){
  const h=html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if(!h)return {skip:'Нет заголовка'};
  const name=clean(h[1]);
  const prod=html.match(/<h1[^>]*itemprop="name"[^>]*>/i);
  if(!prod)return {skip:'Категория или серия',name};
  const start=html.indexOf('<h1');
  const end=html.indexOf('<aside id="neighbors"');
  const body=html.slice(start,end>start?end:html.indexOf('</section>',start)+10);
  const sku=clean(body.match(/<span id="sku">([\s\S]*?)<\/span>/)?.[1])||null;
  if(/^Серия\b/.test(name)&&!sku)return {skip:'Серия, не отдельное изделие',name};
  const id=body.match(/id="good_(\d+)"/)?.[1]||crypto.createHash('sha1').update(url).digest('hex').slice(0,12);
  const mainPicture=body.match(/<picture\b[^>]*>[\s\S]*?<\/picture>/)?.[0]||'';
  const imageTag=body.match(/<img\b[^>]*itemprop="image"[^>]*>/)?.[0];
  let image=abs(mainPicture.match(/srcset="([^"]+)"[^>]*data-device="XXL"/)?.[1]||imageTag?.match(/src="([^"]+)"/)?.[1]);
  if(!image||/nophoto|logo/.test(image))image=abs(body.match(/<a href="([^"]+)" class="lightbox"/)?.[1]);
  const paramsBlock=body.match(/<div class="params"[\s\S]*?<\/ul>/)?.[0]||'';
  const params=Object.fromEntries([...paramsBlock.matchAll(/<li>\s*<span>([\s\S]*?)<\/span>\s*<span>([\s\S]*?)<\/span>/g)].map(x=>[clean(x[1]),clean(x[2])]));
  const dimensions=['Длина','Ширина','Высота'].map(k=>params[k]?`${k}: ${params[k]}`:null).filter(Boolean).join('; ')||null;
  const description=clean(body.match(/<div class="text" itemprop="description">([\s\S]*)/)?.[1]);
  const config=clean(body.match(/<div class="config"[\s\S]*?<\/form>/)?.[0]);
  const matText=description+' '+config;
  const materials=[];
  for(const [re,label] of [[/сталь|стали|стальн/i,'Сталь'],[/алюмини/i,'Алюминий'],[/чугун/i,'Чугун'],[/бетон/i,'Бетон'],[/сосн/i,'Сосна'],[/лиственниц/i,'Лиственница'],[/фанер/i,'Фанера'],[/HPL|HРL/i,'HPL'],[/HDPE/i,'HDPE'],[/канат/i,'Канат'],[/нержавеющ/i,'Нержавеющая сталь'],[/полиэтилен/i,'Полиэтилен'],[/резин/i,'Резина'],[/стеклопластик/i,'Стеклопластик']])if(re.test(matText))materials.push(label);
  if(!materials.some(x=>['Сосна','Лиственница','Фанера'].includes(x))&&/древесин|деревян/i.test(matText))materials.push('Дерево');
  const breadcrumbs=[...html.slice(0,start).matchAll(/<span itemprop="name">([\s\S]*?)<\/span>/g)].map(x=>clean(x[1])).filter(Boolean);
  const sourceCategory=breadcrumbs.filter(x=>x!==name&&x!=='Вся продукция'&&x!=='Главная').join(' / ');
  const [category,section]=classify(url,name);
  const priceMatch=body.match(/itemprop="price"[^>]*content="([\d.]+)"/);
  const currency=body.match(/itemprop="priceCurrency"[^>]*content="([^"]+)"/)?.[1];
  const price=priceMatch&&currency==='RUB'&&+priceMatch[1]>0?+priceMatch[1]:null;
  const formats=[...body.matchAll(/download="[^"]+\.(dwg|max|obj|stl|skp|fbx|3ds)"/gi)].map(x=>x[1].toUpperCase());
  return {product:{id:'adanat-'+id,manufacturer:'Аданат',manufacturerId:'adanat',name,url,image,images:image?[image]:[],sourceCategory,category,section,price,priceNote:price?'Опубликованная цена производителя':'Цена по запросу',sku,dimensions,materials,description:materials.length?'Материалы по карточке производителя: '+materials.join(', ')+'.':'',checkedAt:'2026-11-16',specifications:params,modelFormats:[...new Set(formats)],modelsRequireLogin:formats.length>0}};
}

const sitemapFile=path.join(dir,'sitemap.xml');
const sitemap=fs.existsSync(sitemapFile)?fs.readFileSync(sitemapFile,'utf8'):await get(base+'/sitemap.xml');
fs.writeFileSync(sitemapFile,sitemap);
const urls=[...new Set([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]).filter(u=>u.startsWith(base+'/katalog/')&&!u.includes('/seo_filter/')&&!u.includes('/label/')&&!u.includes('?')))];
stats.candidates=urls.length;
let pointer=0,completed=0;
const records=[];
async function worker(){while(pointer<urls.length){const url=urls[pointer++];const key=crypto.createHash('sha1').update(url).digest('hex');const file=path.join(dir,key+'.json');try{let result;if(fs.existsSync(file))result=JSON.parse(fs.readFileSync(file,'utf8'));else {result=extract(url,await get(url));fs.writeFileSync(file,JSON.stringify(result));await new Promise(r=>setTimeout(r,90));}if(result.product)records.push(result.product);else stats.skipped.push({url,...result});}catch(e){stats.errors.push({url,error:e.message});}completed++;if(completed%100===0){console.log(`${completed}/${urls.length}; products ${records.length}; errors ${stats.errors.length}`);save();}}}
function save(){const dedupe=[...new Map(records.map(x=>[x.id,x])).values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'));stats.imported=dedupe.length;stats.completed=completed;stats.totalProductPages=records.length;stats.priceCount=dedupe.filter(x=>x.price!==null).length;stats.withImage=dedupe.filter(x=>x.image).length;stats.withDimensions=dedupe.filter(x=>x.dimensions).length;stats.withMaterials=dedupe.filter(x=>x.materials.length).length;fs.writeFileSync('data/adanat.json',JSON.stringify(dedupe,null,2));fs.writeFileSync('data/adanat-meta.json',JSON.stringify(stats,null,2));}
await Promise.all(Array.from({length:4},worker));save();console.log(JSON.stringify({candidates:stats.candidates,imported:stats.imported,skipped:stats.skipped.length,errors:stats.errors.length,prices:stats.priceCount,images:stats.withImage,dimensions:stats.withDimensions,materials:stats.withMaterials}));
