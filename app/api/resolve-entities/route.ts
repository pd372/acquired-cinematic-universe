import { type NextRequest, NextResponse } from "next/server"
import { runResolution, getEntityCacheStats, clearEntityCache } from "@/lib/entity-resolver"
import { resolveEntitiesHybrid, clearHybridCaches, getHybridCacheStats } from "@/lib/hybrid-entity-resolver"
import { getStagingStats, clearProcessedItems } from "@/lib/staging-store"
import { verifyAuthHeader } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    if (!verifyAuthHeader(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get parameters from request
    const { entityBatchSize, relationshipBatchSize, maxBatches, clearOlderThan, clearCache, useHybrid, useLLM } =
      await request.json()


    // Clear caches if requested
    if (clearCache) {
      if (useHybrid) {
        clearHybridCaches()
        console.log("Hybrid caches cleared")
      } else {
        clearEntityCache()
        console.log("Entity cache cleared")
      }
    }

    let result: any

    // Choose resolution strategy
    if (useHybrid) {
      console.log("Using hybrid resolution strategy")
      // For hybrid, we'll do a simplified version focusing on entities
      const entityResult = await resolveEntitiesHybrid(entityBatchSize || 100, useLLM !== false)

      result = {
        entitiesProcessed: entityResult.processed,
        entitiesCreated: entityResult.created,
        entitiesMerged: entityResult.merged,
        relationshipsProcessed: 0,
        relationshipsCreated: 0,
        relationshipsSkipped: 0,
        errors: entityResult.errors,
        timeTaken: 0,
        totalCost: entityResult.totalCost,
        strategyStats: entityResult.strategyStats,
        mergeDetails: entityResult.mergeDetails,
        hybrid: true,
      }
    } else {
      console.log("Using traditional rule-based resolution")
      result = await runResolution(entityBatchSize || 100, relationshipBatchSize || 100, maxBatches || 10)
    }

    console.log("Resolution completed:", result)

    // Clear old processed items if requested
    let cleanupResult = null
    if (clearOlderThan) {
      const olderThan = new Date()
      olderThan.setDate(olderThan.getDate() - (clearOlderThan || 7))
      cleanupResult = await clearProcessedItems(olderThan)
      console.log("Cleanup completed:", cleanupResult)
    }

    // Get current staging stats
    const stats = await getStagingStats()

    // Get cache stats
    const cacheStats = useHybrid ? getHybridCacheStats() : getEntityCacheStats()

    return NextResponse.json({
      success: true,
      result,
      cleanupResult,
      stats,
      cacheStats,
      phase: "resolution",
      strategy: useHybrid ? "hybrid" : "rule-based",
      note: useHybrid
        ? `Hybrid resolution completed. Used LLM for ${result.strategyStats?.["llm-analysis"] || 0} entities. Total cost: $${(result.totalCost || 0).toFixed(4)}`
        : "Traditional rule-based resolution completed.",
      performance: {
        timeTakenMs: result.timeTaken,
        entitiesPerSecond:
          result.entitiesProcessed > 0 ? (result.entitiesProcessed / (result.timeTaken / 1000)).toFixed(2) : 0,
        relationshipsPerSecond:
          result.relationshipsProcessed > 0
            ? (result.relationshipsProcessed / (result.timeTaken / 1000)).toFixed(2)
            : 0,
        totalCostUSD: result.totalCost || 0,
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
    // Check authentication
    if (!verifyAuthHeader(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get current staging stats
    const stats = await getStagingStats()

    // Get both cache stats
    const ruleBasedCacheStats = getEntityCacheStats()
    const hybridCacheStats = getHybridCacheStats()

    return NextResponse.json({
      success: true,
      stats,
      cacheStats: {
        ruleBased: ruleBasedCacheStats,
        hybrid: hybridCacheStats,
      },
      note: "Current staging area statistics and cache information.",
    })
  } catch (error) {
    console.error("Error getting staging stats:", error)
    return NextResponse.json({ error: "Failed to get staging stats" }, { status: 500 })
  }
}
