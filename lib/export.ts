import { COLOR_NOTICE, PALETTE } from './palette';
import { statistics, toCsv } from './pattern';
import type { Pattern } from './types';
export function paintGrid(ctx:CanvasRenderingContext2D,p:Pattern,cell:number,offset=32,labels=true) {
 ctx.fillStyle='#fff';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
 ctx.font='10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
 for(let x=0;x<p.width;x++){ctx.fillStyle='#777';ctx.fillText(String(x+1),offset+(x+.5)*cell,offset-14);}
 for(let y=0;y<p.height;y++){ctx.fillStyle='#777';ctx.fillText(String(y+1),offset-15,offset+(y+.5)*cell);}
 for(let i=0;i<p.grid.length;i++){const c=p.grid[i],x=offset+(i%p.width)*cell,y=offset+Math.floor(i/p.width)*cell;ctx.fillStyle=c===null?'#f3f3f3':PALETTE[c].hex;ctx.fillRect(x,y,cell,cell);ctx.strokeStyle='rgba(0,0,0,.13)';ctx.lineWidth=.5;ctx.strokeRect(x,y,cell,cell);
  if(c===null){ctx.fillStyle='#d5d5d5';ctx.fillRect(x+cell/2-1,y+cell/2-1,2,2);}else if(labels&&cell>=19){const rgb=PALETTE[c].rgb;ctx.fillStyle=rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>145?'#282628':'#fff';ctx.font=`${Math.max(8,Math.min(12,cell*.32))}px sans-serif`;ctx.fillText(PALETTE[c].code,x+cell/2,y+cell/2);}
 }
 ctx.strokeStyle='#777';ctx.lineWidth=1;for(let x=0;x<=p.width;x+=10){ctx.beginPath();ctx.moveTo(offset+x*cell,offset);ctx.lineTo(offset+x*cell,offset+p.height*cell);ctx.stroke();}for(let y=0;y<=p.height;y+=10){ctx.beginPath();ctx.moveTo(offset,offset+y*cell);ctx.lineTo(offset+p.width*cell,offset+y*cell);ctx.stroke();}
}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export function downloadCsv(p:Pattern){download(new Blob([toCsv(p)],{type:'text/csv;charset=utf-8;'}),'拼豆用豆清单.csv');}
export async function downloadPng(p:Pattern,version:string){
 const cell=30,stats=statistics(p.grid),width=Math.max(820,p.width*cell+64),cols=Math.floor((width-64)/170),legendRows=Math.ceil(stats.length/cols),gridHeight=p.height*cell+64;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=gridHeight+160+legendRows*34+100;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('浏览器无法创建导出画布');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,width,canvas.height);
 // 单独绘制网格，避免绘制函数覆盖标题与图例。
 const gridCanvas=document.createElement('canvas');gridCanvas.width=p.width*cell+64;gridCanvas.height=gridHeight;paintGrid(gridCanvas.getContext('2d')!,p,cell);ctx.drawImage(gridCanvas,0,85);
 ctx.textAlign='left';ctx.fillStyle='#292b28';ctx.font='bold 25px sans-serif';ctx.fillText(`豆朵 · MARD221 拼豆图纸 · ${version}`,32,36);ctx.font='14px sans-serif';ctx.fillText(`${p.width} × ${p.height} 格  /  ${stats.length} 色  /  ${stats.reduce((s,c)=>s+c.count,0)} 颗  /  ${p.paletteVersion}`,32,65);
 stats.forEach((c,i)=>{const x=32+(i%cols)*170,y=gridHeight+110+Math.floor(i/cols)*34;ctx.fillStyle=c.hex;ctx.fillRect(x,y,22,22);ctx.strokeStyle='#ddd';ctx.strokeRect(x,y,22,22);ctx.fillStyle='#333';ctx.font='14px sans-serif';ctx.fillText(`${c.code}  × ${c.count}`,x+30,y+16);});
 ctx.fillStyle='#777';ctx.font='13px sans-serif';const text=COLOR_NOTICE,chars=Math.floor((width-64)/14);for(let i=0;i<text.length;i+=chars)ctx.fillText(text.slice(i,i+chars),32,canvas.height-60+Math.floor(i/chars)*21);ctx.fillText('玩家整理参考色板 · 非官方认证 · 空格不放豆 · 不用于实际尺寸打印',32,canvas.height-14);
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('导出失败')),'image/png'));download(blob,`拼豆图纸-${version}-${p.width}x${p.height}.png`);
}
