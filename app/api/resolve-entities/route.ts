import { type NextRequest, NextResponse } from "next/server"
import { runResolution, getEntityCacheStats, clearEntityCache } from "@/lib/entity-resolver"
import { getStagingStats, clearProcessedItems } from "@/lib/staging-store"

export async function POST(request: NextRequest) {
  try {
    // Check for API key authentication
    const authHeader = request.headers.get("authorization")
    const expectedKey = process.env.INTERNAL_API_KEY

    console.log("POST /api/resolve-entities - Auth check:")
    console.log("- Auth header present:", !!authHeader)
    console.log("- Expected key present:", !!expectedKey)
    console.log("- Auth header format:", authHeader ? authHeader.substring(0, 20) + "..." : "none")

    if (!expectedKey) {
      console.error("INTERNAL_API_KEY environment variable not set")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
      console.log("Authentication failed - header mismatch")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Authentication successful")

    // Get parameters from request
    const { entityBatchSize, relationshipBatchSize, maxBatches, clearOlderThan, clearCache } = await request.json()

    console.log("Resolution parameters:", {
      entityBatchSize,
      relationshipBatchSize,
      maxBatches,
      clearOlderThan,
      clearCache,
    })

    // Clear entity cache if requested
    if (clearCache) {
      clearEntityCache()
      console.log("Entity cache cleared")
    }

    // Run the resolution process
    console.log("Starting resolution process...")
    const result = await runResolution(entityBatchSize || 100, relationshipBatchSize || 100, maxBatches || 10)
    console.log("Resolution completed:", result)

    // Clear old processed items if requested
    let cleanupResult = null
    if (clearOlderThan) {
      const olderThan = new Date()
      olderThan.setDate(olderThan.getDate() - (clearOlderThan || 7)) // Default to 7 days

      cleanupResult = await clearProcessedItems(olderThan)
      console.log("Cleanup completed:", cleanupResult)
    }

    // Get current staging stats
    const stats = await getStagingStats()

    // Get cache stats
    const cacheStats = getEntityCacheStats()

    return NextResponse.json({
      success: true,
      result,
      cleanupResult,
      stats,
      cacheStats,
      phase: "resolution",
      note: "Entities and relationships have been resolved and integrated into the knowledge graph.",
      performance: {
        timeTakenMs: result.timeTaken,
        entitiesPerSecond:
          result.entitiesProcessed > 0 ? (result.entitiesProcessed / (result.timeTaken / 1000)).toFixed(2) : 0,
        relationshipsPerSecond:
          result.relationshipsProcessed > 0
            ? (result.relationshipsProcessed / (result.timeTaken / 1000)).toFixed(2)
            : 0,
      },
    })
  } catch (error) {
    console.error("Error resolving entities:", error)
    return NextResponse.json({ error: "Failed to resolve entities" }, { status: 500 })
  }
}

// Also support GET to check status
export async function GET(request: NextRequest) {
  try {
    // Check for API key authentication
    const authHeader = request.headers.get("authorization")
    const expectedKey = process.env.INTERNAL_API_KEY

    console.log("GET /api/resolve-entities - Auth check:")
    console.log("- Auth header present:", !!authHeader)
    console.log("- Expected key present:", !!expectedKey)

    if (!expectedKey) {
      console.error("INTERNAL_API_KEY environment variable not set")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
      console.log("Authentication failed - header mismatch")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get current staging stats
    const stats = await getStagingStats()

    // Get cache stats
    const cacheStats = getEntityCacheStats()

    return NextResponse.json({
      success: true,
      stats,
      cacheStats,
      note: "Current staging area statistics.",
    })
  } catch (error) {
    console.error("Error getting staging stats:", error)
    return NextResponse.json({ error: "Failed to get staging stats" }, { status: 500 })
  }
}
