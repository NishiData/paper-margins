const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const {PDFDocument,StandardFonts,PDFName,PDFArray}=require('pdf-lib');
const base=path.resolve('extension');
const server=http.createServer((req,res)=>{const name=decodeURIComponent(req.url.split('?')[0]);const p=path.join(base,name);if(!p.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}try{const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.woff2':'font/woff2','.ttf':'font/ttf','.svg':'image/svg+xml','.gif':'image/gif','.png':'image/png','.json':'application/json','.ftl':'text/plain'};res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p));}catch{res.writeHead(404);res.end();}});
const shim=()=>{
 const listeners=[];window.__binds=[];
 const get=async keys=>{const d=JSON.parse(localStorage.getItem('pm-test-store')||'{}');if(!keys)return d;if(typeof keys==='string')return {[keys]:d[keys]};return Object.fromEntries(keys.map(k=>[k,d[k]]));};
 const set=async data=>{const d=await get(null),changes={};for(const [k,v] of Object.entries(data)){changes[k]={oldValue:d[k],newValue:v};d[k]=v;}localStorage.setItem('pm-test-store',JSON.stringify(d));listeners.forEach(l=>l(changes,'local'));};
 window.chrome={storage:{local:{get,set,remove:async k=>{const d=await get(null);delete d[k];localStorage.setItem('pm-test-store',JSON.stringify(d));listeners.forEach(l=>l({[k]:{}},'local'));}},onChanged:{addListener:l=>listeners.push(l)}},runtime:{sendMessage:async m=>{window.__binds.push(m);if(m.type==='BIND_CHAT'){await set({['pm:note:'+m.note.id]:m.note});return {ok:true};}if(m.type==='ADD_MANUAL_TURN'){const key='pm:note:'+m.note.id,n=(await get(key))[key]||m.note;n.turns.push(m.turn);await set({[key]:n});}if(m.type==='EDIT_NOTE'){const key='pm:note:'+m.id,n=(await get(key))[key];n.tags=m.tags;await set({[key]:n});}if(m.type==='IMPORT_NOTES')for(const n of m.notes)await set({['pm:note:'+n.id]:n});return {ok:true};}}};
};

async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const ctx=await browser.newContext({viewport:{width:1500,height:1000}});await ctx.addInitScript(shim);const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/reader.html');
 const d=await PDFDocument.create();d.addPage([595,842]).drawText('SHELF TOGGLE');await page.locator('#pdf-input').setInputFiles({name:'shelf.pdf',mimeType:'application/pdf',buffer:Buffer.from(await d.save())});await page.frameLocator('#pdf-viewer').locator('.pdf-page canvas').waitFor();
 const original=await page.locator('#pdf-viewer').boundingBox();await page.locator('#close-shelf').click();assert.equal(await page.locator('#papers-panel').isVisible(),false);assert.equal(await page.locator('#toggle-shelf').getAttribute('aria-expanded'),'false');await page.waitForTimeout(250);assert.ok((await page.locator('#pdf-viewer').boundingBox()).width>original.width+150);
 await page.reload();await page.frameLocator('#pdf-viewer').locator('.pdf-page canvas').waitFor();assert.equal(await page.locator('#papers-panel').isVisible(),false);await page.locator('#toggle-shelf').click();assert.ok(await page.locator('.paper-entry').isVisible());await page.reload();await page.frameLocator('#pdf-viewer').locator('.pdf-page canvas').waitFor();assert.ok(await page.locator('#papers-panel').isVisible());
 for(const width of [1500,980,700,500])for(const compact of [false,true]){
  await page.setViewportSize({width,height:1000});await page.evaluate(c=>document.body.classList.toggle('compact',c),compact);
  for(const notesOpen of [false,true]){
   if(await page.locator('#notes-panel').isVisible()!==notesOpen)await page.locator('#toggle-notes').click();
   if(!await page.locator('#papers-panel').isVisible())await page.locator('#toggle-shelf').click();
   assert.equal(await page.locator('#toggle-shelf').getAttribute('aria-expanded'),'true');
   const rects=await page.evaluate(()=>['#papers-panel','#pdf-viewer','#notes-panel'].filter(s=>getComputedStyle(document.querySelector(s)).display!=='none').map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {s,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
   for(let i=0;i<rects.length;i++){const a=rects[i];assert.ok(a.x>=0&&a.right<=width+1&&a.bottom<=1001,JSON.stringify({width,compact,notesOpen,a}));for(const b of rects.slice(i+1)){const overlap=Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));assert.equal(overlap,0,JSON.stringify({width,compact,notesOpen,a,b}));}}
   await page.locator('#close-shelf').click();assert.equal(await page.locator('#papers-panel').isVisible(),false);assert.equal(await page.evaluate(()=>document.scrollingElement.scrollHeight>innerHeight),false);
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS: shelf close/reopen, PDF gains width, reload persistence, notes and shelf stay docked at wide/narrow widths in normal/compact layouts.');
 }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exit(1)});
