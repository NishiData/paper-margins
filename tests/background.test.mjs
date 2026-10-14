import assert from 'node:assert/strict';
const local={},session={},listeners={},sent=[];let activeTab={id:2,url:'https://chatgpt.com/c/test'};
const area=data=>({get:async k=>{await new Promise(r=>setTimeout(r,5));return structuredClone(k?{[k]:data[k]}:data);},set:async v=>{await new Promise(r=>setTimeout(r,5));Object.assign(data,structuredClone(v));},remove:async k=>{delete data[k];},setAccessLevel:async()=>{}});
globalThis.chrome={storage:{local:area(local),session:area(session)},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listeners.message=fn}},commands:{onCommand:{addListener:fn=>listeners.command=fn}},action:{onClicked:{addListener(){}}},tabs:{query:async()=>[activeTab],sendMessage:async(id,message)=>sent.push({id,message}),onRemoved:{addListener(){}}}};
await import('../extension/background.js');
const sender={url:'https://chatgpt.com/c/test',tab:{id:2,url:'https://chatgpt.com/c/test'}};
const request=(m,s=sender)=>new Promise(r=>listeners.message(m,s,r));
const note={id:'n',anchor:{docId:'a'.repeat(64),page:1,rects:[{x:.1,y:.2,w:.3,h:.1}]},turns:[],tags:[],title:'Question'};
local['pm:note:n']=note;session['pm:context:2']={noteId:'n'};
const res=await Promise.all([request({type:'SAVE_TURN',turn:{id:'t1',question:'Q1',answer:'A1'}}),request({type:'SAVE_TURN',turn:{id:'t2',question:'Q2',answer:'A2'}}),request({type:'EDIT_NOTE',id:'n',tags:['群論']},{url:'chrome-extension://test/reader.html',tab:{id:1}})]);
assert.ok(res.every(r=>r.ok));assert.equal(local['pm:note:n'].turns.length,2);assert.deepEqual(local['pm:note:n'].tags,['群論']);
await request({type:'SAVE_TURN',turn:{id:'t1',question:'Q1',answer:'Updated'}});assert.equal(local['pm:note:n'].turns.length,2);assert.equal(local['pm:note:n'].turns[0].answer,'Updated');
assert.ok((await request({type:'SAVE_TURN',turn:{}},{url:'https://example.com/',tab:{id:2}})).error);
local['pm:note:n'].selectionImage={name:'selection.png',dataUrl:'data:image/png;base64,AA=='};assert.equal((await request({type:'GET_CONTEXT'})).selectionImage.name,'selection.png');assert.equal(session['pm:context:2'].selectionImage,undefined);
assert.ok((await request({type:'LIST_NOTE_TARGETS'})).notes.some(n=>n.id==='n'));const linked=await request({type:'CONNECT_EXISTING_NOTE',noteId:'n'});assert.equal(linked.noteId,'n');assert.equal(linked.resume,true);assert.equal(linked.selectionImage.name,'selection.png');
await request({type:'STOP_CONTEXT'});assert.ok((await request({type:'SAVE_TURN',turn:{id:'t3',question:'Q3',answer:'A3'}})).error);
console.log('PASS: concurrent answer saves + tag edits retain all turns; response updates deduplicate; unauthorized sender and stopped context rejected.');

await listeners.command('toggle-chat-panel');assert.deepEqual(sent,[{id:2,message:{type:'TOGGLE_PANEL'}}]);activeTab={id:9,url:'https://example.com/'};await listeners.command('toggle-chat-panel');assert.equal(sent.length,1);
