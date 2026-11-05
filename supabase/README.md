# Supabase setup

This project uses imperative SQL migrations.

Run `supabase db push` after installing and linking the Supabase CLI, or paste
the migration into the Supabase SQL Editor for a first manual setup:

`migrations/20261104000100_create_core_schema.sql`

The migrations create the core tables, RLS policies, and the private
`source-images` Storage bucket. Generation is CV-only;
there are no AI consent or AI usage columns. Source images should be stored in
a private bucket, with `source_images.storage_path` containing only the object
path.
