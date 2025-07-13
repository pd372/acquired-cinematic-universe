import { neon } from "@neondatabase/serverless"
import { v4 as uuidv4 } from "uuid"

const sql = neon(process.env.DATABASE_URL!)

// Enhanced function to find entity by name with better matching
async function findEntityByNameEnhanced(name: string): Promise<any | null> {
  // Try exact match first
  const exactMatch = await sql`
    SELECT id, name, type, description, normalized_name
    FROM "Entity"
    WHERE LOWER(name) = ${name.toLowerCase()}
    LIMIT 1
  `

  if (exactMatch.length > 0) {
    return exactMatch[0]
  }

  // Try normalized match
  const normalizedName = name
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()

  const normalizedMatch = await sql`
    SELECT id, name, type, description, normalized_name
    FROM "Entity"
    WHERE normalized_name = ${normalizedName}
    LIMIT 1
  `

  if (normalizedMatch.length > 0) {
    return normalizedMatch[0]
  }

  // Try fuzzy match with high threshold
  const fuzzyMatch = await sql`
    SELECT id, name, type, description, normalized_name,
           similarity(LOWER(name), ${name.toLowerCase()}) as sim_score
    FROM "Entity"
    WHERE similarity(LOWER(name), ${name.toLowerCase()}) > 0.7
    ORDER BY sim_score DESC
    LIMIT 1
  `

  if (fuzzyMatch.length > 0) {
    return fuzzyMatch[0]
  }

  // Try partial match (contains)
  const partialMatch = await sql`
    SELECT id, name, type, description, normalized_name
    FROM "Entity"
    WHERE LOWER(name) LIKE ${`%${name.toLowerCase()}%`}
    OR ${name.toLowerCase()} LIKE CONCAT('%', LOWER(name), '%')
    ORDER BY LENGTH(name) ASC
    LIMIT 1
  `

  if (partialMatch.length > 0) {
    return partialMatch[0]
  }

  return null
}

// Function to fix missing obvious relationships
export async function fixMissingRelationships(): Promise<{
  fixed: number
  errors: number
  details: Array<{
    source: string
    target: string
    episode: string
    action: string
    error?: string
  }>
}> {
  let fixed = 0
  let errors = 0
  const details: Array<{
    source: string
    target: string
    episode: string
    action: string
    error?: string
  }> = []

  try {
    // Get all unprocessed staged relationships
    const stagedRelationships = await sql`
      SELECT 
        sr.id,
        sr."sourceName",
        sr."targetName",
        sr.description,
        sr."episodeId",
        e.title as episode_title
      FROM "StagedRelationship" sr
      JOIN "Episode" e ON sr."episodeId" = e.id
      WHERE sr.processed = false
      ORDER BY sr."extractedAt" ASC
      LIMIT 500
    `

    console.log(`Found ${stagedRelationships.length} unprocessed staged relationships`)

    for (const rel of stagedRelationships) {
      try {
        // Use enhanced matching to find both entities
        const sourceEntity = await findEntityByNameEnhanced(rel.sourceName)
        const targetEntity = await findEntityByNameEnhanced(rel.targetName)

        if (sourceEntity && targetEntity) {
          // Check if connection already exists
          const existingConnection = await sql`
            SELECT id FROM "Connection"
            WHERE "episodeId" = ${rel.episodeId}
            AND "sourceEntityId" = ${sourceEntity.id}
            AND "targetEntityId" = ${targetEntity.id}
            LIMIT 1
          `

          if (existingConnection.length === 0) {
            // Create the connection
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
                ${rel.episodeId},
                ${sourceEntity.id},
                ${targetEntity.id},
                1,
                ${rel.description}
              )
            `

            details.push({
              source: rel.sourceName,
              target: rel.targetName,
              episode: rel.episode_title,
              action: `Created connection: ${sourceEntity.name} → ${targetEntity.name}`,
            })

            fixed++
          } else {
            details.push({
              source: rel.sourceName,
              target: rel.targetName,
              episode: rel.episode_title,
              action: "Connection already exists",
            })
          }

          // Mark as processed
          await sql`
            UPDATE "StagedRelationship"
            SET processed = true
            WHERE id = ${rel.id}
          `
        } else {
          const missingEntities = []
          if (!sourceEntity) missingEntities.push(`source: "${rel.sourceName}"`)
          if (!targetEntity) missingEntities.push(`target: "${rel.targetName}"`)

          details.push({
            source: rel.sourceName,
            target: rel.targetName,
            episode: rel.episode_title,
            action: "Skipped",
            error: `Missing entities: ${missingEntities.join(", ")}`,
          })
        }
      } catch (error) {
        console.error(`Error processing relationship ${rel.sourceName} → ${rel.targetName}:`, error)
        details.push({
          source: rel.sourceName,
          target: rel.targetName,
          episode: rel.episode_title,
          action: "Error",
          error: error instanceof Error ? error.message : String(error),
        })
        errors++
      }
    }

    return { fixed, errors, details }
  } catch (error) {
    console.error("Error in fixMissingRelationships:", error)
    throw error
  }
}

// Function to create specific missing relationships based on business logic
export async function createObviousRelationships(): Promise<{
  created: number
  details: Array<{ description: string; success: boolean; error?: string }>
}> {
  let created = 0
  const details: Array<{ description: string; success: boolean; error?: string }> = []

  // Define obvious relationships that should exist
  const obviousRelationships = [
    // CEO relationships
    { source: "Morris Chang", target: "TSMC", description: "Founded and led TSMC as CEO" },
    {
      source: "Morris Chang",
      target: "Taiwan Semiconductor Manufacturing Company",
      description: "Founded and led TSMC as CEO",
    },

    // 7 Powers relationships
    { source: "Rolex", target: "Branding", description: "Rolex has strong branding power" },
    { source: "Apple", target: "Branding", description: "Apple has strong branding power" },
    { source: "Coca-Cola", target: "Branding", description: "Coca-Cola has strong branding power" },
    {
      source: "TSMC",
      target: "Scale Economies",
      description: "TSMC benefits from scale economies in semiconductor manufacturing",
    },
    { source: "Facebook", target: "Network Economies", description: "Facebook benefits from network effects" },
    { source: "Meta", target: "Network Economies", description: "Meta platforms benefit from network effects" },

    // Industry relationships
    { source: "TSMC", target: "Semiconductor Industry", description: "TSMC operates in the semiconductor industry" },
    {
      source: "Taiwan Semiconductor Manufacturing Company",
      target: "Semiconductor Industry",
      description: "TSMC operates in the semiconductor industry",
    },
    { source: "Apple", target: "Technology Industry", description: "Apple operates in the technology industry" },
    { source: "Microsoft", target: "Software Industry", description: "Microsoft operates in the software industry" },
  ]

  for (const rel of obviousRelationships) {
    try {
      const sourceEntity = await findEntityByNameEnhanced(rel.source)
      const targetEntity = await findEntityByNameEnhanced(rel.target)

      if (sourceEntity && targetEntity) {
        // Check if any connection already exists between these entities (in any episode)
        const existingConnection = await sql`
          SELECT id FROM "Connection"
          WHERE "sourceEntityId" = ${sourceEntity.id}
          AND "targetEntityId" = ${targetEntity.id}
          LIMIT 1
        `

        if (existingConnection.length === 0) {
          // Find an episode where both entities are mentioned
          const commonEpisode = await sql`
            SELECT DISTINCT e.id
            FROM "Episode" e
            JOIN "EntityMention" em1 ON e.id = em1."episodeId"
            JOIN "EntityMention" em2 ON e.id = em2."episodeId"
            WHERE em1."entityId" = ${sourceEntity.id}
            AND em2."entityId" = ${targetEntity.id}
            LIMIT 1
          `

          if (commonEpisode.length > 0) {
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
                ${commonEpisode[0].id},
                ${sourceEntity.id},
                ${targetEntity.id},
                1,
                ${rel.description}
              )
            `

            details.push({
              description: `Created: ${sourceEntity.name} → ${targetEntity.name}`,
              success: true,
            })
            created++
          } else {
            details.push({
              description: `Skipped: ${rel.source} → ${rel.target} (no common episode)`,
              success: false,
              error: "No episode where both entities are mentioned",
            })
          }
        } else {
          details.push({
            description: `Exists: ${rel.source} → ${rel.target}`,
            success: true,
          })
        }
      } else {
        const missing = []
        if (!sourceEntity) missing.push(rel.source)
        if (!targetEntity) missing.push(rel.target)

        details.push({
          description: `Missing entities: ${missing.join(", ")}`,
          success: false,
          error: `Could not find entities: ${missing.join(", ")}`,
        })
      }
    } catch (error) {
      details.push({
        description: `Error: ${rel.source} → ${rel.target}`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { created, details }
}
