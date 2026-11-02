import {splitMath} from './export-math.mjs';
// Visible Q&A pages are part of the PDF itself, independent of a viewer's popups.
export async function exportAnnotatedPDF(source, notes, {PDFLib, fontkit, fontBytes, title='PDF', onProgress=()=>{}, renderMath}){
 const {PDFDocument,PDFName,PDFArray,PDFHexString,rgb}=PDFLib;
 const out=await PDFDocument.load(source),original=out.getPages();
 if(!notes.length)throw Error('この論文にはまだ注釈がありません。');
 const ordered=notes.slice().sort((a,b)=>a.anchor.page-b.anchor.page||(a.anchor.rects[0]?.y||0)-(b.anchor.rects[0]?.y||0));
 for(const n of ordered)if(!original[n.anchor.page-1])throw Error('元のPDFに対応する注釈ページがありません。');
 out.registerFontkit(fontkit);
 const fonts=[];
 for(const bytes of fontBytes)fonts.push({raw:fontkit.create(bytes),pdf:await out.embedFont(bytes,{subset:false})});
 const glyphs=new Map(),ink=rgb(.07,.07,.07),green=rgb(.16,.39,.29),muted=rgb(.38,.38,.38);
 const W=595.28,H=841.89,M=57,BOTTOM=54,WIDTH=W-2*M,bodySize=11,leading=18;
 let page=null,y=0,appendix=0,currentNumber=0,equation=0;const links=[],badges=new Map();
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
  page=out.addPage([W,H]);appendix++;y=H-78;
  draw(currentNumber?`読書注釈 / ${currentNumber} 節`:'読書注釈',M,H-37,8,muted);
  const reference=`原論文 ${original.length} 頁`;draw(reference,W-M-width(Array.from(reference,glyph),8),H-37,8,muted);
  page.drawLine({start:{x:M,y:H-46},end:{x:W-M,y:H-46},thickness:.35,color:rgb(.62,.62,.62)});
  const number=String(original.length+appendix);draw(number,(W-width(Array.from(number,glyph),9))/2,27,9,ink);
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
 const mathCache=new Map();
 async function math(tex,display,size){
  if(!renderMath)throw Error('PDF出力用の数式描画処理がありません。');
  const key=JSON.stringify([tex,display,size]);if(!mathCache.has(key))mathCache.set(key,(async()=>{const result=await renderMath(tex,{display,size,maxWidth:display?WIDTH-38:WIDTH});return {...result,image:await out.embedPng(result.dataUrl)};})());return mathCache.get(key);
 }
 async function richLines(text,size=bodySize,color=ink,lineHeight=leading){
  let runs=[],used=0;
  function emit(){
   if(!runs.length)return;
   const ascent=Math.max(size,...runs.map(r=>r.math?r.height-r.depth:0)),descent=Math.max(3,...runs.map(r=>r.math?r.depth:0)),height=Math.max(lineHeight,ascent+descent+5);
   space(height);const baseline=y-Math.max(0,ascent-size);let x=M;
   for(const run of runs){if(run.math)page.drawImage(run.image,{x,y:baseline-run.depth,width:run.width,height:run.height});else draw(run.text,x,baseline,size,color);x+=run.width;}y-=height;runs=[];used=0;
  }
  for(const part of splitMath(text)){
   if(part.math!==undefined){
    const image=await math(part.math,part.display,size);
    if(part.display){emit();space(image.height+24);page.drawImage(image.image,{x:M+(WIDTH-image.width)/2,y:y-image.height-6,width:image.width,height:image.height});const number=`(${++equation})`;draw(number,W-M-width(Array.from(number,glyph),9),y-image.height/2-9,9,ink);y-=image.height+24;}
    else{if(used+image.width>WIDTH)emit();runs.push({...image,math:true});used+=image.width;}
   }else for(const token of part.text.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').match(/\n|[^\S\n]+|[A-Za-z0-9_]+|./gu)||[]){
    if(token==='\n'){if(runs.length)emit();else{space(lineHeight*.6);y-=lineHeight*.6;}continue;}
    for(const char of token){const w=width([glyph(char)],size);if(used+w>WIDTH)emit();const last=runs.at(-1);if(last&&!last.math){last.text+=char;last.width+=w;}else runs.push({text:char,width:w});used+=w;}
   }
  }
  emit();
 }
 function label(text){space(60);y-=12;draw(text,M,y,11,ink);y-=23;}
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
 async function figure(data,caption,maxHeight){
  const image=await out.embedPng(data),scale=Math.min(WIDTH/image.width,maxHeight/image.height,1),w=image.width*scale,h=image.height*scale;
  const captionWidth=width(Array.from(caption,glyph),9),captionHeight=Math.ceil(captionWidth/WIDTH)*14;space(h+Math.max(65,captionHeight+38));y-=8;page.drawImage(image,{x:M+(WIDTH-w)/2,y:y-h,width:w,height:h});y-=h+17;if(captionWidth<=WIDTH){draw(caption,(W-captionWidth)/2,y,9,muted);y-=14;}else lines(caption,9,muted,14);y-=9;
 }
 newPage();const heading='論文読書ノート';draw(heading,(W-width(Array.from(heading,glyph),19))/2,y,19,ink);y-=31;
 lines(title,10,muted,16);y-=7;
 lines(`原論文の選択箇所に対応する ${ordered.length} 件の注釈・質疑を収録する。`,9.5,muted,15);
 lines('各節の見出しから原論文へ戻ることができる。',9.5,muted,15);y-=20;
 for(let i=0;i<ordered.length;i++){
  const n=ordered[i],number=i+1;currentNumber=number;space(140);y-=14;
  const first=page,top=y+14;await richLines(`${number}　${n.title||'注釈'}`,14,ink,24);
  const sourcePage=original[n.anchor.page-1],r=sourceRects(n,sourcePage)[0];
  link(first,[M,top-22,W-M,top],[sourcePage.ref,PDFName.of('XYZ'),r[0],r[3]+30,null]);
  lines(`出典：原論文 p. ${n.anchor.page}`,9,muted,15);
  if(n.tags?.length)lines('タグ：'+n.tags.join(' / '),8.5,muted,14);
  let figureNumber=0;
  if(n.anchor.excerpt&&!(n.anchor.kind==='area'&&n.selectionImage)){label('原文');lines(n.anchor.excerpt,9.5,muted,16);y-=5;}
  if(n.selectionImage)await figure(n.selectionImage.dataUrl,`図 ${number}.${++figureNumber}　原論文の選択箇所（p. ${n.anchor.page}）`,175);
  for(const attachment of n.attachments||[])await figure(attachment.dataUrl,`図 ${number}.${++figureNumber}　${attachment.name}`,290);
  if(!n.turns.length){label(`${number}.1　問い`);await richLines(n.title||'（質問なし）');label('回答');lines('回答はまだ保存されていません。');}
  for(let j=0;j<n.turns.length;j++){
   label(`${number}.${j+1}　問い`);await richLines(n.turns[j].question);label('回答');await richLines(n.turns[j].answer||'（空の回答）');
  }
  y-=18;
  links.push({n,number,destination:[first.ref,PDFName.of('XYZ'),M,top,null]});
  onProgress(i+1,ordered.length);await new Promise(resolve=>setTimeout(resolve,0));
 }
 for(const l of links)mark(l.n,l.number,l.destination);
 return out.save();
}

export async function loadExportFonts(){
 const paths=['vendor/noto-serif-jp/NotoSerifJP-Regular.ttf','vendor/dejavu/DejaVuSans.ttf'];
 return Promise.all(paths.map(async path=>{const response=await fetch(new URL(path,import.meta.url));if(!response.ok)throw Error('PDF書き出し用フォントを読み込めませんでした。');return new Uint8Array(await response.arrayBuffer());}));
}
