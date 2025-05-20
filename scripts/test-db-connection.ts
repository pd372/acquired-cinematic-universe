// This script tests the database connection
// Run with: npx tsx scripts/test-db-connection.ts

import { neon } from "@neondatabase/serverless"
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

async function main() {
  try {
    console.log("Testing database connection...")

    // Create a SQL client
    const sql = neon(process.env.DATABASE_URL!)

    // Test the connection with a simple query
    const result = await sql`SELECT NOW() as current_time`

    console.log("Database connection successful!")
    console.log("Current database time:", result[0].current_time)

    // Count episodes
    const episodeCount = await sql`SELECT COUNT(*) as count FROM "Episode"`
    console.log(`Database contains ${episodeCount[0].count} episodes`)

    // Count entities
    const entityCount = await sql`SELECT COUNT(*) as count FROM "Entity"`
    console.log(`Database contains ${entityCount[0].count} entities`)
  } catch (error) {
    console.error("Error connecting to database:", error)
  }
}

main()
