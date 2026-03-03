-- Migration: add turn_state JSONB column to campaigns table
ALTER TABLE campaigns ADD COLUMN turn_state JSONB DEFAULT '{}';
