import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNote,makePrompt} from '../extension/core.mjs';
import '../extension/conversation-guard.js';
test('選択画像をバックアップ・復元の形式で保持する',()=>{const n={id:'n',anchor:{docId:'b'.repeat(64),page:5,kind:'area',rects:[{x:.1,y:.2,w:.3,h:.1}]},turns:[],selectionImage:{name:'selection.png',dataUrl:'data:image/png;base64,AA=='}};assert.deepEqual(validateNote(n).selectionImage,n.selectionImage);assert.throws(()=>validateNote({...n,selectionImage:{name:'bad.png',dataUrl:'https://example.com/image.png'}}));assert.ok(makePrompt('paper.pdf',n.anchor,'導出方法').includes('選択画像'));assert.ok(!makePrompt('paper.pdf',n.anchor,'導出方法').includes('必要なら画像を添付'));});
test('同じ質問が残る会話のURL変更では、自動保存を継続する',()=>{const g=new PaperMarginsConversationGuard('/',[]);assert.equal(g.check('/',[]),'waiting');assert.equal(g.check('/c/temp',['Question about equation']),'same');assert.equal(g.check('/c/final',['Question about equation','Follow-up']),'same');assert.equal(g.check('/c/other',[]),'waiting');assert.equal(g.check('/c/other',['Unrelated question']),'different');});
test('既存の会話を勝手に保存せず、新しい質問から紐づける',()=>{const g=new PaperMarginsConversationGuard('/c/id',['Old question']);assert.equal(g.check('/c/id',['Old question']),'waiting');assert.equal(g.check('/c/id',['Old question','New linked question']),'same');});
