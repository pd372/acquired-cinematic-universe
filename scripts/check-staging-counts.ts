// This script checks the counts of pending entities and relationships in the staging tables
// Run with: npx tsx scripts/check-staging-counts.ts

import { neon } from "@neondatabase/serverless"
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

async function main() {
  try {
    console.log("Checking staging table counts...")

    // Create a SQL client
    const sql = neon(process.env.DATABASE_URL!)

    const pendingEntities = await sql`
      SELECT COUNT(*) as count FROM "StagedEntity" WHERE processed = false
    `
    const pendingRelationships = await sql`
      SELECT COUNT(*) as count FROM "StagedRelationship" WHERE processed = false
    `
    const processedEntities = await sql`
      SELECT COUNT(*) as count FROM "StagedEntity" WHERE processed = true
    `
    const processedRelationships = await sql`
      SELECT COUNT(*) as count FROM "StagedRelationship" WHERE processed = true
    `

    console.log("\n--- Staging Table Counts ---")
    console.log(`Pending Entities: ${pendingEntities[0].count}`)
    console.log(`Pending Relationships: ${pendingRelationships[0].count}`)
    console.log(`Processed Entities: ${processedEntities[0].count}`)
    console.log(`Processed Relationships: ${processedRelationships[0].count}`)
    console.log("----------------------------\n")
  } catch (error) {
    console.error("Error checking staging counts:", error)
  }
}

main()
