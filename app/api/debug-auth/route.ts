import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { testKey } = await request.json()
    const authHeader = request.headers.get("authorization")
    const expectedKey = process.env.INTERNAL_API_KEY

    console.log("=== AUTH DEBUG ===")
    console.log("Environment key exists:", !!expectedKey)
    console.log("Environment key length:", expectedKey?.length || 0)
    console.log("Environment key first 10 chars:", expectedKey?.substring(0, 10) || "none")
    console.log("Environment key last 10 chars:", expectedKey?.substring(-10) || "none")
    console.log("")
    console.log("Auth header:", authHeader)
    console.log("Auth header length:", authHeader?.length || 0)
    console.log("")
    console.log("Test key from request:", testKey)
    console.log("Test key length:", testKey?.length || 0)
    console.log("")
    console.log("Expected format:", `Bearer ${expectedKey}`)
    console.log("Actual format:", authHeader)
    console.log("Match:", authHeader === `Bearer ${expectedKey}`)

    return NextResponse.json({
      success: true,
      debug: {
        envKeyExists: !!expectedKey,
        envKeyLength: expectedKey?.length || 0,
        envKeyPreview: expectedKey ? `${expectedKey.substring(0, 4)}...${expectedKey.substring(-4)}` : "none",
        authHeaderExists: !!authHeader,
        authHeaderLength: authHeader?.length || 0,
        authHeaderPreview: authHeader ? `${authHeader.substring(0, 20)}...` : "none",
        testKeyLength: testKey?.length || 0,
        expectedFormat: `Bearer ${expectedKey?.substring(0, 4)}...`,
        actualFormat: authHeader?.substring(0, 20) + "..." || "none",
        match: authHeader === `Bearer ${expectedKey}`,
      },
    })
  } catch (error) {
    console.error("Debug auth error:", error)
    return NextResponse.json({ error: "Debug failed" }, { status: 500 })
  }
}
