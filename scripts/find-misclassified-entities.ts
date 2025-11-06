import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)

// Common indicators of misclassification
const LOCATION_KEYWORDS = ['city', 'country', 'state', 'province', 'region', 'valley', 'bay area', 'silicon valley', 'china', 'india', 'japan', 'america', 'europe', 'asia']
const DOCUMENT_KEYWORDS = ['form', 'report', '10-k', '10-q', 's-1', 'filing', 'whitepaper', 'presentation']
const CONCEPT_KEYWORDS = ['strategy', 'principle', 'theory', 'framework', 'model', 'concept', 'idea', 'approach']
const EVENT_KEYWORDS = ['conference', 'summit', 'meeting', 'event', 'olympics', 'world cup', 'championship']
const TECHNOLOGY_KEYWORDS = ['ai', 'machine learning', 'blockchain', 'protocol', 'algorithm', 'api', 'sdk', 'framework']

async function main() {
  console.log("🔍 Scanning for misclassified entities...\n")

  // Get all entities
  const entities = await sql`
    SELECT id, name, type, description
    FROM "Entity"
    ORDER BY name
  `

  console.log(`Total entities to check: ${entities.length}\n`)

  const issues: Array<{
    id: string
    name: string
    currentType: string
    suggestedType: string
    reason: string
  }> = []

  for (const entity of entities) {
    const nameLower = entity.name.toLowerCase()
    const descLower = (entity.description || '').toLowerCase()
    const combined = `${nameLower} ${descLower}`

    // Check for documents classified as Person
    if (entity.type === 'Person') {
      // Document indicators
      if (DOCUMENT_KEYWORDS.some(kw => combined.includes(kw))) {
        issues.push({
          id: entity.id,
          name: entity.name,
          currentType: entity.type,
          suggestedType: 'Concept',
          reason: 'Document/filing name'
        })
        continue
      }

      // Technology indicators
      if (TECHNOLOGY_KEYWORDS.some(kw => combined.includes(kw))) {
        issues.push({
          id: entity.id,
          name: entity.name,
          currentType: entity.type,
          suggestedType: 'Technology',
          reason: 'Technology/software'
        })
        continue
      }

      // Event indicators
      if (EVENT_KEYWORDS.some(kw => combined.includes(kw))) {
        issues.push({
          id: entity.id,
          name: entity.name,
          currentType: entity.type,
          suggestedType: 'Event',
          reason: 'Event/conference'
        })
        continue
      }

      // Location indicators
      if (LOCATION_KEYWORDS.some(kw => combined.includes(kw))) {
        issues.push({
          id: entity.id,
          name: entity.name,
          currentType: entity.type,
          suggestedType: 'Location',
          reason: 'Geographic location'
        })
        continue
      }

      // Concept indicators
      if (CONCEPT_KEYWORDS.some(kw => combined.includes(kw))) {
        issues.push({
          id: entity.id,
          name: entity.name,
          currentType: entity.type,
          suggestedType: 'Concept',
          reason: 'Abstract concept'
        })
        continue
      }
    }

    // Check for locations classified as Company
    if (entity.type === 'Company') {
      if (LOCATION_KEYWORDS.some(kw => nameLower.includes(kw) || descLower.includes('country') || descLower.includes('city'))) {
        issues.push({
          id: entity.id,
          name: entity.name,
          currentType: entity.type,
          suggestedType: 'Location',
          reason: 'Geographic location'
        })
        continue
      }
    }

    // Check for concepts/technologies classified as Company
    if (entity.type === 'Company') {
      if (CONCEPT_KEYWORDS.some(kw => nameLower.includes(kw))) {
        issues.push({
          id: entity.id,
          name: entity.name,
          currentType: entity.type,
          suggestedType: 'Concept',
          reason: 'Abstract concept, not a company'
        })
        continue
      }
    }
  }

  console.log(`\n${"=".repeat(80)}`)
  console.log(`Found ${issues.length} potential misclassifications\n`)

  if (issues.length > 0) {
    // Group by current type
    const byType: Record<string, typeof issues> = {}
    issues.forEach(issue => {
      if (!byType[issue.currentType]) byType[issue.currentType] = []
      byType[issue.currentType].push(issue)
    })

    for (const [currentType, typeIssues] of Object.entries(byType)) {
      console.log(`\n📋 Currently classified as "${currentType}" (${typeIssues.length} issues):`)
      typeIssues.forEach((issue, i) => {
        console.log(`   ${i + 1}. "${issue.name}" → should be "${issue.suggestedType}"`)
        console.log(`      Reason: ${issue.reason}`)
      })
    }

    console.log(`\n${"=".repeat(80)}`)
    console.log(`\n💡 To fix these, we can update the Entity table types.`)
    console.log(`   Would you like me to generate a fix script?`)
  } else {
    console.log(`✅ No obvious misclassifications found!`)
  }
}

main()
