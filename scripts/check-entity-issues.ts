import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  console.log("🔍 Checking for entity data issues...\n")

  // Check for entities with undefined or null names
  const undefinedNames = await sql`
    SELECT id, name, type, description
    FROM "Entity"
    WHERE name IS NULL OR name = 'undefined' OR name = ''
    LIMIT 10
  `

  console.log(`Entities with undefined/null names: ${undefinedNames.length}`)
  if (undefinedNames.length > 0) {
    console.log("\nSample bad entities:")
    undefinedNames.forEach((e: any) => {
      console.log(`   - ID: ${e.id}, Name: "${e.name}", Type: ${e.type}`)
    })
  }

  // Check the 54 unprocessed staged entities
  console.log("\n" + "=".repeat(60))
  const unprocessed = await sql`
    SELECT name, type, description
    FROM "StagedEntity"
    WHERE processed = false
    LIMIT 20
  `

  console.log(`\nUnprocessed staged entities (showing first 20 of 54):`)
  unprocessed.forEach((e: any, i: number) => {
    console.log(`   ${i + 1}. "${e.name}" (${e.type})`)
  })

  // Check for duplicate entity names that might indicate bad merges
  console.log("\n" + "=".repeat(60))
  const totalEntities = await sql`SELECT COUNT(*) FROM "Entity"`
  const uniqueNames = await sql`SELECT COUNT(DISTINCT name) FROM "Entity"`

  console.log(`\nEntity statistics:`)
  console.log(`   Total entities: ${totalEntities[0].count}`)
  console.log(`   Unique names: ${uniqueNames[0].count}`)
  console.log(`   Duplicates: ${Number(totalEntities[0].count) - Number(uniqueNames[0].count)}`)
}

main()
