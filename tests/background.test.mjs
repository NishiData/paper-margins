import assert from 'node:assert/strict';
const local={},session={},listeners={},sent=[],opened=[],activated=[],focused=[];
let activeTab={id:2,url:'https://chatgpt.com/c/test'},readerTabs=[],noteReceiver;
const area=data=>({get:async k=>{await new Promise(r=>setTimeout(r,5));return structuredClone(k?{[k]:data[k]}:data);},set:async v=>{await new Promise(r=>setTimeout(r,5));Object.assign(data,structuredClone(v));},remove:async k=>{delete data[k];},setAccessLevel:async()=>{}});
globalThis.chrome={storage:{local:area(local),session:area(session)},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listeners.message=fn}},commands:{onCommand:{addListener:fn=>listeners.command=fn}},action:{onClicked:{addListener(){}}},tabs:{create:async options=>{opened.push(options);return {id:100+opened.length};},query:async options=>options.active?[activeTab]:readerTabs,sendMessage:async(id,message)=>{sent.push({id,message});return {ok:id===noteReceiver};},update:async id=>activated.push(id),onRemoved:{addListener(){}}},windows:{update:async id=>focused.push(id)}};
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

const internal={url:'chrome-extension://test/reader.html',tab:{id:1}};
assert.ok((await request({type:'OPEN_PAPER_TAB',docId:'b'.repeat(64)},internal)).ok);
assert.deepEqual(opened,[{url:'chrome-extension://test/reader.html?paper='+'b'.repeat(64),active:true}]);
assert.ok((await request({type:'OPEN_PAPER_TAB',docId:'../bad'},internal)).error);
assert.ok((await request({type:'OPEN_PAPER_TAB',docId:'c'.repeat(64)},sender)).error);
assert.equal(opened.length,1);

const image={id:'img-1',name:'diagram.png',dataUrl:'data:image/png;base64,AA=='};
session['pm:context:2']={noteId:'n'};
const imageWrites=await Promise.all([request({type:'ADD_NOTE_IMAGES',id:'n',images:[image]},internal),request({type:'SAVE_TURN',turn:{id:'t4',question:'Q4',answer:'A4'}}),request({type:'EDIT_NOTE',id:'n',tags:['添付']},internal)]);
assert.ok(imageWrites.every(r=>r.ok));assert.equal(local['pm:note:n'].attachments.length,1);assert.ok(local['pm:note:n'].turns.some(t=>t.id==='t4'));
assert.ok((await request({type:'REMOVE_NOTE_IMAGE',id:'n',imageId:image.id},sender)).error);
assert.ok((await request({type:'ADD_NOTE_IMAGES',id:'n',images:[{...image,id:'bad',dataUrl:'data:text/html;base64,AA=='}]},internal)).error);
const snapshot=structuredClone(local['pm:note:n']);await request({type:'REMOVE_NOTE_IMAGE',id:'n',imageId:image.id},internal);assert.equal(local['pm:note:n'].attachments.length,0);assert.equal(local['pm:note:n'].turns.length,snapshot.turns.length);
await request({type:'IMPORT_NOTES',notes:[snapshot]},internal);assert.equal(local['pm:note:n'].attachments.length,1);await request({type:'IMPORT_NOTES',notes:[snapshot]},internal);assert.equal(local['pm:note:n'].attachments.length,1);
console.log('PASS: atomic image/answer/tag updates; attachments survive import, deduplicate and remove individually; unauthorized and invalid image updates rejected.');

const paperUrl='chrome-extension://test/reader.html?paper='+note.anchor.docId;
const otherTab={id:11,windowId:1,url:'chrome-extension://test/reader.html?paper='+'b'.repeat(64)};
const targetTab={id:12,windowId:3,url:paperUrl};
readerTabs=[otherTab,targetTab];
noteReceiver=targetTab.id;
assert.ok((await request({type:'OPEN_READER'})).ok);
assert.deepEqual(sent.at(-1),{id:12,message:{type:'SHOW_NOTE',docId:note.anchor.docId,noteId:note.id}});
assert.deepEqual(activated,[12]);
assert.deepEqual(focused,[3]);
session['pm:context:2'].readerTabId=otherTab.id; // The original reader switched papers.
readerTabs=[otherTab];
assert.ok((await request({type:'OPEN_READER'})).ok);
assert.deepEqual(opened.at(-1),{url:paperUrl+'&note=n'});
assert.deepEqual(activated,[12]);
assert.ok((await request({type:'SAVE_TURN',noteId:'another-note',turn:{id:'late',question:'Q',answer:'A'}})).error);
assert.equal(local['pm:note:n'].turns.some(t=>t.id==='late'),false);
const state=await Promise.all([
 request({type:'UPDATE_CAPTURE_STATE',noteId:'n',auto:false}),
 request({type:'UPDATE_CAPTURE_STATE',noteId:'n',path:'/c/test',first:'Q1'})
]);
assert.ok(state.every(r=>r.ok));
assert.deepEqual((await request({type:'GET_CONTEXT'})).capture,{auto:false,path:'/c/test',first:'Q1'});
console.log('PASS: return uses the connected PDF and annotation; switched reader falls back to a correct new tab; stale writes rejected; autosave state retained.');
