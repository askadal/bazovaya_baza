import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';
export async function openCatalogDB(filename,root){
 const db=new DatabaseSync(filename);db.exec('PRAGMA journal_mode = WAL');
 db.exec('CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY)');
 const dir=path.join(root,'drizzle'),files=(await fs.readdir(dir)).filter(n=>n.endsWith('.sql')).sort();
 for(const file of files){if(db.prepare('SELECT name FROM __local_migrations WHERE name=?').get(file))continue;db.exec(await fs.readFile(path.join(dir,file),'utf8'));db.prepare('INSERT INTO __local_migrations (name) VALUES (?)').run(file);}
 const binding={prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const result=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(result.changes)}};}};}};
 return{binding,db};
}
