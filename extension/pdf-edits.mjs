/** Serialize durable PDF writes and retain dirty state on failure or concurrent edits. */
export class PDFEdits {
  constructor({read,write,onState=()=>{},delay=700}) {
    Object.assign(this,{read,write,onState,delay});this.revision=0;this.saved=0;this.pending=null;
  }
  get dirty(){return this.revision!==this.saved;}
  changed(){++this.revision;this.onState('pending');clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush().catch(()=>{}),this.delay);}
  async flush(){
    clearTimeout(this.timer);
    if(this.pending){await this.pending;if(this.dirty)return this.flush();return;}
    if(!this.dirty)return;
    this.pending=(async()=>{
      try{
        while(this.dirty){const revision=this.revision;this.onState('saving');const bytes=await this.read();await this.write(bytes);this.saved=revision;}
        this.onState('saved');
      }catch(error){this.onState('error',error);throw error;}
    })();
    try{await this.pending;}finally{this.pending=null;}
  }
}
