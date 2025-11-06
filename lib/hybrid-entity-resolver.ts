import { neon } from "@neondatabase/serverless"
import { OpenAI } from "openai"
import { v4 as uuidv4 } from "uuid"
import { getStagedEntities, markEntitiesAsProcessed } from "./staging-store"
import { createEntityMention } from "./db"
import NodeCache from "node-cache"

// Create a SQL client and OpenAI client
const sql = neon(process.env.DATABASE_URL!)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Create caches
const entityCache = new NodeCache({ stdTTL: 1800, checkperiod: 120 })
const llmCache = new NodeCache({ stdTTL: 3600, checkperiod: 300 }) // Cache LLM results longer

interface ResolutionStrategy {
  name: string
  cost: number
  confidence: number
  result: any | null
}

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

// Generate alternative names for better matching
function generateAlternativeNames(name: string): string[] {
  const alternatives = [name]
  const normalized = normalizeEntityName(name)

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

  return [...new Set(alternatives)]
}

// Rule-based matching (fast, free, good for obvious cases)
async function ruleBasedMatching(entityName: string, entityType: string): Promise<ResolutionStrategy> {
  const cacheKey = `rule:${entityType}:${entityName}`
  const cachedEntity = entityCache.get(cacheKey)
  if (cachedEntity) {
    return {
      name: "rule-based-cached",
      cost: 0,
      confidence: 0.9,
      result: cachedEntity,
    }
  }

  const alternativeNames = generateAlternativeNames(entityName)
  const normalizedAlternatives = alternativeNames.map((name) => normalizeEntityName(name))

  // Strategy 1: Exact match on any alternative name
  for (const altName of alternativeNames) {
    const exactMatches = await sql`
      SELECT id, name, type, description, normalized_name 
      FROM "Entity"
      WHERE type = ${entityType}
      AND (LOWER(name) = ${altName.toLowerCase()} OR normalized_name = ${normalizeEntityName(altName)})
      LIMIT 1
    `

    if (exactMatches.length > 0) {
      entityCache.set(cacheKey, exactMatches[0])
      return {
        name: "rule-based-exact",
        cost: 0,
        confidence: 0.95,
        result: exactMatches[0],
      }
    }
  }

  // Strategy 2: For Person entities, check substring matches (e.g., "Steve" vs "Steve Jobs")
  if (entityType === "Person") {
    const substringMatches = await sql`
      SELECT id, name, type, description, normalized_name
      FROM "Entity"
      WHERE type = 'Person'
      AND (
        LOWER(name) LIKE ${'%' + entityName.toLowerCase() + '%'}
        OR LOWER(${entityName}) LIKE '%' || LOWER(name) || '%'
      )
      AND LOWER(name) != ${entityName.toLowerCase()}
      LIMIT 5
    `

    if (substringMatches.length > 0) {
      // Found potential substring matches - we need to verify with description
      // Return these as candidates for LLM verification
      return {
        name: "rule-based-substring-check",
        cost: 0,
        confidence: 0.5, // Low confidence - needs LLM verification
        result: { substringCandidates: substringMatches },
      }
    }
  }

  // Strategy 3: Fuzzy matching using trigram similarity
  for (const normalizedAlt of normalizedAlternatives) {
    const fuzzyMatches = await sql`
      SELECT id, name, type, description, normalized_name,
             similarity(normalized_name, ${normalizedAlt}) as sim_score
      FROM "Entity"
      WHERE type = ${entityType}
      AND similarity(normalized_name, ${normalizedAlt}) > 0.6
      ORDER BY sim_score DESC
      LIMIT 1
    `

    if (fuzzyMatches.length > 0 && fuzzyMatches[0].sim_score > 0.8) {
      entityCache.set(cacheKey, fuzzyMatches[0])
      return {
        name: "rule-based-fuzzy",
        cost: 0,
        confidence: fuzzyMatches[0].sim_score,
        result: fuzzyMatches[0],
      }
    }
  }

  return {
    name: "rule-based-no-match",
    cost: 0,
    confidence: 0,
    result: null,
  }
}

// LLM-based name inference (infer full name from description)
async function llmInferFullName(
  partialName: string,
  entityType: string,
  description: string | null,
): Promise<string | null> {
  // Only try to infer for Person entities with single-word names
  if (entityType !== "Person" || !description || partialName.split(/\s+/).length > 1) {
    return null
  }

  const cacheKey = `infer:${partialName}:${description.substring(0, 100)}`
  const cachedResult = llmCache.get<string>(cacheKey)
  if (cachedResult) {
    return cachedResult
  }

  try {
    const prompt = `You are an expert at inferring full names from partial names and context.

PARTIAL NAME: "${partialName}"
TYPE: ${entityType}
DESCRIPTION: ${description}

INSTRUCTIONS:
- Based on the description, infer the person's full name (first and last name)
- Only return a full name if you're confident based on the description
- The description should contain clear context clues (company name, role, etc.)
- Common examples:
  * "Steve" + "CEO of Apple, co-founder in 1976" → "Steve Jobs"
  * "Bill" + "co-founder of Microsoft in 1975" → "Bill Gates"
  * "Jensen" + "CEO of NVIDIA, founded in 1993" → "Jensen Huang"
- If you cannot confidently infer the full name, return null

Respond with ONLY a JSON object:
{
  "fullName": "First Last" or null,
  "confidence": number (0.0-1.0),
  "reasoning": "brief explanation"
}`

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 150,
    })

    const content = response.choices[0].message.content
    if (!content) {
      return null
    }

    const result = JSON.parse(content)

    // Only use the inferred name if confidence is high
    if (result.fullName && result.confidence >= 0.8) {
      console.log(`  🔮 Inferred full name: "${partialName}" → "${result.fullName}" (confidence: ${result.confidence})`)
      llmCache.set(cacheKey, result.fullName)
      return result.fullName
    }

    llmCache.set(cacheKey, null)
    return null
  } catch (error) {
    console.error("LLM name inference error:", error)
    return null
  }
}

// LLM-based matching (slower, costs money, but very accurate)
async function llmBasedMatching(
  entityName: string,
  entityType: string,
  candidateEntities: any[],
): Promise<ResolutionStrategy> {
  const cacheKey = `llm:${entityType}:${entityName}:${candidateEntities.map((e) => e.id).join(",")}`
  const cachedResult = llmCache.get(cacheKey)
  if (cachedResult) {
    return {
      name: "llm-cached",
      cost: 0,
      confidence: 0.9,
      result: cachedResult,
    }
  }

  if (candidateEntities.length === 0) {
    return {
      name: "llm-no-candidates",
      cost: 0,
      confidence: 0,
      result: null,
    }
  }

  try {
    const prompt = `You are an expert at entity resolution. Given a target entity and a list of candidate entities, determine if any of the candidates represent the same real-world entity as the target.

TARGET ENTITY:
Name: "${entityName}"
Type: ${entityType}

CANDIDATE ENTITIES:
${candidateEntities
  .map(
    (entity, index) => `${index + 1}. Name: "${entity.name}"
   Type: ${entity.type}
   Description: ${entity.description || "No description"}`,
  )
  .join("\n\n")}

INSTRUCTIONS:
- Consider common abbreviations, alternative names, and variations
- For companies: "TSMC" = "Taiwan Semiconductor Manufacturing Company"
- For people: Consider nicknames, full names vs shortened names
- For topics: Consider synonyms and related concepts
- IMPORTANT FOR PERSON ENTITIES: If one name is a substring of another (e.g., "Steve" vs "Steve Jobs"), check the descriptions carefully:
  * If descriptions indicate the same person (same company, role, or context), they should match
  * If descriptions indicate different people (e.g., "Steve Jobs" at Apple vs "Steve Ballmer" at Microsoft), they should NOT match
  * Example: "Steve" (CEO of Apple) matches "Steve Jobs" (co-founder of Apple)
  * Example: "Steve" (CEO of Microsoft) does NOT match "Steve Jobs" (co-founder of Apple)
- Be strict: only match if you're confident they represent the SAME entity

Respond with ONLY a JSON object:
{
  "match": true/false,
  "candidateIndex": number (1-based index if match found, null if no match),
  "confidence": number (0.0-1.0),
  "reasoning": "brief explanation"
}`

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    })

    const content = response.choices[0].message.content
    if (!content) {
      throw new Error("No response from LLM")
    }

    const result = JSON.parse(content)
    const matchedEntity = result.match && result.candidateIndex ? candidateEntities[result.candidateIndex - 1] : null

    // Cache the result
    llmCache.set(cacheKey, matchedEntity)

    return {
      name: "llm-analysis",
      cost: 0.002, // Approximate cost for gpt-3.5-turbo
      confidence: result.confidence,
      result: matchedEntity,
    }
  } catch (error) {
    console.error("LLM matching error:", error)
    return {
      name: "llm-error",
      cost: 0.002,
      confidence: 0,
      result: null,
    }
  }
}

// Hybrid entity resolution strategy
async function findMatchingEntityHybrid(
  entityName: string,
  entityType: string,
): Promise<{
  entity: any | null
  strategy: ResolutionStrategy
  totalCost: number
}> {
  console.log(`🔍 Resolving entity: "${entityName}" (${entityType})`)

  // Step 1: Try rule-based matching first (fast and free)
  const ruleResult = await ruleBasedMatching(entityName, entityType)
  console.log(`  📏 Rule-based: ${ruleResult.name} (confidence: ${ruleResult.confidence})`)

  // If rule-based found a high-confidence match, use it
  if (ruleResult.confidence >= 0.8) {
    return {
      entity: ruleResult.result,
      strategy: ruleResult,
      totalCost: 0,
    }
  }

  // Step 2: Handle substring candidates specially - they need LLM verification
  let candidates: any[] = []
  if (ruleResult.result && ruleResult.result.substringCandidates) {
    console.log(`  🔤 Found ${ruleResult.result.substringCandidates.length} substring match(es) - sending to LLM for verification`)
    candidates = ruleResult.result.substringCandidates
  } else {
    // Step 2b: Get general candidates for LLM
    candidates = await sql`
      SELECT id, name, type, description, normalized_name,
             similarity(normalized_name, ${normalizeEntityName(entityName)}) as sim_score
      FROM "Entity"
      WHERE type = ${entityType}
      AND similarity(normalized_name, ${normalizeEntityName(entityName)}) > 0.2
      ORDER BY sim_score DESC
      LIMIT 5
    `
  }

  // If no candidates, no point in using LLM
  if (candidates.length === 0) {
    console.log(`  🤖 LLM: Skipped (no candidates)`)
    return {
      entity: null,
      strategy: ruleResult,
      totalCost: 0,
    }
  }

  // Step 3: Use LLM for nuanced matching
  const llmResult = await llmBasedMatching(entityName, entityType, candidates)
  console.log(`  🤖 LLM: ${llmResult.name} (confidence: ${llmResult.confidence}, cost: $${llmResult.cost})`)

  // Choose the best result
  if (llmResult.confidence > ruleResult.confidence) {
    return {
      entity: llmResult.result,
      strategy: llmResult,
      totalCost: llmResult.cost,
    }
  } else {
    return {
      entity: ruleResult.result,
      strategy: ruleResult,
      totalCost: llmResult.cost, // We still paid for the LLM call
    }
  }
}

// Enhanced resolve entities function with hybrid approach
export async function resolveEntitiesHybrid(
  batchSize = 100,
  useLLM = true,
): Promise<{
  processed: number
  created: number
  merged: number
  errors: number
  totalCost: number
  strategyStats: Record<string, number>
  mergeDetails: Array<{ source: string; target: string; reason: string; strategy: string; confidence: number }>
}> {
  const stagedEntities = await getStagedEntities(batchSize, false)

  if (stagedEntities.length === 0) {
    return {
      processed: 0,
      created: 0,
      merged: 0,
      errors: 0,
      totalCost: 0,
      strategyStats: {},
      mergeDetails: [],
    }
  }

  let created = 0
  let merged = 0
  let errors = 0
  let totalCost = 0
  const processedIds: string[] = []
  const mergeDetails: Array<{ source: string; target: string; reason: string; strategy: string; confidence: number }> =
    []
  const strategyStats: Record<string, number> = {}

  console.log(
    `🚀 Starting hybrid resolution of ${stagedEntities.length} entities (LLM: ${useLLM ? "enabled" : "disabled"})`,
  )

  for (const stagedEntity of stagedEntities) {
    try {
      // Use hybrid matching
      const {
        entity: matchingEntity,
        strategy,
        totalCost: entityCost,
      } = useLLM
        ? await findMatchingEntityHybrid(stagedEntity.name, stagedEntity.type)
        : await ruleBasedMatching(stagedEntity.name, stagedEntity.type).then((strategy) => ({
            entity: strategy.result,
            strategy,
            totalCost: 0,
          }))

      totalCost += entityCost

      // Track strategy usage
      strategyStats[strategy.name] = (strategyStats[strategy.name] || 0) + 1

      let entityId: string

      if (matchingEntity) {
        entityId = matchingEntity.id

        mergeDetails.push({
          source: stagedEntity.name,
          target: matchingEntity.name,
          reason: `Matched using ${strategy.name}`,
          strategy: strategy.name,
          confidence: strategy.confidence,
        })

        // For substring matches, always use the longer name
        // Check if one name is a substring of the other
        const isSubstringMatch =
          stagedEntity.name.toLowerCase().includes(matchingEntity.name.toLowerCase()) ||
          matchingEntity.name.toLowerCase().includes(stagedEntity.name.toLowerCase())

        const shouldUpdateName = isSubstringMatch && stagedEntity.name.length > matchingEntity.name.length

        // Update name if we have a longer version from substring matching
        if (shouldUpdateName) {
          await sql`
            UPDATE "Entity"
            SET name = ${stagedEntity.name}
            WHERE id = ${entityId}
          `
          console.log(`  📝 Updated name from "${matchingEntity.name}" to "${stagedEntity.name}"`)
        }

        // Update description if needed
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
        // Before creating new entity, try to infer full name from description if using LLM
        let finalName = stagedEntity.name
        let inferredEntity = null

        if (useLLM && stagedEntity.type === "Person") {
          const inferredName = await llmInferFullName(stagedEntity.name, stagedEntity.type, stagedEntity.description || null)
          if (inferredName) {
            finalName = inferredName
            totalCost += 0.002 // Add cost for inference call

            // Check if the inferred name already exists in the database
            const existingWithInferredName = await sql`
              SELECT id, name, type, description, normalized_name
              FROM "Entity"
              WHERE type = ${stagedEntity.type}
              AND (LOWER(name) = ${inferredName.toLowerCase()} OR normalized_name = ${normalizeEntityName(inferredName)})
              LIMIT 1
            `

            if (existingWithInferredName.length > 0) {
              // The inferred name already exists! Merge with it instead of creating new
              inferredEntity = existingWithInferredName[0]
              console.log(`  🎯 Inferred name "${inferredName}" already exists - merging instead of creating`)
            }
          }
        }

        if (inferredEntity) {
          // Merge with the existing entity that has the inferred name
          entityId = inferredEntity.id

          mergeDetails.push({
            source: stagedEntity.name,
            target: inferredEntity.name,
            reason: `Matched via name inference: "${stagedEntity.name}" → "${inferredEntity.name}"`,
            strategy: "llm-name-inference",
            confidence: 0.9,
          })

          // Update description if needed
          if (
            stagedEntity.description &&
            (!inferredEntity.description || stagedEntity.description.length > inferredEntity.description.length)
          ) {
            await sql`
              UPDATE "Entity"
              SET description = ${stagedEntity.description}
              WHERE id = ${entityId}
            `
          }

          merged++
        } else {
          // Create new entity with the final name (possibly inferred)
          const normalizedName = normalizeEntityName(finalName)
          const newId = uuidv4()

          await sql`
            INSERT INTO "Entity" (id, name, type, description, normalized_name)
            VALUES (${newId}, ${finalName}, ${stagedEntity.type}, ${stagedEntity.description}, ${normalizedName})
          `
          entityId = newId
          created++
        }
      }

      // Create entity mention
      await createEntityMention(stagedEntity.episodeId, entityId)

      // Mark as processed
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
      console.error(`❌ Error resolving entity ${stagedEntity.name}:`, error)
      errors++
    }
  }

  // Mark processed entities
  if (processedIds.length > 0) {
    await markEntitiesAsProcessed(processedIds)
  }

  console.log(`✅ Hybrid resolution complete:`)
  console.log(`   💰 Total cost: $${totalCost.toFixed(4)}`)
  console.log(`   📊 Strategy usage:`, strategyStats)

  return {
    processed: processedIds.length,
    created,
    merged,
    errors,
    totalCost,
    strategyStats,
    mergeDetails,
  }
}

// Export cache management functions
export function clearHybridCaches(): void {
  entityCache.flushAll()
  llmCache.flushAll()
}

export function getHybridCacheStats() {
  return {
    entityCache: {
      keys: entityCache.keys().length,
      hits: entityCache.getStats().hits,
      misses: entityCache.getStats().misses,
    },
    llmCache: {
      keys: llmCache.keys().length,
      hits: llmCache.getStats().hits,
      misses: llmCache.getStats().misses,
    },
  }
}
