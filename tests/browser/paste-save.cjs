const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
async function main(){fs.mkdirSync(path.resolve('artifacts'),{recursive:true});
 const local={},session={},listeners={};let failWrite=false;
 const area=data=>({get:async k=>structuredClone(k?{[k]:data[k]}:data),set:async v=>{if(data===local&&failWrite)throw Error('書き込み失敗（テスト）');Object.assign(data,structuredClone(v));},remove:async k=>{delete data[k];},setAccessLevel:async()=>{}});
 global.chrome={storage:{local:area(local),session:area(session)},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listeners.message=fn}},commands:{onCommand:{addListener(){}}},action:{onClicked:{addListener(){}}},tabs:{onRemoved:{addListener(){}}}};
 await import('../../extension/background.js');
 const sender={url:'https://chatgpt.com/c/test',tab:{id:2,url:'https://chatgpt.com/c/test'}};
 const request=m=>new Promise(r=>listeners.message(m,sender,r));
 const note={id:'paste-note',docTitle:'paper.pdf',anchor:{docId:'a'.repeat(64),page:5,kind:'region',rects:[{x:.1,y:.2,w:.3,h:.1}]},turns:[],tags:[],title:'導出方法は'};
 local['pm:note:paste-note']=note;
 await request({type:'CONNECT_EXISTING_NOTE',noteId:note.id});
 const b=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
 const p=await b.newPage({acceptDownloads:true});await p.exposeFunction('backend',request);
 async function setup(){await p.setContent('<main><section id="unknown">PRIVATE_ANSWER_DO_NOT_EXPORT</section></main><input value="PRIVATE_ACCOUNT_DO_NOT_EXPORT">');await p.evaluate(()=>{chrome={runtime:{getManifest:()=>({version:'1.0.5'}),onMessage:{addListener(){}},sendMessage:window.backend}};});for(const name of ['capture-core.js','conversation-guard.js','input-bridge.js','chatgpt.js'])await p.addScriptTag({path:path.resolve('extension',name)});await p.locator('#paper-margins-bridge #save').waitFor();}
 await setup();const panel=p.locator('#paper-margins-bridge');await panel.locator('#save').click();assert.equal(await panel.locator('#save-fallback').evaluate(e=>e.open),true);
 assert.equal(await panel.locator('#manual-question').inputValue(),'導出方法は');
 await panel.locator('#save-pasted').click();assert.match(await panel.locator('#status').textContent(),/回答を貼り付け/);assert.equal(local['pm:note:paste-note'].turns.length,0);
 const answer='日本語の回答です。\n\n\\[g=e^{-i\\epsilon t}\\in GL(6,\\mathbb{Z})\\]\n複数行をそのまま保存。';
 await panel.locator('#manual-answer').fill(answer);await panel.locator('#save-pasted').click();assert.match(await panel.locator('#status').textContent(),/✓/);
 assert.equal(local['pm:note:paste-note'].turns.length,1);assert.equal(local['pm:note:paste-note'].turns[0].answer,answer);assert.equal(local['pm:note:paste-note'].anchor.page,5);
 await panel.locator('#save-pasted').click();assert.equal(local['pm:note:paste-note'].turns.length,1);
 failWrite=true;await panel.locator('#manual-answer').fill('保存失敗時に失わない下書き');await panel.locator('#save-pasted').click();assert.match(await panel.locator('#status').textContent(),/書き込み失敗/);assert.equal(await panel.locator('#manual-answer').inputValue(),'保存失敗時に失わない下書き');assert.equal(local['pm:note:paste-note'].turns.length,1);failWrite=false;
 const diagnostic=await p.evaluate(()=>PaperMarginsCapture.diagnostics());assert.equal(diagnostic.counts.answers,0);assert.ok(!JSON.stringify(diagnostic).includes('PRIVATE_'));
 const downloadPromise=p.waitForEvent('download');await panel.locator('#export-diagnostics').click();const download=await downloadPromise;const target=path.resolve('artifacts/diagnostics-qa.json');await download.saveAs(target);const report=JSON.parse(fs.readFileSync(target,'utf8'));assert.equal(report.version,'1.0.5');assert.ok(!JSON.stringify(report).includes('PRIVATE_'));
 // Re-create the page: the production worker still returns the target and the saved turn remains available.
 await setup();assert.equal(local['pm:note:paste-note'].turns[0].answer,answer);assert.match(await panel.locator('#target').textContent(),/5ページ/);
 await request({type:'STOP_CONTEXT'});await panel.locator('#save').click();await panel.locator('#manual-answer').fill('Disconnected answer');await panel.locator('#save-pasted').click();assert.match(await panel.locator('#status').textContent(),/接続が解除/);assert.equal(local['pm:note:paste-note'].turns.length,1);
 console.log('PASS: pasted Japanese and LaTeX saved through production background handler to correct PDF anchor; duplicate clicks upsert; blank and disconnected saves rejected; drafts retained on write failure; saved data remains after page recreation; diagnostics download excludes text and input values. Chrome storage is simulated.');
 }finally{await b.close();}
}
main().catch(e=>{console.error(e);process.exit(1)});
