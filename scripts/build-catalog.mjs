import {musicType} from './classify-music.mjs';
import {canonicalCategory,categoryAliases} from '../shared/catalog-rules.mjs';

import fs from 'node:fs/promises';
import path from 'node:path';
import {primaryCategory} from './classify-primary.mjs';
import {requestedCategory} from './classify-requested.mjs';
import {sportsCategories,refineSportType} from './classify-sports.mjs';
const root=path.resolve(import.meta.dirname,'..');
const thumbnails=JSON.parse(await fs.readFile(path.join(root,'data/image-thumbnails.json'),'utf8').catch(()=>'{}'));
const sourceConfig=JSON.parse(await fs.readFile(path.join(root,'data/sources.json'),'utf8'));
const ids=sourceConfig.map(s=>s.id);
const reviewed=JSON.parse(await fs.readFile(path.join(root,'data/category-overrides.json'),'utf8'));
const musicConfig=JSON.parse(await fs.readFile(path.join(root,'data/music-classification.json'),'utf8'));
const entries=[],sources=[];
for(const id of ids){
 const a=JSON.parse(await fs.readFile(path.join(root,'data',id+'.json'),'utf8'));
 const m=JSON.parse(await fs.readFile(path.join(root,'data',id+'-meta.json'),'utf8'));
 const config=sourceConfig.find(s=>s.id===id);
 const errors=Array.isArray(m.errors)?m.errors.length:Number(m.errors)||0;
 const status=config.status||m.status||(errors?'Частичное покрытие':'Все найденные изделия');
 const note=config.note||m.note||(id==='mafmarket'?'Карточки отдельных моделей извлечены из серий. '+errors+' страниц серий недоступны; это не полный ассортимент производителя.':'Изделия собраны из каталога производителя.');
 sources.push({...config,count:a.length,status,note,checkedAt:m.checkedAt||m.updatedAt||null});
 for(const v of a){
  const p={...v};
  if(p.price===0)p.price=null;
  p.materials=Array.isArray(p.materials)?p.materials:[];
  p.materialGroups=[];
  const text=p.materials.join(' ').toLowerCase();
  const rules=[['Дерево',/дерев|древес|листвен|сосн|робин|дуб|ясен|брус|фанер/],['Металл',/металл|сталь|стальн|алюмин|чугун/],['Бетон',/бетон/],['Пластик',/пластик|hdpe|полиэтилен|полимер/],['HPL',/hpl/],['ДПК',/дпк|древесно.полимер/],['Канат',/канат|веревк|верёвк/],['Стекло',/стекл/],['Камень',/камень|гранит|мрамор/]];
  for(const [label,re]of rules)if(re.test(text))p.materialGroups.push(label);
  const n=p.name.toLowerCase(),s=(p.sourceCategory||'').toLowerCase();
  if(p.section==='Городская мебель'){
    if(/шезлонг|лежак/.test(n))p.category='Шезлонги';
    else if(/скам|скаме|диван|банкет/.test(n))p.category='Скамейки';
    else if(/кресл|стул|стуль|табурет|пуф/.test(n))p.category='Кресла и стулья';
    else if(/урн|пепельниц/.test(n))p.category='Урны';
    else if(/навес|пергол|беседк/.test(n))p.category='Навесы и перголы';
    else if(/велопарк|велостойк/.test(n))p.category='Велопарковки';
    else if(/кашпо|вазон|цветочниц/.test(n))p.category='Кашпо и вазоны';
    else if(/качел/.test(n))p.category='Качели';
    else if(/стол(?:\s|$|«)|столик/.test(n))p.category='Столы';
    if(/реш[её]тк/.test(s))p.category='Приствольные решётки';
    if(/навигац/.test(s))p.category='Навигация';
    if(/остановк/.test(s))p.category='Остановки';
  } else if(p.section==='Детское оборудование'){
    if(/качалк.*пружин|пружин.*качалк/.test(n+' '+s))p.category='Качалки на пружине';
    else if(/балансир/.test(n+' '+s))p.category='Балансиры';
    else if(/качел/.test(n+' '+s))p.category='Детские качели';
    else if(/карусел/.test(n+' '+s))p.category='Карусели';
    else if(/песоч|игр[ыа] с песком|песочниц|игр[ыа] с водой/.test(n+' '+s))p.category='Игры с песком и водой';
    else if(/горк/.test(n)&&!/комплекс|башн/.test(n))p.category='Горки';
    else if(/батут/.test(n+' '+s))p.category='Батуты';
    else if(/скалодром|лазал|канатн.*комплекс/.test(n+' '+s))p.category='Лазалки и скалодромы';
    else if(/домик/.test(n))p.category='Игровые домики';
    else if(/музык|научн|интерактив|обучение/.test(s))p.category='Развивающее оборудование';
    else if(/игровой комплекс|игровые комплекс|игровая башня|игровые башни/.test(n+' '+s))p.category='Игровые комплексы';
    else p.category='Другие игровые элементы';
  } else if(p.section==='Спортивное оборудование'){
    if(/теннис/.test(n+' '+s))p.category='Теннисные столы';
    else if(/тренаж/.test(n+' '+s))p.category='Уличные тренажёры';
    else if(/воркаут|workout|турник|брусь|рукоход/.test(n+' '+s))p.category='Воркаут';
    else if(/паркур/.test(s))p.category='Паркур';
    else p.category='Другое спортивное оборудование';
  }
  // Keep benches and art objects together in the urban catalog, including seasonal designs.
  if(p.section==='Другие изделия'){
    const art=p.category==='Арт-объекты'||/арт[ -]?объект/i.test(p.name+' '+p.sourceCategory);
    const bench=p.category==='Скамейки'||/(?:^|[^а-яё])(?:скам(?:ь|е)|лавоч|лавк)/i.test(p.name);
    if(art||bench){p.section='Городская мебель';p.category=art?'Арт-объекты':'Скамейки';}
  }
  if(p.section==='Другие изделия'&&['Качели','Кашпо и вазоны','Ограждения','Остановки'].includes(p.category))p.section='Городская мебель';
  if(p.section==='Городская мебель'&&['Парклеты','Подиумы'].includes(p.category))p.section='Другие изделия';
  if(['Остановки','Навесы и перголы'].includes(p.category))p.category='Навесы, перголы и остановки';
  // New importers already classify from the product type and source hierarchy.
  if(!['megapolis','aira','mafmarket','adanat'].includes(id)){p.category=v.category;p.section=v.section;}
  else {const primary=primaryCategory(v);if(primary)Object.assign(p,primary);}
  if(['igratex','richter','robinzon','detkki','kenguru','shelby','newhorizons','taiga'].includes(id)){
   const before={section:p.section,category:p.category};
   const normalized={...p,name:p.name.replace(/\s[cс]\s/g,' с ')};
   const principal=primaryCategory(normalized);if(principal)Object.assign(p,principal);
   const head=normalized.name.toLowerCase().replace(/ё/g,'е').split(/[«"“(]/)[0].split(/\s(?:с|со|для|из|на|под|без)\s/)[0];
   if(before.category==='Навесы и веранды'&&/навес|веранд|беседк|террас/.test(head))Object.assign(p,before);
   if(/балансовый комплекс/.test(head))Object.assign(p,before);
   if(/^(?:игровой |детский |спортивно-игровой )?комплекс/.test(head)&&before.section==='Детское оборудование')p.category='Игровые комплексы';
   if(/ди-джей/.test(head)){p.section='Детское оборудование';p.category='Развивающее оборудование';}
   if(/остановка/.test(head)&&/автогород/i.test(p.sourceCategory)){p.section='Детское оборудование';p.category='Другие игровые элементы';}
   if(/^качели (?:детские|гнездо)/.test(head)){p.section='Детское оборудование';p.category='Детские качели';}
   if(/терраса/.test(head)&&/для детского сада/i.test(p.sourceCategory)){p.section='Детское оборудование';p.category='Навесы и веранды';}
  }
  const requested=requestedCategory(p);if(requested)Object.assign(p,requested);
  const music=musicType(p,musicConfig);if(music)Object.assign(p,music);
  if(reviewed[p.id]){p.section=reviewed[p.id].section;p.category=reviewed[p.id].category;}
  const refined=refineSportType(p,reviewed[p.id]);if(refined)Object.assign(p,refined);
  p.category=canonicalCategory(p.category);
  if(thumbnails[p.image])p.thumbnail=thumbnails[p.image];
  entries.push(p);
 }
}
const sectionRank={'Городская мебель':0,'Детское оборудование':1,'Спортивное оборудование':2,'Другие изделия':3};
const catOrder=['Скамейки','Шезлонги','Кресла и стулья','Столы','Урны','Качели','Навесы, перголы и остановки','Кашпо и вазоны','Велопарковки'];
const buckets=new Map();for(const p of entries){const k=p.section+'|'+p.category;if(!buckets.has(k))buckets.set(k,new Map(ids.map(id=>[id,[]])));buckets.get(k).get(p.manufacturerId).push(p);}
const ordered=[...buckets].sort(([ka],[kb])=>{const [sa,ca]=ka.split('|'),[sb,cb]=kb.split('|');const rank=(c,s)=>s==='Спортивное оборудование'&&sportsCategories.includes(c)?sportsCategories.indexOf(c):/^Друг(?:ое|ие)/.test(c)?1000:catOrder.includes(c)?catOrder.indexOf(c):99;return sectionRank[sa]-sectionRank[sb]||rank(ca,sa)-rank(cb,sb)||ca.localeCompare(cb,'ru');});
let products=[];
for(const [,b]of ordered){for(const a of b.values())a.sort((a,b)=>Number(!!b.image)-Number(!!a.image)||a.name.localeCompare(b.name,'ru'));let i=0;while(ids.some(id=>b.get(id)[i])){for(const id of ids){if(b.get(id)[i])products.push(b.get(id)[i]);}i++;}}
const seen=new Set();products=products.filter(p=>{if(seen.has(p.id))return false;seen.add(p.id);return true;});
for(const s of sources)s.count=products.filter(p=>p.manufacturerId===s.id).length;
await fs.mkdir(path.join(root,'dist/client'),{recursive:true});
await fs.writeFile(path.join(root,'dist/client/catalog.json'),JSON.stringify({updatedAt:'2026-11-20',categoryAliases,categoryOrder:{'Спортивное оборудование':sportsCategories},sources,products}));
console.log(JSON.stringify({count:products.length,sources:sources.map(s=>({name:s.name,count:s.count})),prices:products.filter(p=>p.price>0).length}));
