import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

export const dynamic = "force-dynamic"

// Create a SQL client directly in this route for debugging
const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    console.log("=== Graph API Debug ===")

    // Test basic database connection
    const testQuery = await sql`SELECT 1 as test`
    console.log("Database connection test:", testQuery)

    // Check if we have any entities
    const entityCount = await sql`SELECT COUNT(*) as count FROM "Entity"`
    console.log("Entity count:", entityCount[0]?.count)

    // Check if we have any connections
    const connectionCount = await sql`SELECT COUNT(*) as count FROM "Connection"`
    console.log("Connection count:", connectionCount[0]?.count)

    // If no data, return empty graph
    if (Number(entityCount[0]?.count || 0) === 0) {
      console.log("No entities found, returning empty graph")
      return NextResponse.json({
        nodes: [],
        links: [],
      })
    }

    // Get all entities with a simpler query
    console.log("Fetching entities...")
    const entities = await sql`
      SELECT id, name, type, description
      FROM "Entity"
      ORDER BY name
      LIMIT 100
    `
    console.log(`Found ${entities.length} entities`)

    // Get all connections with a simpler query
    console.log("Fetching connections...")
    const connections = await sql`
      SELECT "sourceEntityId", "targetEntityId", strength, description
      FROM "Connection"
      LIMIT 200
    `
    console.log(`Found ${connections.length} connections`)

    // Calculate connection counts
    const connectionCounts: Record<string, number> = {}
    connections.forEach((conn: any) => {
      connectionCounts[conn.sourceEntityId] = (connectionCounts[conn.sourceEntityId] || 0) + 1
      connectionCounts[conn.targetEntityId] = (connectionCounts[conn.targetEntityId] || 0) + 1
    })

    // Format nodes
    const nodes = entities.map((entity: any) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      connections: connectionCounts[entity.id] || 0,
      description: entity.description,
      episodes: [], // Simplified for now
    }))

    // Format links - ensure both source and target exist
    const entityIds = new Set(entities.map((e: any) => e.id))
    const links = connections
      .filter((conn: any) => entityIds.has(conn.sourceEntityId) && entityIds.has(conn.targetEntityId))
      .map((conn: any) => ({
        source: conn.sourceEntityId,
        target: conn.targetEntityId,
        value: conn.strength || 1,
        description: conn.description,
      }))

    const result = { nodes, links }
    console.log(`Returning ${nodes.length} nodes and ${links.length} links`)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Graph API Error:", error)
    return NextResponse.json(
      {
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        nodes: [],
        links: [],
      },
      { status: 500 },
    )
  }
}
