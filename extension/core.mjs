export const noteKey = id => 'pm:note:' + id;
export function clamp(n, a=0, b=1) { return Math.min(b, Math.max(a, n)); }
export function normalizeRect(r, bounds) {
  const x=clamp((r.left-bounds.left)/bounds.width), y=clamp((r.top-bounds.top)/bounds.height);
  return {x,y,w:Math.min(1-x,Math.max(0,r.width/bounds.width)),h:Math.min(1-y,Math.max(0,r.height/bounds.height))};
}
export function validAnchor(a) {
  return a && /^[a-f0-9]{64}$/.test(a.docId) && Number.isInteger(a.page) && a.page>0 && a.page<=100000 &&
    Array.isArray(a.rects) && a.rects.length>0 && a.rects.length<500 && a.rects.every(r=>['x','y','w','h'].every(k=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<=1)&&r.x+r.w<=1.001&&r.y+r.h<=1.001);
}
export function validateNote(n) {
  if(!n || typeof n.id!=='string' || n.id.length>100 || !validAnchor(n.anchor) || !Array.isArray(n.turns) || n.turns.length>1000) throw Error('注釈データの形式を確認してください。');
  for(const t of n.turns) if(typeof t.id!=='string'||typeof t.question!=='string'||typeof t.answer!=='string'||t.question.length>500000||t.answer.length>1000000) throw Error('会話データの形式が不正です。');
  if(n.selectionImage&&(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(n.selectionImage.dataUrl)||n.selectionImage.dataUrl.length>9000000||typeof n.selectionImage.name!=='string'))throw Error('選択画像の形式を確認してください。');
  return {id:n.id,anchor:{...n.anchor,excerpt:String(n.anchor.excerpt||'').slice(0,50000)},title:String(n.title||'注釈').slice(0,300),docTitle:String(n.docTitle||'PDF').slice(0,300),tags:Array.isArray(n.tags)?n.tags.map(String).slice(0,30):[],turns:n.turns,createdAt:Number(n.createdAt)||Date.now(),updatedAt:Number(n.updatedAt)||Date.now(),...(n.selectionImage?{selectionImage:{dataUrl:n.selectionImage.dataUrl,name:n.selectionImage.name.replace(/[\\/:*?"<>|]/g,'_').slice(0,200)}}:{})};
}
export function mergeTurn(note, turn) {
  const turns=note.turns.slice(); const i=turns.findIndex(t=>t.id===turn.id);
  if(i<0) turns.push(turn); else turns[i]=turn;
  return {...note, turns, updatedAt:Date.now()};
}
export function makePrompt(title, anchor, question) {
  const target=anchor.kind==='area'?'囲んだ数式・図の選択画像を、この質問と一緒に添付します。':anchor.excerpt||'選択した本文';
  const image=anchor.kind==='area'?'\n\n数式・図の配置や記号は添付した選択画像で確認してください。画像が表示されていなければ、その点を伝えてください。':'';
  return `論文「${title}」のPDF ${anchor.page}ページについて質問します。\n\n対象箇所：\n${target}${image}\n\n質問：\n${question}\n\nこの引用と、私が添付した資料に基づいて説明してください。論文全体を確認できない場合は、その点を明示してください。`;
}
