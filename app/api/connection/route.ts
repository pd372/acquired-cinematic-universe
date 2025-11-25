import { NextResponse, NextRequest } from "next/server"
import { neon } from "@neondatabase/serverless"
import { verifyAuthHeader } from "@/lib/auth"

const sql = neon(process.env.DATABASE_URL!)

// Create a manual connection between two entities
export async function POST(request: NextRequest) {
  // Check authentication
  if (!verifyAuthHeader(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
      // Generate a cuid-like ID using a combination of timestamp and random string
      const cuid = `c${Date.now().toString(36)}${Math.random().toString(36).substring(2, 11)}`
      manualEpisode = await sql`
        INSERT INTO "Episode" (id, title, url, "publishedAt")
        VALUES (${cuid}, 'Manual Admin Connections', 'manual://admin-created', NOW())
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
          SET strength = COALESCE(strength, 0) + 1,
              description = ${description}
          WHERE id = ${existing[0].id}
        `
      } else {
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

    // Create the connection with a generated cuid
    const connectionId = `c${Date.now().toString(36)}${Math.random().toString(36).substring(2, 11)}`
    const connection = await sql`
      INSERT INTO "Connection" (id, "episodeId", "sourceEntityId", "targetEntityId", strength, description)
      VALUES (${connectionId}, ${episodeId}, ${sourceEntityId}, ${targetEntityId}, 1, ${description || null})
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
