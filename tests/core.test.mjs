import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRect,validAnchor,validateNote,mergeTurn,makePrompt} from '../extension/core.mjs';
const anchor={docId:'a'.repeat(64),page:3,rects:[{x:.1,y:.2,w:.5,h:.1}],excerpt:'1 → Λ → S → P → 1'};
test('選択範囲を拡大縮小に依存しない比率で保存する',()=>{assert.deepEqual(normalizeRect({left:120,top:250,width:500,height:50},{left:20,top:50,width:1000,height:1000}),{x:.1,y:.2,w:.5,h:.05});assert.equal(validAnchor(anchor),true);assert.equal(validAnchor({...anchor,page:0}),false);assert.equal(validAnchor({...anchor,rects:[{x:.9,y:0,w:.5,h:.1}]}),false);});
test('同じ回答の再保存は重複せず、続く回答は別に残る',()=>{const n={turns:[]};let x=mergeTurn(n,{id:'a',answer:'first'});x=mergeTurn(x,{id:'a',answer:'updated'});x=mergeTurn(x,{id:'b',answer:'follow-up'});assert.equal(x.turns.length,2);assert.equal(x.turns[0].answer,'updated');assert.equal(n.turns.length,0);});
test('復元時に不正な座標と会話データを拒否する',()=>{const n={id:'note',anchor,title:'Question',turns:[{id:'a',question:'Why?',answer:'Because.'}]};assert.equal(validateNote(n).turns.length,1);assert.throws(()=>validateNote({...n,anchor:{...anchor,rects:[{x:NaN,y:0,w:0,h:0}]}}));assert.throws(()=>validateNote({...n,turns:[{id:'a',answer:'Missing question'}]}));});
test('引用とページ・参照範囲を質問に含める',()=>{const p=makePrompt('paper.pdf',anchor,'分裂するとは？');assert.ok(p.includes('PDF 3ページ'));assert.ok(p.includes(anchor.excerpt));assert.ok(p.includes('分裂するとは？'));assert.ok(p.includes('論文全体を確認できない場合'));});

test('数式の範囲選択は過去の文字化けした引用も質問に使わない',()=>{const p=makePrompt('math.pdf',{...anchor,kind:'area',excerpt:'■□\uFFFD\uE000'},'Explain');assert.ok(p.includes('選択画像'));for(const c of ['■','□','\uFFFD','\uE000'])assert.ok(!p.includes(c));});
