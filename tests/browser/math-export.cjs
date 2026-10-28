const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const {PDFDocument,StandardFonts,PDFName,PDFArray}=require('pdf-lib');
const base=path.resolve('extension');
const server=http.createServer((req,res)=>{res.setHeader('Content-Security-Policy',"script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self';");const name=decodeURIComponent(req.url.split('?')[0]);const p=path.join(base,name);if(!p.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}try{const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.woff2':'font/woff2','.ttf':'font/ttf','.svg':'image/svg+xml','.gif':'image/gif','.png':'image/png','.json':'application/json','.ftl':'text/plain'};res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p));}catch{res.writeHead(404);res.end();}});
const shim=()=>{
 const listeners=[];window.__binds=[];
 const get=async keys=>{const d=JSON.parse(localStorage.getItem('pm-test-store')||'{}');if(!keys)return d;if(typeof keys==='string')return {[keys]:d[keys]};return Object.fromEntries(keys.map(k=>[k,d[k]]));};
 const set=async data=>{const d=await get(null),changes={};for(const [k,v] of Object.entries(data)){changes[k]={oldValue:d[k],newValue:v};d[k]=v;}localStorage.setItem('pm-test-store',JSON.stringify(d));listeners.forEach(l=>l(changes,'local'));};
 window.chrome={storage:{local:{get,set,remove:async k=>{const d=await get(null);delete d[k];localStorage.setItem('pm-test-store',JSON.stringify(d));listeners.forEach(l=>l({[k]:{}},'local'));}},onChanged:{addListener:l=>listeners.push(l)}},runtime:{sendMessage:async m=>{window.__binds.push(m);if(m.type==='BIND_CHAT'){await set({['pm:note:'+m.note.id]:m.note});return {ok:true};}if(m.type==='ADD_MANUAL_TURN'){const key='pm:note:'+m.note.id,n=(await get(key))[key]||m.note;n.turns.push(m.turn);await set({[key]:n});}if(m.type==='EDIT_NOTE'){const key='pm:note:'+m.id,n=(await get(key))[key];n.tags=m.tags;await set({[key]:n});}if(m.type==='IMPORT_NOTES')for(const n of m.notes)await set({['pm:note:'+n.id]:n});return {ok:true};}}};
};

async function main(){
 fs.mkdirSync('artifacts',{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const ctx=await browser.newContext({viewport:{width:1500,height:1000},acceptDownloads:true});await ctx.addInitScript(shim);const page=await ctx.newPage(),errors=[],remote=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(url)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))remote.push(r.url());});await page.goto(url+'/reader.html');
 const d=await PDFDocument.create();d.addPage([595,842]).drawText('ORIGINAL PAPER',{x:50,y:730});await page.locator('#pdf-input').setInputFiles({name:'math-export.pdf',mimeType:'application/pdf',buffer:Buffer.from(await d.save())});await page.frameLocator('#pdf-viewer').locator('.pdf-page canvas').waitFor();
 await page.evaluate(async()=>{const id=new URL(location.href).searchParams.get('paper');const answer=String.raw`資料に対して、\(X=BG\) とすると、場は \(M\) 上の \(G\) ゲージ場になります。
例えば \(M=S^1\) なら、束は円を一周したときのホロノミー \(g\in G\) で表せます。ゲージ変換では
\[
g\longmapsto hgh^{-1}
\]
となるため、同値類は共役類で分類されます。
有限群 \(G\) に対しても、\(BG\) は \(|G|\) 個の点からなる空間ではありません。
\[
\int_0^1 x^2\,dx=\frac{1}{3},\qquad A=\begin{pmatrix}a&b\\c&d\end{pmatrix},\qquad \alpha\in\mathbb{Z}
\]
インラインの分数 \(\frac{a+b}{c+d}\) も文章と重ならず、読めるようにします。
`;const n={id:'math',title:String.raw`分類空間 \(BG\) の説明`,docTitle:'math-export.pdf',anchor:{docId:id,page:1,rects:[{x:.1,y:.1,w:.5,h:.05}],excerpt:'Original paper'},tags:[],turns:[{id:'t',question:String.raw`\(BG\) とは？`,answer:answer+Array.from({length:35},(_,i)=>String.raw`続き ${i+1}：\(H_g=\operatorname{Hom}(I,gI)\) と \(\alpha_g\) を考えます。`).join('\n')+'\nEND_OF_ANSWER'}],createdAt:1,updatedAt:1};await chrome.storage.local.set({'pm:note:math':n});});await page.locator('.note-card').waitFor();
 const download=page.waitForEvent('download');await page.locator('#export-pdf').click();const saved=await download;await saved.saveAs('artifacts/math-export-qa.pdf');const out=await PDFDocument.load(fs.readFileSync('artifacts/math-export-qa.pdf'));assert.ok(out.getPageCount()>=3);const images=out.getPages().slice(1).reduce((sum,p)=>sum+(p.node.Resources().lookupMaybe(PDFName.of('XObject'),require('pdf-lib').PDFDict)?.keys().length||0),0);assert.ok(images>=10,images);
 // Bad formula errors stay visible instead of silently exporting raw LaTeX.
 const rejected=await page.evaluate(async()=>{const {renderExportMath}=await import('./export-math.mjs');try{await renderExportMath(String.raw`\notARealCommand{x}`);return false;}catch{return true;}});assert.equal(rejected,true);
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);console.log('PASS: inline/display math, fractions/matrices/symbols, long paginated answers, PDF math images and local-only rendering; invalid TeX fails explicitly.');
 }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exit(1)});
