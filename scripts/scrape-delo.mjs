// Import only the selected Delo models, not the manufacturer's entire furniture range.
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const cache=path.resolve(process.argv[2]||path.join(root,'.openai/delo-cache'));
const checkedAt='2026-11-20';
// Millimetres, transcribed from the dimension drawings on the corresponding product pages.
// The stool drawing gives width and height only; its depth is intentionally absent.
const selected=[
 ['yochair','Стул ЙО',530,540,790,450],
 ['yoarm','Стул ЙО с подлокотниками',530,540,790,450],
 ['yobar','Барный стул ЙО',565,540,920,750],
 ['yolounge','Кресло ЙО',665,680,625,370],
 ['kul','Стул КУЛ',530,680,795,450],
 ['nra','Стул НРА',400,475,700,450],
 ['nrabar','Барный стул НРА',400,475,1000,750],
 ['nrabarlow','Полубарный стул НРА',400,475,850,600],
 ['nrastool','Табурет НРА',400,null,450,450]
];
await fs.mkdir(cache,{recursive:true});
async function cached(file,url){
 const target=path.join(cache,file);
 try{return await fs.readFile(target);}catch(error){if(error.code!=='ENOENT')throw error;}
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`${url}: ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());await fs.writeFile(target,bytes);return bytes;
}
const decode=text=>text.replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const textOf=html=>decode(html.replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const attribute=(attributes,name)=>attributes.match(new RegExp(`\\b${name}=['"]([^'"]+)['"]`,'i'))?.[1];
const anchors=html=>[...html.matchAll(/<a\b([^>]+)>([\s\S]*?)<\/a>/g)].map(m=>({href:attribute(m[1],'href'),body:m[2],text:textOf(m[2])}));
const listing=anchors((await cached('chairs.html','https://delo-design.com/chairs')).toString('utf8'));
const imageDirectory=path.join(root,'dist/client/images/delo');await fs.mkdir(imageDirectory,{recursive:true});
const products=[];
for(const [slug,name,width,depth,height,seatHeight]of selected){
 const url='https://delo-design.com/'+slug,html=(await cached(slug+'.html',url)).toString('utf8');
 const text=textOf(html),isNra=slug.startsWith('nra');
 const matching=listing.filter(a=>a.href?.replace(/\/$/,'')===url);
 const imageCandidates=matching.map(a=>attribute(a.body,'data-original')).filter(Boolean);
 // One desktop catalog tile links to Yo but displays an upholstered Nra.
 // Use the separately verified mesh-back Yo photograph, not that mislabeled tile.
 const sourceImage=slug==='yoarm'?imageCandidates.find(image=>/\/yo_arms\.jpg$/.test(image)):imageCandidates[0];
 if(!sourceImage?.startsWith('https://static.tildacdn.com/'))throw Error('Missing selected image: '+slug);
 const priceLabel=matching.find(a=>a.text.includes('₽'))?.text||'';
 const price=Number(priceLabel.match(/([\d\s]+)\s*₽/)?.[1].replace(/\s/g,''))||null;
 const weight=text.match(/Вес:\s*([\d.,]+)\s*кг/)?.[1];
 const model=anchors(html).find(a=>a.text==='3D MODEL')?.href;
 const pageImages=[...new Set([...html.matchAll(/(?:data-original|src)=['"](https:\/\/[^'"]+)['"]/g)].map(m=>m[1]).filter(image=>!/-\/resize\/20x|\/js\/|\.js/.test(image)))];
 const paletteIndex=pageImages.indexOf('https://static.tildacdn.com/tild3761-6530-4335-b166-303438336139/Frame_4.png');
 const diagram=paletteIndex>0?pageImages[paletteIndex-1]:null;
 if(!weight||!model?.startsWith('https://disk.yandex.')||!diagram)throw Error('Incomplete manufacturer data: '+slug);
 const image='images/delo/'+slug+'.jpg';
 const bytes=await cached(slug+'-image.jpg',sourceImage);
 if(bytes[0]!==0xff||bytes[1]!==0xd8)throw Error('Expected the verified JPEG photograph: '+slug);
 await fs.writeFile(path.join(root,'dist/client',image),bytes);
 const dimensions=[`Ширина: ${width} мм`,depth?`Глубина: ${depth} мм`:null,`Высота: ${height} мм`,`Высота сиденья: ${seatHeight} мм`].filter(Boolean).join('; ');
 const frame=isNra?'Стальная труба Ø30 мм; порошковое полимерное покрытие.':'Стальная труба Ø18 мм и пруток Ø6 мм; цинкосодержащий грунт; порошковое полимерное покрытие.';
 const specifications={
  'Ширина':width+' мм',...(depth?{'Глубина':depth+' мм'}:{}),'Высота':height+' мм',
  'Высота сиденья':seatHeight+' мм','Каркас':frame,
  ...(isNra?{[slug==='nrastool'?'Сиденье':'Сиденье и спинка']:'Берёзовая фанера с эмалью и лаком.'}:{}),
  'Вес':weight+' кг','Цвет':'По каталогу RAL Classic'
 };
 products.push({
  id:'delo-'+slug,manufacturer:'Delo',manufacturerId:'delo',name,url,
  image,thumbnail:image,images:[sourceImage],sourceImage,
  sourceCategory:isNra?'Стулья и кресла / НРА':'Стулья и кресла / Уличная мебель',
  section:'Городская мебель',category:'Кресла и стулья',price,sku:null,dimensions,
  materials:isNra?['Сталь','Берёзовая фанера']:['Сталь'],
  description:isNra?'Модель серии НРА со стальным каркасом и фанерным сиденьем. Окраска каркаса и сиденья в один цвет.':'Уличная мебель Delo со стальным каркасом, цинкосодержащим грунтом и порошковой окраской.',
  specifications,files:[{name:'3D-модель',url:model},{name:'Габаритная схема',url:diagram}],checkedAt
 });
}
await fs.writeFile(path.join(root,'data/delo.json'),JSON.stringify(products,null,2)+'\n');
await fs.writeFile(path.join(root,'data/delo-meta.json'),JSON.stringify({
 checkedAt,count:products.length,errors:[],status:'Выбранные модели',
 note:'Четыре варианта ЙО, стул КУЛ и четыре НРА: обычный, барный, полубарный и табурет без мягких сидений. Фотографии НРА сверены со скриншотами; размеры — с чертежами производителя. Цветовые варианты не дублируются.',
 catalogUrl:'https://delo-design.com/chairs',selectedUrls:products.map(p=>p.url)
},null,2)+'\n');
console.log(JSON.stringify({manufacturer:'Delo',products:products.map(p=>({name:p.name,image:p.image,dimensions:p.dimensions}))}));
