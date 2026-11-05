import { createSupabaseServerClient, supabaseConfigured } from '@/lib/supabase/server';
import { PALETTE_VERSION } from '@/lib/palette';
import { statistics } from '@/lib/pattern';
import { z } from 'zod';

export const runtime = 'nodejs';
const bodySchema = z.object({
  projectId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).default('我的拼豆图纸'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  grid: z.array(z.number().int().nonnegative().nullable()),
  params: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()).default([]),
  complexity: z.enum(['simple', 'medium', 'high']).optional(),
}).refine(value => value.grid.length === value.width * value.height, '网格尺寸不一致');

export async function POST(request: Request) {
  if (!supabaseConfigured()) return Response.json({ error: 'Supabase 尚未配置。' }, { status: 503 });
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: '图纸数据格式无效。' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: '请先登录。' }, { status: 401 });

  const input = parsed.data;
  let projectId = input.projectId;
  if (projectId) {
    const { data } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', user.id).single();
    if (!data) return Response.json({ error: '找不到这个项目。' }, { status: 404 });
  } else {
    const { data, error } = await supabase.from('projects').insert({ user_id: user.id, name: input.name }).select('id').single();
    if (error || !data) return Response.json({ error: '项目保存失败。' }, { status: 500 });
    projectId = data.id;
  }

  const { data: palette } = await supabase.from('palette_versions').select('id').eq('name', 'MARD221').eq('version', PALETTE_VERSION).single();
  if (!palette) return Response.json({ error: '色板尚未初始化，请先执行数据库修复迁移。' }, { status: 500 });
  const colors = statistics(input.grid);
  const { data: version, error } = await supabase.from('pattern_versions').insert({
    user_id: user.id, project_id: projectId, palette_version_id: palette.id,
    version_type: 'manual', width: input.width, height: input.height, grid: input.grid,
    params: input.params, stats: { colors, totalBeads: colors.reduce((sum, color) => sum + color.count, 0), actualColors: colors.length },
    processing_path: 'manual', complexity: input.complexity, warnings: input.warnings,
  }).select('id').single();
  if (error || !version) {
    console.error('[patterns/save] failed', error?.message ?? 'no version returned');
    return Response.json({ error: error?.message ?? '图纸保存失败。' }, { status: 500 });
  }
  return Response.json({ projectId, patternVersionId: version.id });
}
