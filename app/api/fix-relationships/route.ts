import { type NextRequest, NextResponse } from "next/server"
import { fixMissingRelationships, createObviousRelationships } from "@/lib/relationship-fixer"

export async function POST(request: NextRequest) {
  try {
    // Check for API key
    const authHeader = request.headers.get("authorization")
    if (!process.env.INTERNAL_API_KEY || authHeader !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { action } = await request.json()

    if (action === "fix-staged") {
      console.log("Fixing staged relationships...")
      const result = await fixMissingRelationships()

      return NextResponse.json({
        success: true,
        action: "fix-staged",
        result,
        message: `Fixed ${result.fixed} relationships, ${result.errors} errors`,
      })
    }

    if (action === "create-obvious") {
      console.log("Creating obvious relationships...")
      const result = await createObviousRelationships()

      return NextResponse.json({
        success: true,
        action: "create-obvious",
        result,
        message: `Created ${result.created} obvious relationships`,
      })
    }

    if (action === "both") {
      console.log("Running both fixes...")
      const stagedResult = await fixMissingRelationships()
      const obviousResult = await createObviousRelationships()

      return NextResponse.json({
        success: true,
        action: "both",
        results: {
          staged: stagedResult,
          obvious: obviousResult,
        },
        message: `Fixed ${stagedResult.fixed} staged relationships and created ${obviousResult.created} obvious relationships`,
      })
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'fix-staged', 'create-obvious', or 'both'" },
      { status: 400 },
    )
  } catch (error) {
    console.error("Error fixing relationships:", error)
    return NextResponse.json({ error: "Failed to fix relationships" }, { status: 500 })
  }
}
