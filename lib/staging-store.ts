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

  // Process entities one by one to avoid complex batch operations
  for (const entity of entities) {
    try {
      const id = uuidv4()
      ids.push(id)

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
        VALUES (
          ${id},
          ${entity.name},
          ${entity.type},
          ${entity.description || null},
          ${entity.episodeId},
          ${entity.episodeTitle},
          ${entity.extractedAt.toISOString()}
        )
      `
    } catch (error) {
      console.error(`Error storing entity ${entity.name}:`, error)
      // Continue with other entities even if one fails
    }
  }

  return ids
}

// Function to store raw relationships in the staging area
export async function storeRawRelationships(relationships: RawRelationship[]): Promise<string[]> {
  if (relationships.length === 0) return []

  const ids: string[] = []

  // Process relationships one by one to avoid complex batch operations
  for (const rel of relationships) {
    try {
      const id = uuidv4()
      ids.push(id)

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
        VALUES (
          ${id},
          ${rel.sourceName},
          ${rel.targetName},
          ${rel.description},
          ${rel.episodeId},
          ${rel.episodeTitle},
          ${rel.extractedAt.toISOString()}
        )
      `
    } catch (error) {
      console.error(`Error storing relationship ${rel.sourceName} -> ${rel.targetName}:`, error)
      // Continue with other relationships even if one fails
    }
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

  // Process in smaller batches to avoid query size limits
  const batchSize = 50
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)

    // Use ANY operator for array matching
    await sql`
      UPDATE "StagedEntity"
      SET processed = true
      WHERE id = ANY(${batch})
    `
  }
}

// Function to mark staged relationships as processed
export async function markRelationshipsAsProcessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  // Process in smaller batches to avoid query size limits
  const batchSize = 50
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)

    // Use ANY operator for array matching
    await sql`
      UPDATE "StagedRelationship"
      SET processed = true
      WHERE id = ANY(${batch})
    `
  }
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
    WHERE processed = true AND "extractedAt" < ${olderThan.toISOString()}
    RETURNING id
  `

  const relationshipsResult = await sql`
    DELETE FROM "StagedRelationship"
    WHERE processed = true AND "extractedAt" < ${olderThan.toISOString()}
    RETURNING id
  `

  return {
    entitiesRemoved: entitiesResult.length,
    relationshipsRemoved: relationshipsResult.length,
  }
}
