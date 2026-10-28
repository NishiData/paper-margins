import {ContinuousPDFReader} from './pdf-reader.mjs';
import {normalizeRect} from './core.mjs';

/** Same-origin bridge to the complete, locally bundled PDF.js generic viewer. */
export class StandardPDFReader extends ContinuousPDFReader {
  constructor(container,stack,callbacks){
    super(container,stack,callbacks);Object.assign(this,callbacks);this.host=container;
    this.frame=document.createElement('iframe');this.frame.id='pdf-viewer';this.frame.title='PDFビューア・手書き編集';this.frame.hidden=true;
    this.readyPromise=new Promise((resolve,reject)=>{
      const loaded=event=>{
        const source=event.detail?.source;if(source?.frameElement!==this.frame)return;
        document.removeEventListener('webviewerloaded',loaded);
        source.PDFViewerApplicationOptions.setAll({disablePreferences:true,defaultUrl:'',localeProperties:{lang:'ja'},defaultZoomValue:'page-width',viewOnLoad:1,scrollModeOnLoad:0,spreadModeOnLoad:0,disableHistory:true,externalLinkTarget:2,enableScripting:false,isEvalSupported:false,enableAltTextModelDownload:false,enableGuessAltText:false,enableNewAltTextWhenAddingImage:false,cMapUrl:'../cmaps/',standardFontDataUrl:'../standard_fonts/',wasmUrl:'../wasm/'});
        const app=source.PDFViewerApplication;
        app.initializedPromise.then(()=>{this.app=app;this.setup();resolve(app);},reject);
      };
      document.addEventListener('webviewerloaded',loaded);
      this.frame.addEventListener('error',()=>reject(Error('PDFビューアを読み込めませんでした。')),{once:true});
    });
    this.frame.src='vendor/pdfjs/web/viewer.html?file=';container.append(this.frame);
  }
  setup(){
    const app=this.app,w=this.frame.contentWindow,d=w.document,bus=app.eventBus;
    this.container=app.pdfViewer.container;this.stack=app.pdfViewer.viewer;
    const inkPanel=d.getElementById('editorInkParamsToolbar'),inkButton=d.getElementById('editorInkButton');
    const close=d.createElement('button');close.type='button';close.className='pm-ink-close';close.textContent='閉じる ×';close.setAttribute('aria-label','ペン設定を閉じる');close.onclick=()=>this.setInkSettingsOpen(false);inkPanel.prepend(close);
    // Keep the pen active when dismissing its settings, and let the icon reopen it.
    inkButton.addEventListener('click',event=>{if(app.pdfViewer.annotationEditorMode!==15)return;event.preventDefault();event.stopImmediatePropagation();if(this.mode==='erase'){this.setMode('ink');this.onMode?.('ink');this.setInkSettingsOpen(true);}else this.setInkSettingsOpen(inkPanel.classList.contains('hidden'));},true);
    const dismiss=event=>{if(!inkPanel.contains(event.target)&&!inkButton.contains(event.target))this.setInkSettingsOpen(false);};
    d.addEventListener('pointerdown',dismiss,true);document.addEventListener('pointerdown',()=>this.setInkSettingsOpen(false),true);
    const escape=event=>{if(event.key!=='Escape'||inkPanel.classList.contains('hidden'))return false;event.preventDefault();event.stopImmediatePropagation();this.setInkSettingsOpen(false);return true;};
    document.addEventListener('keydown',escape,true);

    this.stack.addEventListener('mouseup',e=>this.selectText(e));
    d.addEventListener('pointerdown',e=>this.eraseAt(e).catch(this.onError),true);
    bus.on('pagechanging',({pageNumber})=>{this.currentPage=pageNumber;this.onPage(pageNumber);});
    for(const name of ['pagesinit','pagerendered','textlayerrendered','annotationeditorlayerrendered','scalechanging','rotationchanging'])bus.on(name,()=>this.syncViews());
    bus.on('annotationeditoruimanager',({uiManager})=>{this.uiManager=uiManager;});
    bus.on('annotationeditormodechanged',({mode})=>{const m=mode===15?(this.mode==='erase'?'erase':'ink'):mode>0?'edit':this.mode==='area'?'area':'text';this.setMode(m);this.onMode?.(m);});
    bus.on('editingstateschanged',()=>this.edited());
    const schedule=e=>{if(this.pdf&&(this.app.pdfViewer.annotationEditorMode>0||e.target.closest?.('.annotationEditorLayer,.annotationLayer,#editorInkParamsToolbar,#editorFreeTextParamsToolbar')))this.edited();};
    w.addEventListener('pointerup',e=>{this.pointerActive=false;schedule(e);});
    w.addEventListener('pointercancel',()=>{this.pointerActive=false;this.edited();});
    w.addEventListener('pointerdown',()=>{this.pointerActive=true;},{capture:true});
    for(const name of ['keyup','input','change'])d.addEventListener(name,schedule,true);
    d.addEventListener('change',e=>{if(e.target.id!=='fileInput')return;e.stopImmediatePropagation();if(e.target.files[0])this.onFile?.(e.target.files[0]);},true);
    d.addEventListener('keydown',e=>{if(escape(e))return;if(e.key==='Escape')this.onEscape?.();},true);
    // Never let the embedded viewer open a different document behind the shelf.
    d.addEventListener('drop',e=>{e.preventDefault();e.stopImmediatePropagation();if(e.dataTransfer?.files[0])this.onFile?.(e.dataTransfer.files[0]);},true);
    bus.on('documenterror',({message,reason})=>this.onError(Error(message||reason||'PDFを表示できませんでした。')));
    app.downloadOrSave=async()=>{await this.onDownload?.();};
  }
  setInkSettingsOpen(open){
    if(!this.app)return;const d=this.frame.contentDocument,panel=d.getElementById('editorInkParamsToolbar');
    panel.classList.toggle('hidden',!open);d.getElementById('editorInkButton').setAttribute('aria-expanded',String(open));
  }
  edited(){if(this.pdf&&!this.suppressEdits)this.onDirty?.();}
  async close(){
    if(!this.app)return;this.pdf=null;this.suppressEdits=true;
    // Edits have already been saved by the owner before closing; don't download on switch.
    delete this.app._annotationStorageModified;await this.app.close();
    this.views.clear();this.notes=[];this.selected=null;this.uiManager=null;this.ready=false;
  }
  async load(data){
    await this.readyPromise;this.frame.hidden=false;this.host.classList.add('standard-viewer');this.suppressEdits=true;
    await this.app.open({data});const pdf=this.app.pdfDocument;if(!pdf)throw Error('PDFを読み込めませんでした。');
    await this.app.pdfViewer.firstPagePromise;await this.app.pdfViewer.pagesPromise;
    this.pdf=pdf;this.ready=true;this.syncViews();return pdf;
  }
  async open(){this.syncViews();this.app.pdfViewer.currentScaleValue='page-width';this.zoom=1;this.setMode('text');await this.app.pdfViewer.onePageRendered;this.suppressEdits=false;}
  syncViews(){
    if(!this.pdf)return;const viewer=this.app.pdfViewer;
    for(let n=1;n<=this.pdf.numPages;n++){
      const pv=viewer.getPageView(n-1);if(!pv)continue;
      let v=this.views.get(n);const element=pv.div;element.classList.add('pdf-page');element.dataset.page=n;
      if(!v){v={number:n,element};this.views.set(n,v);}
      Object.assign(v,{page:pv.pdfPage,viewport:pv.viewport,canvas:pv.canvas,text:pv.textLayer?.div||element.querySelector('.textLayer')});
      // PDF.js may replace its page contents during zoom or canvas eviction.
      for(const [key,css] of [['marks','page-marks'],['area','area-layer'],['draft','draft-mark']])if(!v[key]?.isConnected){const node=element.ownerDocument.createElement('div');node.className=css;element.append(node);v[key]=node;if(key==='area')this.bindArea(v);}
    }
    this.drawMarks();
  }
  async layout(zoom=this.zoom){
    if(!this.pdf)return;
    // PDF.js manages resize, native toolbar scale and the user's chosen scroll mode.
    if(zoom!==this.zoom){const viewer=this.app.pdfViewer;viewer.currentScale=viewer.currentScale*(zoom/this.zoom);this.zoom=zoom;}
    this.syncViews();
  }
  async render(v){
    if(!v?.page)v.page=await this.pdf.getPage(v.number);
    const pv=this.app.pdfViewer.getPageView(v.number-1);this.app.pdfViewer.forceRendering();
    if(pv?.renderingState!==3)await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{this.app.eventBus.off('pagerendered',done);reject(Error('ページの描画が完了しませんでした。'));},15000);const done=e=>{if(e.pageNumber!==v.number)return;clearTimeout(timeout);this.app.eventBus.off('pagerendered',done);e.error?reject(e.error):resolve();};this.app.eventBus.on('pagerendered',done);});
    this.syncViews();
  }
  async renderNearby(){} // Upstream PDFRenderingQueue owns rendering and memory eviction.
  updateCurrentPage(){}
  clear(){this.views.clear();this.notes=[];this.pdf=null;this.ready=false;}
  async jump(n){if(!this.pdf)return;this.app.pdfViewer.scrollPageIntoView({pageNumber:Math.max(1,Math.min(this.pdf.numPages,n))});this.syncViews();}
  async jumpToAnchor(anchor){
    if(!this.pdf)return;
    // Let the docked notes panel finish resizing the viewer before locating the mark.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    this.syncViews();const v=this.views.get(anchor.page),r=v&&this.rects({anchor},v)?.[0];
    if(!r){await this.jump(anchor.page);return;}
    const [x,y]=v.viewport.convertToPdfPoint(Math.max(0,r.x*v.viewport.width-20),Math.max(0,r.y*v.viewport.height-40));
    this.app.pdfViewer.scrollPageIntoView({pageNumber:anchor.page,destArray:[null,{name:'XYZ'},x,y,null],ignoreDestinationZoom:true});
    this.syncViews();
  }
  setMode(mode){
    this.mode=mode;if(!this.app)return;
    this.stack.classList.toggle('area-mode',mode==='area');this.stack.classList.toggle('edit-mode',mode==='ink'||mode==='edit'||mode==='erase');
    this.stack.classList.toggle('erase-mode',mode==='erase');
    if(mode==='erase')this.uiManager?.currentLayer?.endDrawingSession();
    const current=this.app.pdfViewer.annotationEditorMode;
    const desired=mode==='ink'||mode==='erase'?15:mode==='edit'?current:0;
    if(current!==desired&&current!==-1)this.app.eventBus.dispatch('switchannotationeditormode',{source:this,mode:desired});
  }
  async eraseAt(event){
    if(this.mode!=='erase'||event.button!==0)return;
    const page=event.target.closest('.pdf-page');if(!page)return;
    // Capture the gesture before PDF.js starts a new ink stroke.
    event.preventDefault();event.stopImmediatePropagation();this.pointerActive=false;
    let element=event.target.closest('.inkEditor');
    if(!element)element=Array.from(page.querySelectorAll('.inkEditor')).reverse().find(el=>{const b=el.getBoundingClientRect();return event.clientX>=b.left-5&&event.clientX<=b.right+5&&event.clientY>=b.top-5&&event.clientY<=b.bottom+5;});
    const editor=element&&this.uiManager?.getEditor(element.id);if(!editor)return;
    this.erasing ||= new Set();if(this.erasing.has(editor))return;this.erasing.add(editor);
    // PDF.js builds the edit toolbar asynchronously. Finish that before removal
    // so its pending button builders don't try to access a deleted toolbar.
    const pdf=this.pdf,manager=this.uiManager;
    try{
      await editor.addEditToolbar();
      if(this.pdf!==pdf||this.mode!=='erase'||!element.isConnected)return;
      manager.setSelected(editor);manager.delete();this.edited();
    }finally{this.erasing.delete(editor);}
  }
  undoEdit(){
    if(!this.uiManager)return;
    this.uiManager.commitOrRemove();this.uiManager.currentLayer?.endDrawingSession();this.uiManager.undo();this.edited();
  }
  rects(note,v){
    if(!note.anchor.pdfRects?.length)return note.anchor.rects;
    return note.anchor.pdfRects.map(r=>{const [x1,y1,x2,y2]=v.viewport.convertToViewportRectangle(r);return {x:Math.min(x1,x2)/v.viewport.width,y:Math.min(y1,y2)/v.viewport.height,w:Math.abs(x2-x1)/v.viewport.width,h:Math.abs(y2-y1)/v.viewport.height};});
  }
  drawMarks(){
    for(const v of this.views.values())v.marks?.replaceChildren();
    for(const note of this.notes||[]){const v=this.views.get(note.anchor.page);if(!v?.marks)continue;
      for(const r of this.rects(note,v)){const b=v.element.ownerDocument.createElement('button');b.className='mark'+(this.selected===note.id?' focused':'');Object.assign(b.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});b.title=note.title;b.setAttribute('aria-label',note.title);b.onclick=()=>Promise.resolve(this.onNote(note,{navigate:false})).catch(this.onError);v.marks.append(b);}
    }
  }
  selectText(event){
    if(this.mode!=='text'||event.target.closest('.mark'))return;
    const s=this.frame.contentWindow.getSelection();if(!s||s.isCollapsed||!s.rangeCount)return;
    const range=s.getRangeAt(0),el=node=>(node.nodeType===1?node:node.parentElement)?.closest('.pdf-page'),start=el(range.startContainer),end=el(range.endContainer);
    if(!start||!end||!this.stack.contains(start))return;
    if(start!==end){this.onError(Error('注釈を付ける箇所は、1ページ内で選択してください。'));return;}
    this.syncViews();const v=this.views.get(Number(start.dataset.page));if(!v?.text?.contains(range.startContainer)||!v.text.contains(range.endContainer))return;
    const bounds=v.element.getBoundingClientRect(),rects=Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0).map(r=>normalizeRect(r,bounds));
    if(rects.length)this.onSelect(this.anchor(v,rects,s.toString(),'text'));
  }
  async crop(anchor){
    this.syncViews();const v=this.views.get(anchor.page);if(!v)throw Error('対象のページが見つかりません。');
    // PDF.js loads its FontFaces into the iframe document. The render canvas must
    // belong to that same document, or embedded math fonts become missing glyphs.
    // Render a clean offscreen page so cropping works even after canvas eviction.
    const page=await this.pdf.getPage(anchor.page),vp=page.getViewport({scale:Math.max(1.5,v.viewport.scale),rotation:v.viewport.rotation}),src=this.frame.contentDocument.createElement('canvas');src.width=Math.ceil(vp.width);src.height=Math.ceil(vp.height);
    await page.render({canvasContext:src.getContext('2d'),viewport:vp}).promise;
    const r=this.rects({anchor},v)[0],c=this.frame.contentDocument.createElement('canvas');c.width=Math.max(1,Math.round(src.width*r.w));c.height=Math.max(1,Math.round(src.height*r.h));c.getContext('2d').drawImage(src,src.width*r.x,src.height*r.y,src.width*r.w,src.height*r.h,0,0,c.width,c.height);
    return new Promise((resolve,reject)=>c.toBlob(blob=>blob?resolve(blob):reject(Error('選択画像を作成できませんでした。')),'image/png'));
  }
  async bytes(){
    if(!this.pdf)throw Error('PDFが開かれていません。');
    if(this.pointerActive)await new Promise(resolve=>{this.frame.contentWindow.addEventListener('pointerup',resolve,{once:true});this.frame.contentWindow.addEventListener('pointercancel',resolve,{once:true});});
    this.suppressEdits=true;
    try{this.uiManager?.commitOrRemove();this.uiManager?.currentLayer?.endDrawingSession();}finally{this.suppressEdits=false;}
    return new Uint8Array(this.pdf.annotationStorage.size?await this.pdf.saveDocument():await this.pdf.getData());
  }
}
