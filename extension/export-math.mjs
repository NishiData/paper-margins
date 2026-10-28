/** Keep prose/code intact while finding the same math delimiters used by the reader. */
export function splitMath(text){
 const result=[],source=String(text||'');let end=0;
 const pattern=/```[\s\S]*?```|`[^`\n]+`|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\s)(?:\\.|[^$\n\\])*?\$/g;
 for(const m of source.matchAll(pattern)){
  const value=m[0];if(m.index>end)result.push({text:source.slice(end,m.index)});
  if(value.startsWith('`'))result.push({text:value});
  else {const display=value.startsWith('\\[')||value.startsWith('$$'),length=value.startsWith('$')&&!display?1:2;result.push({math:value.slice(length,-length),display});}
  end=m.index+value.length;
 }
 if(end<source.length)result.push({text:source.slice(end)});return result;
}

export async function renderExportMath(tex,{display=false,size=10.5,maxWidth=507}={}){
 const mj=window.MathJax;await mj?.startup?.promise;
 if(!mj?.tex2svgPromise)throw Error('PDF出力用の数式エンジンを読み込めませんでした。');
 const node=await mj.tex2svgPromise(tex,{display});
 const svg=node.querySelector('svg');if(!svg||node.querySelector('[data-mjx-error]'))throw Error('PDFの数式を描画できませんでした：'+tex.slice(0,100));
 const [,minY,viewWidth,viewHeight]=svg.getAttribute('viewBox').split(/\s+/).map(Number);
 const factor=Math.min(size/1000,maxWidth/viewWidth,600/viewHeight),width=viewWidth*factor,height=viewHeight*factor,depth=Math.max(0,(minY+viewHeight)*factor);
 const pixels=Math.min(4,4096/Math.max(width,height));svg.setAttribute('width',String(Math.ceil(width*pixels)));svg.setAttribute('height',String(Math.ceil(height*pixels)));svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.style.color='#233d35';
 const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),image=new Image();
 try{image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d').drawImage(image,0,0);return {dataUrl:c.toDataURL('image/png'),width,height,depth};}finally{URL.revokeObjectURL(url);}
}
