import Studio from '@/components/studio';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, supabaseConfigured } from '@/lib/supabase/server';

export default async function Page({ searchParams }: { searchParams: Promise<{ patternId?: string }> }){
  if (supabaseConfigured()) {
    const supabase=await createSupabaseServerClient();
    const { data: { user } }=await supabase.auth.getUser();
    if (!user) redirect('/auth');
  }
  const params = await searchParams;
  return <Studio patternId={params.patternId} />;
}
