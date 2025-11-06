import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  const episodes = await sql`SELECT COUNT(*) FROM "Episode"`
  const stagedEntities = await sql`SELECT COUNT(*) FROM "StagedEntity"`
  const stagedRels = await sql`SELECT COUNT(*) FROM "StagedRelationship"`

  console.log(`Episodes: ${episodes[0].count}`)
  console.log(`Staged Entities: ${stagedEntities[0].count}`)
  console.log(`Staged Relationships: ${stagedRels[0].count}`)

  const withEntities = await sql`
    SELECT COUNT(DISTINCT "episodeId") FROM "StagedEntity"
  `
  console.log(`Episodes with entities: ${withEntities[0].count}`)
}

main()
