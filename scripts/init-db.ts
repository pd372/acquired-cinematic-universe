// This script initializes the database and creates the schema
// Run with: npx tsx scripts/init-db.ts

import { PrismaClient } from "@prisma/client"
import { config } from "dotenv"

// Load environment variables
config()

async function main() {
  const prisma = new PrismaClient()

  try {
    // Test database connection
    await prisma.$connect()
    console.log("Connected to database")

    // Create a test episode if none exist
    const episodeCount = await prisma.episode.count()
    if (episodeCount === 0) {
      console.log("Creating test episode...")
      await prisma.episode.create({
        data: {
          title: "Test Episode",
          url: "https://example.com/test-episode",
          transcript: "This is a test transcript.",
        },
      })
      console.log("Test episode created")
    } else {
      console.log(`Database already contains ${episodeCount} episodes`)
    }

    console.log("Database initialization complete")
  } catch (error) {
    console.error("Error initializing database:", error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
