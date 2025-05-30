-- Enable the pg_trgm extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add a GIN index on Entity.name for faster text search
CREATE INDEX IF NOT EXISTS idx_entity_name_trgm ON "Entity" USING GIN (name gin_trgm_ops);

-- Add a GIN index on Entity.name and type for combined searches
CREATE INDEX IF NOT EXISTS idx_entity_name_type ON "Entity" (type, name);

-- Add a normalized_name column to Entity table for faster matching
ALTER TABLE "Entity" ADD COLUMN IF NOT EXISTS normalized_name TEXT;

-- Update existing entities with normalized names
UPDATE "Entity" SET normalized_name = LOWER(REGEXP_REPLACE(name, '[^\w\s]', '', 'g'));

-- Add index on normalized_name
CREATE INDEX IF NOT EXISTS idx_entity_normalized_name ON "Entity" (normalized_name);
