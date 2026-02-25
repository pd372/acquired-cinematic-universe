import { NextResponse, NextRequest } from "next/server"
import { neon } from "@neondatabase/serverless"
import { verifyAuthAndCSRF } from "@/lib/session"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { createEntitySchema } from "@/lib/validation"
import { v4 as uuidv4 } from "uuid"

const sql = neon(process.env.DATABASE_URL!)

// Force dynamic rendering for authenticated routes
export const dynamic = "force-dynamic"

// Create entity
export async function POST(request: NextRequest) {
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
    const body = await request.json()

    // Validate input with Zod
    const validation = createEntitySchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 },
      )
    }

    const { name, type, description } = validation.data

    // Check if entity already exists
    const existing = await sql`
      SELECT id FROM "Entity"
      WHERE name = ${name} AND type = ${type}
      LIMIT 1
    `

    if (existing.length > 0) {
      return NextResponse.json(
        {
          error: "Entity already exists with this name and type",
          entityId: existing[0].id,
        },
        { status: 409 },
      )
    }

    // Generate proper UUID
    const entityId = uuidv4()

    // Create the entity
    const entity = await sql`
      INSERT INTO "Entity" (id, name, type, description)
      VALUES (${entityId}, ${name}, ${type}, ${description || null})
      RETURNING id, name, type, description
    `

    return NextResponse.json({
      success: true,
      entity: entity[0],
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to create entity" }, { status: 500 })
  }
}
