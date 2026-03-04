-- supabase/migrations/006_world_classes.sql
ALTER TABLE worlds ADD COLUMN classes JSONB NOT NULL DEFAULT '[]';
