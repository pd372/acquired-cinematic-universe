import { type NextRequest, NextResponse } from "next/server"
import { resolveRelationshipsRobust, getRelationshipResolutionStats } from "@/lib/robust-relationship-resolver"
import { getStagingStats } from "@/lib/staging-store"
import { verifyAuthHeader } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    if (!verifyAuthHeader(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get parameters from request
    const { batchSize = 100 } = await request.json()

    // Run robust relationship resolution
    const result = await resolveRelationshipsRobust(batchSize)

    console.log("Robust relationship resolution completed:", result)

    // Get current staging stats
    const stats = await getStagingStats()

    // Get relationship resolution stats
    const relationshipStats = await getRelationshipResolutionStats()

    return NextResponse.json({
      success: true,
      result,
      stats,
      relationshipStats,
      phase: "robust-relationship-resolution",
      note: `Robust relationship resolution completed. Created ${result.created} relationships with cross-validation.`,
      performance: {
        successRate: result.processed > 0 ? ((result.created / result.processed) * 100).toFixed(1) + "%" : "0%",
        averageConfidence:
          result.details.length > 0
            ? (result.details.reduce((sum, d) => sum + d.confidence, 0) / result.details.length).toFixed(2)
            : "0.00",
      },
    })
  } catch (error) {
    console.error("Error in robust relationship resolution:", error)
    return NextResponse.json(
      {
        error: "Failed to run robust relationship resolution",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

// Also support GET to check status
export async function GET(request: NextRequest) {
  try {
    // Check for API key authentication
    const authHeader = request.headers.get("authorization")
    const expectedKey = process.env.INTERNAL_API_KEY?.trim()

    if (!expectedKey) {
      console.error("INTERNAL_API_KEY environment variable not set")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get current staging stats
    const stats = await getStagingStats()

    // Get relationship resolution stats
    const relationshipStats = await getRelationshipResolutionStats()

    return NextResponse.json({
      success: true,
      stats,
      relationshipStats,
      note: "Current robust relationship resolution statistics.",
    })
  } catch (error) {
    console.error("Error getting robust relationship stats:", error)
    return NextResponse.json({ error: "Failed to get robust relationship stats" }, { status: 500 })
  }
}
