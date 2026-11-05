import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dimensions,statistics,changeGrid,rgbToLab} from '../lib/pattern';
import {PALETTE} from '../lib/palette';
import {paramsSchema} from '../lib/validation';
test('色板完整且色号不重复',()=>{assert.equal(PALETTE.length,221);assert.equal(new Set(PALETTE.map(c=>c.code)).size,221);});
test('保留比例与极端长宽比',()=>{assert.deepEqual(dimensions(200,100,48),{width:48,height:24});assert.deepEqual(dimensions(1,10000,96),{width:1,height:96});});
test('全局替色、空格与统计一致',()=>{const grid=changeGrid([0,1,0,null],0,2,true);assert.deepEqual(grid,[2,1,2,null]);assert.equal(statistics(grid).reduce((s,c)=>s+c.count,0),3);assert.deepEqual(changeGrid(grid,1,null),[2,null,2,null]);});
test('白色Lab与非法裁剪校验',()=>{assert.ok(Math.abs(rgbToLab([255,255,255])[0]-100)<.01);assert.equal(paramsSchema.safeParse({longEdge:48,maxColors:24,crop:{x:.9,y:0,width:.5,height:1},background:{remove:false,color:'#ffffff',tolerance:35}}).success,false);});
