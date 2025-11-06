import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  console.log("📊 Final Database Statistics\n")
  console.log("=" .repeat(60))

  const episodes = await sql`SELECT COUNT(*) FROM "Episode"`
  const entities = await sql`SELECT COUNT(*) FROM "Entity"`
  const connections = await sql`SELECT COUNT(*) FROM "Connection"`
  const stagedEntities = await sql`SELECT COUNT(*) FROM "StagedEntity"`
  const stagedRelationships = await sql`SELECT COUNT(*) FROM "StagedRelationship"`
  const entityMentions = await sql`SELECT COUNT(*) FROM "EntityMention"`

  console.log(`\n✅ Episodes processed: ${episodes[0].count}`)
  console.log(`✅ Entities created: ${entities[0].count}`)
  console.log(`✅ Connections created: ${connections[0].count}`)
  console.log(`✅ Entity mentions: ${entityMentions[0].count}`)
  console.log(`\n📝 Staged entities (leftover): ${stagedEntities[0].count}`)
  console.log(`📝 Staged relationships (leftover): ${stagedRelationships[0].count}`)

  // Show sample entities
  console.log(`\n🎯 Sample entities:`)
  const sampleEntities = await sql`
    SELECT name, type FROM "Entity"
    ORDER BY name
    LIMIT 20
  `
  sampleEntities.forEach((e: any, i: number) => {
    console.log(`   ${i + 1}. ${e.name} (${e.type})`)
  })

  console.log(`\n${"=".repeat(60)}`)
}

main()
