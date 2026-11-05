import { PALETTE } from './palette';
import type { Cell, Pattern } from './types';
export function dimensions(w: number, h: number, edge: number) { return w >= h ? {width:edge,height:Math.max(1,Math.round(edge*h/w))} : {width:Math.max(1,Math.round(edge*w/h)),height:edge}; }
export function statistics(grid: Cell[]) {
 const counts = new Map<number,number>();
 for (const cell of grid) if(cell !== null) counts.set(cell,(counts.get(cell)||0)+1);
 return [...counts].map(([index,count])=>({...PALETTE[index],index,count})).sort((a,b)=>b.count-a.count || a.index-b.index);
}
export function changeGrid(grid: Cell[], index: number, color: Cell, replace = false): Cell[] {
 const old = grid[index];
 return grid.map((c,i)=>(replace ? c===old : i===index) ? color : c);
}
export function toCsv(pattern: Pattern) {
 const stats=statistics(pattern.grid);
 return '\uFEFF'+['色号,颜色值,数量',...stats.map(c=>`${c.code},${c.hex},${c.count}`),`总计,,${stats.reduce((s,c)=>s+c.count,0)}`,`网格,${pattern.width}×${pattern.height},`,`色板版本,${pattern.paletteVersion},`].join('\r\n');
}
export function rgbToLab(rgb: readonly number[]) {
 const [r,g,b] = rgb.map(v=>{v/=255;return v>0.04045?((v+0.055)/1.055)**2.4:v/12.92;});
 const f=(v:number)=>v>0.008856?Math.cbrt(v):7.787*v+16/116;
 const x=f((r*.4124564+g*.3575761+b*.1804375)/.95047),y=f(r*.2126729+g*.7151522+b*.072175),z=f((r*.0193339+g*.119192+b*.9503041)/1.08883);
 return [116*y-16,500*(x-y),200*(y-z)];
}
export const labDistance = (a:number[],b:number[])=>a.reduce((s,v,i)=>s+(v-b[i])**2,0);
