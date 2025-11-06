import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"
import * as fs from "fs"
import * as path from "path"

dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)
const API_BASE = "http://localhost:3000"
const API_KEY = process.env.INTERNAL_API_KEY || "qwerty"

interface Episode {
  title: string
  url: string
}

interface ProcessingStats {
  total: number
  alreadyProcessed: number
  toExtract: number
  extractionSuccessful: number
  extractionFailed: number
  totalEntitiesExtracted: number
  totalRelationshipsExtracted: number
  startTime: number
  extractionErrors: Array<{ url: string; error: string }>
}

// Load episodes from the pre-scraped JSON file
async function fetchEpisodesList(): Promise<Episode[]> {
  console.log("📡 Loading episodes list from data/episode-urls.json...")

  try {
    const filePath = path.join(process.cwd(), "data", "episode-urls.json")

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Episode URLs file not found at ${filePath}. Run 'npm run scrape-urls' first to generate it.`,
      )
    }

    const fileContent = fs.readFileSync(filePath, "utf-8")
    const episodes: Episode[] = JSON.parse(fileContent)

    console.log(`✅ Loaded ${episodes.length} episodes from file`)
    return episodes
  } catch (error: any) {
    console.error("❌ Error loading episodes list:", error.message)
    throw error
  }
}

// Check which episodes are already processed
async function getProcessedEpisodeUrls(): Promise<Set<string>> {
  const result = await sql`SELECT url FROM "Episode"`
  return new Set(result.map((row: any) => row.url))
}

// Extract entities and relationships for a single episode
async function extractEpisode(episode: Episode, stats: ProcessingStats): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/process-transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: episode.url,
        transcript: "placeholder",
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    console.log(`   ✓ ${episode.title}: ${data.rawEntities} entities, ${data.rawRelationships} relationships`)

    stats.totalEntitiesExtracted += data.rawEntities
    stats.totalRelationshipsExtracted += data.rawRelationships
    stats.extractionSuccessful++

    return true
  } catch (error: any) {
    console.error(`   ✗ ${episode.title}: ${error.message}`)
    stats.extractionFailed++
    stats.extractionErrors.push({
      url: episode.url,
      error: error.message,
    })
    return false
  }
}

// Process episodes in parallel batches
async function extractAllEpisodes(episodes: Episode[], concurrency: number, stats: ProcessingStats) {
  console.log(`\n${"=".repeat(80)}`)
  console.log(`📦 PHASE 1: Extracting entities and relationships`)
  console.log(`   Processing ${episodes.length} episodes with concurrency: ${concurrency}`)
  console.log(`${"=".repeat(80)}\n`)

  const batches: Episode[][] = []
  for (let i = 0; i < episodes.length; i += concurrency) {
    batches.push(episodes.slice(i, i + concurrency))
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const batchNum = i + 1
    const totalBatches = batches.length

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} episodes)`)

    // Process batch in parallel
    await Promise.all(batch.map((episode) => extractEpisode(episode, stats)))

    // Show progress
    const processed = stats.extractionSuccessful + stats.extractionFailed
    const progress = ((processed / stats.toExtract) * 100).toFixed(1)

    console.log(`\n📊 Progress: ${processed}/${stats.toExtract} (${progress}%)`)
    console.log(`   ✅ Successful: ${stats.extractionSuccessful}`)
    console.log(`   ❌ Failed: ${stats.extractionFailed}`)
    console.log(`   📝 Total entities staged: ${stats.totalEntitiesExtracted}`)
    console.log(`   🔗 Total relationships staged: ${stats.totalRelationshipsExtracted}`)

    // Brief pause between batches to be nice to the server
    if (i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
}

// Resolve all entities in one batch
async function resolveAllEntities() {
  console.log(`\n${"=".repeat(80)}`)
  console.log(`🔍 PHASE 2: Resolving entities`)
  console.log(`${"=".repeat(80)}\n`)

  try {
    const response = await fetch(`${API_BASE}/api/resolve-entities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        useHybrid: true,
        useLLM: true,
        entityBatchSize: 10000, // Process all at once
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    console.log(`✅ Entity resolution complete!`)
    console.log(`   📊 Processed: ${data.result.entitiesProcessed}`)
    console.log(`   ✨ Created: ${data.result.entitiesCreated}`)
    console.log(`   🔀 Merged: ${data.result.entitiesMerged}`)
    console.log(`   💰 Cost: $${data.result.totalCost?.toFixed(4) || "0.0000"}`)
    console.log(`   📈 Strategy stats:`, data.result.strategyStats)

    return {
      processed: data.result.entitiesProcessed,
      created: data.result.entitiesCreated,
      merged: data.result.entitiesMerged,
      cost: data.result.totalCost || 0,
    }
  } catch (error: any) {
    console.error(`❌ Entity resolution failed:`, error.message)
    throw error
  }
}

// Resolve all relationships in one batch
async function resolveAllRelationships() {
  console.log(`\n${"=".repeat(80)}`)
  console.log(`🔗 PHASE 3: Resolving relationships`)
  console.log(`${"=".repeat(80)}\n`)

  try {
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
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    console.log(`✅ Relationship resolution complete!`)
    console.log(`   📊 Processed: ${data.result.processed}`)
    console.log(`   ✨ Created: ${data.result.created}`)
    console.log(`   ⏭️  Skipped: ${data.result.skipped}`)
    console.log(`   ❌ Errors: ${data.result.errors}`)

    return {
      processed: data.result.processed,
      created: data.result.created,
      skipped: data.result.skipped,
    }
  } catch (error: any) {
    console.error(`❌ Relationship resolution failed:`, error.message)
    throw error
  }
}

async function main() {
  console.log("🚀 Bulk Episode Processing Script - Option 2 Strategy")
  console.log("=" .repeat(80))
  console.log("Strategy: Extract all → Resolve entities → Resolve relationships")
  console.log("=" .repeat(80))

  const stats: ProcessingStats = {
    total: 0,
    alreadyProcessed: 0,
    toExtract: 0,
    extractionSuccessful: 0,
    extractionFailed: 0,
    totalEntitiesExtracted: 0,
    totalRelationshipsExtracted: 0,
    startTime: Date.now(),
    extractionErrors: [],
  }

  try {
    // Step 1: Fetch all episodes
    const allEpisodes = await fetchEpisodesList()
    stats.total = allEpisodes.length

    // Step 2: Get already processed episodes
    const processedUrls = await getProcessedEpisodeUrls()
    stats.alreadyProcessed = processedUrls.size

    // Step 3: Filter to unprocessed episodes
    const episodesToProcess = allEpisodes.filter((ep) => !processedUrls.has(ep.url))
    stats.toExtract = episodesToProcess.length

    console.log(`\n📈 Summary:`)
    console.log(`   Total episodes found: ${stats.total}`)
    console.log(`   Already processed: ${stats.alreadyProcessed}`)
    console.log(`   To process: ${stats.toExtract}`)

    if (stats.toExtract === 0) {
      console.log(`\n✅ All episodes are already processed!`)
      return
    }

    console.log(`\n⚙️  Configuration:`)
    console.log(`   Extraction concurrency: 5 episodes at a time`)
    console.log(`   API endpoint: ${API_BASE}`)
    console.log(`\n🎬 Starting processing...\n`)

    // PHASE 1: Extract all episodes in parallel
    await extractAllEpisodes(episodesToProcess, 5, stats)

    if (stats.extractionSuccessful === 0) {
      console.log(`\n❌ No episodes were successfully extracted. Aborting.`)
      return
    }

    // PHASE 2: Resolve all entities in one batch
    const entityResults = await resolveAllEntities()

    // PHASE 3: Resolve all relationships in one batch
    const relationshipResults = await resolveAllRelationships()

    // Final summary
    const totalTime = (Date.now() - stats.startTime) / 1000 / 60 // minutes

    console.log(`\n${"=".repeat(80)}`)
    console.log(`🎉 Processing Complete!`)
    console.log(`${"=".repeat(80)}`)
    console.log(`\n📊 Final Statistics:`)
    console.log(`\n📥 EXTRACTION:`)
    console.log(`   Episodes processed: ${stats.extractionSuccessful}/${stats.toExtract}`)
    console.log(`   Entities extracted: ${stats.totalEntitiesExtracted}`)
    console.log(`   Relationships extracted: ${stats.totalRelationshipsExtracted}`)

    console.log(`\n🔍 ENTITY RESOLUTION:`)
    console.log(`   Total processed: ${entityResults.processed}`)
    console.log(`   New entities created: ${entityResults.created}`)
    console.log(`   Entities merged: ${entityResults.merged}`)
    console.log(`   Cost: $${entityResults.cost.toFixed(4)}`)

    console.log(`\n🔗 RELATIONSHIP RESOLUTION:`)
    console.log(`   Total processed: ${relationshipResults.processed}`)
    console.log(`   Relationships created: ${relationshipResults.created}`)
    console.log(`   Relationships skipped: ${relationshipResults.skipped}`)

    console.log(`\n⏱️  PERFORMANCE:`)
    console.log(`   Total time: ${totalTime.toFixed(1)} minutes`)
    console.log(`   Average time per episode: ${(totalTime / stats.extractionSuccessful).toFixed(2)} minutes`)

    if (stats.extractionErrors.length > 0) {
      console.log(`\n❌ Extraction errors (${stats.extractionErrors.length}):`)
      stats.extractionErrors.slice(0, 10).forEach((err) => {
        console.log(`   - ${err.url}: ${err.error}`)
      })
      if (stats.extractionErrors.length > 10) {
        console.log(`   ... and ${stats.extractionErrors.length - 10} more`)
      }
    }

    console.log(`\n✨ Knowledge graph is now complete! Refresh your browser to see all episodes.`)
  } catch (error) {
    console.error(`\n💥 Fatal error:`, error)
    process.exit(1)
  }
}

// Run the script
main()
