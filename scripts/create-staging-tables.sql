-- Create staging tables for two-phase ingestion

-- Table for staged entities
CREATE TABLE IF NOT EXISTS "StagedEntity" (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  "episodeId" TEXT NOT NULL,
  "episodeTitle" TEXT NOT NULL,
  "extractedAt" TIMESTAMP NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  
  -- Create indexes for efficient querying
  INDEX idx_staged_entity_processed (processed),
  INDEX idx_staged_entity_extracted_at ("extractedAt")
);

-- Table for staged relationships
CREATE TABLE IF NOT EXISTS "StagedRelationship" (
  id UUID PRIMARY KEY,
  "sourceName" TEXT NOT NULL,
  "targetName" TEXT NOT NULL,
  description TEXT,
  "episodeId" TEXT NOT NULL,
  "episodeTitle" TEXT NOT NULL,
  "extractedAt" TIMESTAMP NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  
  -- Create indexes for efficient querying
  INDEX idx_staged_relationship_processed (processed),
  INDEX idx_staged_relationship_extracted_at ("extractedAt")
);

-- Add indexes for name-based lookups
CREATE INDEX IF NOT EXISTS idx_staged_entity_name ON "StagedEntity" (name);
CREATE INDEX IF NOT EXISTS idx_staged_relationship_source ON "StagedRelationship" ("sourceName");
CREATE INDEX IF NOT EXISTS idx_staged_relationship_target ON "StagedRelationship" ("targetName");

-- Add index for episode-based lookups
CREATE INDEX IF NOT EXISTS idx_staged_entity_episode ON "StagedEntity" ("episodeId");
CREATE INDEX IF NOT EXISTS idx_staged_relationship_episode ON "StagedRelationship" ("episodeId");
