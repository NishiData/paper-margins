import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..'),extension=join(root,'extension');
const manifest=JSON.parse(readFileSync(join(extension,'manifest.json'),'utf8'));
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
assert.equal(manifest.version,pkg.version,'Extension/package versions differ');
assert.equal(manifest.manifest_version,3);
for(const relative of [manifest.background.service_worker,...Object.values(manifest.icons),...manifest.content_scripts.flatMap(s=>s.js)])assert.ok(existsSync(join(extension,relative)),`Missing manifest asset: ${relative}`);
const html=readFileSync(join(extension,'reader.html'),'utf8');
for(const [,relative] of html.matchAll(/(?:src|href)="([^"]+)"/g))if(!/^(?:https?:|#)/.test(relative))assert.ok(existsSync(join(extension,relative)),`Missing HTML asset: ${relative}`);
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
for(const file of walk(extension).filter(p=>p.endsWith('.css')))for(const [,relative] of readFileSync(file,'utf8').matchAll(/url\(["']?([^\s)"']+)["']?\)/g))if(!relative.startsWith('data:'))assert.ok(existsSync(resolve(dirname(file),relative)),`Missing CSS asset: ${file}: ${relative}`);
for(const file of walk(extension).filter(p=>/\.(?:mjs|js)$/.test(p)&&!p.includes('/vendor/'))){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
assert.match(readFileSync(join(root,'README.md'),'utf8'),/GPT（ChatGPT \/ Codex）/);
console.log(`PASS: manifest, local assets, source syntax and GPT attribution (v${manifest.version}).`);
