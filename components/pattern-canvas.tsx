'use client';
import { useEffect,useRef } from 'react';
import { paintGrid } from '@/lib/export';
import type { Pattern } from '@/lib/types';
export default function PatternCanvas({pattern,zoom,tool,onCell}:{pattern:Pattern;zoom:number;tool:string;onCell:(i:number)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),viewport=useRef<HTMLDivElement>(null);
 const gesture=useRef<{x:number;y:number;left:number;top:number;id:number;moved:boolean}|null>(null);
 const pointers=useRef(new Set<number>()),multi=useRef(false);
 const cell=zoom,offset=32;
 useEffect(()=>{const node=canvas.current;if(!node)return;node.width=pattern.width*cell+offset*2;node.height=pattern.height*cell+offset*2;paintGrid(node.getContext('2d')!,pattern,cell,offset);},[pattern,cell]);
 return <div className={`canvas-viewport ${tool==='move'?'pan':'draw'}`} ref={viewport} onPointerDown={e=>{pointers.current.add(e.pointerId);if(pointers.current.size>1)multi.current=true;const v=viewport.current!;gesture.current={x:e.clientX,y:e.clientY,left:v.scrollLeft,top:v.scrollTop,id:e.pointerId,moved:false};if(e.pointerType==='mouse')e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const g=gesture.current,v=viewport.current;if(!g||!v)return;if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>5)g.moved=true;if(tool==='move'&&e.pointerType==='mouse'){v.scrollLeft=g.left-(e.clientX-g.x);v.scrollTop=g.top-(e.clientY-g.y);}}} onPointerUp={e=>{const g=gesture.current;if(g&&!g.moved&&!multi.current&&tool!=='move'&&canvas.current){const rect=canvas.current.getBoundingClientRect(),x=Math.floor((e.clientX-rect.left-offset)/cell),y=Math.floor((e.clientY-rect.top-offset)/cell);if(x>=0&&y>=0&&x<pattern.width&&y<pattern.height)onCell(y*pattern.width+x);}pointers.current.delete(e.pointerId);if(!pointers.current.size){multi.current=false;gesture.current=null;}}} onPointerCancel={()=>{pointers.current.clear();multi.current=false;gesture.current=null;}}>
 <canvas ref={canvas} aria-label={`${pattern.width}乘${pattern.height}格拼豆图纸，编辑模式下点击格子改色`} />
 </div>;
}
