import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"
import * as readline from "readline"

dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function askQuestion(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve))
}

function isSuspicious(entity: any): { suspicious: boolean, reason?: string } {
  const name = entity.name
  const nameLower = name.toLowerCase()
  const desc = (entity.description || '').toLowerCase()

  // Cryptocurrencies/protocols
  if (nameLower.includes('bitcoin') || nameLower.includes('ethereum') ||
      nameLower.includes('crypto') && !desc.includes('exchange') && !desc.includes('company')) {
    return { suspicious: true, reason: 'Cryptocurrency/protocol' }
  }

  // AI products/tools
  if ((nameLower.includes('gpt') || nameLower.includes('ai ')) &&
      (desc.includes('agent') || desc.includes('model') || desc.includes('tool'))) {
    return { suspicious: true, reason: 'AI product/tool' }
  }

  // Operating systems/software
  if (nameLower === 'android' || nameLower === 'ios' || nameLower.includes(' os') ||
      nameLower.endsWith('os')) {
    return { suspicious: true, reason: 'Operating system/software' }
  }

  // Payment systems/protocols
  if (nameLower.includes('ach system') || nameLower.includes('clearing house')) {
    return { suspicious: true, reason: 'Payment system/protocol' }
  }

  // Standards/Accounting
  if (nameLower.match(/^asc \d+/) || nameLower.match(/^iso \d+/)) {
    return { suspicious: true, reason: 'Standard/regulation' }
  }

  // Sports leagues
  if ((nameLower.includes('league') || nameLower.includes('conference')) &&
      (desc.includes('sport') || desc.includes('football') || desc.includes('basketball'))) {
    return { suspicious: true, reason: 'Sports league/organization' }
  }

  // Universities
  if (desc.includes('university') || desc.includes('college') ||
      nameLower === 'berkeley' || nameLower === 'stanford' || nameLower === 'mit') {
    return { suspicious: true, reason: 'University/educational institution' }
  }

  // Governing bodies
  if (desc.includes('governing body') || desc.includes('board of control')) {
    return { suspicious: true, reason: 'Governing body/organization' }
  }

  // Music groups
  if (desc.includes('music group') || desc.includes('band') || nameLower === 'bts') {
    return { suspicious: true, reason: 'Music group' }
  }

  // Podcasts/media
  if (nameLower.includes('podcast') || desc.startsWith('podcast') ||
      desc.includes('podcast hosted by')) {
    return { suspicious: true, reason: 'Podcast/media' }
  }

  // Airports/locations
  if (nameLower.includes('airport') || nameLower.includes('municipal')) {
    return { suspicious: true, reason: 'Airport/location' }
  }

  // Families (not companies)
  if (nameLower.includes('family') && desc.includes('owners')) {
    return { suspicious: true, reason: 'Family/not a company' }
  }

  // Fictional
  if (desc.includes('fictional')) {
    return { suspicious: true, reason: 'Fictional entity' }
  }

  // Student organizations
  if (desc.includes('student organization') || desc.includes('student club')) {
    return { suspicious: true, reason: 'Student organization' }
  }

  // Research labs (divisions, not companies)
  if (nameLower === 'brain' && desc.includes('research lab')) {
    return { suspicious: true, reason: 'Research lab/division' }
  }

  return { suspicious: false }
}

async function main() {
  console.log("🔍 Interactive Entity Review Tool (Suspicious Entities Only)")
  console.log("=" .repeat(80))
  console.log("\nCommands:")
  console.log("  k or keep     - Keep the entity")
  console.log("  r or remove   - Remove the entity from database")
  console.log("  s or skip     - Skip for now, move to next")
  console.log("  q or quit     - Exit the tool")
  console.log("=" .repeat(80))
  console.log()

  // Get all Company entities
  const allEntities = await sql`
    SELECT id, name, type, description
    FROM "Entity"
    WHERE type = 'Company'
    ORDER BY name
  `

  // Filter for suspicious ones
  const suspiciousEntities = allEntities.filter(e => isSuspicious(e).suspicious)

  console.log(`\n📊 Pre-filtered results:`)
  console.log(`   Total Company entities: ${allEntities.length}`)
  console.log(`   Suspicious entities to review: ${suspiciousEntities.length}`)
  console.log(`   This will save you from reviewing ${allEntities.length - suspiciousEntities.length} entities!`)
  console.log()

  const entities = suspiciousEntities

  let removed = 0
  let kept = 0
  let skipped = 0

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]
    const { reason } = isSuspicious(entity)

    console.log(`\n[${i + 1}/${entities.length}]`)
    console.log("-".repeat(80))
    console.log(`Name: ${entity.name}`)
    console.log(`Type: ${entity.type}`)
    console.log(`Reason flagged: ${reason}`)
    console.log(`Description: ${entity.description || 'No description'}`)
    console.log("-".repeat(80))

    const answer = await askQuestion("\nAction (k/r/s/q): ")
    const cmd = answer.toLowerCase().trim()

    if (cmd === 'q' || cmd === 'quit') {
      console.log("\n✋ Stopping review...")
      break
    } else if (cmd === 'r' || cmd === 'remove') {
      // Delete the entity
      await sql`DELETE FROM "Entity" WHERE id = ${entity.id}`
      console.log(`✅ REMOVED: "${entity.name}"`)
      removed++
    } else if (cmd === 'k' || cmd === 'keep') {
      console.log(`✅ KEPT: "${entity.name}"`)
      kept++
    } else if (cmd === 's' || cmd === 'skip') {
      console.log(`⏭️  SKIPPED: "${entity.name}"`)
      skipped++
    } else {
      console.log(`❓ Unknown command, skipping...`)
      skipped++
    }
  }

  console.log("\n" + "=".repeat(80))
  console.log("📊 Review Summary:")
  console.log(`   Kept: ${kept}`)
  console.log(`   Removed: ${removed}`)
  console.log(`   Skipped: ${skipped}`)
  console.log("=".repeat(80))

  rl.close()
}

main().catch(console.error)
