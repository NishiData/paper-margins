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
 try {
 const ctx=await browser.newContext({viewport:{width:1550,height:1050}});await ctx.addInitScript(shim);
 // No external service is contacted when testing outbound citation links.
 await ctx.route('https://citation.example/**',route=>route.fulfill({contentType:'text/html',body:'Citation target'}));
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
 await page.goto(url+'/reader.html');const frame=page.frameLocator('#pdf-viewer');
 const source=await PDFDocument.create(),first=source.addPage([595,842]),refs=source.addPage([595,842]);
 first.drawText('Text citation [1] and external [2]',{x:50,y:740,size:15});
 first.drawText('Image citation [3] and external [4]',{x:50,y:620,size:15});
 refs.drawText('Bibliography',{x:50,y:740,size:20});
 const add=(rect,target)=>{const a=source.context.obj({Type:'Annot',Subtype:'Link',Rect:rect,Border:[0,0,0],...target});const ref=source.context.register(a);first.node.addAnnot(ref);};
 for(const y of [740,620]){
  add([135,y-3,165,y+16],{Dest:[refs.ref,PDFName.of('Fit')]});
  add([250,y-3,280,y+16],{A:{S:'URI',URI:require('pdf-lib').PDFString.of('https://citation.example/'+y)}});
 }
 await page.locator('#pdf-input').setInputFiles({name:'citations.pdf',mimeType:'application/pdf',buffer:Buffer.from(await source.save())});
 const link=(n)=>frame.locator('.pdf-page[data-page="1"] .linkAnnotation a').nth(n);
 await link(0).waitFor();
 const goto=async n=>{await page.locator('#prev').click();await page.waitForFunction(n=>document.querySelector('#page-number').value===String(n),n,{timeout:3000});};
 const followInternal=async n=>{await link(n).scrollIntoViewIfNeeded();const box=await link(n).boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.waitForFunction(()=>document.querySelector('#page-number').value==='2',null,{timeout:3000});await goto(1);};
 const followExternal=async n=>{const opened=ctx.waitForEvent('page');await link(n).scrollIntoViewIfNeeded();const box=await link(n).boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);const tab=await opened;await tab.waitForLoadState();assert.match(tab.url(),/^https:\/\/citation\.example\//);await tab.close();};
 await followInternal(0);await followExternal(1);
 // Save a real text selection spanning both citation links.
 await frame.locator('.pdf-page[data-page="1"] .textLayer span').filter({hasText:'Text citation'}).evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);e.closest('.pdf-page').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
 const save=async title=>{await page.locator('#question').fill(title);await page.locator('#manual-add').click();await page.locator('#manual-answer').fill('Saved answer');await page.locator('#save-manual').click();};
 await save('Text citation note');await frame.locator('.mark').first().waitFor();
 await followInternal(0);await followExternal(1);
 // Save an image selection enclosing both links, using the actual drag gesture.
 await page.locator('#area-mode').click();
 const area=await frame.locator('.pdf-page[data-page="1"] .area-layer').boundingBox();
 const b=await link(2).boundingBox(),last=await link(3).boundingBox();
 await page.mouse.move(area.x+30,b.y-15);await page.mouse.down();await page.mouse.move(last.x+last.width+50,b.y+b.height+20,{steps:8});await page.mouse.up();
 await page.locator('#selection-preview:not([hidden])').waitFor();await save('Image citation note');
 await followInternal(2);await followExternal(3);
 // A drag that starts on a citation selects an image instead of following it.
 const target=await link(2).boundingBox(),x=target.x+target.width/2,y=target.y+target.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+80,y+35,{steps:6});await page.mouse.up();
 assert.equal(await page.locator('#page-number').inputValue(),'1');await page.locator('#selection-preview:not([hidden])').waitFor();
 // Moving out and back is still a drag, and Escape-style cancellation never follows a link.
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+30,y+15);await page.mouse.move(x,y);await page.mouse.up();
 assert.equal(await page.locator('#page-number').inputValue(),'1');
 await frame.locator('.pdf-page[data-page="1"] .area-layer').dispatchEvent('pointercancel',{bubbles:true});
 assert.equal(await page.locator('#page-number').inputValue(),'1');await page.locator('#text-mode').click();
 await followInternal(2);await followExternal(3);
 // Notes remain clickable outside links, without moving to another page.
 await frame.locator('.mark[aria-label="Image citation note"]').click({position:{x:5,y:5}});assert.equal(await page.locator('.note-card.selected .note-heading button').textContent(),'Image citation note');
 // Native link hit targets survive scale, rotation, and reload of saved notes.
 await frame.locator('body').evaluate(()=>{PDFViewerApplication.pdfViewer.currentScale=1.4;PDFViewerApplication.pdfViewer.pagesRotation=90;});
 await followInternal(0);await followInternal(2);
 await page.reload();await frame.locator('.mark').first().waitFor();await followInternal(0);await followExternal(3);
 assert.deepEqual(errors,[]);
 console.log('PASS: internal/external citations before and after text/image notes, note clicks, zoom, rotation and reload.');
 } finally {await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exit(1)});
