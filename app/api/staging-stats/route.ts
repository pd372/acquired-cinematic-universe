import { type NextRequest, NextResponse } from "next/server"
import { getStagingStats } from "@/lib/staging-store"
import { getEntityCacheStats } from "@/lib/entity-resolver"
import { verifyAuthHeader } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    if (!verifyAuthHeader(request)) {
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
