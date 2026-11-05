import { z } from 'zod';
const cropSchema = z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().positive().max(1),height:z.number().positive().max(1)}).refine(c=>c.x+c.width<=1.00001&&c.y+c.height<=1.00001,'裁剪超出图片范围');
export const paramsSchema = z.object({
 longEdge:z.union([z.literal(32),z.literal(48),z.literal(64),z.literal(96)]),
 maxColors:z.union([z.literal(12),z.literal(24),z.literal(36),z.literal(48)]), crop:cropSchema,
 background:z.object({remove:z.boolean(),color:z.string().regex(/^#[0-9a-f]{6}$/i),tolerance:z.number().min(0).max(150)}),
 style:z.enum(['easy','refined','outline','faithful']).default('refined'),
});
