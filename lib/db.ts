import { neon } from "@neondatabase/serverless"
import { v4 as uuidv4 } from "uuid"

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

// Create a SQL client using the DATABASE_URL environment variable
const sql = neon(process.env.DATABASE_URL)

// Export the db client for other modules to use
export const db = sql

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

// Create episode-centric graph that eliminates duplicates and ensures connectivity
function createEpisodeCentricGraph(entities: any[], connections: any[]) {
  console.log("Creating episode-centric graph...")
  
  // Separate episodes from other entities
  const episodes = entities.filter(e => e.type === 'Episode')
  const nonEpisodeEntities = entities.filter(e => e.type !== 'Episode')
  
  console.log(`Found ${episodes.length} episodes and ${nonEpisodeEntities.length} non-episode entities`)
  
  // Find duplicates: non-episode entities that have the same name as an episode
  const episodeNames = new Set(episodes.map(e => e.name.toLowerCase()))
  const duplicateEntities = nonEpisodeEntities.filter(e => 
    episodeNames.has(e.name.toLowerCase())
  )
  
  console.log(`Found ${duplicateEntities.length} duplicate entities to remove:`, 
    duplicateEntities.map(e => `${e.name} (${e.type})`))
  
  // Keep only non-duplicate entities
  const cleanedNonEpisodeEntities = nonEpisodeEntities.filter(e => 
    !episodeNames.has(e.name.toLowerCase())
  )
  
  // Create mapping from duplicate entity IDs to episode IDs
  const duplicateToEpisodeMap: Record<string, string> = {}
  duplicateEntities.forEach(duplicate => {
    const matchingEpisode = episodes.find(ep => 
      ep.name.toLowerCase() === duplicate.name.toLowerCase()
    )
    if (matchingEpisode) {
      duplicateToEpisodeMap[duplicate.id] = matchingEpisode.id
    }
  })
  
  // Final entity list: episodes + cleaned non-episode entities
  const finalEntities = [...episodes, ...cleanedNonEpisodeEntities]
  const finalEntityIds = new Set(finalEntities.map(e => e.id))
  
  // Update connections: redirect duplicate references to episodes
  const updatedConnections = connections
    .map(conn => ({
      ...conn,
      sourceEntityId: duplicateToEpisodeMap[conn.sourceEntityId] || conn.sourceEntityId,
      targetEntityId: duplicateToEpisodeMap[conn.targetEntityId] || conn.targetEntityId
    }))
    .filter(conn => 
      finalEntityIds.has(conn.sourceEntityId) && 
      finalEntityIds.has(conn.targetEntityId) &&
      conn.sourceEntityId !== conn.targetEntityId // Remove self-loops
    )
  
  // Find entities that have no connections
  const connectedEntityIds = new Set()
  updatedConnections.forEach(conn => {
    connectedEntityIds.add(conn.sourceEntityId)
    connectedEntityIds.add(conn.targetEntityId)
  })
  
  const orphanedEntities = cleanedNonEpisodeEntities.filter(e => 
    !connectedEntityIds.has(e.id)
  )
  
  console.log(`Found ${orphanedEntities.length} orphaned entities to connect to episodes`)
  
  // Connect orphaned entities to their episodes via EntityMention
  const orphanConnections: any[] = []
  orphanedEntities.forEach(orphan => {
    // Find episodes that mention this entity
    const mentioningEpisodes = episodes.filter(episode => 
      orphan.episodes && orphan.episodes.some((ep: any) => ep.id === episode.id)
    )
    
    if (mentioningEpisodes.length > 0) {
      // Connect to the first mentioning episode
      orphanConnections.push({
        sourceEntityId: orphan.id,
        targetEntityId: mentioningEpisodes[0].id,
        strength: 1,
        description: "mentioned in episode"
      })
    } else if (episodes.length > 0) {
      // Fallback: connect to the first episode
      orphanConnections.push({
        sourceEntityId: orphan.id,
        targetEntityId: episodes[0].id,
        strength: 1,
        description: "mentioned in episode"
      })
    }
  })
  
  const allConnections = [...updatedConnections, ...orphanConnections]
  
  console.log(`Final graph: ${finalEntities.length} entities, ${allConnections.length} connections`)
  console.log(`Removed ${duplicateEntities.length} duplicates, connected ${orphanedEntities.length} orphans`)
  
  return { entities: finalEntities, connections: allConnections }
}

// Graph data retrieval with episode-centric model
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

    // Add episode info to entities
    const entitiesWithEpisodes = allEntities.map((entity: any) => ({
      ...entity,
      episodes: episodesByEntityId[entity.id] || [],
    }))

    // Create episode-centric graph (removes duplicates and ensures connectivity)
    const { entities: cleanedEntities, connections: cleanedConnections } = 
      createEpisodeCentricGraph(entitiesWithEpisodes, allConnections)

    // Calculate connection counts for each entity
    const connectionCounts: Record<string, number> = {}
    cleanedConnections.forEach((conn: any) => {
      connectionCounts[conn.sourceEntityId] = (connectionCounts[conn.sourceEntityId] || 0) + 1
      connectionCounts[conn.targetEntityId] = (connectionCounts[conn.targetEntityId] || 0) + 1
    })

    // Format nodes - all nodes use the same sizing formula
    const nodes = cleanedEntities.map((entity: any) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      connections: connectionCounts[entity.id] || 0,
      description: entity.description,
      episodes: entity.episodes || [],
    }))

    // Format links
    const links = cleanedConnections.map((conn: any) => ({
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

export default sql
