import { type NextRequest, NextResponse } from "next/server"
import { clearCache } from "@/lib/cache"
import { neon } from "@neondatabase/serverless"
import { verifyAuthHeader } from "@/lib/auth"

// Create a SQL client using the DATABASE_URL environment variable
const sql = neon(process.env.DATABASE_URL!)

// Force dynamic rendering for authenticated routes
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check authentication
    if (!verifyAuthHeader(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Clear all caches
    clearCache()

    // Get a count of entities and connections to verify data exists
    const entityCount = await sql`SELECT COUNT(*) as count FROM "Entity"`
    const connectionCount = await sql`SELECT COUNT(*) as count FROM "Connection"`

    return NextResponse.json({
      success: true,
      message: "All caches cleared and database verified",
      stats: {
        entities: Number.parseInt(entityCount[0].count),
        connections: Number.parseInt(connectionCount[0].count),
      },
    })
  } catch (error) {
    console.error("Error in force-refresh API:", error)
    return NextResponse.json(
      { error: `Failed to refresh: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
