import { neon } from "@neondatabase/serverless"
import { v4 as uuidv4 } from "uuid"

// Create a SQL client using the DATABASE_URL environment variable
const sql = neon(process.env.DATABASE_URL!)

// Episode-related database functions
export async function getEpisodeByUrl(url: string) {
  const result = await sql`
    SELECT * FROM "Episode" WHERE url = ${url} LIMIT 1
  `
  return result[0] || null
}

export async function createEpisode(title: string, url: string, publishedAt?: Date) {
  const id = uuidv4()
  const result = await sql`
    INSERT INTO "Episode" (id, title, url, "publishedAt", "processedAt")
    VALUES (${id}, ${title}, ${url}, ${publishedAt}, NOW())
    RETURNING *
  `
  return result[0]
}

// Entity-related database functions
export async function findOrCreateEntity(name: string, type: string, description?: string) {
  // Try to find existing entity
  const existingEntity = await sql`
    SELECT * FROM "Entity" 
    WHERE name = ${name} AND type = ${type}
    LIMIT 1
  `

  if (existingEntity.length > 0) {
    // Update description if provided and different
    if (description && existingEntity[0].description !== description) {
      await sql`
        UPDATE "Entity"
        SET description = ${description}
        WHERE id = ${existingEntity[0].id}
      `
    }
    return existingEntity[0]
  }

  // Create new entity
  const id = uuidv4()
  const result = await sql`
    INSERT INTO "Entity" (id, name, type, description)
    VALUES (${id}, ${name}, ${type}, ${description})
    RETURNING *
  `
  return result[0]
}

// EntityMention-related database functions
export async function createEntityMention(episodeId: string, entityId: string) {
  try {
    const id = uuidv4()
    await sql`
      INSERT INTO "EntityMention" (id, "episodeId", "entityId")
      VALUES (${id}, ${episodeId}, ${entityId})
      ON CONFLICT ("episodeId", "entityId") DO NOTHING
    `
    return true
  } catch (error) {
    console.error("Error creating entity mention:", error)
    return false
  }
}

// Connection-related database functions
export async function createOrUpdateConnection(
  episodeId: string,
  sourceEntityId: string,
  targetEntityId: string,
  description?: string,
) {
  try {
    // Check if connection already exists
    const existingConnection = await sql`
      SELECT * FROM "Connection"
      WHERE "episodeId" = ${episodeId}
        AND "sourceEntityId" = ${sourceEntityId}
        AND "targetEntityId" = ${targetEntityId}
      LIMIT 1
    `

    if (existingConnection.length > 0) {
      // Update strength and description if provided
      await sql`
        UPDATE "Connection"
        SET 
          strength = strength + 1,
          description = COALESCE(${description}, description)
        WHERE id = ${existingConnection[0].id}
      `
      return existingConnection[0]
    }

    // Create new connection
    const id = uuidv4()
    const result = await sql`
      INSERT INTO "Connection" (id, "episodeId", "sourceEntityId", "targetEntityId", strength, description)
      VALUES (${id}, ${episodeId}, ${sourceEntityId}, ${targetEntityId}, 1, ${description})
      RETURNING *
    `
    return result[0]
  } catch (error) {
    console.error("Error creating/updating connection:", error)
    return null
  }
}

// Graph data retrieval - now includes Episode entities from extraction
export async function getGraphData() {
  try {
    console.log("=== Starting getGraphData ===")
    
    // Get all entities (now includes Episode type from extraction)
    console.log("Fetching all entities...")
    const allEntities = await sql`
      SELECT id, name, type, description
      FROM "Entity"
      WHERE type IN ('Company', 'Person', 'Topic', 'Episode')
      ORDER BY name
    `
    
    console.log(`Found ${allEntities.length} entities`)
    if (allEntities.length > 0) {
      console.log("First entity:", allEntities[0])
    }

    // Get all connections
    console.log("Fetching all connections...")
    const allConnections = await sql`
      SELECT "sourceEntityId", "targetEntityId", strength, description
      FROM "Connection"
    `
    
    console.log(`Found ${allConnections.length} connections`)
    if (allConnections.length > 0) {
      console.log("First connection:", allConnections[0])
    }

    // Get entity mentions for episodes (for non-Episode entities)
    console.log("Fetching entity mentions...")
    const entityMentions = await sql`
      SELECT 
        em."entityId", 
        e.id as "episodeId", 
        e.title, 
        e.url, 
        e."publishedAt"
      FROM "EntityMention" em
      JOIN "Episode" e ON em."episodeId" = e.id
    `
    
    console.log(`Found ${entityMentions.length} entity mentions`)

    // Build episodes by entity map
    const episodesByEntityId: Record<string, any[]> = {}
    entityMentions.forEach((mention: any) => {
      if (!episodesByEntityId[mention.entityId]) {
        episodesByEntityId[mention.entityId] = []
      }
      episodesByEntityId[mention.entityId].push({
        id: mention.episodeId,
        title: mention.title,
        url: mention.url,
        date: mention.publishedAt ? new Date(mention.publishedAt).toISOString().split("T")[0] : null,
      })
    })

    // Calculate connection counts for each entity
    const connectionCounts: Record<string, number> = {}
    allConnections.forEach((conn: any) => {
      connectionCounts[conn.sourceEntityId] = (connectionCounts[conn.sourceEntityId] || 0) + 1
      connectionCounts[conn.targetEntityId] = (connectionCounts[conn.targetEntityId] || 0) + 1
    })

    // Format nodes
    const nodes = allEntities.map((entity: any) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      connections: connectionCounts[entity.id] || 0,
      description: entity.description,
      episodes: episodesByEntityId[entity.id] || [],
    }))

    // Format links - ensure both source and target exist
    const entityIds = new Set(allEntities.map((e: any) => e.id))
    const links = allConnections
      .filter((conn: any) => entityIds.has(conn.sourceEntityId) && entityIds.has(conn.targetEntityId))
      .map((conn: any) => ({
        source: conn.sourceEntityId,
        target: conn.targetEntityId,
        value: conn.strength || 1,
        description: conn.description,
      }))

    console.log(`Processed ${nodes.length} nodes and ${links.length} valid links`)
    console.log("Sample node:", nodes[0])
    console.log("Sample link:", links[0])
    
    const result = { nodes, links }
    console.log("=== getGraphData completed successfully ===")
    
    return result
  } catch (error) {
    console.error("Error in getGraphData:", error)
    console.error("Error details:", error instanceof Error ? error.message : 'Unknown error')
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace')
    throw error
  }
}
