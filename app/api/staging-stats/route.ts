import { type NextRequest, NextResponse } from "next/server"
import { getStagingStats } from "@/lib/staging-store"
import { getEntityCacheStats } from "@/lib/entity-resolver"

export async function GET(request: NextRequest) {
  try {
    // Get current staging stats (no auth required for read-only stats)
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
