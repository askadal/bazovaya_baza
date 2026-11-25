import {createHash} from 'node:crypto';
import {cp, readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';

const client = path.resolve(import.meta.dirname, '../dist/client');
const output = process.argv[2];
if (!output) throw new Error('Укажите папку для публикации GitHub Pages');

const [document, app, catalog, snapshot] = await Promise.all([
  readFile(path.join(client, 'index.html'), 'utf8'),
  readFile(path.join(client, 'app.js')),
  stat(path.join(client, 'catalog.json')),
  readFile(path.join(client, 'catalog-state.json'), 'utf8').then(JSON.parse),
]);
const scriptSource = /src="app\.js(?:\?[^"]*)?"/;
if (!document.includes('</head>') || !scriptSource.test(document) || !catalog.isFile() || !catalog.size || !snapshot.reactionIds || !snapshot.overrides) {
  throw new Error('В dist/client отсутствует точка входа или данные каталога');
}

const version = createHash('sha256').update(app).digest('hex').slice(0, 12);
const html = document.replace('</head>', '<meta name="catalog-runtime" content="static"></head>')
  .replace(scriptSource, `src="app.js?v=${version}"`);
await cp(client, output, {recursive: true, force: false, errorOnExist: true});
await writeFile(path.join(output, 'index.html'), html);
