import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

// Create a manual connection between two entities
export async function POST(request: Request) {
  try {
    const { sourceEntityId, targetEntityId, description } = await request.json()

    if (!sourceEntityId || !targetEntityId) {
      return NextResponse.json({ error: "Source and target entities are required" }, { status: 400 })
    }

    if (sourceEntityId === targetEntityId) {
      return NextResponse.json({ error: "Cannot create connection to same entity" }, { status: 400 })
    }

    // Check if entities exist
    const entities = await sql`
      SELECT id FROM "Entity"
      WHERE id IN (${sourceEntityId}, ${targetEntityId})
    `

    if (entities.length !== 2) {
      return NextResponse.json({ error: "One or both entities not found" }, { status: 404 })
    }

    // Create a manual episode for admin-created connections
    let manualEpisode = await sql`
      SELECT id FROM "Episode"
      WHERE url = 'manual://admin-created'
      LIMIT 1
    `

    if (manualEpisode.length === 0) {
      // Create the manual episode if it doesn't exist
      manualEpisode = await sql`
        INSERT INTO "Episode" (id, title, url, "publishedAt")
        VALUES (gen_random_uuid(), 'Manual Admin Connections', 'manual://admin-created', NOW())
        RETURNING id
      `
    }

    const episodeId = manualEpisode[0].id

    // Check if connection already exists
    const existing = await sql`
      SELECT id FROM "Connection"
      WHERE "episodeId" = ${episodeId}
        AND "sourceEntityId" = ${sourceEntityId}
        AND "targetEntityId" = ${targetEntityId}
    `

    if (existing.length > 0) {
      // Update description if provided
      if (description) {
        await sql`
          UPDATE "Connection"
          SET strength = COALESCE(strength, 0) + 1
          WHERE id = ${existing[0].id}
        `
      }
      return NextResponse.json({
        success: true,
        connectionId: existing[0].id,
        message: "Connection already exists, incremented strength"
      })
    }

    // Create the connection
    const connection = await sql`
      INSERT INTO "Connection" ("episodeId", "sourceEntityId", "targetEntityId", strength)
      VALUES (${episodeId}, ${sourceEntityId}, ${targetEntityId}, 1)
      RETURNING id
    `

    return NextResponse.json({
      success: true,
      connectionId: connection[0].id
    })
  } catch (error: any) {
    console.error("Connection create error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
