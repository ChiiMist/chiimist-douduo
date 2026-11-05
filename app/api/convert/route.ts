import { convertImage, ConversionError } from '@/lib/convert';
import { paramsSchema } from '@/lib/validation';
import { statistics } from '@/lib/pattern';
import { createSupabaseServerClient, supabaseConfigured } from '@/lib/supabase/server';
import { persistPattern } from '@/lib/persistence';
export const runtime='nodejs';
export const maxDuration=60;
let active=0;const requests:number[]=[];
export async function POST(request:Request) {
 const limit=10*1024*1024;
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 const cap=Math.max(1,Number(process.env.MAX_CONCURRENT_CONVERSIONS)||2),rate=Math.max(1,Number(process.env.REQUESTS_PER_MINUTE)||12);
 const now=Date.now();while(requests.length&&requests[0]<now-60000)requests.shift();
 if(active>=cap||requests.length>=rate)return json({code:'BUSY',error:'正在处理的图片较多，请稍后再试。'},429);
 if(Number(request.headers.get('content-length'))>limit+65536)return json({code:'FILE_TOO_LARGE',error:'图片不能超过 10 MB。'},413);
 active++;requests.push(now);
 try {
  // 有界读取，不能仅信任 content-length；包含 multipart 开销。
  const reader=request.body?.getReader();if(!reader)throw new ConversionError('EMPTY','请选择图片。');
  const chunks:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit+65536){await reader.cancel();throw new ConversionError('FILE_TOO_LARGE','图片不能超过 10 MB。',413);}chunks.push(value);}
  const bounded=new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')||''},body:Buffer.concat(chunks)});
  let form:FormData;try{form=await bounded.formData();}catch{throw new ConversionError('INVALID_FORM','上传格式无效。');}
  const file=form.get('image');if(!(file instanceof File)||!file.size)throw new ConversionError('EMPTY','请选择有效图片。');
  if(file.size>limit)throw new ConversionError('FILE_TOO_LARGE','图片不能超过 10 MB。',413);
  let input;try{input=JSON.parse(String(form.get('params')));}catch{throw new ConversionError('INVALID_PARAMS','生成参数格式无效。');}
  const parsed=paramsSchema.safeParse(input);if(!parsed.success)throw new ConversionError('INVALID_PARAMS','请检查裁剪范围和生成参数。');
  const result=await convertImage(Buffer.from(await file.arrayBuffer()),parsed.data);
  const colors=statistics(result.grid);
  let persistence: { projectId: string; patternVersionId: string } | undefined;
  let persistenceWarning: string | undefined;
  if (supabaseConfigured()) {
   try {
    const supabase=await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('AUTH_REQUIRED');
    const saved=await persistPattern({supabase,userId:user.id,file,result,projectId:String(form.get('projectId')||'')||undefined});
    persistence=saved;
  } catch (error) {
    console.error('[convert] persistence failed', error instanceof Error ? error.message : error);
    throw new ConversionError('PERSISTENCE_FAILED','图纸生成成功，但保存到云端失败，请稍后重试。',500);
   }
  }
  return json({...result,colors,totalBeads:colors.reduce((sum,c)=>sum+c.count,0),actualColors:colors.length,persistence,persistenceWarning});
 }catch(error){return error instanceof ConversionError?json({code:error.code,error:error.message},error.status):json({code:'CONVERSION_FAILED',error:'图片处理失败，请换一张图片或稍后重试。'},500);}finally{active--;}
}
