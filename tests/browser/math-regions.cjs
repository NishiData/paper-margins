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
 fs.mkdirSync('artifacts',{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const ctx=await browser.newContext({viewport:{width:1500,height:1000},acceptDownloads:true});await ctx.addInitScript(shim);const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const d=await PDFDocument.create();d.registerFontkit(require('../../extension/vendor/fontkit/fontkit.umd.min.js'));
 const f=await d.embedFont(fs.readFileSync('extension/vendor/dejavu/DejaVuSans.ttf'));const pg=d.addPage([595,842]);
 pg.drawText('∫ f(x) dx = Σ α', {x:80,y:700,size:28,font:f});pg.drawText('a + b', {x:300,y:737,size:17,font:f});pg.drawLine({start:{x:295,y:730},end:{x:355,y:730}});pg.drawText('c', {x:320,y:710,size:17,font:f});
 await page.goto(url+'/reader.html');await page.locator('#pdf-input').setInputFiles({name:'math.pdf',mimeType:'application/pdf',buffer:Buffer.from(await d.save())});
 const frame=page.frameLocator('#pdf-viewer');await frame.locator('.pdf-page .textLayer span').first().waitFor();await page.locator('#area-mode').click();
 const select=async()=>{const b=await frame.locator('.pdf-page .area-layer').boundingBox();await page.mouse.move(b.x+b.width*.10,b.y+b.height*.10);await page.mouse.down();await page.mouse.move(b.x+b.width*.75,b.y+b.height*.22);await page.mouse.up();await page.waitForSelector('#selection-preview:not([hidden])');await page.locator('#selection-preview').evaluate(i=>i.decode());return page.locator('#selection-preview').getAttribute('src');};
 const clean=await select();assert.ok(clean.startsWith('data:image/png;base64,'));
 // Simulate a broken PDF character map. The canvas remains the authoritative glyph rendering.
 await frame.locator('.textLayer span').evaluateAll(xs=>xs.forEach(e=>e.textContent='■□\uFFFD\uE000'));
 const corrupted=await select();assert.equal(corrupted,clean,'PDF text codes must not affect the visual crop');assert.ok(!(await page.locator('#selection-excerpt').textContent()).includes('□'));
 const pixels=await page.locator('#selection-preview').evaluate(i=>{const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const g=c.getContext('2d');g.drawImage(i,0,0);const a=g.getImageData(0,0,c.width,c.height).data;let dark=0;for(let n=0;n<a.length;n+=4)if(a[n]<100&&a[n+1]<100&&a[n+2]<100&&a[n+3]>200)dark++;return {dark,width:c.width,height:c.height};});assert.ok(pixels.dark>300,JSON.stringify(pixels));
 await page.locator('#question').fill('この数式を説明して');await page.locator('#manual-add').click();await page.locator('#manual-answer').fill('画像の数式への注釈です');await page.locator('#save-manual').click();await page.waitForSelector('.note-card .selection-image');assert.equal(await page.locator('.note-card .selection-image').getAttribute('src'),clean);assert.equal(await page.locator('.note-card blockquote').count(),0);
 const manual=await page.evaluate(()=>window.__binds.find(m=>m.type==='ADD_MANUAL_TURN').note);assert.equal(manual.anchor.excerpt,'');assert.equal(manual.selectionImage.dataUrl,clean);
 const reference=await frame.locator('body').evaluate(async (element,anchor)=>{
  const app=PDFViewerApplication,pdfPage=await app.pdfDocument.getPage(1),view=app.pdfViewer.getPageView(0).viewport,vp=pdfPage.getViewport({scale:Math.max(1.5,view.scale),rotation:view.rotation});
  const [x1,y1,x2,y2]=view.convertToViewportRectangle(anchor.pdfRects[0]);const r={x:Math.min(x1,x2)/view.width,y:Math.min(y1,y2)/view.height,w:Math.abs(x2-x1)/view.width,h:Math.abs(y2-y1)/view.height};
  async function render(owner){const src=owner.createElement('canvas');src.width=Math.ceil(vp.width);src.height=Math.ceil(vp.height);await pdfPage.render({canvasContext:src.getContext('2d'),viewport:vp}).promise;const c=owner.createElement('canvas');c.width=Math.max(1,Math.round(src.width*r.w));c.height=Math.max(1,Math.round(src.height*r.h));c.getContext('2d').drawImage(src,src.width*r.x,src.height*r.y,src.width*r.w,src.height*r.h,0,0,c.width,c.height);return c.toDataURL('image/png');}
  return {correct:await render(document),wrongDocument:await render(parent.document)};
 },manual.anchor);
 assert.equal(clean,reference.correct,'Crop must match the PDF with its embedded fonts');assert.notEqual(clean,reference.wrongDocument,'Regression fixture must reproduce missing glyphs when canvas uses the parent document');

 await page.screenshot({path:'artifacts/math-region.png'});
 await page.locator('#ask').click();await page.waitForFunction(()=>window.__binds.some(m=>m.type==='BIND_CHAT'));const bind=await page.evaluate(()=>window.__binds.find(m=>m.type==='BIND_CHAT'));assert.equal(bind.note.selectionImage.dataUrl,clean);assert.equal(bind.note.anchor.excerpt,'');assert.ok(!bind.prompt.includes('■'));assert.ok(bind.prompt.includes('選択画像'));
 await page.reload();await frame.locator('.mark').first().waitFor();assert.equal(await page.locator('.note-card .selection-image').count(),2);assert.equal(await page.locator('.note-card .selection-image').first().getAttribute('src'),clean);
 assert.deepEqual(errors,[]);console.log('PASS: mathematical glyphs and fractions retain the same PNG despite broken text codes; preview, manual save, ChatGPT binding and reload retain image, omit corrupt excerpt.');
 }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exit(1)});
