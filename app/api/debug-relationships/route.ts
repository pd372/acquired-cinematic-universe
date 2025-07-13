import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    // Check for API key
    const authHeader = request.headers.get("authorization")
    if (!process.env.INTERNAL_API_KEY || authHeader !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const entityName = request.nextUrl.searchParams.get("entity")

    if (!entityName) {
      return NextResponse.json({ error: "Missing entity parameter" }, { status: 400 })
    }

    // Find the entity
    const entities = await sql`
      SELECT id, name, type, description 
      FROM "Entity" 
      WHERE LOWER(name) LIKE ${`%${entityName.toLowerCase()}%`}
      ORDER BY similarity(LOWER(name), ${entityName.toLowerCase()}) DESC
      LIMIT 5
    `

    if (entities.length === 0) {
      return NextResponse.json({
        error: `No entities found matching "${entityName}"`,
        suggestion: "Try a partial name or check spelling",
      })
    }

    const results = []

    for (const entity of entities) {
      // Get all connections for this entity
      const outgoingConnections = await sql`
        SELECT 
          c.id,
          c.strength,
          c.description,
          target.name as target_name,
          target.type as target_type,
          e.title as episode_title
        FROM "Connection" c
        JOIN "Entity" target ON c."targetEntityId" = target.id
        JOIN "Episode" e ON c."episodeId" = e.id
        WHERE c."sourceEntityId" = ${entity.id}
        ORDER BY c.strength DESC
      `

      const incomingConnections = await sql`
        SELECT 
          c.id,
          c.strength,
          c.description,
          source.name as source_name,
          source.type as source_type,
          e.title as episode_title
        FROM "Connection" c
        JOIN "Entity" source ON c."sourceEntityId" = source.id
        JOIN "Episode" e ON c."episodeId" = e.id
        WHERE c."targetEntityId" = ${entity.id}
        ORDER BY c.strength DESC
      `

      // Get episodes this entity was mentioned in
      const episodes = await sql`
        SELECT DISTINCT
          e.id,
          e.title,
          e.url
        FROM "EntityMention" em
        JOIN "Episode" e ON em."episodeId" = e.id
        WHERE em."entityId" = ${entity.id}
        ORDER BY e."processedAt" DESC
      `

      // Check for staged relationships that might not have been resolved
      const stagedRelationships = await sql`
        SELECT 
          sr."sourceName",
          sr."targetName", 
          sr.description,
          sr.processed,
          e.title as episode_title
        FROM "StagedRelationship" sr
        JOIN "Episode" e ON sr."episodeId" = e.id
        WHERE (
          LOWER(sr."sourceName") LIKE ${`%${entity.name.toLowerCase()}%`} OR
          LOWER(sr."targetName") LIKE ${`%${entity.name.toLowerCase()}%`}
        )
        ORDER BY sr."extractedAt" DESC
        LIMIT 10
      `

      results.push({
        entity: {
          id: entity.id,
          name: entity.name,
          type: entity.type,
          description: entity.description,
        },
        connections: {
          outgoing: outgoingConnections,
          incoming: incomingConnections,
          total: outgoingConnections.length + incomingConnections.length,
        },
        episodes: episodes,
        stagedRelationships: stagedRelationships,
      })
    }

    return NextResponse.json({
      success: true,
      query: entityName,
      results: results,
      analysis: {
        entitiesFound: entities.length,
        totalConnections: results.reduce((sum, r) => sum + r.connections.total, 0),
        episodesInvolved: [...new Set(results.flatMap((r) => r.episodes.map((e) => e.id)))].length,
      },
    })
  } catch (error) {
    console.error("Error debugging relationships:", error)
    return NextResponse.json({ error: "Failed to debug relationships" }, { status: 500 })
  }
}
