import { NextResponse, NextRequest } from "next/server"
import { neon } from "@neondatabase/serverless"
import { verifyAuthHeader } from "@/lib/auth"

const sql = neon(process.env.DATABASE_URL!)

// Force dynamic rendering for authenticated routes
export const dynamic = "force-dynamic"

// Create entity
export async function POST(request: NextRequest) {
  // Check authentication
  if (!verifyAuthHeader(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { name, type, description } = await request.json()

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    if (!type || !type.trim()) {
      return NextResponse.json({ error: "Type is required" }, { status: 400 })
    }

    // Validate type
    const validTypes = ["Company", "Person", "Topic", "Episode", "Industry", "Location", "Product"]
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` }, { status: 400 })
    }

    // Check if entity already exists
    const existing = await sql`
      SELECT id FROM "Entity"
      WHERE name = ${name.trim()} AND type = ${type}
      LIMIT 1
    `

    if (existing.length > 0) {
      return NextResponse.json({
        error: "Entity already exists with this name and type",
        entityId: existing[0].id
      }, { status: 409 })
    }

    // Generate a cuid-like ID
    const entityId = `c${Date.now().toString(36)}${Math.random().toString(36).substring(2, 11)}`

    // Create the entity
    const entity = await sql`
      INSERT INTO "Entity" (id, name, type, description)
      VALUES (${entityId}, ${name.trim()}, ${type}, ${description?.trim() || null})
      RETURNING id, name, type, description
    `

    return NextResponse.json({
      success: true,
      entity: entity[0]
    })
  } catch (error: any) {
    console.error("Entity create error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
