import { neon } from "@neondatabase/serverless"
import { getStagedRelationships, markRelationshipsAsProcessed } from "./staging-store"
import { createOrUpdateConnection } from "./db"
import OpenAI from "openai"

// Create a SQL client using the DATABASE_URL environment variable
const sql = neon(process.env.DATABASE_URL!)

// Create OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

interface EntityMatch {
  id: string
  name: string
  type: string
  confidence: number
  matchReason: string
}

interface RelationshipResolutionResult {
  source: string
  target: string
  result: "created" | "skipped" | "error"
  reason: string
  confidence: number
  sourceEntity?: EntityMatch
  targetEntity?: EntityMatch
  error?: string
}

// Enhanced entity matching with cross-validation
async function findEntityWithCrossValidation(entityName: string): Promise<EntityMatch | null> {
  const normalizedName = entityName.toLowerCase().trim()

  // Strategy 1: Exact name match (highest confidence)
  const exactMatches = await sql`
    SELECT id, name, type, 'exact' as match_type
    FROM "Entity"
    WHERE LOWER(name) = ${normalizedName}
    LIMIT 1
  `

  if (exactMatches.length > 0) {
    return {
      id: exactMatches[0].id,
      name: exactMatches[0].name,
      type: exactMatches[0].type,
      confidence: 0.95,
      matchReason: "Exact name match",
    }
  }

  // Strategy 2: Normalized name match
  const normalizedMatches = await sql`
    SELECT id, name, type, normalized_name
    FROM "Entity"
    WHERE normalized_name = ${normalizedName
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim()}
    LIMIT 1
  `

  if (normalizedMatches.length > 0) {
    return {
      id: normalizedMatches[0].id,
      name: normalizedMatches[0].name,
      type: normalizedMatches[0].type,
      confidence: 0.9,
      matchReason: "Normalized name match",
    }
  }

  // Strategy 3: LLM-enhanced matching with context (85-90% confidence)
  const llmMatch = await findEntityWithLLM(entityName)
  if (llmMatch) {
    return llmMatch
  }

  // Strategy 4: Fuzzy matching with similarity
  // FIX: Re-calculate similarity in ORDER BY to avoid "column does not exist" error
  const fuzzyMatches = await sql`
    SELECT id, name, type, normalized_name,
           similarity(LOWER(name), ${normalizedName}) as name_sim,
           similarity(normalized_name, ${normalizedName
             .replace(/[^\w\s]/g, "")
             .replace(/\s+/g, " ")
             .trim()}) as norm_sim
    FROM "Entity"
    WHERE similarity(LOWER(name), ${normalizedName}) > 0.6
       OR similarity(normalized_name, ${normalizedName
         .replace(/[^\w\s]/g, "")
         .replace(/\s+/g, " ")
         .trim()}) > 0.6
    ORDER BY GREATEST(
        similarity(LOWER(name), ${normalizedName}),
        similarity(normalized_name, ${normalizedName
          .replace(/[^\w\s]/g, "")
          .replace(/\s+/g, " ")
          .trim()})
    ) DESC
    LIMIT 1
  `

  if (fuzzyMatches.length > 0) {
    const match = fuzzyMatches[0]
    const confidence = Math.max(match.name_sim || 0, match.norm_sim || 0)

    if (confidence > 0.75) {
      return {
        id: match.id,
        name: match.name,
        type: match.type,
        confidence,
        matchReason: `Fuzzy match (${(confidence * 100).toFixed(1)}% similarity)`,
      }
    }
  }

  // Strategy 5: Business logic matching for known patterns
  const businessLogicMatch = await applyBusinessLogicMatching(entityName)
  if (businessLogicMatch) {
    return businessLogicMatch
  }

  return null
}

// LLM-enhanced entity matching using OpenAI
async function findEntityWithLLM(entityName: string): Promise<EntityMatch | null> {
  try {
    console.log(`    🤖 Trying LLM matching for: "${entityName}"`)

    // Get entities that might match (use fuzzy search to narrow down)
    // First try to get entities with similar names to reduce the search space
    const normalizedSearch = entityName.toLowerCase().trim().replace(/[^\w\s]/g, "")

    const allEntities = await sql`
      SELECT id, name, type,
             similarity(LOWER(name), ${entityName.toLowerCase()}) as sim
      FROM "Entity"
      WHERE similarity(LOWER(name), ${entityName.toLowerCase()}) > 0.3
         OR LOWER(name) LIKE ${`%${normalizedSearch}%`}
      ORDER BY sim DESC NULLS LAST
      LIMIT 50
    `

    // If no candidates found, fall back to alphabetically close entities
    if (allEntities.length === 0) {
      const fallbackEntities = await sql`
        SELECT id, name, type
        FROM "Entity"
        ORDER BY name
        LIMIT 30
      `
      if (fallbackEntities.length === 0) {
        return null
      }
      allEntities.push(...fallbackEntities)
    }

    if (allEntities.length === 0) {
      return null
    }

    // Create a concise list of entities for the LLM
    const entityList = allEntities.map(e => `${e.name} (${e.type})`).join('\n')

    const prompt = `You are matching entity names. Given the entity name "${entityName}", which entity from this list is the best match?

Available entities:
${entityList}

Rules:
- Match abbreviations (e.g., "AAPL" → "Apple Inc.")
- Match name variants (e.g., "Facebook" → "Meta (formerly Facebook)")
- Match partial names (e.g., "Berkshire" → "Berkshire Hathaway")
- If no good match exists, respond with "NONE"

Respond with ONLY the exact entity name from the list above, or "NONE".`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 50,
    })

    const matchedName = response.choices[0]?.message?.content?.trim()

    if (!matchedName || matchedName === "NONE") {
      console.log(`    🤖 LLM: No match found`)
      return null
    }

    // Find the entity by the name returned by LLM
    // Extract just the name part (before the type in parentheses)
    const nameOnly = matchedName.replace(/\s*\([^)]*\)$/, "").trim()

    const matchedEntity = await sql`
      SELECT id, name, type
      FROM "Entity"
      WHERE name = ${nameOnly}
      LIMIT 1
    `

    if (matchedEntity.length > 0) {
      console.log(`    🤖 LLM matched: "${entityName}" → "${matchedEntity[0].name}"`)
      return {
        id: matchedEntity[0].id,
        name: matchedEntity[0].name,
        type: matchedEntity[0].type,
        confidence: 0.85,
        matchReason: `LLM-enhanced match: ${entityName} → ${matchedEntity[0].name}`,
      }
    }

    return null
  } catch (error) {
    console.error(`    ❌ LLM matching error:`, error instanceof Error ? error.message : "Unknown error")
    return null
  }
}

// Apply business logic for known entity patterns
async function applyBusinessLogicMatching(entityName: string): Promise<EntityMatch | null> {
  const lowerName = entityName.toLowerCase().trim()

  // Known CEO -> Company mappings
  const ceoCompanyMappings: Record<string, string> = {
    "morris chang": "TSMC",
    "jensen huang": "NVIDIA",
    "satya nadella": "Microsoft",
    "tim cook": "Apple",
    "elon musk": "Tesla",
    "jeff bezos": "Amazon",
    "mark zuckerberg": "Meta",
    "sundar pichai": "Google",
  }

  // Check if this is a known CEO
  for (const [ceo, company] of Object.entries(ceoCompanyMappings)) {
    if (lowerName.includes(ceo)) {
      // Try to find the company
      const companyMatches = await sql`
        SELECT id, name, type
        FROM "Entity"
        WHERE type = 'Company' 
        AND (LOWER(name) LIKE ${`%${company.toLowerCase()}%`} OR normalized_name LIKE ${`%${company.toLowerCase()}%`})
        LIMIT 1
      `

      if (companyMatches.length > 0) {
        return {
          id: companyMatches[0].id,
          name: companyMatches[0].name,
          type: companyMatches[0].type,
          confidence: 0.85,
          matchReason: `Business logic: ${ceo} -> ${company}`,
        }
      }
    }
  }

  return null
}

// Validate relationship makes business sense
function validateRelationship(
  sourceEntity: EntityMatch,
  targetEntity: EntityMatch,
  description: string,
): { valid: boolean; reason: string; confidence: number } {
  const desc = description.toLowerCase()

  // Person -> Company relationships
  if (sourceEntity.type === "Person" && targetEntity.type === "Company") {
    if (desc.includes("ceo") || desc.includes("founder") || desc.includes("executive")) {
      return { valid: true, reason: "Person-Company leadership relationship", confidence: 0.9 }
    }
    if (desc.includes("employee") || desc.includes("work")) {
      return { valid: true, reason: "Person-Company employment relationship", confidence: 0.8 }
    }
    return { valid: true, reason: "Person-Company relationship", confidence: 0.7 }
  }

  // Company -> Person relationships
  if (sourceEntity.type === "Company" && targetEntity.type === "Person") {
    if (desc.includes("ceo") || desc.includes("founder") || desc.includes("executive")) {
      return { valid: true, reason: "Company-Person leadership relationship", confidence: 0.9 }
    }
    return { valid: true, reason: "Company-Person relationship", confidence: 0.7 }
  }

  // Company -> Company relationships
  if (sourceEntity.type === "Company" && targetEntity.type === "Company") {
    if (desc.includes("acquired") || desc.includes("merger") || desc.includes("acquisition")) {
      return { valid: true, reason: "Company-Company M&A relationship", confidence: 0.9 }
    }
    if (desc.includes("competitor") || desc.includes("competing")) {
      return { valid: true, reason: "Company-Company competitive relationship", confidence: 0.85 }
    }
    if (desc.includes("partner") || desc.includes("collaboration")) {
      return { valid: true, reason: "Company-Company partnership", confidence: 0.85 }
    }
    return { valid: true, reason: "Company-Company relationship", confidence: 0.7 }
  }

  // Person -> Person relationships
  if (sourceEntity.type === "Person" && targetEntity.type === "Person") {
    if (desc.includes("co-founder") || desc.includes("partner")) {
      return { valid: true, reason: "Person-Person partnership", confidence: 0.85 }
    }
    return { valid: true, reason: "Person-Person relationship", confidence: 0.7 }
  }

  // Default validation for any combination
  return { valid: true, reason: "General relationship", confidence: 0.6 }
}

// Main robust relationship resolution function
export async function resolveRelationshipsRobust(batchSize = 100): Promise<{
  processed: number
  created: number
  skipped: number
  errors: number
  details: RelationshipResolutionResult[]
}> {
  console.log(`🔍 Starting robust relationship resolution (batch size: ${batchSize})`)

  // Get unprocessed staged relationships
  const stagedRelationships = await getStagedRelationships(batchSize, false)

  if (stagedRelationships.length === 0) {
    console.log("No staged relationships to process")
    return { processed: 0, created: 0, skipped: 0, errors: 0, details: [] }
  }

  console.log(`Processing ${stagedRelationships.length} staged relationships`)

  let created = 0
  let skipped = 0
  let errors = 0
  const processedIds: string[] = []
  const details: RelationshipResolutionResult[] = []

  // Process each relationship with cross-validation
  for (const stagedRel of stagedRelationships) {
    try {
      console.log(`\n🔗 Processing: "${stagedRel.sourceName}" -> "${stagedRel.targetName}"`)

      // Find source entity with cross-validation
      const sourceEntity = await findEntityWithCrossValidation(stagedRel.sourceName)
      console.log(
        `  📍 Source: ${sourceEntity ? `Found "${sourceEntity.name}" (${sourceEntity.confidence})` : "Not found"}`,
      )

      // Find target entity with cross-validation
      const targetEntity = await findEntityWithCrossValidation(stagedRel.targetName)
      console.log(
        `  📍 Target: ${targetEntity ? `Found "${targetEntity.name}" (${targetEntity.confidence})` : "Not found"}`,
      )

      if (!sourceEntity || !targetEntity) {
        const reason = `Missing entities: source=${!!sourceEntity}, target=${!!targetEntity}`
        console.log(`  ❌ Skipped: ${reason}`)

        details.push({
          source: stagedRel.sourceName,
          target: stagedRel.targetName,
          result: "skipped",
          reason,
          confidence: 0,
          sourceEntity: sourceEntity || undefined,
          targetEntity: targetEntity || undefined,
        })
        skipped++
      } else {
        // Validate the relationship makes business sense
        const validation = validateRelationship(sourceEntity, targetEntity, stagedRel.description)
        console.log(`  ✅ Validation: ${validation.reason} (confidence: ${validation.confidence})`)

        if (validation.valid && validation.confidence > 0.5) {
          // Create the relationship
          await createOrUpdateConnection(stagedRel.episodeId, sourceEntity.id, targetEntity.id, stagedRel.description)

          const overallConfidence = Math.min(sourceEntity.confidence, targetEntity.confidence, validation.confidence)

          console.log(`  ✅ Created relationship (confidence: ${overallConfidence})`)

          details.push({
            source: stagedRel.sourceName,
            target: stagedRel.targetName,
            result: "created",
            reason: `${sourceEntity.matchReason} + ${targetEntity.matchReason} + ${validation.reason}`,
            confidence: overallConfidence,
            sourceEntity,
            targetEntity,
          })
          created++
        } else {
          const reason = `Low confidence relationship: ${validation.reason} (${validation.confidence})`
          console.log(`  ⚠️ Skipped: ${reason}`)

          details.push({
            source: stagedRel.sourceName,
            target: stagedRel.targetName,
            result: "skipped",
            reason,
            confidence: validation.confidence,
            sourceEntity,
            targetEntity,
          })
          skipped++
        }
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
      console.error(`❌ Error processing relationship ${stagedRel.sourceName} -> ${stagedRel.targetName}:`, error)

      details.push({
        source: stagedRel.sourceName,
        target: stagedRel.targetName,
        result: "error",
        reason: "Processing error",
        confidence: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      })
      errors++
    }
  }

  // Mark all processed relationships
  if (processedIds.length > 0) {
    await markRelationshipsAsProcessed(processedIds)
    console.log(`\n📝 Marked ${processedIds.length} relationships as processed`)
  }

  const summary = {
    processed: processedIds.length,
    created,
    skipped,
    errors,
    details,
  }

  console.log(`\n🎯 Robust resolution complete:`)
  console.log(`   📊 Processed: ${summary.processed}`)
  console.log(`   ✅ Created: ${summary.created}`)
  console.log(`   ⚠️ Skipped: ${summary.skipped}`)
  console.log(`   ❌ Errors: ${summary.errors}`)
  console.log(
    `   📈 Success rate: ${summary.processed > 0 ? ((summary.created / summary.processed) * 100).toFixed(1) : 0}%`,
  )

  return summary
}

// Function to get relationship resolution statistics
export async function getRelationshipResolutionStats(): Promise<{
  totalPending: number
  totalProcessed: number
  recentlyCreated: number
  commonSkipReasons: Array<{ reason: string; count: number }>
}> {
  const pendingCount = await sql`
    SELECT COUNT(*) as count FROM "StagedRelationship" WHERE processed = false
  `

  const processedCount = await sql`
    SELECT COUNT(*) as count FROM "StagedRelationship" WHERE processed = true
  `

  // Get recent connections (last 24 hours)
  const recentConnections = await sql`
    SELECT COUNT(*) as count FROM "Connection" 
    WHERE "createdAt" > NOW() - INTERVAL '24 hours'
  `

  return {
    totalPending: Number(pendingCount[0]?.count || 0),
    totalProcessed: Number(processedCount[0]?.count || 0),
    recentlyCreated: Number(recentConnections[0]?.count || 0),
    commonSkipReasons: [], // Could be enhanced to track skip reasons
  }
}
