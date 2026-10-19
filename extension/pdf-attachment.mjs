/** Read the original PDF on demand. PDF bytes never enter notes or session storage. */
export const PDF_CHUNK_SIZE=192*1024;
export async function readOriginalPDF(id){
 if(!/^[a-f0-9]{64}$/.test(id||''))throw Error('PDFの指定が不正です。');
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('paper-margins',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('papers'))request.result.createObjectStore('papers',{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('papers','readonly'),r=tx.objectStore('papers').get(id);r.onsuccess=()=>{const paper=r.result;if(!paper?.blob)reject(Error('元のPDFが見つかりません。PDF画面から質問し直してください。'));else resolve({blob:paper.blob,name:String(paper.name||'paper.pdf').replace(/[\\/:*?"<>|]/g,'_').slice(0,180)});};r.onerror=()=>reject(r.error);});}finally{db.close();}
}
export async function originalPDFInfo(id){const file=await readOriginalPDF(id);return {name:/\.pdf$/i.test(file.name)?file.name:file.name+'.pdf',size:file.blob.size};}
export async function originalPDFChunk(id,offset){
 const file=await readOriginalPDF(id);
 if(!Number.isSafeInteger(offset)||offset<0||offset>=file.blob.size||offset%PDF_CHUNK_SIZE)throw Error('PDFの読み取り位置が不正です。');
 const bytes=new Uint8Array(await file.blob.slice(offset,offset+PDF_CHUNK_SIZE).arrayBuffer());let binary='';for(let n=0;n<bytes.length;n+=8192)binary+=String.fromCharCode(...bytes.subarray(n,n+8192));return {data:btoa(binary),offset,next:offset+bytes.length,total:file.blob.size};
}
