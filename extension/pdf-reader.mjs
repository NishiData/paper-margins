import * as pdfjs from './vendor/pdfjs/build/pdf.mjs';
import {normalizeRect} from './core.mjs';

export class ContinuousPDFReader {
  constructor(container, stack, {onSelect, onPage, onError}) {
    this.container=container; this.stack=stack; this.onSelect=onSelect; this.onPage=onPage; this.onError=onError;
    this.views=new Map(); this.mode='text'; this.zoom=1; this.currentPage=1; this.epoch=0; this.pinnedPage=null;
    container.addEventListener('scroll',()=>{
      this.updateCurrentPage(); clearTimeout(this.scrollTimer);
      this.scrollTimer=setTimeout(()=>this.renderNearby().catch(onError),80);
    },{passive:true});
    stack.addEventListener('mouseup',e=>this.selectText(e));
  }
  top(view) { return view.element.getBoundingClientRect().top-this.container.getBoundingClientRect().top+this.container.scrollTop; }
  position() {
    const top=this.container.scrollTop+24;
    for(const v of this.views.values()) if(this.top(v)+v.viewport.height>top)
      return {page:v.number,fraction:Math.max(0,(top-this.top(v))/v.viewport.height)};
    return {page:this.currentPage,fraction:0};
  }
  release(v) {
    ++v.job; v.task?.cancel(); v.textTask?.cancel(); v.promise=null; v.rendered=false;
    v.canvas.width=0; v.canvas.height=0; v.text.replaceChildren();
    v.element.classList.add('loading');
  }
  clear() {
    ++this.epoch; clearTimeout(this.scrollTimer);
    for(const v of this.views.values()) this.release(v);
    this.views.clear(); this.stack.replaceChildren(); this.pdf=null; this.ready=false; this.currentPage=1; this.pinnedPage=null;this.notes=[];this.selected=null;
  }
  async open(pdf) {
    this.clear(); this.pdf=pdf; const epoch=this.epoch;
    const fragment=document.createDocumentFragment();
    for(let n=1;n<=pdf.numPages;n++) {
      const page=await pdf.getPage(n); if(epoch!==this.epoch)return;
      const element=document.createElement('section'); element.className='pdf-page loading'; element.dataset.page=n;
      element.setAttribute('aria-label',`PDF ${n}ページ`);
      const label=document.createElement('span'); label.className='page-label'; label.textContent=`${n} / ${pdf.numPages}`;
      const canvas=document.createElement('canvas'); canvas.className='pdf-canvas';
      const text=document.createElement('div'); text.className='textLayer';
      const marks=document.createElement('div'); marks.className='page-marks';
      const area=document.createElement('div'); area.className='area-layer';
      const draft=document.createElement('div'); draft.className='draft-mark';
      element.append(label,canvas,text,marks,area,draft); fragment.append(element);
      const view={number:n,page,element,canvas,text,marks,area,draft,job:0,rendered:false,promise:null};
      this.views.set(n,view); this.bindArea(view);
    }
    this.stack.append(fragment); this.stack.hidden=false; this.container.scrollTop=0;this.ready=true;
    await this.layout(1,false); this.updateCurrentPage();
  }
  async layout(zoom=this.zoom,preserve=true) {
    if(!this.pdf||!this.ready||!this.views.size)return;
    const position=preserve?this.position():{page:1,fraction:0}; ++this.epoch; this.zoom=zoom;
    const width=Math.max(220,this.container.clientWidth-48);
    for(const v of this.views.values()) {
      this.release(v); const base=v.page.getViewport({scale:1});
      const scale=Math.min(1.65,width/base.width)*zoom;
      v.viewport=v.page.getViewport({scale});
      Object.assign(v.element.style,{width:v.viewport.width+'px',height:v.viewport.height+'px'});
      Object.assign(v.canvas.style,{width:v.viewport.width+'px',height:v.viewport.height+'px'});
      v.element.style.setProperty('--total-scale-factor',scale); v.element.style.setProperty('--scale-factor',scale);
      v.draft.style.display='none';
    }
    const v=this.views.get(position.page)||this.views.get(1);
    this.container.scrollTop=Math.max(0,this.top(v)+position.fraction*v.viewport.height-24);
    this.updateCurrentPage(); this.drawMarks(); await this.renderNearby();
  }
  updateCurrentPage() {
    if(!this.ready||!this.views.size)return;
    const probe=this.container.scrollTop+Math.min(160,this.container.clientHeight*.25);
    let number=1;
    for(const v of this.views.values()){if(this.top(v)<=probe)number=v.number;else break;}
    this.currentPage=number; this.onPage(number);
  }
  async renderNearby() {
    if(!this.pdf||!this.ready)return;
    const top=this.container.scrollTop-700,bottom=this.container.scrollTop+this.container.clientHeight+700;
    const near=Array.from(this.views.values()).filter(v=>this.top(v)<bottom&&this.top(v)+v.viewport.height>top);
    const results=await Promise.allSettled(near.map(v=>this.render(v)));
    for(const r of results) if(r.status==='rejected')this.onError(r.reason);
    for(const v of this.views.values()) if(v.rendered&&Math.abs(v.number-this.currentPage)>3&&v.number!==this.pinnedPage)this.release(v);
  }
  async render(v) {
    if(v.rendered)return; if(v.promise)return v.promise;
    const epoch=this.epoch,job=++v.job,valid=()=>epoch===this.epoch&&job===v.job;
    v.promise=(async()=>{
      const vp=v.viewport,dpr=window.devicePixelRatio||1;
      v.canvas.width=Math.ceil(vp.width*dpr); v.canvas.height=Math.ceil(vp.height*dpr);
      v.task=v.page.render({canvasContext:v.canvas.getContext('2d'),viewport:vp,transform:dpr===1?null:[dpr,0,0,dpr,0,0]});
      try{await v.task.promise;}catch(e){if(!valid()||e.name==='RenderingCancelledException')return;throw e;}
      if(!valid())return; const content=await v.page.getTextContent(); if(!valid())return;
      v.textTask=new pdfjs.TextLayer({textContentSource:content,container:v.text,viewport:vp});
      try{await v.textTask.render();}catch(e){if(!valid()||e.name==='AbortException')return;throw e;}
      if(!valid())return; v.rendered=true; v.element.classList.remove('loading');
    })().catch(e=>{if(valid())throw e;}).finally(()=>{if(job===v.job)v.promise=null;});
    return v.promise;
  }
  async jump(n) {
    if(!this.pdf||!this.ready)return;
    const v=this.views.get(Math.min(this.pdf.numPages,Math.max(1,n))); if(!v)return;
    this.container.scrollTo({top:Math.max(0,this.top(v)-24),behavior:'instant'});
    this.updateCurrentPage(); await this.render(v); await this.renderNearby();
  }
  setMode(mode) {this.mode=mode;this.stack.classList.toggle('area-mode',mode==='area');}
  setNotes(notes,selected,onClick) {this.notes=notes;this.selected=selected;this.onNote=onClick;this.drawMarks();}
  drawMarks() {
    for(const v of this.views.values())v.marks.replaceChildren();
    for(const n of this.notes||[]) {
      const v=this.views.get(n.anchor.page);if(!v)continue;
      for(const r of n.anchor.rects){const b=document.createElement('button');b.className='mark'+(this.selected===n.id?' focused':'');
        Object.assign(b.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});
        b.title=n.title;b.setAttribute('aria-label',n.title);b.onclick=()=>Promise.resolve(this.onNote(n)).catch(this.onError);v.marks.append(b);}
    }
  }
  anchor(v,rects,excerpt,kind) {
    const vp=v.viewport;this.pinnedPage=v.number;
    if(kind==='area'&&!excerpt){const region=rects[0],bounds=v.element.getBoundingClientRect();
      excerpt=Array.from(v.text.querySelectorAll('span')).filter(span=>{const b=span.getBoundingClientRect(),x=(b.left-bounds.left)/bounds.width,y=(b.top-bounds.top)/bounds.height,w=b.width/bounds.width,h=b.height/bounds.height;const ix=Math.max(0,Math.min(x+w,region.x+region.w)-Math.max(x,region.x)),iy=Math.max(0,Math.min(y+h,region.y+region.h)-Math.max(y,region.y));return ix*iy>0.25*w*h;}).map(s=>s.textContent).join(' ').trim();
    }
    return {page:v.number,kind,excerpt,rects,pdfRects:rects.map(r=>[...vp.convertToPdfPoint(r.x*vp.width,r.y*vp.height),...vp.convertToPdfPoint((r.x+r.w)*vp.width,(r.y+r.h)*vp.height)])};
  }
  selectText(event) {
    if(this.mode!=='text'||event.target.closest('.mark'))return;
    const s=window.getSelection();if(!s||s.isCollapsed||!s.rangeCount)return;
    const range=s.getRangeAt(0);const start=(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement)?.closest('.pdf-page');
    const end=(range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement)?.closest('.pdf-page');
    if(!start||!end||!this.stack.contains(start))return;
    if(start!==end){this.onError(Error('注釈を付ける箇所は、1ページ内で選択してください。'));return;}
    const v=this.views.get(Number(start.dataset.page));if(!v.text.contains(range.startContainer)||!v.text.contains(range.endContainer))return;
    const bounds=v.element.getBoundingClientRect(),rects=Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0).map(r=>normalizeRect(r,bounds));
    if(rects.length){for(const p of this.views.values())p.draft.style.display='none';this.onSelect(this.anchor(v,rects,s.toString(),'text'));}
  }
  bindArea(v) {
    let drag=null;
    const rect=e=>{const b=v.element.getBoundingClientRect(),x=Math.min(b.width,Math.max(0,e.clientX-b.left)),y=Math.min(b.height,Math.max(0,e.clientY-b.top));return {left:Math.min(x,drag.x),top:Math.min(y,drag.y),width:Math.abs(x-drag.x),height:Math.abs(y-drag.y)};};
    const draw=r=>Object.assign(v.draft.style,{display:'block',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
    v.area.addEventListener('pointerdown',e=>{e.preventDefault();const b=v.element.getBoundingClientRect();for(const p of this.views.values())p.draft.style.display='none';drag={x:Math.min(b.width,Math.max(0,e.clientX-b.left)),y:Math.min(b.height,Math.max(0,e.clientY-b.top))};v.area.setPointerCapture(e.pointerId);});
    v.area.addEventListener('pointermove',e=>{if(drag)draw(rect(e));});
    v.area.addEventListener('pointercancel',()=>{drag=null;v.draft.style.display='none';});
    v.area.addEventListener('pointerup',e=>{if(!drag)return;const r=rect(e);drag=null;if(r.width<6||r.height<6)return;draw(r);const normalized=normalizeRect(r,{left:0,top:0,width:v.viewport.width,height:v.viewport.height});this.onSelect(this.anchor(v,[normalized],'','area'));});
  }
  async crop(anchor) {
    const v=this.views.get(anchor.page);if(!v)throw Error('対象のページが見つかりません。');await this.render(v);
    const r=anchor.rects[0],src=v.canvas,c=document.createElement('canvas');c.width=Math.round(src.width*r.w);c.height=Math.round(src.height*r.h);
    c.getContext('2d').drawImage(src,src.width*r.x,src.height*r.y,src.width*r.w,src.height*r.h,0,0,c.width,c.height);
    return new Promise(resolve=>c.toBlob(resolve,'image/png'));
  }
}
