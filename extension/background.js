import {validateNoteImages} from './note-images.mjs';
import {originalPDFInfo,originalPDFChunk} from './pdf-attachment.mjs';
import {noteKey, validAnchor, mergeTurn,validateNote,makePrompt} from './core.mjs';
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(console.error);
let writes=Promise.resolve();
function serial(fn) {const p=writes.then(fn); writes=p.catch(()=>{}); return p;}
async function openReader() {
 const url=chrome.runtime.getURL('reader.html');
 const tabs=await chrome.tabs.query({}); const existing=tabs.find(t=>t.url===url||t.url?.startsWith(url+'?'));
 if(existing){await chrome.tabs.update(existing.id,{active:true});await chrome.windows.update(existing.windowId,{focused:true});return;}
 await chrome.tabs.create({url});
}
async function openNoteReader(ctx,note) {
 const url=new URL(chrome.runtime.getURL('reader.html'));
 url.searchParams.set('paper',note.anchor.docId);
 const tabs=await chrome.tabs.query({});
 const candidates=tabs.filter(tab=>tab.id===ctx.readerTabId||tab.url===url.href);
 candidates.sort((a,b)=>Number(b.id===ctx.readerTabId)-Number(a.id===ctx.readerTabId));
 for(const tab of candidates){
  const shown=await chrome.tabs.sendMessage(tab.id,{type:'SHOW_NOTE',docId:note.anchor.docId,noteId:note.id}).catch(()=>null);
  if(!shown?.ok)continue;
  await chrome.tabs.update(tab.id,{active:true});
  await chrome.windows.update(tab.windowId,{focused:true});
  return;
 }
 url.searchParams.set('note',note.id);
 await chrome.tabs.create({url:url.href});
}
chrome.action.onClicked.addListener(()=>openReader().catch(console.error));
chrome.commands.onCommand.addListener(async command=>{
 if(command!=='toggle-chat-panel')return;
 try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab?.url||''))await chrome.tabs.sendMessage(tab.id,{type:'TOGGLE_PANEL'});}catch{/* The page may be reloading; do not open an unsolicited panel. */}
});
async function handle(m,sender) {
 const internal=sender.url?.startsWith(chrome.runtime.getURL(''));
 const chat=/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(sender.url||'');
 if(!internal&&!chat) throw Error('許可されていない送信元です。');
 if(m.type==='OPEN_PAPER_TAB'&&internal){if(!/^[a-f0-9]{64}$/.test(m.docId||''))throw Error('PDFの指定が不正です。');const tab=await chrome.tabs.create({url:chrome.runtime.getURL('reader.html')+'?paper='+m.docId,active:true});return {ok:true,tabId:tab.id};}
 if(m.type==='GET_CONTEXT') {const k='pm:context:'+sender.tab.id,ctx=(await chrome.storage.session.get(k))[k];if(!ctx)return null;const key=noteKey(ctx.noteId),note=(await chrome.storage.local.get(key))[key];return {...ctx,selectionImage:note?.selectionImage||null};}
 if(m.type==='GET_PDF_CHUNK'&&chat){const ctx=(await chrome.storage.session.get('pm:context:'+sender.tab.id))['pm:context:'+sender.tab.id];if(!ctx?.pdfAttachment||m.noteId!==ctx.noteId)throw Error('PDF添付の接続がありません。');const note=(await chrome.storage.local.get(noteKey(ctx.noteId)))[noteKey(ctx.noteId)];if(!note||note.anchor.docId!==ctx.docId)throw Error('添付先のPDFが見つかりません。');return originalPDFChunk(ctx.docId,m.offset);}
 if(m.type==='STOP_CONTEXT') return serial(async()=>{await chrome.storage.session.remove('pm:context:'+sender.tab.id);return {ok:true};});
 if(m.type==='UPDATE_CAPTURE_STATE'&&chat) return serial(async()=>{
  const key='pm:context:'+sender.tab.id,ctx=(await chrome.storage.session.get(key))[key];
  if(!ctx||m.noteId!==ctx.noteId)throw Error('PDFの対象箇所との接続が変わりました。');
  const capture={...ctx.capture};
  if(typeof m.auto==='boolean')capture.auto=m.auto;
  if(typeof m.path==='string'&&typeof m.first==='string'){
   capture.path=m.path;capture.first=m.first;
  }
  await chrome.storage.session.set({[key]:{...ctx,capture}});
  return {ok:true};
 });
 if(m.type==='LIST_NOTE_TARGETS'&&chat){const data=await chrome.storage.local.get(null);return {notes:Object.entries(data).filter(([k])=>k.startsWith('pm:note:')).map(([,n])=>({id:n.id,docTitle:n.docTitle,page:n.anchor.page,title:n.title,excerpt:String(n.anchor.excerpt||'').slice(0,70),updatedAt:n.updatedAt})).sort((a,b)=>b.updatedAt-a.updatedAt)};}
 if(m.type==='CONNECT_EXISTING_NOTE'&&chat){const key=noteKey(m.noteId),n=(await chrome.storage.local.get(key))[key];if(!n)throw Error('接続先の注釈が見つかりません。');
  const ctx={noteId:n.id,docTitle:n.docTitle,page:n.anchor.page,prompt:makePrompt(n.docTitle,n.anchor,n.title),createdAt:Date.now(),resume:true};
  await serial(()=>chrome.storage.session.set({['pm:context:'+sender.tab.id]:ctx}));return {...ctx,selectionImage:n.selectionImage||null};}
 if(m.type==='EDIT_NOTE'&&internal) return serial(async()=>{
  const key=noteKey(m.id),current=(await chrome.storage.local.get(key))[key];if(!current)throw Error('注釈が見つかりません。');
  const tags=Array.isArray(m.tags)?m.tags.map(String).slice(0,30):current.tags;
  await chrome.storage.local.set({[key]:{...current,tags,updatedAt:Date.now()}});return {ok:true};});
 if((m.type==='ADD_NOTE_IMAGES'||m.type==='REMOVE_NOTE_IMAGE')&&internal)return serial(async()=>{
  const key=noteKey(m.id),current=(await chrome.storage.local.get(key))[key];if(!current)throw Error('注釈が見つかりません。');
  const attachments=m.type==='ADD_NOTE_IMAGES'?validateNoteImages([...(current.attachments||[]),...validateNoteImages(m.images)]):validateNoteImages((current.attachments||[]).filter(image=>image.id!==m.imageId));
  await chrome.storage.local.set({[key]:{...current,attachments,updatedAt:Date.now()}});return {ok:true};});
 if(m.type==='ADD_MANUAL_TURN'&&internal) return serial(async()=>{
  const key=noteKey(m.note.id),current=(await chrome.storage.local.get(key))[key]||validateNote(m.note);
  const updated=validateNote(mergeTurn(current,m.turn));if(!current.turns.length)updated.title=m.turn.question.slice(0,90);
  await chrome.storage.local.set({[key]:updated});return {ok:true};});
 if(m.type==='DELETE_NOTE'&&internal) return serial(async()=>{await chrome.storage.local.remove(noteKey(m.id));return {ok:true};});
 if(m.type==='IMPORT_NOTES'&&internal) return serial(async()=>{
  const incoming=m.notes.map(validateNote);for(const n of incoming){const key=noteKey(n.id),old=(await chrome.storage.local.get(key))[key];let merged=old||n;
   if(old&&n.attachments?.length){const images=new Map((old.attachments||[]).map(image=>[image.id,image]));for(const image of n.attachments)if(!images.has(image.id))images.set(image.id,image);merged={...merged,attachments:validateNoteImages([...images.values()])};}
   if(old)for(const t of n.turns)if(!merged.turns.some(x=>x.id===t.id))merged=mergeTurn(merged,t);
   await chrome.storage.local.set({[key]:merged});}return {ok:true};});
 if(m.type==='BIND_CHAT'&&internal) {
  if(!validAnchor(m.note?.anchor)) throw Error('PDFの対象箇所を選択してください。');
  const note=validateNote(m.note);const pdfAttachment=m.attachPDF===true?await originalPDFInfo(note.anchor.docId):null;await serial(()=>chrome.storage.local.set({[noteKey(note.id)]:note}));
  const b=m.bounds; if(b) await chrome.windows.update(sender.tab.windowId,{state:'normal',left:b.left,top:b.top,width:b.readerWidth,height:b.height});
  const win=await chrome.windows.create({url:'https://chatgpt.com/',type:'normal',...(b?{left:b.left+b.readerWidth,top:b.top,width:b.chatWidth,height:b.height}:{width:650,height:900})});
  const tabId=win.tabs[0].id;
  const ctx={noteId:note.id,docTitle:note.docTitle,page:note.anchor.page,prompt:m.prompt,createdAt:Date.now(),readerTabId:sender.tab.id,...(pdfAttachment?{docId:note.anchor.docId,pdfAttachment}:{})};
  await chrome.storage.session.set({['pm:context:'+tabId]:ctx});
  chrome.tabs.sendMessage(tabId,{type:'CONTEXT_READY',context:{...ctx,selectionImage:note.selectionImage||null}}).catch(()=>{});
  return {ok:true,tabId};
 }
 if(m.type==='SAVE_TURN'&&chat) return serial(async()=>{
  const k='pm:context:'+sender.tab.id,ctx=(await chrome.storage.session.get(k))[k];
  if(!ctx) throw Error('PDFの対象箇所との接続が解除されています。');
  if(m.noteId!==undefined&&m.noteId!==ctx.noteId)throw Error('保存先の注釈が切り替わりました。');
  const t=m.turn;
  if(!t||typeof t.id!=='string'||typeof t.question!=='string'||typeof t.answer!=='string'||t.answer.length>1000000) throw Error('回答データを保存できません。');
  const key=noteKey(ctx.noteId),n=(await chrome.storage.local.get(key))[key];if(!n)throw Error('対象の注釈が削除されています。');
  const turn={id:t.id,question:t.question.slice(0,500000),answer:t.answer,url:sender.tab.url||sender.url,createdAt:Date.now()};
  const old=n.turns.find(turn=>turn.id===t.id);
  if(!old||old.question!==turn.question||old.answer!==turn.answer||old.url!==turn.url)await chrome.storage.local.set({[key]:mergeTurn(n,turn)});
  return {ok:true};
 });
 if(m.type==='OPEN_READER'&&chat){
  const key='pm:context:'+sender.tab.id,ctx=(await chrome.storage.session.get(key))[key];
  if(!ctx)throw Error('PDFの対象箇所との接続が解除されています。');
  if(m.noteId!==undefined&&m.noteId!==ctx.noteId)throw Error('接続先の注釈が切り替わりました。');
  const noteId=noteKey(ctx.noteId),note=(await chrome.storage.local.get(noteId))[noteId];
  if(!note)throw Error('対象の注釈が見つかりません。');
  await openNoteReader(ctx,note);return {ok:true};
 }
 if(m.type==='OPEN_READER'&&internal){await openReader();return {ok:true};}
 throw Error('未対応の操作です。');
}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{handle(m,sender).then(respond).catch(e=>respond({error:e.message}));return true;});
chrome.tabs.onRemoved.addListener(id=>chrome.storage.session.remove('pm:context:'+id));
