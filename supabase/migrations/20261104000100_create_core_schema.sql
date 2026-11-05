-- Core product schema for 豆朵 / 拼豆图纸生成器.
-- Images and exports belong in private Supabase Storage buckets; this schema
-- stores metadata and generated pattern data only.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  avatar_url text,
  locale text not null default 'zh-CN',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.palette_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  source text not null,
  is_official boolean not null default false,
  checksum text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (name, version)
);

create table public.palette_colors (
  id uuid primary key default gen_random_uuid(),
  palette_version_id uuid not null references public.palette_versions(id) on delete cascade,
  code text not null,
  hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  red smallint not null check (red between 0 and 255),
  green smallint not null check (green between 0 and 255),
  blue smallint not null check (blue between 0 and 255),
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  unique (palette_version_id, code)
);

insert into public.palette_versions (id, name, version, source, is_official)
values ('00000000-0000-0000-0000-000000000221', 'MARD221', 'mard221-community-2026-11-04', '玩家整理参考色板（非官方认证）', false)
on conflict (name, version) do nothing;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text,
  status text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.source_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_path text not null,
  original_filename text,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  sha256 text,
  retention_until timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source_image_id uuid not null references public.source_images(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed')),
  error_code text,
  error_message text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  finished_at timestamptz
);

create table public.pattern_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source_image_id uuid references public.source_images(id) on delete set null,
  generation_job_id uuid references public.generation_jobs(id) on delete set null,
  palette_version_id uuid not null references public.palette_versions(id),
  version_type text not null check (version_type in ('generated', 'manual')),
  version_number integer not null default 1 check (version_number > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  grid jsonb not null,
  params jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  processing_path text not null check (processing_path in ('cv', 'manual')),
  complexity text check (complexity is null or complexity in ('simple', 'medium', 'high')),
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, version_type, version_number)
);

-- Composite ownership foreign keys prevent a client from attaching one of its
-- rows to another user's project, image, or generation job.
alter table public.projects add constraint projects_id_user_key unique (id, user_id);
alter table public.source_images add constraint source_images_id_user_key unique (id, user_id);
alter table public.generation_jobs add constraint generation_jobs_id_user_key unique (id, user_id);
alter table public.source_images add constraint source_images_project_owner_fk
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade;
alter table public.generation_jobs add constraint generation_jobs_project_owner_fk
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade;
alter table public.generation_jobs add constraint generation_jobs_image_owner_fk
  foreign key (source_image_id, user_id) references public.source_images (id, user_id) on delete cascade;
alter table public.pattern_versions add constraint pattern_versions_project_owner_fk
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade;
alter table public.pattern_versions add constraint pattern_versions_image_owner_fk
  foreign key (source_image_id, user_id) references public.source_images (id, user_id) on delete set null;
alter table public.pattern_versions add constraint pattern_versions_job_owner_fk
  foreign key (generation_job_id, user_id) references public.generation_jobs (id, user_id) on delete set null;

create index projects_user_updated_idx on public.projects (user_id, updated_at desc);
create index source_images_project_created_idx on public.source_images (project_id, created_at desc);
create index generation_jobs_user_created_idx on public.generation_jobs (user_id, created_at desc);
create index generation_jobs_project_created_idx on public.generation_jobs (project_id, created_at desc);
create index pattern_versions_project_updated_idx on public.pattern_versions (project_id, updated_at desc);
create index pattern_versions_user_updated_idx on public.pattern_versions (user_id, updated_at desc);
create index palette_colors_version_order_idx on public.palette_colors (palette_version_id, sort_order);

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();
create trigger pattern_versions_set_updated_at before update on public.pattern_versions
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.palette_versions enable row level security;
alter table public.palette_colors enable row level security;
alter table public.projects enable row level security;
alter table public.source_images enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.pattern_versions enable row level security;

create policy "Users can view their profile" on public.profiles
for select to authenticated using ((select auth.uid()) = id);
create policy "Users can update their profile" on public.profiles
for update to authenticated using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
create policy "Users can create their profile" on public.profiles
for insert to authenticated with check ((select auth.uid()) = id);

create policy "Authenticated users can read palettes" on public.palette_versions
for select to authenticated using (true);
create policy "Authenticated users can read palette colors" on public.palette_colors
for select to authenticated using (true);

create policy "Users can view their projects" on public.projects
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their projects" on public.projects
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their projects" on public.projects
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their projects" on public.projects
for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can view their source images" on public.source_images
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their source images" on public.source_images
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can delete their source images" on public.source_images
for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can view their generation jobs" on public.generation_jobs
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their generation jobs" on public.generation_jobs
for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Users can view their pattern versions" on public.pattern_versions
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their pattern versions" on public.pattern_versions
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their pattern versions" on public.pattern_versions
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their pattern versions" on public.pattern_versions
for delete to authenticated using ((select auth.uid()) = user_id);

grant select on public.palette_versions, public.palette_colors to authenticated;
grant select, insert, update, delete on public.profiles, public.projects,
  public.source_images, public.generation_jobs, public.pattern_versions to authenticated;

comment on table public.source_images is 'Metadata only; source files belong in a private Storage bucket.';
comment on column public.pattern_versions.grid is 'JSONB grid with null for empty cells and palette color indexes for occupied cells.';
