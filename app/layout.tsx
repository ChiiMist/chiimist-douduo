import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'豆朵 · 把喜欢，拼成小小的作品',description:'上传喜欢的图片，制作 MARD221 拼豆图纸。简单生成、轻松编辑，下载图纸与用豆清单。'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}<a href="/history" aria-label="查看我的图纸" style={{position:'fixed',right:16,top:'50%',transform:'translateY(-50%)',zIndex:20,background:'#f9e8c7',color:'#8f3022',border:'2px solid #401b16',borderRadius:5,padding:'12px 14px',fontWeight:800,textDecoration:'none',boxShadow:'3px 3px #401b16',writingMode:'vertical-rl'}}>▦ 我的图纸</a></body></html>;}
