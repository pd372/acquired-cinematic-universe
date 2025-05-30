import { neon } from "@neondatabase/serverless"
import {
  getStagedEntities,
  getStagedRelationships,
  markEntitiesAsProcessed,
  markRelationshipsAsProcessed,
} from "./staging-store"
import { createEntityMention, createOrUpdateConnection } from "./db"
import NodeCache from "node-cache"

// Create a SQL client using the DATABASE_URL environment variable
const sql = neon(process.env.DATABASE_URL!)

// Create a cache for entity lookups with 30-minute TTL
const entityCache = new NodeCache({ stdTTL: 1800, checkperiod: 120 })

// Function to normalize entity name for comparison
function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove special characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim()
}

// Function to check if two entity names are similar enough to be considered the same
// This is now only used as a fallback when database matching fails
function areEntitiesSimilar(name1: string, name2: string): boolean {
  const normalized1 = normalizeEntityName(name1)
  const normalized2 = normalizeEntityName(name2)

  // Exact match after normalization
  if (normalized1 === normalized2) return true

  // Check for contained names (e.g., "Apple" and "Apple Inc.")
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    // Only consider it a match if the shorter name is at least 5 characters
    // This avoids matching short abbreviations like "AI" with longer terms
    const minLength = Math.min(normalized1.length, normalized2.length)
    if (minLength >= 5) return true
  }

  return false
}

// Function to find matching entity using database-side text search
async function findMatchingEntity(entityName: string, entityType: string): Promise<any | null> {
  // First check the cache
  const cacheKey = `${entityType}:${entityName}`
  const cachedEntity = entityCache.get(cacheKey)
  if (cachedEntity) {
    return cachedEntity
  }

  // Normalize the name for searching
  const normalizedName = normalizeEntityName(entityName)

  // Try exact match on normalized name first (fastest)
  const exactMatches = await sql`
    SELECT id, name, type, description, normalized_name 
    FROM "Entity"
    WHERE type = ${entityType}
    AND normalized_name = ${normalizedName}
    LIMIT 1
  `

  if (exactMatches.length > 0) {
    // Cache the result
    entityCache.set(cacheKey, exactMatches[0])
    return exactMatches[0]
  }

  // Try fuzzy matching using trigram similarity
  const fuzzyMatches = await sql`
    SELECT id, name, type, description, normalized_name,
           similarity(normalized_name, ${normalizedName}) as sim_score
    FROM "Entity"
    WHERE type = ${entityType}
    AND similarity(normalized_name, ${normalizedName}) > 0.4
    ORDER BY sim_score DESC
    LIMIT 1
  `

  if (fuzzyMatches.length > 0) {
    // Cache the result
    entityCache.set(cacheKey, fuzzyMatches[0])
    return fuzzyMatches[0]
  }

  // Try containment matching (one name contains the other)
  const containmentMatches = await sql`
    SELECT id, name, type, description, normalized_name
    FROM "Entity"
    WHERE type = ${entityType}
    AND (
      normalized_name LIKE ${`%${normalizedName}%`}
      OR ${normalizedName} LIKE ${`%` + sql("normalized_name") + `%`}
    )
    LIMIT 1
  `

  if (containmentMatches.length > 0) {
    // Cache the result
    entityCache.set(cacheKey, containmentMatches[0])
    return containmentMatches[0]
  }

  // No match found
  return null
}

// Function to resolve a batch of staged entities with optimized database queries
export async function resolveEntities(batchSize = 100): Promise<{
  processed: number
  created: number
  merged: number
  errors: number
}> {
  // Get a batch of unprocessed staged entities
  const stagedEntities = await getStagedEntities(batchSize, false)

  if (stagedEntities.length === 0) {
    return { processed: 0, created: 0, merged: 0, errors: 0 }
  }

  let created = 0
  let merged = 0
  let errors = 0
  const processedIds: string[] = []

  // Process each staged entity
  for (const stagedEntity of stagedEntities) {
    try {
      // Find a matching entity using optimized database search
      const matchingEntity = await findMatchingEntity(stagedEntity.name, stagedEntity.type)

      let entityId: string

      if (matchingEntity) {
        // Use the existing entity
        entityId = matchingEntity.id

        // Update description if the staged entity has a more detailed one
        if (
          stagedEntity.description &&
          (!matchingEntity.description || stagedEntity.description.length > matchingEntity.description.length)
        ) {
          await sql`
            UPDATE "Entity"
            SET description = ${stagedEntity.description}
            WHERE id = ${entityId}
          `
        }

        merged++
      } else {
        // Create a new entity with normalized name
        const normalizedName = normalizeEntityName(stagedEntity.name)
        const entity = await sql`
          INSERT INTO "Entity" (id, name, type, description, normalized_name)
          VALUES (${stagedEntity.id || undefined}, ${stagedEntity.name}, ${stagedEntity.type}, ${stagedEntity.description}, ${normalizedName})
          RETURNING id
        `
        entityId = entity[0].id

        // Add to cache
        entityCache.set(`${stagedEntity.type}:${stagedEntity.name}`, {
          id: entityId,
          name: stagedEntity.name,
          type: stagedEntity.type,
          description: stagedEntity.description,
          normalized_name: normalizedName,
        })

        created++
      }

      // Create entity mention
      await createEntityMention(stagedEntity.episodeId, entityId)

      // Mark as processed
      processedIds.push(stagedEntity.id)
    } catch (error) {
      console.error(`Error resolving entity ${stagedEntity.name}:`, error)
      errors++
    }
  }

  // Mark processed entities in a single batch operation
  if (processedIds.length > 0) {
    await markEntitiesAsProcessed(processedIds)
  }

  return {
    processed: processedIds.length,
    created,
    merged,
    errors,
  }
}

// Function to resolve a batch of staged relationships with optimized lookups
export async function resolveRelationships(batchSize = 100): Promise<{
  processed: number
  created: number
  skipped: number
  errors: number
}> {
  // Get a batch of unprocessed staged relationships
  const stagedRelationships = await getStagedRelationships(batchSize, false)

  if (stagedRelationships.length === 0) {
    return { processed: 0, created: 0, skipped: 0, errors: 0 }
  }

  let created = 0
  let skipped = 0
  let errors = 0
  const processedIds: string[] = []

  // Create a map to track entity lookups for this batch
  const entityLookupCache = new Map<string, string | null>()

  // Helper function to find entity ID by name
  async function findEntityIdByName(name: string): Promise<string | null> {
    // Check batch-specific cache first
    if (entityLookupCache.has(name)) {
      return entityLookupCache.get(name) || null
    }

    // Try to find entity using optimized search across all types
    const normalizedName = normalizeEntityName(name)

    // Try exact match on normalized name first
    const entities = await sql`
      SELECT id, name, type 
      FROM "Entity"
      WHERE normalized_name = ${normalizedName}
      LIMIT 1
    `

    if (entities.length > 0) {
      const id = entities[0].id
      entityLookupCache.set(name, id)
      return id
    }

    // Try fuzzy match
    const fuzzyEntities = await sql`
      SELECT id, name, type,
             similarity(normalized_name, ${normalizedName}) as sim_score
      FROM "Entity"
      WHERE similarity(normalized_name, ${normalizedName}) > 0.4
      ORDER BY sim_score DESC
      LIMIT 1
    `

    if (fuzzyEntities.length > 0) {
      const id = fuzzyEntities[0].id
      entityLookupCache.set(name, id)
      return id
    }

    // Try containment match
    const containmentEntities = await sql`
      SELECT id, name, type
      FROM "Entity"
      WHERE normalized_name LIKE ${`%${normalizedName}%`}
         OR ${normalizedName} LIKE ${`%` + sql("normalized_name") + `%`}
      LIMIT 1
    `

    if (containmentEntities.length > 0) {
      const id = containmentEntities[0].id
      entityLookupCache.set(name, id)
      return id
    }

    // No match found
    entityLookupCache.set(name, null)
    return null
  }

  // Process each staged relationship
  for (const stagedRel of stagedRelationships) {
    try {
      // Find source and target entities
      const sourceEntityId = await findEntityIdByName(stagedRel.sourceName)
      const targetEntityId = await findEntityIdByName(stagedRel.targetName)

      // Only create connection if both entities exist
      if (sourceEntityId && targetEntityId) {
        await createOrUpdateConnection(stagedRel.episodeId, sourceEntityId, targetEntityId, stagedRel.description)
        created++
      } else {
        // Skip if either entity doesn't exist
        skipped++
      }

      // Mark as processed
      processedIds.push(stagedRel.id)
    } catch (error) {
      console.error(`Error resolving relationship ${stagedRel.sourceName} -> ${stagedRel.targetName}:`, error)
      errors++
    }
  }

  // Mark processed relationships in a single batch operation
  if (processedIds.length > 0) {
    await markRelationshipsAsProcessed(processedIds)
  }

  return {
    processed: processedIds.length,
    created,
    skipped,
    errors,
  }
}

// Function to run a complete resolution process with improved batching
export async function runResolution(
  entityBatchSize = 100,
  relationshipBatchSize = 100,
  maxBatches = 10,
): Promise<{
  entitiesProcessed: number
  entitiesCreated: number
  entitiesMerged: number
  relationshipsProcessed: number
  relationshipsCreated: number
  relationshipsSkipped: number
  errors: number
  timeTaken: number
}> {
  const startTime = Date.now()

  let entitiesProcessed = 0
  let entitiesCreated = 0
  let entitiesMerged = 0
  let relationshipsProcessed = 0
  let relationshipsCreated = 0
  let relationshipsSkipped = 0
  let errors = 0

  // Process entities first
  for (let i = 0; i < maxBatches; i++) {
    const result = await resolveEntities(entityBatchSize)

    entitiesProcessed += result.processed
    entitiesCreated += result.created
    entitiesMerged += result.merged
    errors += result.errors

    // Stop if no more entities to process
    if (result.processed === 0) break
  }

  // Then process relationships
  for (let i = 0; i < maxBatches; i++) {
    const result = await resolveRelationships(relationshipBatchSize)

    relationshipsProcessed += result.processed
    relationshipsCreated += result.created
    relationshipsSkipped += result.skipped
    errors += result.errors

    // Stop if no more relationships to process
    if (result.processed === 0) break
  }

  const timeTaken = Date.now() - startTime

  return {
    entitiesProcessed,
    entitiesCreated,
    entitiesMerged,
    relationshipsProcessed,
    relationshipsCreated,
    relationshipsSkipped,
    errors,
    timeTaken,
  }
}

// Function to clear entity cache
export function clearEntityCache(): void {
  entityCache.flushAll()
}

// Function to get entity cache stats
export function getEntityCacheStats(): {
  keys: number
  hits: number
  misses: number
  ksize: number
  vsize: number
} {
  return {
    keys: entityCache.keys().length,
    hits: entityCache.getStats().hits,
    misses: entityCache.getStats().misses,
    ksize: entityCache.getStats().ksize,
    vsize: entityCache.getStats().vsize,
  }
}
