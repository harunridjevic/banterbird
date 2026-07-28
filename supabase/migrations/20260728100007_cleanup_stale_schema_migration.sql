-- Cleanup stale schema_migrations entry for version 20250126
-- This version exists in the database but has no corresponding migration file
-- Remove it to prevent duplicate key errors during future migrations

delete from supabase_migrations.schema_migrations 
where version = '20250126';
