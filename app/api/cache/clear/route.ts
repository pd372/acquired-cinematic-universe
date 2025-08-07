import { NextRequest, NextResponse } from 'next/server'
import { clearCache } from '@/lib/cache'

export async function POST(request: NextRequest) {
  try {
    const { tag } = await request.json()
    
    if (!tag) {
      return NextResponse.json(
        { error: 'Cache tag is required' },
        { status: 400 }
      )
    }
    
    await clearCache(tag)
    
    return NextResponse.json({ 
      success: true, 
      message: `Cache cleared for tag: ${tag}` 
    })
  } catch (error) {
    console.error('Error clearing cache:', error)
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 }
    )
  }
}
