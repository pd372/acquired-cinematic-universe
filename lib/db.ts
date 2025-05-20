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

// Graph data retrieval - optimized to reduce number of queries
export async function getGraphData() {
  try {
    // Get all entities with their connection counts in a single query
    const entitiesWithCounts = await sql`
      WITH connection_counts AS (
        SELECT 
          "sourceEntityId" as entity_id, 
          COUNT(*) as count 
        FROM "Connection" 
        GROUP BY "sourceEntityId"
        UNION ALL
        SELECT 
          "targetEntityId" as entity_id, 
          COUNT(*) as count 
        FROM "Connection" 
        GROUP BY "targetEntityId"
      )
      SELECT 
        e.*, 
        COALESCE(SUM(cc.count), 0) as connection_count,
        COUNT(DISTINCT em."episodeId") as episode_count
      FROM "Entity" e
      LEFT JOIN connection_counts cc ON e.id = cc.entity_id
      LEFT JOIN "EntityMention" em ON e.id = em."entityId"
      GROUP BY e.id
    `

    // Get all connections in a single query
    const connections = await sql`
      SELECT 
        c."sourceEntityId",
        c."targetEntityId",
        c.strength,
        c.description
      FROM "Connection" c
    `

    // Get episode details for each entity in a single query
    const entityEpisodes = await sql`
      SELECT 
        em."entityId", 
        e.id as "episodeId", 
        e.title, 
        e.url, 
        e."publishedAt"
      FROM "EntityMention" em
      JOIN "Episode" e ON em."episodeId" = e.id
    `

    // Process the data into the required format
    const episodesByEntityId = entityEpisodes.reduce((acc: any, row: any) => {
      if (!acc[row.entityId]) {
        acc[row.entityId] = []
      }
      acc[row.entityId].push({
        id: row.episodeId,
        title: row.title,
        url: row.url,
        date: row.publishedAt ? new Date(row.publishedAt).toISOString().split("T")[0] : null,
      })
      return acc
    }, {})

    // Format nodes
    const nodes = entitiesWithCounts.map((entity: any) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      connections: Number.parseInt(entity.connection_count) || 0,
      description: entity.description,
      episodes: episodesByEntityId[entity.id] || [],
    }))

    // Format links
    const links = connections.map((conn: any) => ({
      source: conn.sourceEntityId,
      target: conn.targetEntityId,
      value: conn.strength,
      description: conn.description,
    }))

    return { nodes, links }
  } catch (error) {
    console.error("Error in getGraphData:", error)
    throw error
  }
}
