import { neon } from "@neondatabase/serverless"
import { v4 as uuidv4 } from "uuid"
import { getStagedRelationships, markRelationshipsAsProcessed } from "./staging-store"
import NodeCache from "node-cache"

const sql = neon(process.env.DATABASE_URL!)
const entityLookupCache = new NodeCache({ stdTTL: 1800, checkperiod: 120 })

interface EntityMatch {
  id: string
  name: string
  type: string
  confidence: number
  matchStrategy: string
}

interface RelationshipCandidate {
  sourceMatches: EntityMatch[]
  targetMatches: EntityMatch[]
  originalSource: string
  originalTarget: string
  description: string
  episodeId: string
}

// Enhanced entity finder that tries EVERYTHING
async function findAllEntityMatches(name: string): Promise<EntityMatch[]> {
  const cacheKey = `all_matches:${name}`
  const cached = entityLookupCache.get<EntityMatch[]>(cacheKey)
  if (cached) return cached

  const matches: EntityMatch[] = []
  const normalizedName = normalizeEntityName(name)
  const alternatives = generateAlternativeNames(name)

  console.log(`🔍 Finding matches for "${name}" with ${alternatives.length} alternatives`)

  // Strategy 1: Exact matches (highest confidence)
  for (const alt of alternatives) {
    const exactMatches = await sql`
      SELECT id, name, type, description
      FROM "Entity"
      WHERE LOWER(name) = ${alt.toLowerCase()}
    `

    for (const match of exactMatches) {
      matches.push({
        id: match.id,
        name: match.name,
        type: match.type,
        confidence: 0.95,
        matchStrategy: "exact",
      })
    }
  }

  // Strategy 2: Normalized matches
  const normalizedMatches = await sql`
    SELECT id, name, type, description, normalized_name
    FROM "Entity"
    WHERE normalized_name = ${normalizedName}
  `

  for (const match of normalizedMatches) {
    if (!matches.find((m) => m.id === match.id)) {
      matches.push({
        id: match.id,
        name: match.name,
        type: match.type,
        confidence: 0.9,
        matchStrategy: "normalized",
      })
    }
  }

  // Strategy 3: Fuzzy matches (with multiple thresholds)
  const fuzzyMatches = await sql`
    SELECT id, name, type, description,
           similarity(LOWER(name), ${name.toLowerCase()}) as sim_score
    FROM "Entity"
    WHERE similarity(LOWER(name), ${name.toLowerCase()}) > 0.4
    ORDER BY sim_score DESC
    LIMIT 10
  `

  for (const match of fuzzyMatches) {
    if (!matches.find((m) => m.id === match.id)) {
      matches.push({
        id: match.id,
        name: match.name,
        type: match.type,
        confidence: Number(match.sim_score),
        matchStrategy: "fuzzy",
      })
    }
  }

  // Strategy 4: Containment matches
  for (const alt of alternatives) {
    const containmentMatches = await sql`
      SELECT id, name, type, description
      FROM "Entity"
      WHERE LOWER(name) LIKE ${`%${alt.toLowerCase()}%`}
         OR ${alt.toLowerCase()} LIKE CONCAT('%', LOWER(name), '%')
      LIMIT 5
    `

    for (const match of containmentMatches) {
      if (!matches.find((m) => m.id === match.id)) {
        matches.push({
          id: match.id,
          name: match.name,
          type: match.type,
          confidence: 0.7,
          matchStrategy: "containment",
        })
      }
    }
  }

  // Sort by confidence and remove duplicates
  const uniqueMatches = matches.sort((a, b) => b.confidence - a.confidence).slice(0, 5) // Keep top 5 matches

  entityLookupCache.set(cacheKey, uniqueMatches)
  console.log(`  Found ${uniqueMatches.length} matches for "${name}"`)

  return uniqueMatches
}

// Cross-validation: Check if a relationship makes business sense
function validateRelationship(
  sourceMatch: EntityMatch,
  targetMatch: EntityMatch,
  description: string,
): { valid: boolean; confidence: number; reason: string } {
  // Business logic validation rules
  const validationRules = [
    // CEO/Founder relationships
    {
      condition: (s: EntityMatch, t: EntityMatch, desc: string) =>
        s.type === "Person" &&
        t.type === "Company" &&
        (desc.toLowerCase().includes("ceo") ||
          desc.toLowerCase().includes("founder") ||
          desc.toLowerCase().includes("founded")),
      confidence: 0.9,
      reason: "Person-Company leadership relationship",
    },

    // Company-Industry relationships
    {
      condition: (s: EntityMatch, t: EntityMatch, desc: string) =>
        s.type === "Company" &&
        t.type === "Topic" &&
        (t.name.toLowerCase().includes("industry") || desc.toLowerCase().includes("operates in")),
      confidence: 0.85,
      reason: "Company-Industry relationship",
    },

    // 7 Powers relationships
    {
      condition: (s: EntityMatch, t: EntityMatch, desc: string) =>
        s.type === "Company" &&
        t.type === "Topic" &&
        [
          "scale economies",
          "network economies",
          "counter-positioning",
          "switching costs",
          "branding",
          "cornered resource",
          "process power",
        ].some((power) => t.name.toLowerCase().includes(power.toLowerCase())),
      confidence: 0.8,
      reason: "Company-Strategic Power relationship",
    },

    // Product-Company relationships
    {
      condition: (s: EntityMatch, t: EntityMatch, desc: string) =>
        s.type === "Company" &&
        t.type === "Topic" &&
        (desc.toLowerCase().includes("developed") ||
          desc.toLowerCase().includes("created") ||
          desc.toLowerCase().includes("product")),
      confidence: 0.75,
      reason: "Company-Product relationship",
    },

    // General same-episode co-mention
    {
      condition: () => true, // Always applies as fallback
      confidence: 0.6,
      reason: "Co-mentioned in same episode",
    },
  ]

  for (const rule of validationRules) {
    if (rule.condition(sourceMatch, targetMatch, description)) {
      return {
        valid: true,
        confidence: rule.confidence,
        reason: rule.reason,
      }
    }
  }

  return {
    valid: false,
    confidence: 0.3,
    reason: "No clear business relationship pattern",
  }
}

// Smart relationship resolver with cross-validation
async function resolveRelationshipSmart(
  sourceName: string,
  targetName: string,
  description: string,
  episodeId: string,
): Promise<{
  success: boolean
  confidence: number
  sourceEntity?: EntityMatch
  targetEntity?: EntityMatch
  reason: string
}> {
  // Get all possible matches for both entities
  const sourceMatches = await findAllEntityMatches(sourceName)
  const targetMatches = await findAllEntityMatches(targetName)

  if (sourceMatches.length === 0) {
    return {
      success: false,
      confidence: 0,
      reason: `No matches found for source entity: "${sourceName}"`,
    }
  }

  if (targetMatches.length === 0) {
    return {
      success: false,
      confidence: 0,
      reason: `No matches found for target entity: "${targetName}"`,
    }
  }

  // Try all combinations and find the best one
  let bestMatch: {
    source: EntityMatch
    target: EntityMatch
    totalConfidence: number
    validation: { valid: boolean; confidence: number; reason: string }
  } | null = null

  for (const sourceMatch of sourceMatches) {
    for (const targetMatch of targetMatches) {
      // Validate this relationship
      const validation = validateRelationship(sourceMatch, targetMatch, description)

      // Calculate total confidence (entity matching + business logic validation)
      const totalConfidence = (sourceMatch.confidence + targetMatch.confidence + validation.confidence) / 3

      if (!bestMatch || totalConfidence > bestMatch.totalConfidence) {
        bestMatch = {
          source: sourceMatch,
          target: targetMatch,
          totalConfidence,
          validation,
        }
      }
    }
  }

  if (!bestMatch || bestMatch.totalConfidence < 0.6) {
    return {
      success: false,
      confidence: bestMatch?.totalConfidence || 0,
      reason: `Low confidence match (${(bestMatch?.totalConfidence || 0).toFixed(2)}). Best: ${bestMatch?.source.name} → ${bestMatch?.target.name}`,
    }
  }

  // Create the connection
  try {
    // Check if connection already exists
    const existingConnection = await sql`
      SELECT id FROM "Connection"
      WHERE "episodeId" = ${episodeId}
      AND "sourceEntityId" = ${bestMatch.source.id}
      AND "targetEntityId" = ${bestMatch.target.id}
      LIMIT 1
    `

    if (existingConnection.length === 0) {
      const connectionId = uuidv4()
      await sql`
        INSERT INTO "Connection" (
          id, 
          "episodeId", 
          "sourceEntityId", 
          "targetEntityId", 
          strength, 
          description
        )
        VALUES (
          ${connectionId},
          ${episodeId},
          ${bestMatch.source.id},
          ${bestMatch.target.id},
          1,
          ${description}
        )
      `
    }

    return {
      success: true,
      confidence: bestMatch.totalConfidence,
      sourceEntity: bestMatch.source,
      targetEntity: bestMatch.target,
      reason: `Created: ${bestMatch.source.name} → ${bestMatch.target.name} (${bestMatch.validation.reason})`,
    }
  } catch (error) {
    return {
      success: false,
      confidence: bestMatch.totalConfidence,
      reason: `Database error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

// Main robust relationship resolution function
export async function resolveRelationshipsRobust(batchSize = 100): Promise<{
  processed: number
  created: number
  skipped: number
  errors: number
  details: Array<{
    source: string
    target: string
    result: string
    confidence: number
  }>
}> {
  const stagedRelationships = await getStagedRelationships(batchSize, false)

  if (stagedRelationships.length === 0) {
    return { processed: 0, created: 0, skipped: 0, errors: 0, details: [] }
  }

  console.log(`🚀 Starting robust resolution of ${stagedRelationships.length} relationships`)

  let created = 0
  let skipped = 0
  let errors = 0
  const processedIds: string[] = []
  const details: Array<{
    source: string
    target: string
    result: string
    confidence: number
  }> = []

  for (const rel of stagedRelationships) {
    try {
      const result = await resolveRelationshipSmart(rel.sourceName, rel.targetName, rel.description, rel.episodeId)

      details.push({
        source: rel.sourceName,
        target: rel.targetName,
        result: result.reason,
        confidence: result.confidence,
      })

      if (result.success) {
        created++
        console.log(`✅ ${rel.sourceName} → ${rel.targetName} (${result.confidence.toFixed(2)})`)
      } else {
        skipped++
        console.log(`⏭️  ${rel.sourceName} → ${rel.targetName}: ${result.reason}`)
      }

      // Mark as processed regardless of success
      const stagedRelRecord = await sql`
        SELECT id FROM "StagedRelationship" 
        WHERE "sourceName" = ${rel.sourceName} 
        AND "targetName" = ${rel.targetName} 
        AND "episodeId" = ${rel.episodeId}
        AND processed = false
        LIMIT 1
      `

      if (stagedRelRecord.length > 0) {
        processedIds.push(stagedRelRecord[0].id)
      }
    } catch (error) {
      console.error(`❌ Error resolving ${rel.sourceName} → ${rel.targetName}:`, error)
      errors++

      details.push({
        source: rel.sourceName,
        target: rel.targetName,
        result: `Error: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0,
      })
    }
  }

  // Mark all as processed
  if (processedIds.length > 0) {
    await markRelationshipsAsProcessed(processedIds)
  }

  console.log(`✅ Robust resolution complete: ${created} created, ${skipped} skipped, ${errors} errors`)

  return {
    processed: processedIds.length,
    created,
    skipped,
    errors,
    details,
  }
}

// Helper functions (reuse from existing code)
function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\b(company|corp|corporation|inc|incorporated|ltd|limited|llc|co|the)\b/g, "")
    .trim()
}

function generateAlternativeNames(name: string): string[] {
  const alternatives = [name]
  const normalized = normalizeEntityName(name)

  if (normalized !== name.toLowerCase()) {
    alternatives.push(normalized)
  }

  // Add known abbreviations
  const abbreviationMap: Record<string, string[]> = {
    "morris chang": ["morris c chang", "morris c. chang"],
    "taiwan semiconductor manufacturing company": ["tsmc", "taiwan semiconductor"],
    tsmc: ["taiwan semiconductor manufacturing company"],
    "apple inc": ["apple", "apple computer"],
    apple: ["apple inc", "apple computer"],
    rolex: ["rolex sa", "rolex watch company"],
    branding: ["brand power", "brand strength", "brand equity"],
  }

  const lowerName = name.toLowerCase()
  if (abbreviationMap[lowerName]) {
    alternatives.push(...abbreviationMap[lowerName])
  }

  return [...new Set(alternatives)]
}
