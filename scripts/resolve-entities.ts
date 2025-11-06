import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)
const API_BASE = "http://localhost:3000"
const API_KEY = process.env.INTERNAL_API_KEY || "qwerty"

async function main() {
  console.log("🔍 Entity Resolution Script (Phase 2)")
  console.log("=".repeat(80))

  try {
    // Check how many staged entities we have
    const stagedCount = await sql`SELECT COUNT(*) FROM "StagedEntity" WHERE processed = false`
    const totalStaged = stagedCount[0].count

    console.log(`\n📊 Status:`)
    console.log(`   Staged entities to process: ${totalStaged}`)

    if (totalStaged === 0) {
      console.log(`\n✅ No staged entities to process!`)
      console.log(`\n💡 Next step:`)
      console.log(`   Run 'npm run resolve-relationships' to resolve staged relationships`)
      return
    }

    const BATCH_SIZE = 100 // Process 100 entities per API call
    console.log(`\n⚙️  Configuration:`)
    console.log(`   Using hybrid resolution (rule-based + LLM)`)
    console.log(`   Batch size: ${BATCH_SIZE} entities per request`)
    console.log(`   API endpoint: ${API_BASE}`)
    console.log(`\n🎬 Starting entity resolution...\n`)

    const startTime = Date.now()
    let totalProcessed = 0
    let totalCreated = 0
    let totalMerged = 0
    let totalErrors = 0
    let totalCost = 0
    const allStrategyStats: Record<string, number> = {}
    const allMergeDetails: any[] = []

    // Process in batches until no more staged entities
    let batchNum = 0
    while (totalProcessed < totalStaged) {
      batchNum++
      console.log(`\n📦 Batch ${batchNum} (processing up to ${BATCH_SIZE} entities)`)

      const response = await fetch(`${API_BASE}/api/resolve-entities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          useHybrid: true,
          useLLM: true,
          entityBatchSize: BATCH_SIZE,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`)
      }

      const data = await response.json()
      const batchProcessed = data.result.entitiesProcessed || 0

      // Accumulate results
      totalProcessed += batchProcessed
      totalCreated += data.result.entitiesCreated || 0
      totalMerged += data.result.entitiesMerged || 0
      totalErrors += data.result.errors || 0
      totalCost += data.result.totalCost || 0

      // Merge strategy stats
      Object.entries(data.result.strategyStats || {}).forEach(([strategy, count]) => {
        allStrategyStats[strategy] = (allStrategyStats[strategy] || 0) + (count as number)
      })

      // Collect merge details
      if (data.result.mergeDetails) {
        allMergeDetails.push(...data.result.mergeDetails)
      }

      console.log(`   ✅ Processed: ${batchProcessed} entities`)
      console.log(`   📊 Progress: ${totalProcessed}/${totalStaged} (${((totalProcessed / totalStaged) * 100).toFixed(1)}%)`)
      console.log(`   💰 Batch cost: $${(data.result.totalCost || 0).toFixed(4)}`)

      // If this batch processed 0 entities, we're done
      if (batchProcessed === 0) {
        console.log(`\n   ℹ️  No more entities to process, stopping.`)
        break
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const totalTime = (Date.now() - startTime) / 1000 // seconds

    console.log(`\n${"=".repeat(80)}`)
    console.log(`🎉 Entity Resolution Complete!`)
    console.log(`${"=".repeat(80)}`)
    console.log(`\n📊 Results:`)
    console.log(`   Processed: ${totalProcessed}`)
    console.log(`   Created: ${totalCreated}`)
    console.log(`   Merged: ${totalMerged}`)
    console.log(`   Errors: ${totalErrors}`)
    console.log(`   Total Cost: $${totalCost.toFixed(4)}`)
    console.log(`\n📈 Strategy Usage:`)
    Object.entries(allStrategyStats).forEach(([strategy, count]) => {
      console.log(`   ${strategy}: ${count}`)
    })
    console.log(`\n⏱️  Performance:`)
    console.log(`   Total time: ${totalTime.toFixed(1)} seconds`)
    console.log(`   Avg time per batch: ${(totalTime / batchNum).toFixed(2)} seconds`)
    console.log(`   Entities per second: ${(totalProcessed / totalTime).toFixed(2)}`)

    // Show some merge examples
    if (allMergeDetails.length > 0) {
      console.log(`\n🔀 Sample Merges (first 10):`)
      allMergeDetails.slice(0, 10).forEach((merge: any, i: number) => {
        console.log(`   ${i + 1}. "${merge.source}" → "${merge.target}" (${merge.strategy}, confidence: ${merge.confidence.toFixed(2)})`)
      })
      if (allMergeDetails.length > 10) {
        console.log(`   ... and ${allMergeDetails.length - 10} more merges`)
      }
    }

    console.log(`\n💡 Next step:`)
    console.log(`   Run 'npm run resolve-relationships' to resolve staged relationships`)
  } catch (error: any) {
    console.error(`\n💥 Fatal error:`, error.message)
    process.exit(1)
  }
}

// Run the script
main()
