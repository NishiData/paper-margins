const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
async function main(){fs.mkdirSync(path.resolve('artifacts'),{recursive:true});const b=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});const p=await b.newPage();await p.setContent('<main id="conversation"></main><button data-testid="stop-button" style="display:none">Stop generating</button>');
 await p.evaluate(()=>{window.saved=[];window.rows={};window.chrome={runtime:{onMessage:{addListener(){}},sendMessage:async m=>{if(m.type==='GET_CONTEXT')return {noteId:'note-qa',docTitle:'paper.pdf',page:5,prompt:'Original question'};if(m.type==='SAVE_TURN'){if(window.failSave)return {error:'保存に失敗しました（テスト）'};window.saved.push(m.turn);window.rows[m.turn.id]=m.turn;}return {ok:true};}}};});
 for(const name of ['capture-core.js','conversation-guard.js','input-bridge.js','chatgpt.js'])await p.addScriptTag({path:path.resolve('extension',name)});
 const panel=p.locator('#paper-margins-bridge');await panel.waitFor();
 await p.evaluate(()=>document.querySelector('main').innerHTML='<div data-message-author-role="user">Question 1</div><div data-message-author-role="assistant" data-message-id="m1"><p>Completed answer 1</p></div>');assert.equal(await p.evaluate(()=>PaperMarginsCapture.streaming()),false);await p.waitForFunction(()=>window.saved.length===1,{timeout:7000});assert.equal(await p.evaluate(()=>window.saved[0].answer),'Completed answer 1');
 // The manual button saves what is displayed even if a visible stop button remains.
 await p.locator('[data-testid=stop-button]').evaluate(e=>e.style.display='block');assert.equal(await p.evaluate(()=>PaperMarginsCapture.streaming()),true);await panel.locator('#save').click();await p.waitForFunction(()=>window.saved.length===2);assert.equal((await p.evaluate(()=>Object.values(window.rows))).length,1);
 await p.locator('[data-testid=stop-button]').evaluate(e=>e.style.display='none');
 await p.evaluate(()=>{const main=document.querySelector('main');main.insertAdjacentHTML('beforeend','<article data-turn="user" data-testid="conversation-turn-2"><p>Question 2</p></article><article data-turn="assistant" data-testid="conversation-turn-3"><div class="markdown"><p>Answer 2 in another layout</p></div></article>');});await p.waitForFunction(()=>window.saved.length===3,{timeout:7000});assert.equal(await p.evaluate(()=>window.saved.at(-1).question),'Question 2');
 // Bodies without the original role attribute are still recognized and paired.
 await p.evaluate(()=>document.querySelector('main').insertAdjacentHTML('beforeend','<div class="whitespace-pre-wrap">Question 3</div><div class="markdown" data-message-id="m3"><p>Answer 3 without role attributes</p></div>'));await p.waitForFunction(()=>window.saved.length===4,{timeout:7000});assert.equal(await p.evaluate(()=>window.saved.at(-1).question),'Question 3');
 // Unknown markup: preserve a selected answer when clicking the fallback button.
 await p.evaluate(()=>document.querySelector('main').innerHTML='<section id="unknown-answer">Answer in an unknown layout</section>');await panel.locator('#save').click();assert.ok((await panel.locator('#status').textContent()).includes('自動取得できません'));
 assert.equal(await panel.locator('#save-fallback').evaluate(e=>e.open),true);await p.locator('#unknown-answer').evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));});await panel.locator('#save-selection').click();await p.waitForFunction(()=>window.saved.length===5);assert.equal(await p.evaluate(()=>window.saved.at(-1).answer),'Answer in an unknown layout');
 await p.evaluate(()=>window.failSave=true);await panel.locator('#save-selection').click();assert.ok((await panel.locator('#status').textContent()).includes('保存に失敗'));assert.equal(await p.evaluate(()=>window.saved.length),5);
 const old=await b.newPage();await old.setContent('<main><div data-message-author-role="user">Already asked</div><div data-message-author-role="assistant" data-message-id="existing"><p>Already completed answer</p></div></main>');await old.evaluate(()=>{window.saved=[];chrome={runtime:{onMessage:{addListener:fn=>window.bridgeListener=fn},sendMessage:async m=>{if(m.type==='GET_CONTEXT')return null;if(m.type==='LIST_NOTE_TARGETS')return {notes:[{id:'existing-note',docTitle:'paper.pdf',page:5,title:'Question'}]};if(m.type==='CONNECT_EXISTING_NOTE')return {noteId:m.noteId,docTitle:'paper.pdf',page:5,prompt:'Original question',resume:true};if(m.type==='SAVE_TURN')window.saved.push(m.turn);return {ok:true};}}};});for(const name of ['capture-core.js','conversation-guard.js','input-bridge.js','chatgpt.js'])await old.addScriptTag({path:path.resolve('extension',name)});const oldPanel=old.locator('#paper-margins-bridge');await old.waitForTimeout(2700);assert.equal(await oldPanel.count(),0);await old.evaluate(()=>bridgeListener({type:'TOGGLE_PANEL'}));await oldPanel.locator('#choose-note').click();await oldPanel.locator('#connect-note').click();await old.waitForFunction(()=>window.saved.length===1);assert.equal(await old.evaluate(()=>window.saved[0].answer),'Already completed answer');assert.ok((await old.evaluate(()=>window.saved[0].id)).startsWith('existing-note:'));await old.waitForTimeout(2500);assert.equal(await old.evaluate(()=>window.saved.length),1);
 // Hiding a connected panel keeps recording, and the interval must not reveal it again.
 await old.evaluate(()=>bridgeListener({type:'TOGGLE_PANEL'}));assert.equal(await oldPanel.count(),0);
 await old.evaluate(()=>document.querySelector('main').insertAdjacentHTML('beforeend','<div data-message-author-role="user">Follow up while hidden</div><div data-message-author-role="assistant" data-message-id="hidden"><p>Saved while hidden</p></div>'));
 await old.waitForFunction(()=>window.saved.length===2,{timeout:7000});assert.equal(await oldPanel.count(),0);assert.equal(await old.evaluate(()=>window.saved.at(-1).answer),'Saved while hidden');
 await old.evaluate(()=>bridgeListener({type:'TOGGLE_PANEL'}));await oldPanel.locator('#stop').click();await old.waitForTimeout(4200);assert.equal(await oldPanel.count(),0);
 // An explicit PDF connection shows the panel in a previously ordinary ChatGPT tab.
 await old.evaluate(()=>bridgeListener({type:'CONTEXT_READY',context:{noteId:'new-link',docTitle:'new.pdf',page:3,prompt:'A new PDF question'}}));await oldPanel.waitFor();assert.match(await oldPanel.locator('#target').textContent(),/3ページ/);

 const restored=await b.newPage(),context={noteId:'reload-note',docTitle:'reload.pdf',page:7,prompt:'Original PDF question'};
 const requests=[];
 await restored.exposeFunction('captureRequest',m=>{
  if(m.type==='GET_CONTEXT')return context;
  if(m.type==='RETURN_COUNT')return requests.filter(r=>r.type==='OPEN_READER').length;
  if(m.type==='UPDATE_CAPTURE_STATE'){
   const {type,noteId,...state}=m;
   context.capture={...context.capture,...state};
  }
  requests.push(m);
  return {ok:true};
 });
 await restored.addInitScript(()=>{window.chrome={runtime:{onMessage:{addListener(){}},sendMessage:window.captureRequest}};});
 let conversation='<div data-message-author-role="user">Original PDF question</div><div data-message-author-role="assistant" data-message-id="reload-answer">Rendered before the extension started</div>';
 await restored.route('https://fixture.test/c/reload',route=>route.fulfill({contentType:'text/html',body:'<main>'+conversation+'</main>'}));
 await restored.goto('https://fixture.test/c/reload');
 const restoredPanel=restored.locator('#paper-margins-bridge');
 const startBridge=async()=>{for(const name of ['capture-core.js','conversation-guard.js','input-bridge.js','chatgpt.js'])await restored.addScriptTag({path:path.resolve('extension',name)});await restoredPanel.waitFor();};
 await startBridge();
 await restoredPanel.locator('#reader').click();
 await restored.waitForFunction(async()=>await window.captureRequest({type:'RETURN_COUNT'})===1);
 assert.deepEqual(requests.filter(m=>['SAVE_TURN','OPEN_READER'].includes(m.type)).map(m=>m.type),['SAVE_TURN','OPEN_READER']);
 assert.equal(requests.find(m=>m.type==='SAVE_TURN').turn.answer,'Rendered before the extension started');
 await restoredPanel.locator('#auto').uncheck();
 await restored.waitForFunction(async()=>!(await window.captureRequest({type:'GET_CONTEXT'})).capture.auto);
 conversation+='<div data-message-author-role="user">Do not save this question</div><div data-message-author-role="assistant">Do not save this answer</div>';
 await restored.reload();
 await startBridge();
 assert.equal(await restoredPanel.locator('#auto').isChecked(),false);
 await restoredPanel.locator('#reader').click();
 await restored.waitForFunction(async()=>await window.captureRequest({type:'RETURN_COUNT'})===2);
 assert.equal(requests.filter(m=>m.type==='SAVE_TURN').length,1);

 await b.close();console.log('PASS: reconnect and save existing answer without repeating question; hidden stop ignored; automatic completed-answer save; manual save despite visible stop; role/turn/Markdown layouts; correct question pairing; selected answer fallback; write failures not reported as success.');}
main().catch(e=>{console.error(e);process.exit(1)});
