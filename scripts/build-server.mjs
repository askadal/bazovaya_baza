import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),client=path.join(root,'dist/client'),server=path.join(root,'dist/server');
const data=JSON.parse(await fs.readFile(path.join(client,'catalog.json'),'utf8'));
const taxonomy={};for(const section of ['Городская мебель','Детское оборудование','Спортивное оборудование','Другие изделия']){
 const cats=[...new Set(data.products.filter(p=>p.section===section).map(p=>p.category))],order=data.categoryOrder?.[section]||[];
 cats.sort((a,b)=>(order.includes(a)?order.indexOf(a):999)-(order.includes(b)?order.indexOf(b):999)||a.localeCompare(b,'ru'));taxonomy[section]=cats;
}
const locations=[],locationMap=new Map();const products=data.products.map(p=>{const key=p.section+'\n'+p.category;if(!locationMap.has(key)){locationMap.set(key,locations.length);locations.push([p.section,p.category]);}return[p.id,locationMap.get(key)];});
const index={locations,products,taxonomy};
const adminUI=await fs.readFile(path.join(root,'worker/admin-ui.js'),'utf8');
const entry=[
 "import {createGithubCatalog} from '../../worker/github-worker.mjs';",
 'export default createGithubCatalog('+JSON.stringify(index)+','+JSON.stringify(adminUI)+');',
 '',
].join('\n');
await fs.mkdir(server,{recursive:true});
await fs.writeFile(path.join(server,'index.js'),entry);
console.log(JSON.stringify({products:products.length,entryBytes:Buffer.byteLength(entry),sections:Object.keys(taxonomy).length}));
