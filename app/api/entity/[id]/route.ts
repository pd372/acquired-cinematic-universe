import { NextResponse, NextRequest } from "next/server"
import { neon } from "@neondatabase/serverless"
import { verifyAuthHeader } from "@/lib/auth"

const sql = neon(process.env.DATABASE_URL!)

// Force dynamic rendering for authenticated routes
export const dynamic = "force-dynamic"

// Update entity name
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  // Check authentication
  if (!verifyAuthHeader(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const entityId = params.id
    const { name } = await request.json()

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    // Update the entity name
    await sql`
      UPDATE "Entity"
      SET name = ${name.trim()}
      WHERE id = ${entityId}
    `

    return NextResponse.json({ success: true, name: name.trim() })
  } catch (error: any) {
    console.error("Entity update error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Delete entity
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  // Check authentication
  if (!verifyAuthHeader(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const entityId = params.id

    // Delete the entity (cascades to EntityMention and Connection)
    await sql`
      DELETE FROM "Entity"
      WHERE id = ${entityId}
    `

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Entity delete error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
