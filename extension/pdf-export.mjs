// Visible Q&A pages are part of the PDF itself, independent of a viewer's popups.
export async function exportAnnotatedPDF(source, notes, {PDFLib, fontkit, fontBytes, title='PDF', onProgress=()=>{}}){
 const {PDFDocument,PDFName,PDFArray,PDFHexString,rgb}=PDFLib;
 const out=await PDFDocument.load(source),original=out.getPages();
 if(!notes.length)throw Error('この論文にはまだ注釈がありません。');
 const ordered=notes.slice().sort((a,b)=>a.anchor.page-b.anchor.page||(a.anchor.rects[0]?.y||0)-(b.anchor.rects[0]?.y||0));
 for(const n of ordered)if(!original[n.anchor.page-1])throw Error('元のPDFに対応する注釈ページがありません。');
 out.registerFontkit(fontkit);
 const fonts=[];
 for(const bytes of fontBytes)fonts.push({raw:fontkit.create(bytes),pdf:await out.embedFont(bytes,{subset:false})});
 const glyphs=new Map(),ink=rgb(.13,.22,.19),green=rgb(.16,.39,.29),muted=rgb(.36,.43,.39);
 const W=595.28,H=841.89,M=44,BOTTOM=48,WIDTH=W-2*M,bodySize=10.5,leading=17;
 let page=null,y=0,appendix=0,currentNumber=0;const links=[],badges=new Map();
 function glyph(char){
  if(glyphs.has(char))return glyphs.get(char);
  const font=fonts.find(f=>f.raw.hasGlyphForCodePoint(char.codePointAt(0)));
  const result=font?{text:char,font:font.pdf}:{text:`[U+${char.codePointAt(0).toString(16).toUpperCase()}]`,font:fonts.find(f=>f.raw.hasGlyphForCodePoint(65)).pdf};
  glyphs.set(char,result);return result;
 }
 function width(items,size){return items.reduce((sum,g)=>sum+g.font.widthOfTextAtSize(g.text,size),0);}
 function draw(text,x,baseline,size,color=ink,target=page){
  const items=Array.from(text,glyph);let run='',font=null;
  function flush(){if(!run)return;target.drawText(run,{x,y:baseline,size,font,color});x+=font.widthOfTextAtSize(run,size);run='';}
  for(const g of items){if(g.font!==font){flush();font=g.font;}run+=g.text;}flush();
 }
 function addAnnotation(target,object){let a=target.node.lookupMaybe(PDFName.of('Annots'),PDFArray);if(!a){a=out.context.obj([]);target.node.set(PDFName.of('Annots'),a);}a.push(out.context.register(out.context.obj(object)));}
 function link(target,rect,destination){addAnnotation(target,{Type:'Annot',Subtype:'Link',Rect:rect,Border:[0,0,0],Dest:destination});}
 function newPage(){
  page=out.addPage([W,H]);appendix++;y=H-48;
  draw('Paper Margins',M,y,15,green);draw(appendix===1?'注釈と会話':`注釈と会話 / 続き${currentNumber?' ['+currentNumber+']':''}`,M,y-25,12,ink);
  page.drawLine({start:{x:M,y:y-38},end:{x:W-M,y:y-38},thickness:1,color:rgb(.77,.83,.78)});
  draw(`注釈 ${appendix} / 元のPDFは ${original.length} ページ`,M,26,8,muted);
  y-=62;
 }
 function space(height){if(y-height<BOTTOM)newPage();}
 function lines(text,size=bodySize,color=ink,lineHeight=leading){
  const clean=String(text||'').replace(/\r\n?/g,'\n').replace(/\t/g,'    ').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
  for(const paragraph of clean.split('\n')){
   if(!paragraph){space(lineHeight*.6);y-=lineHeight*.6;continue;}
   let buffer=[],used=0,lastBreak=-1;
   function emit(items){space(lineHeight);draw(items.map(g=>g.original).join(''),M,y,size,color);y-=lineHeight;}
   for(const char of paragraph){const g={...glyph(char),original:char},w=width([g],size);
    while(buffer.length&&used+w>WIDTH){
     let cut=lastBreak>0?lastBreak:buffer.length;while(cut>1&&(/[、。，．！？）」』】〕〉》]/u.test(buffer[cut]?.original||char)||/[（「『【〔〈《]/u.test(buffer[cut-1].original)))cut--;emit(buffer.slice(0,cut));buffer=buffer.slice(cut);while(buffer[0]?.original===' ')buffer.shift();used=width(buffer,size);lastBreak=-1;
     for(let j=0;j<buffer.length;j++)if(/[\s\u3000-\u9fff\uff00-\uffef]/u.test(buffer[j].original))lastBreak=j+1;
    }
    buffer.push(g);used+=w;if(/[\s\u3000-\u9fff\uff00-\uffef]/u.test(char))lastBreak=buffer.length;
   }
   if(buffer.length)emit(buffer);
  }
 }
 function label(text){space(42);y-=8;draw(text,M,y,11,green);y-=22;}
 function sourceRects(n,target){
  if(n.anchor.pdfRects?.length)return n.anchor.pdfRects.map(r=>[Math.min(r[0],r[2]),Math.min(r[1],r[3]),Math.max(r[0],r[2]),Math.max(r[1],r[3])]);
  const box=target.getCropBox();return n.anchor.rects.map(r=>[box.x+r.x*box.width,box.y+(1-r.y-r.h)*box.height,box.x+(r.x+r.w)*box.width,box.y+(1-r.y)*box.height]);
 }
 function mark(n,number,destination){
  const target=original[n.anchor.page-1],rects=sourceRects(n,target),r=rects[0],box=target.getCropBox();
  for(const [x0,y0,x1,y1] of rects)target.drawRectangle({x:x0,y:y0,width:Math.max(1,x1-x0),height:Math.max(1,y1-y0),borderWidth:.7,borderColor:green,color:rgb(.84,.94,.84),opacity:.15});
  const text=`[${number}]`,size=9,bw=width(Array.from(text,glyph),size)+10,bh=17;
  let x=Math.max(box.x+2,Math.min(r[0]-bw-3,box.x+box.width-bw-2)),by=Math.max(box.y+2,Math.min(r[3]-bh,box.y+box.height-bh-2));
  const occupied=badges.get(target)||[];while(occupied.some(b=>Math.abs(b.x-x)<bw+2&&Math.abs(b.y-by)<bh+2)&&by>box.y+bh+4)by-=bh+3;occupied.push({x,y:by});badges.set(target,occupied);
  target.drawRectangle({x,y:by,width:bw,height:bh,color:rgb(.93,.98,.92),borderColor:green,borderWidth:.8});draw(text,x+5,by+5,size,green,target);
  link(target,[x,by,x+bw,by+bh],destination);
  const body=[`注釈 [${number}] - PDF末尾の「注釈と会話」を参照`,...n.turns.map(t=>`質問：${t.question}\n\n回答：${t.answer}`),n.anchor.excerpt&&!(n.anchor.kind==='area'&&n.selectionImage)?`選択箇所：${n.anchor.excerpt}`:''].filter(Boolean).join('\n\n');
  addAnnotation(target,{Type:'Annot',Subtype:'Text',Rect:[x,Math.max(box.y+2,by-15),x+12,Math.max(box.y+2,by-15)+12],Contents:PDFHexString.fromText(body),T:PDFHexString.fromText('Paper Margins'),Name:'Comment',C:[.16,.39,.29],Open:false});
 }
 newPage();lines(title,9,muted,14);lines(`注釈 ${ordered.length} 件。本文の緑の番号から各注釈へ移動できます。`,9,muted,14);lines('リンクが使えない場合も、末尾のこのページから全文を読めます。',9,muted,14);y-=10;
 for(let i=0;i<ordered.length;i++){
  const n=ordered[i],number=i+1;currentNumber=number;space(130);y-=8;
  const first=page,top=y+14;lines(`[${number}] ${n.title||'注釈'}`,13,green,21);
  const sourcePage=original[n.anchor.page-1],r=sourceRects(n,sourcePage)[0];
  link(first,[M,top-22,W-M,top],[sourcePage.ref,PDFName.of('XYZ'),r[0],r[3]+30,null]);
  lines(`元のPDF ${n.anchor.page} ページ / 見出しをクリックすると元の箇所へ戻ります。`,8.5,muted,14);
  if(n.tags?.length)lines('タグ：'+n.tags.join(' / '),8.5,muted,14);
  if(n.selectionImage){const image=await out.embedPng(n.selectionImage.dataUrl),scale=Math.min(WIDTH/image.width,115/image.height,1);const iw=image.width*scale,ih=image.height*scale;space(ih+18);page.drawImage(image,{x:M,y:y-ih-7,width:iw,height:ih});y-=ih+18;}
  for(const attachment of n.attachments||[]){
   const image=await out.embedPng(attachment.dataUrl),scale=Math.min(WIDTH/image.width,330/image.height,1),iw=image.width*scale,ih=image.height*scale;space(ih+48);label('添付画像：'+attachment.name);page.drawImage(image,{x:M,y:y-ih-7,width:iw,height:ih});y-=ih+18;
  }
  if(!n.turns.length){label('質問');lines(n.title||'（質問なし）');label('回答');lines('回答はまだ保存されていません。');}
  for(let j=0;j<n.turns.length;j++){
   label(`質問 ${j+1}`);lines(n.turns[j].question);label(`回答 ${j+1}`);lines(n.turns[j].answer||'（空の回答）');
  }
  if(n.anchor.excerpt&&!(n.anchor.kind==='area'&&n.selectionImage)){label('選択箇所');lines(n.anchor.excerpt,9,muted,15);}
  space(23);y-=10;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:.6,color:rgb(.82,.86,.82)});y-=15;
  links.push({n,number,destination:[first.ref,PDFName.of('XYZ'),M,top,null]});
  onProgress(i+1,ordered.length);await new Promise(resolve=>setTimeout(resolve,0));
 }
 for(const l of links)mark(l.n,l.number,l.destination);
 return out.save();
}

export async function loadExportFonts(){
 const paths=['vendor/japanese-font/files/noto-sans-jp-export.ttf','vendor/dejavu/DejaVuSans.ttf'];
 return Promise.all(paths.map(async path=>{const response=await fetch(new URL(path,import.meta.url));if(!response.ok)throw Error('PDF書き出し用フォントを読み込めませんでした。');return new Uint8Array(await response.arrayBuffer());}));
}
