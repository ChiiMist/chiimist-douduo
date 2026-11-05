import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pattern } from './types';
import { statistics } from './pattern';

const PALETTE_NAME = 'MARD221';

async function cleanupExpiredSourceImages(supabase: SupabaseClient, userId: string) {
  const { data: expired, error: listError } = await supabase
    .from('source_images')
    .select('id, storage_path')
    .eq('user_id', userId)
    .lt('retention_until', new Date().toISOString());

  if (listError) throw listError;
  if (!expired?.length) return;

  const { error: storageError } = await supabase.storage
    .from('source-images')
    .remove(expired.map((image) => image.storage_path));
  if (storageError) throw storageError;

  const { error: deleteError } = await supabase
    .from('source_images')
    .delete()
    .in('id', expired.map((image) => image.id));
  if (deleteError) throw deleteError;
}

export async function persistPattern({
  supabase,
  userId,
  file,
  result,
  projectId,
}: {
  supabase: SupabaseClient;
  userId: string;
  file: File;
  result: Pattern;
  projectId?: string;
}) {
  const now = new Date().toISOString();
  // 清理当前用户超过 7 天的原图；图纸记录不会被删除。
  try {
    await cleanupExpiredSourceImages(supabase, userId);
  } catch (error) {
    // 清理失败不应阻止本次生成，避免影响用户正常使用。
    console.warn('[persistence] expired source image cleanup failed', error);
  }
  const { error: profileError } = await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' });
  if (profileError) throw profileError;

  let activeProjectId = projectId;
  if (activeProjectId) {
    const { data, error } = await supabase.from('projects').select('id').eq('id', activeProjectId).eq('user_id', userId).single();
    if (error || !data) throw error ?? new Error('PROJECT_NOT_FOUND');
  } else {
    const defaultName = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 120) || '我的拼豆图纸';
    const { data, error } = await supabase.from('projects').insert({ user_id: userId, name: defaultName }).select('id').single();
    if (error || !data) throw error ?? new Error('PROJECT_CREATE_FAILED');
    activeProjectId = data.id;
  }
  if (!activeProjectId) throw new Error('PROJECT_CREATE_FAILED');

  const storagePath = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error: uploadError } = await supabase.storage
    .from('source-images')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data: image, error: imageError } = await supabase.from('source_images').insert({
      user_id: userId,
      project_id: activeProjectId,
      storage_path: storagePath,
      original_filename: file.name.slice(0, 255),
      mime_type: file.type,
      file_size: file.size,
      width: result.width,
      height: result.height,
      retention_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }).select('id').single();
  if (imageError || !image) throw imageError ?? new Error('IMAGE_METADATA_CREATE_FAILED');

  const { data: palette, error: paletteError } = await supabase.from('palette_versions')
    .select('id').eq('name', PALETTE_NAME).eq('version', result.paletteVersion).maybeSingle();
  if (paletteError) throw paletteError;
  let paletteId = palette?.id;
  if (!paletteId) {
    const { data: createdPalette, error } = await supabase.from('palette_versions').insert({
      name: PALETTE_NAME,
      version: result.paletteVersion,
      source: '玩家整理参考色板（非官方认证）',
      is_official: false,
    }).select('id').single();
    if (error || !createdPalette) throw error ?? new Error('PALETTE_CREATE_FAILED');
    paletteId = createdPalette.id;
  }

  const colors = statistics(result.grid);
  const { data: job, error: jobError } = await supabase.from('generation_jobs').insert({
    user_id: userId,
    project_id: activeProjectId,
    source_image_id: image.id,
    status: 'succeeded',
    duration_ms: 0,
    started_at: now,
    finished_at: now,
  }).select('id').single();
  if (jobError || !job) throw jobError ?? new Error('JOB_CREATE_FAILED');

  const { data: version, error: versionError } = await supabase.from('pattern_versions').insert({
    user_id: userId,
    project_id: activeProjectId,
    source_image_id: image.id,
    generation_job_id: job.id,
    palette_version_id: paletteId,
    version_type: 'generated',
    width: result.width,
    height: result.height,
    grid: result.grid,
    params: result.params,
    stats: { colors, totalBeads: colors.reduce((sum, color) => sum + color.count, 0), actualColors: colors.length },
    processing_path: 'cv',
    complexity: result.complexity,
    warnings: result.warnings,
  }).select('id').single();
  if (versionError || !version) throw versionError ?? new Error('PATTERN_VERSION_CREATE_FAILED');

  return { projectId: activeProjectId, patternVersionId: version.id };
}
