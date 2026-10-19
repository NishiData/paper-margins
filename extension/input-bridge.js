/* Insert plain text into a visible composer; never click Send. */
globalThis.PaperMarginsInput=(()=>{
 const selectors='#prompt-textarea,textarea,[contenteditable="true"],[contenteditable="plaintext-only"]';
 const compact=s=>String(s||'').replace(/\s+/g,' ').trim();
 function roots(){const out=[document];for(let i=0;i<out.length;i++)for(const e of out[i].querySelectorAll('*'))if(e.shadowRoot&&e.id!=='paper-margins-bridge')out.push(e.shadowRoot);return out;}
 function visible(e){if(!e.isConnected||e.disabled||e.readOnly||e.getAttribute('aria-disabled')==='true')return false;const css=getComputedStyle(e),r=e.getBoundingClientRect();return css.display!=='none'&&css.visibility!=='hidden'&&r.width>0&&r.height>0&&!e.closest('[hidden],[inert]');}
 function editable(e){return e.tagName==='TEXTAREA'||e.isContentEditable;}
 function find(){const candidates=[];for(const root of roots())for(const wrapper of root.querySelectorAll(selectors)){const e=editable(wrapper)?wrapper:wrapper.querySelector('textarea,[contenteditable="true"],[contenteditable="plaintext-only"]');if(!e||!visible(e)||candidates.some(c=>c.e===e))continue;
  const name=(e.getAttribute('aria-label')||'')+' '+(e.getAttribute('placeholder')||'');let score=0;if(e.id==='prompt-textarea'||e.closest('#prompt-textarea'))score+=100;if(e.classList.contains('ProseMirror'))score+=60;if(e.closest('form'))score+=15;if(/message|prompt|chatgpt|メッセージ|質問/i.test(name))score+=20;if(e.tagName==='TEXTAREA')score+=5;candidates.push({e,score});}
  return candidates.sort((a,b)=>b.score-a.score)[0]?.e||null;}
 function text(e){return e.tagName==='TEXTAREA'?e.value:(e.innerText||e.textContent||'');}
 function select(e){e.focus({preventScroll:true});if(e.tagName==='TEXTAREA'){e.setSelectionRange(0,e.value.length);return;}const r=document.createRange();r.selectNodeContents(e);const s=e.ownerDocument.getSelection();s.removeAllRanges();s.addRange(r);}
 function notify(e,type,data){e.dispatchEvent(new InputEvent(type,{bubbles:true,composed:true,inputType:'insertFromPaste',data}));}
 function matches(e,prompt){return compact(text(e))===compact(prompt);}
 async function insert(prompt){let e=find();if(!e)return {ok:false,reason:'not-found'};if(text(e).trim()&&!confirm('ChatGPTの入力欄に文章があります。質問で置き換えますか？'))return {ok:false,reason:'cancelled'};
  select(e);
  if(e.tagName==='TEXTAREA'){
   const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(setter)setter.call(e,prompt);else e.value=prompt;notify(e,'input',prompt);e.dispatchEvent(new Event('change',{bubbles:true}));
  }else{
   // Rich-text editors such as ProseMirror handle paste as an editor transaction.
   const data=new DataTransfer();data.setData('text/plain',prompt);e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,composed:true,clipboardData:data}));
   if(!matches(e,prompt)){
    select(e);let observed=false;const sawInput=()=>{observed=true;};e.addEventListener('input',sawInput);
    try{document.execCommand('insertText',false,prompt);}catch{}finally{e.removeEventListener('input',sawInput);}
    if(matches(e,prompt)&&!observed)notify(e,'input',prompt);
   }
   if(!matches(e,prompt)){
    select(e);e.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,composed:true,inputType:'insertFromPaste',data:prompt}));
    if(!matches(e,prompt)){
     const nodes=prompt.split('\n').map(line=>{const p=document.createElement('p');if(line)p.textContent=line;else p.append(document.createElement('br'));return p;});e.replaceChildren(...nodes);notify(e,'input',prompt);
    }
   }
  }
  // Verify after React/editor rerenders, rather than claiming success immediately.
  await new Promise(resolve=>setTimeout(resolve,350));e=find();return e&&matches(e,prompt)?{ok:true}:{ok:false,reason:'reverted'};
 }
 async function imageBlob(image){if(!image?.dataUrl?.startsWith('data:image/png;base64,'))throw Error('選択画像がありません。');return (await fetch(image.dataUrl)).blob();}
 async function copyImage(image){if(!globalThis.ClipboardItem||!navigator.clipboard?.write)throw Error('画像をコピーできません。「画像を保存」して添付してください。');const blob=await imageBlob(image);await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);}
 function attachmentShown(name){const editor=find();if(!editor)return false;const scope=editor.closest('form')||editor.closest('[data-testid*="composer"]')||editor.parentElement?.parentElement;if(!scope)return false;
  // The question itself contains the PDF filename. Only inspect attachment UI,
  // excluding the composer and the extension panel, to avoid a false success.
  const outside=e=>e!==editor&&!editor.contains(e)&&!e.closest('textarea,[contenteditable],#paper-margins-bridge');
  const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())if(outside(node.parentElement)&&node.textContent.includes(name))return true;
  return Array.from(scope.querySelectorAll('[title],[aria-label],img[alt]')).some(e=>outside(e)&&['title','aria-label','alt'].some(attr=>e.getAttribute(attr)?.includes(name)));
 }
 function acceptsFile(input,file){const accept=input.accept.toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);return !accept.length||accept.some(type=>type==='*/*'||type==='*'||type.startsWith('.')&&file.name.toLowerCase().endsWith(type)||type===file.type.toLowerCase()||type.endsWith('/*')&&file.type.toLowerCase().startsWith(type.slice(0,-1)));}
 async function attachFiles(files){
  const editor=find();if(!editor)return {ok:false,reason:'not-found'};
  const pending=files.filter(file=>!attachmentShown(file.name));if(!pending.length)return {ok:true};
  const inputs=roots().flatMap(root=>Array.from(root.querySelectorAll('input[type="file"]'))).filter(e=>!e.disabled&&!e.webkitdirectory&&pending.every(file=>acceptsFile(e,file))&&(pending.length===1||e.multiple));
  const form=editor.closest('form'),input=inputs.find(e=>form?.contains(e))||inputs[0];
  if(!input&&pending.length>1){for(const file of pending){const r=await attachFiles([file]);if(!r.ok)return r;}return files.every(file=>attachmentShown(file.name))?{ok:true}:{ok:false,reason:'unconfirmed'};}
  const transfer=new DataTransfer();for(const file of pending)transfer.items.add(file);
  if(input){input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true,composed:true}));}
  else{editor.focus({preventScroll:true});editor.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,composed:true,clipboardData:transfer}));}
  for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,100));if(files.every(file=>attachmentShown(file.name)))return {ok:true};}
  return {ok:false,reason:'unconfirmed'};
 }
 async function attachImage(image){const blob=await imageBlob(image);return attachFiles([new File([blob],image.name,{type:'image/png'})]);}
 return {find,text,insert,attachImage,attachFiles,copyImage,imageBlob};
})();
