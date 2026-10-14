/* DOM-only helpers: no private ChatGPT endpoints, cookies or credentials. */
globalThis.PaperMarginsCapture={
 text(element){
  const clone=element.cloneNode(true);
  for(const math of clone.querySelectorAll('.katex')){
   const tex=math.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
   if(!tex)continue;const display=math.closest('.katex-display');const n=clone.ownerDocument.createTextNode(display?`\n\\[${tex}\\]\n`:`\\(${tex}\\)`);if(display)display.replaceWith(n);else math.replaceWith(n);
  }
  clone.querySelectorAll('button,svg,[aria-hidden="true"],.sr-only').forEach(n=>n.remove());
  clone.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));
  clone.querySelectorAll('p,li,h1,h2,h3,h4,pre,blockquote,tr').forEach(n=>n.append('\n'));
  return (clone.textContent||'').replace(/\n{3,}/g,'\n\n').trim();
 },
 role(element){
  for(const attr of ['data-message-author-role','data-role','data-author','data-turn']){const value=element.getAttribute(attr);if(['user','assistant'].includes(value))return value;}
  const label=(element.getAttribute('aria-label')||'')+' '+(element.querySelector('.sr-only')?.textContent||'');
  if(/you said|user message|あなたの(?:発言|メッセージ)|あなた[:：]/i.test(label))return 'user';
  if(/chatgpt said|assistant message|chatgpt[:：]|chatgpt の発言/i.test(label))return 'assistant';
  if(element.matches('[data-testid="user-message"],.user-message,.message-user')||element.querySelector('[data-testid="user-message"],.user-message,.message-user'))return 'user';
  if(element.matches('[data-testid="assistant-message"],.assistant-message,.message-assistant,.markdown,.prose')||element.querySelector('[data-testid="assistant-message"],.assistant-message,.message-assistant,.markdown,.prose'))return 'assistant';
  if(element.matches('[data-testid^="conversation-turn-"]')&&element.querySelector('.whitespace-pre-wrap'))return 'user';
  if(element.matches('.whitespace-pre-wrap,.whitespace-pre-line')&&!element.closest('form,pre,code,[contenteditable]'))return 'user';
  return null;
 },
 messages(root=document){
  const out=[],add=e=>{if(!this.role(e)||e.closest('#paper-margins-bridge'))return;if(out.some(x=>x===e||x.contains(e)||e.contains(x)))return;out.push(e);};
  root.querySelectorAll('[data-message-author-role],[data-role="user"],[data-role="assistant"],[data-author="user"],[data-author="assistant"],[data-turn="user"],[data-turn="assistant"],[data-testid="user-message"],[data-testid="assistant-message"]').forEach(add);
  root.querySelectorAll('article[data-testid^="conversation-turn-"],article[data-turn],article[aria-label],.user-message,.assistant-message,.message-user,.message-assistant').forEach(add);
  root.querySelectorAll('main .markdown,main .prose').forEach(add);
  root.querySelectorAll('main .whitespace-pre-wrap,main .whitespace-pre-line').forEach(e=>{if(!e.closest('form,pre,code,[contenteditable]'))add(e);});
  return out.sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
 },
 id(element,root=document){return element.dataset.messageId||element.closest('[data-message-id]')?.dataset.messageId||element.closest('[data-testid^="conversation-turn-"]')?.getAttribute('data-testid')||`turn-${this.messages(root).indexOf(element)}`;},
 pair(element,root=document,fallbackQuestion=''){const ms=this.messages(root),i=ms.indexOf(element);let user=null;for(let j=i-1;j>=0;j--)if(this.role(ms[j])==='user'){user=ms[j];break;}const body=element.matches('.markdown,.prose')?element:(element.querySelector('.markdown,.prose')||element);const question=user?this.text(user):fallbackQuestion,answer=this.text(body);if(!question||!answer)return null;return {id:this.id(element,root),question,answer};},
 visible(element){const r=element.getBoundingClientRect(),style=getComputedStyle(element);return r.width>0&&r.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse'&&!element.disabled&&!element.closest('[hidden],[inert],[aria-hidden="true"]');},
 streaming(root=document){return Array.from(root.querySelectorAll('[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="生成を停止する"],button[aria-label="応答の生成を停止"]')).some(e=>this.visible(e));},
 diagnostics(root=document){
  // Structural metadata only. Never export conversation text, URLs, HTML,
  // element values, attachment names, cookies or account details.
  const classes=new Map(),tags=new Map(),samples=[],roots=[];
  const describe=e=>({tag:e.localName,classes:Array.from(e.classList).slice(0,12),role:this.role(e),testKind:(e.getAttribute('data-testid')||'').match(/^(conversation-turn|user-message|assistant-message|stop-button)/)?.[1]||null});
  const walk=r=>{if(roots.length>=30)return;roots.push(r);for(const e of r.querySelectorAll('*')){
   if(e.id==='paper-margins-bridge'||e.closest('#paper-margins-bridge'))continue;
   tags.set(e.localName,(tags.get(e.localName)||0)+1);for(const c of e.classList)classes.set(c,(classes.get(c)||0)+1);
   if(samples.length<160&&e.matches('article,main,[role="main"],[data-message-author-role],[data-turn],[data-testid*="conversation"],.markdown,.prose'))samples.push({element:describe(e),parents:[e.parentElement,e.parentElement?.parentElement,e.parentElement?.parentElement?.parentElement].filter(Boolean).map(describe),textLength:e.textContent?.length||0});
   if(e.shadowRoot)walk(e.shadowRoot);
  }};walk(root);
  const selection=root.getSelection?.()||root.ownerDocument?.getSelection?.(),node=selection?.anchorNode?.nodeType===1?selection.anchorNode:selection?.anchorNode?.parentElement,selectionParents=[];
  if(node&&!node.closest('#paper-margins-bridge'))for(let e=node;e&&selectionParents.length<10;e=e.parentElement)selectionParents.push(describe(e));
  const ms=this.messages(root);return {format:'paper-margins-dom-structure-v1',counts:{questions:ms.filter(e=>this.role(e)==='user').length,answers:ms.filter(e=>this.role(e)==='assistant').length,streaming:this.streaming(root),roots:roots.length,frames:root.querySelectorAll('iframe').length},tags:Object.fromEntries(tags),commonClasses:Array.from(classes).sort((a,b)=>b[1]-a[1]).slice(0,180),samples,selectionParents};
 }
};
