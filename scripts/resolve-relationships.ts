import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)
const API_BASE = "http://localhost:3000"
const API_KEY = process.env.INTERNAL_API_KEY || "qwerty"

async function main() {
  console.log("🔗 Relationship Resolution Script (Phase 3)")
  console.log("=".repeat(80))

  try {
    // Check how many staged relationships we have
    const stagedCount = await sql`SELECT COUNT(*) FROM "StagedRelationship" WHERE processed = false`
    const totalStaged = stagedCount[0].count

    console.log(`\n📊 Status:`)
    console.log(`   Staged relationships to process: ${totalStaged}`)

    if (totalStaged === 0) {
      console.log(`\n✅ No staged relationships to process!`)
      console.log(`\n🎉 All processing complete! Check your knowledge graph.`)
      return
    }

    console.log(`\n⚙️  Configuration:`)
    console.log(`   API endpoint: ${API_BASE}`)
    console.log(`\n🎬 Starting relationship resolution...\n`)

    const startTime = Date.now()

    const response = await fetch(`${API_BASE}/api/resolve-relationships-robust`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        batchSize: 10000, // Process all at once
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }

    const data = await response.json()

    const totalTime = (Date.now() - startTime) / 1000 // seconds

    console.log(`\n${"=".repeat(80)}`)
    console.log(`🎉 Relationship Resolution Complete!`)
    console.log(`${"=".repeat(80)}`)
    console.log(`\n📊 Results:`)
    console.log(`   Processed: ${data.result.processed}`)
    console.log(`   Created: ${data.result.created}`)
    console.log(`   Skipped: ${data.result.skipped}`)
    console.log(`   Errors: ${data.result.errors}`)
    console.log(`\n⏱️  Performance:`)
    console.log(`   Total time: ${totalTime.toFixed(1)} seconds`)

    console.log(`\n🎉 All processing complete! Refresh your browser to see the updated knowledge graph.`)
  } catch (error: any) {
    console.error(`\n💥 Fatal error:`, error.message)
    process.exit(1)
  }
}

// Run the script
main()
