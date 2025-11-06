import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

// Load environment variables
dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)

async function resetDatabase() {
  console.log("Starting database reset...")

  try {
    // Step 1: Delete all connections
    console.log("Deleting all connections...")
    const deletedConnections = await sql`DELETE FROM "Connection"`
    console.log(`Deleted ${deletedConnections.length} connections`)

    // Step 2: Delete all entity mentions
    console.log("Deleting all entity mentions...")
    const deletedMentions = await sql`DELETE FROM "EntityMention"`
    console.log(`Deleted ${deletedMentions.length} entity mentions`)

    // Step 3: Delete all entities
    console.log("Deleting all entities...")
    const deletedEntities = await sql`DELETE FROM "Entity"`
    console.log(`Deleted ${deletedEntities.length} entities`)

    // Step 4: Reset staged entities to unprocessed
    console.log("Resetting staged entities to unprocessed...")
    const resetEntities = await sql`
      UPDATE "StagedEntity"
      SET processed = false
      WHERE processed = true
    `
    console.log(`Reset ${resetEntities.length} staged entities`)

    // Step 5: Reset staged relationships to unprocessed
    console.log("Resetting staged relationships to unprocessed...")
    const resetRelationships = await sql`
      UPDATE "StagedRelationship"
      SET processed = false
      WHERE processed = true
    `
    console.log(`Reset ${resetRelationships.length} staged relationships`)

    // Step 6: Verify the reset
    console.log("\nVerifying reset...")
    const entityCount = await sql`SELECT COUNT(*) as count FROM "Entity"`
    const connectionCount = await sql`SELECT COUNT(*) as count FROM "Connection"`
    const pendingEntities = await sql`SELECT COUNT(*) as count FROM "StagedEntity" WHERE processed = false`
    const pendingRelationships = await sql`SELECT COUNT(*) as count FROM "StagedRelationship" WHERE processed = false`

    console.log("\n=== Database Reset Complete ===")
    console.log(`Entities remaining: ${entityCount[0].count}`)
    console.log(`Connections remaining: ${connectionCount[0].count}`)
    console.log(`Pending staged entities: ${pendingEntities[0].count}`)
    console.log(`Pending staged relationships: ${pendingRelationships[0].count}`)
    console.log("\nReady to re-run entity resolution with improved algorithm!")
  } catch (error) {
    console.error("Error resetting database:", error)
    throw error
  }
}

resetDatabase()
