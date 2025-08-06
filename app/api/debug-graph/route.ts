import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    console.log("=== Debug Graph API ===")
    
    // Check entities
    const entities = await sql`SELECT COUNT(*) as count FROM "Entity"`
    console.log("Entity count:", entities[0].count)
    
    const sampleEntities = await sql`SELECT * FROM "Entity" LIMIT 5`
    console.log("Sample entities:", sampleEntities)
    
    // Check connections
    const connections = await sql`SELECT COUNT(*) as count FROM "Connection"`
    console.log("Connection count:", connections[0].count)
    
    const sampleConnections = await sql`SELECT * FROM "Connection" LIMIT 5`
    console.log("Sample connections:", sampleConnections)
    
    // Check entity mentions
    const mentions = await sql`SELECT COUNT(*) as count FROM "EntityMention"`
    console.log("EntityMention count:", mentions[0].count)
    
    // Check episodes
    const episodes = await sql`SELECT COUNT(*) as count FROM "Episode"`
    console.log("Episode count:", episodes[0].count)
    
    return NextResponse.json({
      entities: {
        count: entities[0].count,
        samples: sampleEntities
      },
      connections: {
        count: connections[0].count,
        samples: sampleConnections
      },
      mentions: {
        count: mentions[0].count
      },
      episodes: {
        count: episodes[0].count
      }
    })
  } catch (error) {
    console.error("Debug error:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
