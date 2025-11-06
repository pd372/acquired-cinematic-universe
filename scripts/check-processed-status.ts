import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  console.log("🔍 Checking processed status...\n")

  const totalStaged = await sql`SELECT COUNT(*) FROM "StagedEntity"`
  const processed = await sql`SELECT COUNT(*) FROM "StagedEntity" WHERE processed = true`
  const unprocessed = await sql`SELECT COUNT(*) FROM "StagedEntity" WHERE processed = false`

  console.log(`Total staged entities: ${totalStaged[0].count}`)
  console.log(`Processed: ${processed[0].count}`)
  console.log(`Unprocessed: ${unprocessed[0].count}`)
}

main()
