import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  console.log("🔍 Finding episode without staged entities...\n")

  // Get the episode without staged entities
  const episodesWithoutStaged = await sql`
    SELECT e.id, e.title, e.url
    FROM "Episode" e
    LEFT JOIN "StagedEntity" se ON e.id = se."episodeId"
    WHERE se.id IS NULL
    ORDER BY e.title
  `

  if (episodesWithoutStaged.length === 0) {
    console.log("✅ All episodes have staged entities!")
  } else {
    console.log(`❌ Found ${episodesWithoutStaged.length} episode(s) without staged entities:\n`)
    episodesWithoutStaged.forEach((ep: any, i: number) => {
      console.log(`${i + 1}. ${ep.title}`)
      console.log(`   URL: ${ep.url}`)
      console.log(`   ID: ${ep.id}\n`)
    })
  }
}

main()
