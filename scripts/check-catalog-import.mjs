import {sportGame,tennisTable} from './classify-sports.mjs';
import {canonicalCategory} from '../shared/catalog-rules.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),data=JSON.parse(await fs.readFile(new URL('dist/client/catalog.json',root),'utf8'));
const sources=JSON.parse(await fs.readFile(new URL('data/sources.json',root),'utf8'));
assert.equal(data.sources.length,sources.length);
assert.equal(new Set(data.products.map(p=>p.id)).size,data.products.length);
for(const source of sources){
 const raw=JSON.parse(await fs.readFile(new URL('data/'+source.id+'.json',root),'utf8'));
 const expected=new Set(raw.map(p=>p.id));const rows=data.products.filter(p=>p.manufacturerId===source.id);
 assert.equal(rows.length,expected.size,source.id);
 for(const p of rows){assert.ok(expected.has(p.id));assert.ok(p.name&&p.category&&p.section,p.id);assert.ok(/^https?:/.test(p.url),p.id);assert.ok(Array.isArray(p.materials)&&Array.isArray(p.materialGroups),p.id);if(p.thumbnail)await fs.access(new URL('dist/client/'+p.thumbnail,root));}
}
const dog=data.products.filter(p=>/собак|собач|аджилити|agility/i.test(p.sourceCategory||''));
assert.ok(dog.every(p=>p.section==='Другие изделия'&&p.category==='Площадки для собак'));
assert.equal(data.products.filter(p=>p.category==='Навесы, перголы и остановки'&&/велопарк|велосипед/i.test(p.name+' '+p.sourceCategory)).length,0);
assert.ok(data.products.some(p=>p.section==='Детское оборудование'&&p.category==='Навесы и веранды'));
assert.ok(data.products.filter(p=>p.manufacturerId==='newhorizons').every(p=>p.url.startsWith('https://www.newhorizons.ru/catalog/igrovye-prostranstva-dlya-ulitsy/')));
assert.equal(data.products.filter(p=>/^парклет/i.test(p.name)&&p.category!=='Парклеты').length,0);
const sportsNames=data.categoryOrder['Спортивное оборудование'];
assert.ok(sportsNames.includes('Теннисные столы'));
assert.equal(sportsNames[0],'Воркаут-комплексы');assert.equal(sportsNames[1],'Турники');assert.ok(!sportsNames.includes('Баскетбольный щит'));
assert.ok(!data.products.some(p=>p.section==='Спортивное оборудование'&&p.category==='Баскетбольный щит'));
assert.ok(data.products.filter(p=>p.category==='Игровое спортивное оборудование').every(p=>sportGame(p)&&!tennisTable(p)));
assert.ok(data.products.filter(p=>p.section==='Спортивное оборудование'&&tennisTable(p)).every(p=>p.category==='Теннисные столы'));
assert.ok(data.products.filter(p=>p.section==='Спортивное оборудование'&&/^(?:баскетбол|стойка баскетбол|щит баскетбол)/i.test(p.name)).every(p=>p.category==='Игровое спортивное оборудование'));
assert.ok(data.products.some(p=>p.category==='Воркаут-комплексы'));
assert.ok(data.products.filter(p=>p.section==='Спортивное оборудование').every(p=>sportsNames.includes(p.category)));
assert.ok(data.products.every(p=>['Городская мебель','Детское оборудование','Спортивное оборудование','Другие изделия'].includes(p.section)));
const ropes=data.products.filter(p=>p.manufacturerId==='kenguru'&&/канатные игровые комплексы/i.test(p.sourceCategory));assert.equal(ropes.length,36);assert.ok(ropes.every(p=>p.section==='Детское оборудование'&&p.category==='Лазалки и скалодромы'));
const music=JSON.parse(await fs.readFile(new URL('data/music-classification.json',root),'utf8'));const byId=new Map(data.products.map(p=>[p.id,p]));for(const id of music.includeIds)assert.equal(byId.get(id)?.category,'Музыкальное оборудование',id);for(const id of music.excludeIds)assert.notEqual(byId.get(id)?.category,'Музыкальное оборудование',id);
for(const [id,category]of Object.entries({'punto-1372':'Игровое спортивное оборудование','punto-1680':'Брусья','punto-1224':'Турники','taiga-2442':'Шведская стенка','taiga-2434':'Кольца','detkki-419':'Рукоходы'}))assert.equal(byId.get(id)?.category,category,id);
assert.equal(sportsNames.filter(c=>c==='Рукоходы').length,1);assert.ok(sportsNames.includes('Скамьи для упражнений'));
assert.ok(data.products.every(p=>canonicalCategory(p.category)===p.category));
const checked=JSON.parse(await fs.readFile(new URL('data/category-overrides.json',root),'utf8'));for(const [id,c]of Object.entries(checked)){assert.ok(byId.has(id),id);assert.equal(byId.get(id).section,c.section,id);assert.equal(byId.get(id).category,canonicalCategory(c.category),id);}
console.log(JSON.stringify({products:data.products.length,manufacturers:data.sources.length,sources:data.sources.map(s=>({name:s.name,count:s.count})),dogs:dog.length,childShelters:data.products.filter(p=>p.category==='Навесы и веранды').length}));
