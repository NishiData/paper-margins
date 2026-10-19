import test from 'node:test';
import assert from 'node:assert/strict';
import {PDF_CHUNK_SIZE} from '../extension/pdf-attachment.mjs';

test('PDF transport requires explicit opt-in and the bound chat, streams only the original, and stops with the context',async()=>{
 const id='c'.repeat(64),bytes=new Uint8Array(600001).fill(65);bytes.set(new TextEncoder().encode('%PDF-1.7'));
 const record={id,name:'private-paper.pdf',blob:new Blob([bytes],{type:'application/pdf'}),editedBlob:new Blob(['DO_NOT_SEND_ANNOTATIONS'])};
 globalThis.indexedDB={open(){
  const request={};queueMicrotask(()=>{
   request.result={close(){},transaction(){return {objectStore(){return {get(key){
    const result={};queueMicrotask(()=>{result.result=key===id?record:undefined;result.onsuccess();});return result;
   }};}};}};
   request.onsuccess();
  });return request;
 }};
 const local={},session={},listeners={};const area=data=>({get:async k=>structuredClone(k?{[k]:data[k]}:data),set:async v=>Object.assign(data,structuredClone(v)),remove:async k=>delete data[k],setAccessLevel:async()=>{}});
 globalThis.chrome={storage:{local:area(local),session:area(session)},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listeners.message=fn}},commands:{onCommand:{addListener(){}}},action:{onClicked:{addListener(){}}},windows:{create:async()=>({tabs:[{id:10}]})},tabs:{sendMessage:async()=>{},onRemoved:{addListener(){}}}};
 await import('../extension/background.js');const internal={url:'chrome-extension://test/reader.html',tab:{id:1}},chat={url:'https://chatgpt.com/c/a',tab:{id:10}},other={url:'https://chatgpt.com/c/b',tab:{id:11}};
 const request=(m,s=chat)=>new Promise(resolve=>listeners.message(m,s,resolve));
 const note={id:'n',anchor:{docId:id,page:1,rects:[{x:0,y:0,w:.5,h:.5}]},turns:[],tags:[],title:'Q',docTitle:record.name};
 assert.ok((await request({type:'BIND_CHAT',note,prompt:'Q'},internal)).ok);
 assert.equal((await request({type:'GET_CONTEXT'})).pdfAttachment,undefined);
 assert.ok((await request({type:'GET_PDF_CHUNK',noteId:'n',offset:0})).error);
 assert.ok((await request({type:'BIND_CHAT',note,prompt:'Q',attachPDF:true},internal)).ok);
 const ctx=await request({type:'GET_CONTEXT'});assert.deepEqual(ctx.pdfAttachment,{name:record.name,size:bytes.length});
 assert.ok((await request({type:'GET_PDF_CHUNK',noteId:'n',offset:0},other)).error);
 assert.ok((await request({type:'GET_PDF_CHUNK',noteId:'wrong',offset:0})).error);
 for(const offset of [-1,1,bytes.length,NaN])assert.ok((await request({type:'GET_PDF_CHUNK',noteId:'n',offset})).error);
 const chunks=[];for(let offset=0;offset<bytes.length;offset+=PDF_CHUNK_SIZE){const chunk=await request({type:'GET_PDF_CHUNK',noteId:'n',offset});assert.equal(chunk.offset,offset);assert.ok(chunk.next>offset);chunks.push(Buffer.from(chunk.data,'base64'));}
 assert.deepEqual(Buffer.concat(chunks),Buffer.from(bytes));assert.ok(!JSON.stringify({local,session}).includes('DO_NOT_SEND_ANNOTATIONS'));assert.ok(!JSON.stringify(local).includes('pdfAttachment'));
 await request({type:'STOP_CONTEXT'});assert.ok((await request({type:'GET_PDF_CHUNK',noteId:'n',offset:0})).error);
});
