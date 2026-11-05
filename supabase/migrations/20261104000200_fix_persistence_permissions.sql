-- Apply this migration when the core schema migration was already executed.
-- It enables profile creation and guarantees the palette metadata exists for
-- authenticated pattern persistence.

insert into public.palette_versions (id, name, version, source, is_official)
values ('00000000-0000-0000-0000-000000000221', 'MARD221', 'mard221-community-2026-11-04', '玩家整理参考色板（非官方认证）', false)
on conflict (name, version) do nothing;

drop policy if exists "Users can create their profile" on public.profiles;
create policy "Users can create their profile" on public.profiles
for insert to authenticated
with check ((select auth.uid()) = id);
