import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)

async function checkOmegaRelationships() {
  console.log("Checking Omega relationships in database...\n")

  // Find Omega entity
  const omega = await sql`SELECT * FROM "Entity" WHERE name = 'Omega'`
  console.log("Omega entity:", omega[0])

  if (omega.length > 0) {
    const omegaId = omega[0].id

    // Get all connections involving Omega
    const connections = await sql`
      SELECT
        c.id,
        c."sourceEntityId",
        c."targetEntityId",
        c.description,
        e1.name as source_name,
        e2.name as target_name
      FROM "Connection" c
      LEFT JOIN "Entity" e1 ON c."sourceEntityId" = e1.id
      LEFT JOIN "Entity" e2 ON c."targetEntityId" = e2.id
      WHERE c."sourceEntityId" = ${omegaId} OR c."targetEntityId" = ${omegaId}
    `

    console.log(`\nFound ${connections.length} connections for Omega:\n`)
    connections.forEach((conn: any) => {
      console.log(`${conn.source_name} → ${conn.target_name}`)
      console.log(`  Description: ${conn.description}`)
      console.log(`  IDs: ${conn.sourceEntityId} → ${conn.targetEntityId}\n`)
    })
  }
}

checkOmegaRelationships()
