// Store raster attachments independently of the PDF selection screenshot.
export const MAX_NOTE_IMAGES=10;
export function validateNoteImages(images=[]){
 if(!Array.isArray(images)||images.length>MAX_NOTE_IMAGES)throw Error('画像は1つの注釈に10枚まで添付できます。');
 const ids=new Set();let total=0;
 return images.map(image=>{
  if(!image||typeof image.id!=='string'||!image.id||image.id.length>100||ids.has(image.id)||typeof image.name!=='string'||typeof image.dataUrl!=='string'||image.dataUrl.length>6000000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image.dataUrl))throw Error('添付画像の形式を確認してください。');
  ids.add(image.id);total+=image.dataUrl.length;if(total>24000000)throw Error('添付画像の合計サイズが大きすぎます。枚数を減らしてください。');
  return {id:image.id,name:image.name.replace(/[\\/:*?"<>|]/g,'_').slice(0,180)||'image.png',dataUrl:image.dataUrl};
 });
}
export async function readNoteImages(files){
 if(files.length>MAX_NOTE_IMAGES)throw Error('画像は一度に10枚まで選択できます。');
 const images=[];
 for(const file of files){
  if(!/^(image\/(png|jpeg|webp|gif))$/.test(file.type)||file.size>20*1024*1024)throw Error('20MB以下のPNG・JPEG・WebP・GIF画像を選んでください。');
  const url=URL.createObjectURL(file),img=new Image();
  try{
   img.src=url;await img.decode();let scale=Math.min(1,2048/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement('canvas');let dataUrl;
   do{canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);dataUrl=canvas.toDataURL('image/png');scale*=.75;}while(dataUrl.length>6000000&&canvas.width>1&&canvas.height>1);
   images.push({id:crypto.randomUUID(),name:file.name.replace(/\.[^.]+$/,'')+'.png',dataUrl});
  }catch{throw Error(`画像を読み込めませんでした：${file.name}`);}finally{URL.revokeObjectURL(url);}
 }
 return validateNoteImages(images);
}
