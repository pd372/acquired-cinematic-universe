import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  console.log("🔍 Checking staged entities coverage...\n")

  // Get total episodes
  const totalEpisodes = await sql`SELECT COUNT(*) FROM "Episode"`
  console.log(`📊 Total episodes in database: ${totalEpisodes[0].count}`)

  // Get total staged entities
  const totalStaged = await sql`SELECT COUNT(*) FROM "StagedEntity"`
  console.log(`📝 Total staged entities: ${totalStaged[0].count}`)

  // Get total staged relationships
  const totalStagedRels = await sql`SELECT COUNT(*) FROM "StagedRelationship"`
  console.log(`🔗 Total staged relationships: ${totalStagedRels[0].count}`)

  // Get episodes with staged entities
  const episodesWithStaged = await sql`
    SELECT COUNT(DISTINCT "episodeId")
    FROM "StagedEntity"
  `
  console.log(`\n✅ Episodes with staged entities: ${episodesWithStaged[0].count}/${totalEpisodes[0].count}`)

  // Get episodes WITHOUT staged entities
  const episodesWithoutStaged = await sql`
    SELECT e.id, e.title, e.url
    FROM "Episode" e
    LEFT JOIN "StagedEntity" se ON e.id = se."episodeId"
    WHERE se.id IS NULL
    ORDER BY e.title DESC
    LIMIT 20
  `

  if (episodesWithoutStaged.length > 0) {
    console.log(`\n⚠️  Episodes WITHOUT staged entities (showing first 20 of ${episodesWithoutStaged.length}):`)
    episodesWithoutStaged.forEach((ep: any, i: number) => {
      console.log(`   ${i + 1}. ${ep.title}`)
    })
  } else {
    console.log(`\n✅ All episodes have staged entities!`)
  }

  // Show episodes with highest entity counts
  const topEpisodes = await sql`
    SELECT e.title, COUNT(se.id) as entity_count
    FROM "Episode" e
    LEFT JOIN "StagedEntity" se ON e.id = se."episodeId"
    GROUP BY e.id, e.title
    ORDER BY entity_count DESC
    LIMIT 10
  `

  console.log(`\n📈 Top 10 episodes by entity count:`)
  topEpisodes.forEach((row: any, i: number) => {
    console.log(`   ${i + 1}. ${row.entity_count} entities - ${row.title.substring(0, 60)}...`)
  })

  // Check for episodes with 0 entities
  const zeroEntityEpisodes = await sql`
    SELECT e.title
    FROM "Episode" e
    LEFT JOIN "StagedEntity" se ON e.id = se."episodeId"
    GROUP BY e.id, e.title
    HAVING COUNT(se.id) = 0
  `

  if (zeroEntityEpisodes.length > 0) {
    console.log(`\n⚠️  ${zeroEntityEpisodes.length} episodes have ZERO staged entities:`)
    zeroEntityEpisodes.slice(0, 10).forEach((ep: any, i: number) => {
      console.log(`   ${i + 1}. ${ep.title}`)
    })
  }
}

main()
