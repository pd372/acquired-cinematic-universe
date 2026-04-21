// Rotate Vercel environment variables after a security breach.
//
// Usage:
//   1. Copy .env.rotate.example to .env.rotate.local
//   2. Fill in NEW_* values for every secret you want to rotate
//   3. Set VERCEL_API_TOKEN to your freshly-created Vercel token
//   4. Run: npx tsx scripts/rotate-env-vars.ts
//
// The script lists all env vars in your Vercel project, matches them by name,
// and updates them via the Vercel REST API.

import dotenv from "dotenv"
import fetch from "node-fetch"

dotenv.config({ path: ".env.rotate.local" })
dotenv.config({ path: ".env.local" })

const VERCEL_API = "https://api.vercel.com"

interface VercelEnvVar {
  id: string
  key: string
  target: string[]
  type: string
}

interface VercelEnvListResponse {
  envs: VercelEnvVar[]
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set — check your .env.rotate.local`)
  return value
}

async function listProjectEnvs(
  token: string,
  projectId: string,
  teamId?: string
): Promise<VercelEnvVar[]> {
  const params = new URLSearchParams()
  if (teamId) params.set("teamId", teamId)

  const url = `${VERCEL_API}/v9/projects/${projectId}/env?${params}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to list env vars (${res.status}): ${body}`)
  }

  const data = (await res.json()) as VercelEnvListResponse
  return data.envs
}

async function updateEnvVar(
  token: string,
  projectId: string,
  envId: string,
  newValue: string,
  teamId?: string
): Promise<void> {
  const params = new URLSearchParams()
  if (teamId) params.set("teamId", teamId)

  const url = `${VERCEL_API}/v9/projects/${projectId}/env/${envId}?${params}`
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: newValue }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to update env var ${envId} (${res.status}): ${body}`)
  }
}

// Map of Vercel env var name → env var holding its new value
const ROTATION_MAP: Record<string, string> = {
  DATABASE_URL: "NEW_DATABASE_URL",
  OPENAI_API_KEY: "NEW_OPENAI_API_KEY",
  ADMIN_PASSWORD: "NEW_ADMIN_PASSWORD",
  INTERNAL_API_KEY: "NEW_INTERNAL_API_KEY",
  VERCEL_API_TOKEN: "NEW_VERCEL_API_TOKEN",
}

async function main() {
  const token = requireEnv("VERCEL_API_TOKEN")
  const projectId = requireEnv("VERCEL_PROJECT_ID")
  const teamId = process.env.VERCEL_TEAM_ID

  // Collect which variables the user actually wants to rotate
  const rotations: Array<{ vercelKey: string; newValue: string }> = []
  for (const [vercelKey, envKey] of Object.entries(ROTATION_MAP)) {
    const newValue = process.env[envKey]
    if (newValue) {
      rotations.push({ vercelKey, newValue })
    }
  }

  if (rotations.length === 0) {
    console.error(
      "No NEW_* variables found. Set at least one in .env.rotate.local before running."
    )
    process.exit(1)
  }

  console.log(`Fetching env vars for project: ${projectId}`)
  const envs = await listProjectEnvs(token, projectId, teamId)
  console.log(`Found ${envs.length} env vars in Vercel project.\n`)

  let updated = 0
  let skipped = 0

  for (const { vercelKey, newValue } of rotations) {
    // A project can have the same key on multiple targets (production, preview, development)
    const matches = envs.filter((e) => e.key === vercelKey)

    if (matches.length === 0) {
      console.log(`  SKIP  ${vercelKey} — not found in Vercel project`)
      skipped++
      continue
    }

    for (const match of matches) {
      const targets = match.target.join(", ")
      process.stdout.write(`  UPDATE ${vercelKey} (${targets}) ... `)
      await updateEnvVar(token, projectId, match.id, newValue, teamId)
      console.log("done")
      updated++
    }
  }

  console.log(`\nRotation complete: ${updated} updated, ${skipped} skipped.`)

  if (updated > 0) {
    console.log("\nNext steps:")
    console.log("  1. Redeploy your Vercel project to pick up the new values.")
    console.log("  2. Verify the app is healthy after redeployment.")
    console.log("  3. Revoke the old secrets in each upstream service:")
    console.log("     - Neon: rotate database password or connection string")
    console.log("     - OpenAI: delete and recreate the API key")
    console.log("     - Vercel: delete the old API token from account settings")
  }
}

main().catch((err) => {
  console.error("Error:", err.message)
  process.exit(1)
})
