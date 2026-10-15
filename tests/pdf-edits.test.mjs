import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFEdits} from '../extension/pdf-edits.mjs';

test('PDF autosave serializes writes and includes edits arriving during a write',async()=>{
  const writes=[],states=[];let release,reads=0;
  const blocked=new Promise(r=>release=r);
  const edits=new PDFEdits({delay:60000,read:async()=>++reads,write:async bytes=>{writes.push(bytes);if(bytes===1)await blocked;},onState:s=>states.push(s)});
  edits.changed();const first=edits.flush();await new Promise(r=>setImmediate(r));edits.changed();const second=edits.flush();release();await Promise.all([first,second]);
  assert.deepEqual(writes,[1,2]);assert.equal(edits.dirty,false);assert.equal(states.at(-1),'saved');clearTimeout(edits.timer);
});
test('a failed PDF write stays dirty and can be retried',async()=>{
  let fail=true;const states=[];const edits=new PDFEdits({delay:60000,read:async()=>new Uint8Array([1]),write:async()=>{if(fail)throw Error('disk failure');},onState:s=>states.push(s)});
  edits.changed();await assert.rejects(edits.flush(),/disk failure/);assert.equal(edits.dirty,true);assert.equal(states.at(-1),'error');fail=false;await edits.flush();assert.equal(edits.dirty,false);assert.equal(states.at(-1),'saved');
});
