import sharp from 'sharp';
import { PALETTE, PALETTE_VERSION } from './palette';
import { dimensions, labDistance, rgbToLab } from './pattern';
import type { Cell, Params, Pattern } from './types';
const labs=PALETTE.map(c=>rgbToLab(c.rgb));
export class ConversionError extends Error { constructor(public code:string,message:string,public status=400){super(message);} }
export function removeBackground(data:Uint8Array,w:number,h:number,color:string,tolerance:number) {
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
 const seen=new Uint8Array(w*h),queue:number[]=[];
 const visit=(i:number)=>{if(seen[i])return;seen[i]=1;const p=i*4;if(data[p+3]<128||Math.sqrt(rgb.reduce((s,c,j)=>s+(data[p+j]-c)**2,0))<=tolerance)queue.push(i);};
 for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
 for(let k=0;k<queue.length;k++){const i=queue[k];data[i*4+3]=0;const x=i%w,y=Math.floor(i/w);if(x)visit(i-1);if(x<w-1)visit(i+1);if(y)visit(i-w);if(y<h-1)visit(i+w);}
 return data;
}
export function classify(data:Uint8Array,w:number,h:number):'simple'|'medium'|'high' {
 const bins=new Set<number>();let edges=0,pairs=0,highlights=0,lap=0,visible=0;const luminance=(i:number)=>data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114;
 for(let i=0;i<w*h;i++){if(data[i*4+3]<128)continue;visible++;const p=i*4;bins.add((data[p]>>4)*256+(data[p+1]>>4)*16+(data[p+2]>>4));if(Math.min(data[p],data[p+1],data[p+2])>246)highlights++;
 if(i%w<w-1){pairs++;if(Math.abs(luminance(i)-luminance(i+1))>25)edges++;}if(i>w&&i<w*(h-1)&&i%w>0&&i%w<w-1){lap+=Math.abs(4*luminance(i)-luminance(i-1)-luminance(i+1)-luminance(i-w)-luminance(i+w));}}
 const diversity=bins.size,edge=edges/Math.max(1,pairs),detail=lap/Math.max(1,visible);
 // 启发式阈值，需用人工标注样本继续标定，非识别置信度。
 if(diversity>500&&(edge>.25||(detail<5&&highlights/Math.max(1,visible)>.18)))return 'high';
 return diversity>260&&edge>.075?'medium':'simple';
}
function closest(lab:number[],candidates:number[]){return candidates.reduce((best,c)=>labDistance(lab,labs[c])<labDistance(lab,labs[best])?c:best,candidates[0]);}
function luminance(index:number){const [r,g,b]=PALETTE[index].rgb;return r*.299+g*.587+b*.114;}
/** Source-derived dark edges are established before any colour cleanup. */
export function outlineMask(data:Uint8Array,w:number,h:number):boolean[]{
 const mask=Array<boolean>(w*h).fill(false),lum=(i:number)=>data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,current=lum(i);if(data[i*4+3]<128||current>145)continue;const neighbors:number[]=[];if(x)neighbors.push(lum(i-1));if(x<w-1)neighbors.push(lum(i+1));if(y)neighbors.push(lum(i-w));if(y<h-1)neighbors.push(lum(i+w));if(neighbors.length&&Math.max(...neighbors)-current>38)mask[i]=true;}
 return mask;
}
/** Pick a compact palette before assigning cells. This preserves dominant regions and
 * colour extremes rather than retaining every tiny anti-aliased shade. */
export function quantize(data:Uint8Array,w:number,h:number,maxColors:number):Cell[] {
 const pixelLabs:(number[]|null)[]=[],pixelLuminance:(number|null)[]=[],counts=new Map<number,number>(),outlineSupport=new Map<number,number>(),all=PALETTE.map((_,i)=>i),outlines=outlineMask(data,w,h);
 const sourceLum=(i:number)=>data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114;
 for(let i=0;i<w*h;i++){const p=i*4,a=data[p+3]/255;if(a<128/255){pixelLabs.push(null);pixelLuminance.push(null);continue;}const lab=rgbToLab([0,1,2].map(j=>data[p+j]*a+255*(1-a)));pixelLabs.push(lab);pixelLuminance.push(sourceLum(i));const index=closest(lab,all);counts.set(index,(counts.get(index)||0)+1);}
 for(let i=0;i<outlines.length;i++)if(outlines[i]&&pixelLabs[i]){const index=closest(pixelLabs[i]!,all);outlineSupport.set(index,(outlineSupport.get(index)||0)+1);}
 const available=[...counts.keys()];if(!available.length)return pixelLabs.map(()=>null);if(available.length<=maxColors)return pixelLabs.map(lab=>lab?closest(lab,available):null);
 const selected:number[]=[];const ranked=[...counts].sort((a,b)=>(b[1]+(outlineSupport.get(b[0])||0)*4)-(a[1]+(outlineSupport.get(a[0])||0)*4)||a[0]-b[0]);selected.push(ranked[0][0]);
 const outlineColor=[...outlineSupport].filter(([index])=>luminance(index)<150).sort((a,b)=>b[1]-a[1])[0]?.[0];if(outlineColor!==undefined&&!selected.includes(outlineColor)&&maxColors>1)selected.push(outlineColor);
 // Weighted farthest-point sampling keeps a main colour, then deliberately saves
 // budget for visually distant feature colours such as outlines, eyes and highlights.
 while(selected.length<maxColors){let pick=-1,score=-1;for(const [index,count] of ranked){if(selected.includes(index))continue;const distance=Math.min(...selected.map(s=>labDistance(labs[index],labs[s])));const weighted=distance*Math.sqrt(count)+(luminance(index)<80?180:0);if(weighted>score){score=weighted;pick=index;}}if(pick<0)break;selected.push(pick);}
 return pixelLabs.map(lab=>lab?closest(lab,selected):null);
}
/** Re-apply only source-dark, high-contrast edges after any region smoothing.
 * It never invents black outlines in light areas. */
export function prioritizeOutlines(grid:Cell[],data:Uint8Array,w:number,h:number):Cell[]{
 const dark=[...new Set(grid.filter((cell):cell is number=>cell!==null&&luminance(cell)<150))];if(!dark.length)return grid;
 const result=grid.slice(),outlines=outlineMask(data,w,h);
 for(let i=0;i<outlines.length;i++){if(!outlines[i])continue;const p=i*4;result[i]=closest(rgbToLab([data[p],data[p+1],data[p+2]]),dark);}
 return result;
}
export function smoothGrid(grid:Cell[],w:number,h:number,passes:number,maxDistance:number,locked?:boolean[]):Cell[]{
 let current=grid;for(let pass=0;pass<passes;pass++){const next=current.slice();for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,cell=current[i];if(cell===null||locked?.[i])continue;const neighbors=[current[i-1],current[i+1],current[i-w],current[i+w]].filter((c):c is number=>c!==null);const matches=neighbors.filter(c=>c===cell).length;if(matches>=2||neighbors.length<3)continue;const totals=new Map<number,number>();for(const n of neighbors)totals.set(n,(totals.get(n)||0)+1);const [mode,count]=[...totals].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0];if(count>=3&&labDistance(labs[cell],labs[mode])<=maxDistance)next[i]=mode;}current=next;}return current;
}
export async function convertImage(buffer:Buffer,params:Params):Promise<Pattern> {
 const style=params.style??'refined';
 let metadata;try {metadata=await sharp(buffer,{limitInputPixels:20_000_000,failOn:'error'}).metadata();}catch{throw new ConversionError('INVALID_IMAGE','图片无法解码，或超过 2000 万像素，请换一张图片。');}
 if(!['jpeg','png','webp'].includes(metadata.format||''))throw new ConversionError('UNSUPPORTED_FORMAT','仅支持 JPEG、PNG、WebP 图片。');
 if((metadata.pages||1)>1)throw new ConversionError('ANIMATED_IMAGE','暂不支持动画图片，请上传静态图片。');
 if(!metadata.width||!metadata.height||metadata.width*metadata.height>20_000_000)throw new ConversionError('PIXEL_LIMIT','图片不能超过 2000 万像素。');
 let oriented;try{oriented=await sharp(buffer,{limitInputPixels:20_000_000}).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});}catch{throw new ConversionError('DECODE_FAILED','图片数据不完整，无法处理。');}
 const {width:ow,height:oh}=oriented.info;
 const left=Math.min(ow-1,Math.round(params.crop.x*ow)),top=Math.min(oh-1,Math.round(params.crop.y*oh));
 const cw=Math.max(1,Math.min(ow-left,Math.round(params.crop.width*ow))),ch=Math.max(1,Math.min(oh-top,Math.round(params.crop.height*oh)));
 let working=await sharp(oriented.data,{raw:oriented.info}).extract({left,top,width:cw,height:ch}).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).raw().toBuffer({resolveWithObject:true});
 if(params.background.remove)removeBackground(working.data,working.info.width,working.info.height,params.background.color,params.background.tolerance);
 if(style==='easy')working=await sharp(working.data,{raw:working.info}).median(3).raw().toBuffer({resolveWithObject:true});
 if(style==='outline')working=await sharp(working.data,{raw:working.info}).modulate({saturation:1.05}).linear(1.12,-12).raw().toBuffer({resolveWithObject:true});
 const analysis=await sharp(working.data,{raw:working.info}).resize({width:128,height:128,fit:'inside',withoutEnlargement:true}).raw().toBuffer({resolveWithObject:true});
 const complexity=classify(analysis.data,analysis.info.width,analysis.info.height);
 const warnings:string[]=[];const path:Pattern['path']='cv';
 if(complexity!=='simple')warnings.push('图片包含较多细节，已使用 CV 处理；建议裁剪到主体，减少背景和细微光影。');
 const {width,height}=dimensions(cw,ch,params.longEdge);
 const kernel=style==='easy'||complexity==='simple'?sharp.kernel.nearest:sharp.kernel.mitchell;
 const data=await sharp(working.data,{raw:working.info}).resize(width,height,{fit:'fill',kernel}).raw().toBuffer();
 let paletteBudget=style==='easy'?Math.min(params.maxColors,18):style==='refined'?Math.min(params.maxColors,32):params.maxColors;
 const lockedOutlines=outlineMask(data,width,height);
 let grid=prioritizeOutlines(quantize(data,width,height,paletteBudget),data,width,height);
 // 易拼优先干净色块，精致模式仅合并与邻区非常接近的孤立杂点；高对比特征保留。
 const smoothing=style==='easy'?{passes:1,distance:900}:{passes:0,distance:0};
 grid=smoothGrid(grid,width,height,smoothing.passes,smoothing.distance,lockedOutlines);
 if(style==='easy')warnings.push(`易拼模式已将自动用色控制在 ${paletteBudget} 色以内，并合并零散小色块。`);
 if(style==='refined')warnings.push(`精致模式保留轮廓和关键对比色，自动用色上限为 ${paletteBudget} 色。`);
 if(style==='outline')warnings.push(`轮廓优先模式已增强对比，并为深色轮廓保留颜色名额。`);
 warnings.push('已优先保留深色高对比轮廓；光影过渡在轮廓稳定后处理。');
 if(grid.every(c=>c===null))warnings.push('当前图纸全部为空格，请撤销去背景或调整裁剪。');
 return {width,height,grid,paletteVersion:PALETTE_VERSION,params:{...params,style},path,warnings,complexity};
}
