import { createSupabaseServerClient, supabaseConfigured } from '@/lib/supabase/server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured()) return Response.json({ error: 'Supabase 尚未配置。' }, { status: 503 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: '请先登录。' }, { status: 401 });
  const { id } = await params;
  const { data, error } = await supabase.from('pattern_versions').select('id,width,height,grid,params,warnings,complexity,processing_path,created_at').eq('id', id).eq('user_id', user.id).single();
  if (error || !data) return Response.json({ error: '找不到这张图纸。' }, { status: 404 });
  return Response.json(data);
}
