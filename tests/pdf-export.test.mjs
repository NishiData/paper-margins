import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {exportAnnotatedPDF} from '../extension/pdf-export.mjs';
const require=createRequire(import.meta.url),PDFLib=require('pdf-lib');
const sandbox={Uint8Array,ArrayBuffer,TextDecoder,TextEncoder,setTimeout,clearTimeout,console};
vm.runInNewContext(readFileSync(new URL('../extension/vendor/fontkit/fontkit.umd.min.js',import.meta.url),'utf8'),sandbox);
const fontkit=sandbox.fontkit;
const fontBytes=['japanese-font/files/noto-sans-jp-export.ttf','dejavu/DejaVuSans.ttf'].map(p=>new Uint8Array(readFileSync(new URL('../extension/vendor/'+p,import.meta.url))));

test('注釈の全文を通常のPDFページへ出力し、本文との往復リンクを保持する',async()=>{
 const {PDFDocument,PDFName,PDFArray}=PDFLib;
 const source=await PDFDocument.create();for(let i=0;i<2;i++){const p=source.addPage([595,842]);p.drawText('Original paper - page '+(i+1),{x:55,y:770,size:20});p.drawText('An exact sequence and geometric charges.',{x:70,y:680,size:14});}
 const repeated=Array.from({length:55},(_,i)=>`第${i+1}段落：点群電荷と並進電荷は、群の生成元の関係式によって結び付きます。長い回答も途中で切らずに、次のページへ続けて書き出します。`).join('\n\n');
 const notes=[{id:'n1',title:'点群電荷と並進電荷の関係',tags:['群論','導出'],anchor:{page:1,rects:[{x:.12,y:.15,w:.65,h:.05}],excerpt:'The relations among the generators are essential.'},turns:[{question:'この関係式を説明してください。',answer:repeated+'\n\n\\[s(g_\\omega)^2=s(T_1)\\]\nΛ、θ、∈、ℤ。\n最後の回答 END_OF_FULL_ANSWER'},{question:'可換化の場合は？',answer:'可換化では交換子が自明になります。 SECOND_TURN_END'}]},
 {id:'n2',title:'回答を保存していない質問',tags:[],anchor:{page:2,rects:[{x:.12,y:.15,w:.65,h:.05}],pdfRects:[[70,670,400,700]],excerpt:'A question without an answer.'},turns:[]}];
 const bytes=await exportAnnotatedPDF(await source.save(),notes,{PDFLib,fontkit,fontBytes,title:'geometric-symmetry.pdf'});
 const out=await PDFDocument.load(bytes);assert.ok(out.getPageCount()>3);
 for(let i=0;i<2;i++){const annotations=out.getPages()[i].node.lookup(PDFName.of('Annots'),PDFArray).asArray().map(ref=>out.context.lookup(ref));const link=annotations.find(a=>a.lookup(PDFName.of('Subtype')).asString()==='/Link');assert.ok(link);const destination=link.lookup(PDFName.of('Dest'),PDFArray);assert.ok(out.getPages().slice(2).some(p=>p.ref.toString()===destination.get(0).toString()));const comment=annotations.find(a=>a.lookup(PDFName.of('Subtype')).asString()==='/Text');assert.ok(comment.lookup(PDFName.of('Contents')).decodeText().includes(i===0?'END_OF_FULL_ANSWER':'PDF末尾'));}
 const appendixLinks=out.getPages().slice(2).flatMap(p=>p.node.lookupMaybe(PDFName.of('Annots'),PDFArray)?.asArray()||[]);assert.equal(appendixLinks.length,2);
 mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});writeFileSync(new URL('../artifacts/pdf-export-qa.pdf',import.meta.url),bytes);
});
