import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PALETTE } from '@/lib/palette';
import styles from './history.module.css';

type Cell = number | null;
type Version = { id: string; width: number; height: number; grid: Cell[]; stats: { totalBeads?: number; actualColors?: number }; created_at: string };

function Preview({ grid, width, height }: { grid: Cell[]; width: number; height: number }) {
  return <div className={styles.preview} style={{ gridTemplateColumns: `repeat(${width}, 1fr)` }} aria-label={`${width}乘${height}图纸预览`}>
    {grid.map((cell, index) => {
      const color = cell === null ? undefined : PALETTE[cell];
      return <i key={index} className={cell === null ? styles.empty : styles.bead} style={color ? { backgroundColor: color.hex } : undefined} title={color?.code} />;
    })}
  </div>;
}

export default async function HistoryPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  const { data: projects, error: projectsError } = await supabase.from('projects').select('id,name,created_at,updated_at,pattern_versions!pattern_versions_project_owner_fk(id,width,height,grid,stats,created_at)').eq('user_id', user.id).neq('status', 'deleted').order('updated_at', { ascending: false });
  if (projectsError) console.error('[history] query failed', projectsError.message);
  const items = (projects ?? []).flatMap(project => (project.pattern_versions as Version[] ?? []).map(version => ({ project, version }))).sort((a, b) => Date.parse(b.version.created_at) - Date.parse(a.version.created_at));

  return <main className={styles.page}>
    <header className={styles.header}><a className={styles.brand} href="/">▦ <b>豆朵</b></a><nav><a href="/">继续拼图</a><a className={styles.active} href="/history">我的图纸</a></nav></header>
    <section className={styles.hero}><span>✿ 我的作品集</span><h1>以前拼过的，<em>都在这里。</em></h1><p>登录后生成的图纸会自动保存，随时回来继续。</p></section>
    {projectsError ? <section className={styles.empty}><b>图纸读取失败</b><p>数据库暂时无法读取你的图纸，请刷新后重试。</p></section> : items.length ? <section className={styles.grid}>{items.map(({ project, version }) => <article className={styles.card} key={version.id}>
      <Preview grid={version.grid} width={version.width} height={version.height} />
      <a className={styles.cardLink} href={`/?patternId=${version.id}`} aria-label={`打开${project.name}进行编辑`}><div className={styles.cardBody}><h2>{project.name}</h2><p>{version.width} × {version.height} 格 · {version.stats?.actualColors ?? 0} 色 · {version.stats?.totalBeads ?? 0} 颗</p><small>{new Date(version.created_at).toLocaleString('zh-CN')}</small><strong>打开编辑 →</strong></div></a>
    </article>)}</section> : <section className={styles.empty}><b>还没有保存的图纸</b><p>去首页上传一张图片，开始制作你的第一张拼豆图纸吧。</p><a href="/">开始拼图 →</a></section>}
  </main>;
}
