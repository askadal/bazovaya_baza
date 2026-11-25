import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..');
const args=process.argv.slice(2),flag=args.indexOf('--module-root');
const moduleRoot=flag>=0?args.splice(flag,2)[1]:null;
const req=createRequire(moduleRoot?path.join(moduleRoot,'thumbnail-runtime.cjs'):import.meta.url);
const sharp=req('sharp');
const downloadUrls=JSON.parse(await fs.readFile(path.join(root,'data/image-download-urls.json'),'utf8').catch(()=>'{}'));
async function imageBytes(url){
 url=downloadUrls[url]||url;
 try{const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status);return Buffer.from(await r.arrayBuffer());}
 catch(error){
  if(!/(^|\.)kenguru\.pro$/.test(new URL(url).hostname))throw error;
  const dir=path.join(root,'../../work/thumbnail-fetch');await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,crypto.createHash('sha256').update(url).digest('hex')+'.bin');
  const q=s=>"'"+s.replace(/'/g,"''")+"'";
  const command='Invoke-WebRequest -UseBasicParsing -Uri '+q(url)+' -OutFile '+q(file)+' -TimeoutSec 30';
  await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,timeout:45000},e=>e?reject(e):resolve()));
  const b=await fs.readFile(file);await fs.unlink(file);return b;
 }
}
const ids=args.length?args:['novalur','punto','leber'];
const products=(await Promise.all(ids.map(async id=>JSON.parse(await fs.readFile(path.join(root,'data',id+'.json'),'utf8'))))).flat();
const urls=[...new Set(products.map(p=>p.image).filter(u=>/^https?:/.test(u)))];
const mapFile=path.join(root,'data/image-thumbnails.json');
const map=JSON.parse(await fs.readFile(mapFile,'utf8').catch(()=>'{}'));
const dest=path.join(root,'dist/client/thumbnails');
await fs.mkdir(dest,{recursive:true});
let next=0,done=0,downloaded=0;const failed=[];
const progress=path.join(root,'.openai/thumbnail-progress.json');
async function checkpoint(){await fs.writeFile(progress,JSON.stringify({done,total:urls.length,downloaded,failed:failed.length}));await fs.writeFile(mapFile,JSON.stringify(map));}
await checkpoint();
await Promise.all(Array.from({length:6},async()=>{
 while(next<urls.length){
  const url=urls[next++],name=crypto.createHash('sha256').update(url).digest('hex').slice(0,20)+'.jpg',file=/^thumbnails\/(?:[a-f0-9]{2}\/)?[a-f0-9]+\.jpg$/.test(map[url]||'')?path.join(root,'dist/client',map[url]):path.join(dest,name.slice(0,2),name);
  await fs.mkdir(path.dirname(file),{recursive:true});
  try{
   try{await fs.access(file);}catch{
    let success=false,last;
    for(let attempt=0;attempt<2&&!success;attempt++){
     try{const buf=await imageBytes(url);
      await sharp(buf,{limitInputPixels:60000000,failOn:'none'}).rotate().resize(240,180,{fit:'contain',background:'#fff'}).flatten({background:'#fff'}).jpeg({quality:76}).toFile(file);
      success=true;downloaded++;
     }catch(e){last=e;}
    }
    if(!success)throw last;
   }
   map[url]=path.relative(path.join(root,'dist/client'),file).split(path.sep).join('/');
  }catch(e){failed.push({url,error:e.message});}
  done++;if(done%100===0)await checkpoint();
 }
}));
await fs.writeFile(mapFile,JSON.stringify(map));
await fs.writeFile(path.join(root,'data/thumbnail-import-meta.json'),JSON.stringify({checkedAt:'2026-11-18',manufacturers:ids,total:urls.length,downloaded,failed},null,2));
await checkpoint();console.log(JSON.stringify({total:urls.length,downloaded,failed:failed.length}));
