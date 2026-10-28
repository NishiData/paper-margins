import test from 'node:test';
import assert from 'node:assert/strict';
import {splitMath} from '../extension/export-math.mjs';
test('inline/display delimiters become math while code and escaped dollars remain text',()=>{
 const parts=splitMath(String.raw`日本語 \(X=BG\) と $x^2$。\[g\longmapsto hgh^{-1}\] $$\frac{a}{b}$$ `+'`$code$`'+' ```'+String.raw`\(code\)`+'``` '+String.raw`\$5`);
 assert.deepEqual(parts.filter(p=>p.math!==undefined).map(p=>[p.math,p.display]),[['X=BG',false],['x^2',false],[String.raw`g\longmapsto hgh^{-1}`,true],[String.raw`\frac{a}{b}`,true]]);
 assert.ok(parts.filter(p=>p.text).map(p=>p.text).join('').includes('`$code$`'));
});
