import { neon } from "@neondatabase/serverless"
import { v4 as uuidv4 } from "uuid"

// Create a SQL client using the DATABASE_URL environment variable
const sql = neon(process.env.DATABASE_URL!)

// Types for raw entities and relationships
export interface RawEntity {
  name: string
  type: string
  description?: string
  episodeId: string
  episodeTitle: string
  extractedAt: Date
}

export interface RawRelationship {
  sourceName: string
  targetName: string
  description: string
  episodeId: string
  episodeTitle: string
  extractedAt: Date
}

// Function to store raw entities in the staging area
export async function storeRawEntities(entities: RawEntity[]): Promise<string[]> {
  if (entities.length === 0) return []

  const ids: string[] = []
  const batchSize = 50

  // Process in batches to avoid hitting query size limits
  for (let i = 0; i < entities.length; i += batchSize) {
    const batch = entities.slice(i, i + batchSize)

    // Create values for batch insert
    const values = batch.map((entity) => {
      const id = uuidv4()
      ids.push(id)

      return {
        id,
        name: entity.name,
        type: entity.type,
        description: entity.description || null,
        episodeId: entity.episodeId,
        episodeTitle: entity.episodeTitle,
        extractedAt: entity.extractedAt,
      }
    })

    // Insert batch
    await sql`
      INSERT INTO "StagedEntity" (
        id, 
        name, 
        type, 
        description, 
        "episodeId", 
        "episodeTitle", 
        "extractedAt"
      )
      SELECT 
        ${sql(values.map((v) => v.id))},
        ${sql(values.map((v) => v.name))},
        ${sql(values.map((v) => v.type))},
        ${sql(values.map((v) => v.description))},
        ${sql(values.map((v) => v.episodeId))},
        ${sql(values.map((v) => v.episodeTitle))},
        ${sql(values.map((v) => v.extractedAt))}
    `
  }

  return ids
}

// Function to store raw relationships in the staging area
export async function storeRawRelationships(relationships: RawRelationship[]): Promise<string[]> {
  if (relationships.length === 0) return []

  const ids: string[] = []
  const batchSize = 50

  // Process in batches to avoid hitting query size limits
  for (let i = 0; i < relationships.length; i += batchSize) {
    const batch = relationships.slice(i, i + batchSize)

    // Create values for batch insert
    const values = batch.map((rel) => {
      const id = uuidv4()
      ids.push(id)

      return {
        id,
        sourceName: rel.sourceName,
        targetName: rel.targetName,
        description: rel.description,
        episodeId: rel.episodeId,
        episodeTitle: rel.episodeTitle,
        extractedAt: rel.extractedAt,
      }
    })

    // Insert batch
    await sql`
      INSERT INTO "StagedRelationship" (
        id, 
        "sourceName", 
        "targetName", 
        description, 
        "episodeId", 
        "episodeTitle", 
        "extractedAt"
      )
      SELECT 
        ${sql(values.map((v) => v.id))},
        ${sql(values.map((v) => v.sourceName))},
        ${sql(values.map((v) => v.targetName))},
        ${sql(values.map((v) => v.description))},
        ${sql(values.map((v) => v.episodeId))},
        ${sql(values.map((v) => v.episodeTitle))},
        ${sql(values.map((v) => v.extractedAt))}
    `
  }

  return ids
}

// Function to get all staged entities
export async function getStagedEntities(limit = 1000, processed = false): Promise<RawEntity[]> {
  const result = await sql`
    SELECT * FROM "StagedEntity"
    WHERE processed = ${processed}
    ORDER BY "extractedAt" ASC
    LIMIT ${limit}
  `

  return result.map((row) => ({
    name: row.name,
    type: row.type,
    description: row.description,
    episodeId: row.episodeId,
    episodeTitle: row.episodeTitle,
    extractedAt: new Date(row.extractedAt),
  }))
}

// Function to get all staged relationships
export async function getStagedRelationships(limit = 1000, processed = false): Promise<RawRelationship[]> {
  const result = await sql`
    SELECT * FROM "StagedRelationship"
    WHERE processed = ${processed}
    ORDER BY "extractedAt" ASC
    LIMIT ${limit}
  `

  return result.map((row) => ({
    sourceName: row.sourceName,
    targetName: row.targetName,
    description: row.description,
    episodeId: row.episodeId,
    episodeTitle: row.episodeTitle,
    extractedAt: new Date(row.extractedAt),
  }))
}

// Function to mark staged entities as processed
export async function markEntitiesAsProcessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  await sql`
    UPDATE "StagedEntity"
    SET processed = true
    WHERE id IN ${sql(ids)}
  `
}

// Function to mark staged relationships as processed
export async function markRelationshipsAsProcessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  await sql`
    UPDATE "StagedRelationship"
    SET processed = true
    WHERE id IN ${sql(ids)}
  `
}

// Function to get staging statistics
export async function getStagingStats(): Promise<{
  pendingEntities: number
  pendingRelationships: number
  processedEntities: number
  processedRelationships: number
}> {
  const pendingEntities = await sql`
    SELECT COUNT(*) as count FROM "StagedEntity" WHERE processed = false
  `

  const pendingRelationships = await sql`
    SELECT COUNT(*) as count FROM "StagedRelationship" WHERE processed = false
  `

  const processedEntities = await sql`
    SELECT COUNT(*) as count FROM "StagedEntity" WHERE processed = true
  `

  const processedRelationships = await sql`
    SELECT COUNT(*) as count FROM "StagedRelationship" WHERE processed = true
  `

  return {
    pendingEntities: Number(pendingEntities[0]?.count || 0),
    pendingRelationships: Number(pendingRelationships[0]?.count || 0),
    processedEntities: Number(processedEntities[0]?.count || 0),
    processedRelationships: Number(processedRelationships[0]?.count || 0),
  }
}

// Function to clear processed items older than a certain date
export async function clearProcessedItems(olderThan: Date): Promise<{
  entitiesRemoved: number
  relationshipsRemoved: number
}> {
  const entitiesResult = await sql`
    DELETE FROM "StagedEntity"
    WHERE processed = true AND "extractedAt" < ${olderThan}
    RETURNING id
  `

  const relationshipsResult = await sql`
    DELETE FROM "StagedRelationship"
    WHERE processed = true AND "extractedAt" < ${olderThan}
    RETURNING id
  `

  return {
    entitiesRemoved: entitiesResult.length,
    relationshipsRemoved: relationshipsResult.length,
  }
}
