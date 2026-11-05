'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import styles from './auth.module.css';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage('');
    const supabase = createSupabaseBrowserClient();
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    if (mode === 'login') router.replace('/');
    else setMessage('注册成功，请检查邮箱确认后再登录。');
  }

  return <main className={styles.page}>
    <header className={styles.header}><a className={styles.brand} href="/">▦ <b>豆朵</b></a><span className={styles.badge}>MARD 221 色</span></header>
    <section className={styles.hero}><span className={styles.sticker}>✿ 手作小天地</span><h1>{mode === 'login' ? <>欢迎回来，<em>继续拼快乐。</em></> : <>加入豆朵，<em>拼出好心情。</em></>}</h1><p>保存你的图纸，让灵感一直在。</p></section>
    <section className={styles.card}><div className={styles.cardTop}><span>▦</span><div><b>{mode === 'login' ? '登录豆朵' : '注册豆朵'}</b><small>{mode === 'login' ? '回来继续制作你的拼豆图纸' : '创建账号，保存你的作品'}</small></div></div>
      <form onSubmit={submit} className={styles.form}>
        <label>邮箱<input type="email" required placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} /></label>
        <label>密码<input type="password" required minLength={6} placeholder="至少 6 位密码" value={password} onChange={e=>setPassword(e.target.value)} /></label>
        <button className={styles.submit} disabled={busy}>{busy ? '处理中…' : mode === 'login' ? '登录，开始拼豆' : '注册账号'}</button>
      </form>
      {message && <p className={styles.message}>{message}</p>}
      <button className={styles.switch} onClick={()=>{setMode(mode === 'login' ? 'signup' : 'login');setMessage('')}}>{mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}</button>
    </section>
    <a className={styles.back} href="/">← 返回首页</a>
  </main>;
}
