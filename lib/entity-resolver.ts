import { neon } from "@neondatabase/serverless"
import { v4 as uuidv4 } from "uuid"
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

// Enhanced function to normalize entity name for comparison
function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove special characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/\b(company|corp|corporation|inc|incorporated|ltd|limited|llc|co|the)\b/g, "") // Remove common company suffixes
    .replace(/\b(manufacturing|manufactuging|mfg|tech|technology|technologies|systems|solutions)\b/g, "") // Remove common tech terms
    .trim()
}

// Enhanced function to generate alternative names for better matching
function generateAlternativeNames(name: string): string[] {
  const alternatives = [name]
  const normalized = normalizeEntityName(name)

  // Add normalized version
  if (normalized !== name.toLowerCase()) {
    alternatives.push(normalized)
  }

  // Common abbreviations and variations
  const abbreviationMap: Record<string, string[]> = {
    "taiwan semiconductor manufacturing company": ["tsmc", "taiwan semiconductor", "taiwan semi"],
    tsmc: ["taiwan semiconductor manufacturing company", "taiwan semiconductor"],
    "apple inc": ["apple", "apple computer"],
    apple: ["apple inc", "apple computer"],
    "microsoft corporation": ["microsoft", "msft"],
    microsoft: ["microsoft corporation", "msft"],
    amazon: ["amazon.com", "amazon inc"],
    google: ["alphabet", "alphabet inc"],
    alphabet: ["google", "alphabet inc"],
    facebook: ["meta", "meta platforms"],
    meta: ["facebook", "meta platforms"],
    "international business machines": ["ibm"],
    ibm: ["international business machines"],
    "nvidia corporation": ["nvidia", "nvda"],
    nvidia: ["nvidia corporation", "nvda"],
    "advanced micro devices": ["amd"],
    amd: ["advanced micro devices"],
    "intel corporation": ["intel"],
    intel: ["intel corporation"],
  }

  const lowerName = name.toLowerCase()
  const normalizedLower = normalized.toLowerCase()

  // Check for known abbreviations
  if (abbreviationMap[lowerName]) {
    alternatives.push(...abbreviationMap[lowerName])
  }

  if (abbreviationMap[normalizedLower]) {
    alternatives.push(...abbreviationMap[normalizedLower])
  }

  // Generate acronyms for multi-word names
  const words = name
    .split(/\s+/)
    .filter((word) => !["the", "and", "or", "of", "in", "at", "to", "for", "with", "by"].includes(word.toLowerCase()))

  if (words.length > 1) {
    const acronym = words.map((word) => word.charAt(0).toUpperCase()).join("")
    if (acronym.length >= 2 && acronym.length <= 6) {
      alternatives.push(acronym)
      alternatives.push(acronym.toLowerCase())
    }
  }

  return [...new Set(alternatives)] // Remove duplicates
}

// Enhanced function to find matching entity using multiple strategies
async function findMatchingEntity(entityName: string, entityType: string): Promise<any | null> {
  // First check the cache
  const cacheKey = `${entityType}:${entityName}`
  const cachedEntity = entityCache.get(cacheKey)
  if (cachedEntity) {
    return cachedEntity
  }

  // Generate all possible alternative names
  const alternativeNames = generateAlternativeNames(entityName)
  const normalizedAlternatives = alternativeNames.map((name) => normalizeEntityName(name))

  console.log(`Searching for entity "${entityName}" with alternatives:`, alternativeNames)

  // Strategy 1: Exact match on any alternative name (CONSERVATIVE)
  for (const altName of alternativeNames) {
    const exactMatches = await sql`
      SELECT id, name, type, description, normalized_name 
      FROM "Entity"
      WHERE type = ${entityType}
      AND (LOWER(name) = ${altName.toLowerCase()} OR normalized_name = ${normalizeEntityName(altName)})
      LIMIT 1
    `

    if (exactMatches.length > 0) {
      console.log(`Found exact match for "${entityName}" -> "${exactMatches[0].name}"`)
      entityCache.set(cacheKey, exactMatches[0])
      return exactMatches[0]
    }
  }

  // Strategy 2: High-confidence fuzzy matching (VERY CONSERVATIVE - 0.8+ only)
  for (const normalizedAlt of normalizedAlternatives) {
    const fuzzyMatches = await sql`
      SELECT id, name, type, description, normalized_name,
             similarity(normalized_name, ${normalizedAlt}) as sim_score
      FROM "Entity"
      WHERE type = ${entityType}
      AND similarity(normalized_name, ${normalizedAlt}) > 0.8
      ORDER BY sim_score DESC
      LIMIT 1
    `

    if (fuzzyMatches.length > 0 && fuzzyMatches[0].sim_score > 0.85) {
      console.log(
        `Found high-confidence fuzzy match for "${entityName}" -> "${fuzzyMatches[0].name}" (score: ${fuzzyMatches[0].sim_score})`,
      )
      entityCache.set(cacheKey, fuzzyMatches[0])
      return fuzzyMatches[0]
    }
  }

  // Strategy 3: Known aliases and variations only (WHITELIST APPROACH)
  const knownAliases: Record<string, Record<string, string[]>> = {
    Company: {
      "apple": ["apple inc", "apple computer"],
      "microsoft": ["microsoft corporation", "msft"],
      "meta": ["facebook", "meta platforms", "facebook inc"],
      "alphabet": ["google", "alphabet inc"],
      "lvmh": ["lvmh moet hennessy louis vuitton", "moet hennessy louis vuitton"],
      "bernard arnault": [], // Person, not company
      "groupe arnault": [], // Should not match with anything else
      "omega": [], // Should not match with anything else  
      "rolex": ["wilsdorf and davis"], // Historical name
    },
    Person: {
      "bernard arnault": [], // Should not match with companies
      "steve jobs": [],
      "tim cook": [],
      "mark zuckerberg": [],
    }
  }

  // Check known aliases
  const entityNormalized = normalizeEntityName(entityName)
  const typeAliases = knownAliases[entityType] || {}
  
  for (const [canonical, aliases] of Object.entries(typeAliases)) {
    if (entityNormalized === canonical || aliases.includes(entityNormalized)) {
      // Find the canonical entity
      const canonicalMatches = await sql`
        SELECT id, name, type, description, normalized_name
        FROM "Entity"
        WHERE type = ${entityType}
        AND normalized_name = ${canonical}
        LIMIT 1
      `
      
      if (canonicalMatches.length > 0) {
        console.log(`Found known alias match for "${entityName}" -> "${canonicalMatches[0].name}"`)
        entityCache.set(cacheKey, canonicalMatches[0])
        return canonicalMatches[0]
      }
    }
  }

  console.log(`No match found for "${entityName}" (conservative matching)`)
  return null
}

// Function to resolve a batch of staged entities with enhanced matching
export async function resolveEntities(batchSize = 100): Promise<{
  processed: number
  created: number
  merged: number
  errors: number
  mergeDetails: Array<{ source: string; target: string; reason: string }>
}> {
  // Get a batch of unprocessed staged entities
  const stagedEntities = await getStagedEntities(batchSize, false)

  if (stagedEntities.length === 0) {
    return { processed: 0, created: 0, merged: 0, errors: 0, mergeDetails: [] }
  }

  let created = 0
  let merged = 0
  let errors = 0
  const processedIds: string[] = []
  const mergeDetails: Array<{ source: string; target: string; reason: string }> = []

  // Process each staged entity
  for (const stagedEntity of stagedEntities) {
    try {
      // Find a matching entity using enhanced search
      const matchingEntity = await findMatchingEntity(stagedEntity.name, stagedEntity.type)

      let entityId: string

      if (matchingEntity) {
        // Use the existing entity
        entityId = matchingEntity.id

        // Record the merge
        mergeDetails.push({
          source: stagedEntity.name,
          target: matchingEntity.name,
          reason: "Entity resolution matched existing entity",
        })

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
        const newId = uuidv4()

        await sql`
          INSERT INTO "Entity" (id, name, type, description, normalized_name)
          VALUES (${newId}, ${stagedEntity.name}, ${stagedEntity.type}, ${stagedEntity.description}, ${normalizedName})
        `
        entityId = newId

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

      // Mark as processed (we'll need the staged entity ID)
      const stagedEntityRecord = await sql`
        SELECT id FROM "StagedEntity" 
        WHERE name = ${stagedEntity.name} 
        AND type = ${stagedEntity.type} 
        AND "episodeId" = ${stagedEntity.episodeId}
        AND processed = false
        LIMIT 1
      `

      if (stagedEntityRecord.length > 0) {
        processedIds.push(stagedEntityRecord[0].id)
      }
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
    mergeDetails,
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

  // Helper function to find entity ID by name using enhanced matching
  async function findEntityIdByName(name: string): Promise<string | null> {
    // Try all entity types since relationships might not specify type
    const types = ["Company", "Person", "Topic"]

    for (const type of types) {
      const entity = await findMatchingEntity(name, type)
      if (entity) {
        return entity.id
      }
    }

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
        console.log(
          `Skipping relationship ${stagedRel.sourceName} -> ${stagedRel.targetName}: source=${!!sourceEntityId}, target=${!!targetEntityId}`,
        )
        skipped++
      }

      // Get the staged relationship ID for marking as processed
      const stagedRelRecord = await sql`
        SELECT id FROM "StagedRelationship" 
        WHERE "sourceName" = ${stagedRel.sourceName} 
        AND "targetName" = ${stagedRel.targetName} 
        AND "episodeId" = ${stagedRel.episodeId}
        AND processed = false
        LIMIT 1
      `

      if (stagedRelRecord.length > 0) {
        processedIds.push(stagedRelRecord[0].id)
      }
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

// Enhanced function to run a complete resolution process
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
  mergeDetails: Array<{ source: string; target: string; reason: string }>
}> {
  const startTime = Date.now()

  let entitiesProcessed = 0
  let entitiesCreated = 0
  let entitiesMerged = 0
  let relationshipsProcessed = 0
  let relationshipsCreated = 0
  let relationshipsSkipped = 0
  let errors = 0
  const allMergeDetails: Array<{ source: string; target: string; reason: string }> = []

  console.log("Starting entity resolution process...")

  // Process entities first
  for (let i = 0; i < maxBatches; i++) {
    console.log(`Processing entity batch ${i + 1}/${maxBatches}`)
    const result = await resolveEntities(entityBatchSize)

    entitiesProcessed += result.processed
    entitiesCreated += result.created
    entitiesMerged += result.merged
    errors += result.errors
    allMergeDetails.push(...result.mergeDetails)

    console.log(
      `Batch ${i + 1} results: processed=${result.processed}, created=${result.created}, merged=${result.merged}`,
    )

    // Stop if no more entities to process
    if (result.processed === 0) {
      console.log("No more entities to process")
      break
    }
  }

  console.log("Starting relationship resolution process...")

  // Then process relationships
  for (let i = 0; i < maxBatches; i++) {
    console.log(`Processing relationship batch ${i + 1}/${maxBatches}`)
    const result = await resolveRelationships(relationshipBatchSize)

    relationshipsProcessed += result.processed
    relationshipsCreated += result.created
    relationshipsSkipped += result.skipped
    errors += result.errors

    console.log(
      `Batch ${i + 1} results: processed=${result.processed}, created=${result.created}, skipped=${result.skipped}`,
    )

    // Stop if no more relationships to process
    if (result.processed === 0) {
      console.log("No more relationships to process")
      break
    }
  }

  const timeTaken = Date.now() - startTime

  console.log("Resolution process completed:", {
    entitiesProcessed,
    entitiesCreated,
    entitiesMerged,
    relationshipsProcessed,
    relationshipsCreated,
    relationshipsSkipped,
    errors,
    timeTaken,
    mergeCount: allMergeDetails.length,
  })

  return {
    entitiesProcessed,
    entitiesCreated,
    entitiesMerged,
    relationshipsProcessed,
    relationshipsCreated,
    relationshipsSkipped,
    errors,
    timeTaken,
    mergeDetails: allMergeDetails,
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
