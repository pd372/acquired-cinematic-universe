import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  console.log("📋 Getting all entities for manual review...\n")

  // Get all entities grouped by type
  const byType = await sql`
    SELECT type, COUNT(*) as count
    FROM "Entity"
    GROUP BY type
    ORDER BY count DESC
  `

  console.log("Entities by type:")
  byType.forEach((row: any) => {
    console.log(`   ${row.type}: ${row.count}`)
  })

  // Get all Company entities (where products often hide)
  console.log("\n\n" + "=".repeat(80))
  console.log("ALL COMPANY ENTITIES:")
  console.log("=".repeat(80) + "\n")

  const companies = await sql`
    SELECT name, description
    FROM "Entity"
    WHERE type = 'Company'
    ORDER BY name
  `

  companies.forEach((e: any, i: number) => {
    const desc = e.description ? e.description.substring(0, 100) : 'No description'
    console.log(`${i + 1}. ${e.name}`)
    console.log(`   ${desc}`)
    console.log()
  })
}

main()
