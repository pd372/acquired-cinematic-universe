import { NextResponse, NextRequest } from "next/server"
import { neon } from "@neondatabase/serverless"
import { verifyAuthAndCSRF } from "@/lib/session"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { updateEntitySchema } from "@/lib/validation"

const sql = neon(process.env.DATABASE_URL!)

// Force dynamic rendering for authenticated routes
export const dynamic = "force-dynamic"

// Update entity
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  // Apply rate limiting
  const rateLimitResponse = rateLimit(request, RATE_LIMITS.API_WRITE)
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  // Check authentication and CSRF
  const session = verifyAuthAndCSRF(request)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const entityId = params.id
    const body = await request.json()

    // Validate input
    const validation = updateEntitySchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 },
      )
    }

    const updates = validation.data

    // Build dynamic update query
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      setClauses.push(`name = $${values.length + 1}`)
      values.push(updates.name)
    }
    if (updates.type !== undefined) {
      setClauses.push(`type = $${values.length + 1}`)
      values.push(updates.type)
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${values.length + 1}`)
      values.push(updates.description)
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    // Update the entity
    const result = await sql`
      UPDATE "Entity"
      SET ${sql.unsafe(setClauses.join(", "))}
      WHERE id = ${entityId}
      RETURNING id, name, type, description
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, entity: result[0] })
  } catch (error) {
    return NextResponse.json({ error: "Failed to update entity" }, { status: 500 })
  }
}

// Delete entity
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  // Apply rate limiting
  const rateLimitResponse = rateLimit(request, RATE_LIMITS.API_WRITE)
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  // Check authentication and CSRF
  const session = verifyAuthAndCSRF(request)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const entityId = params.id

    // Delete the entity (cascades to EntityMention and Connection)
    const result = await sql`
      DELETE FROM "Entity"
      WHERE id = ${entityId}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete entity" }, { status: 500 })
  }
}
