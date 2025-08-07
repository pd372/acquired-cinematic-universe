import { NextResponse } from 'next/server'
import { clearAllCache } from '@/lib/cache'

export async function POST() {
  try {
    await clearAllCache()
    
    return NextResponse.json({ 
      success: true, 
      message: 'All caches cleared successfully' 
    })
  } catch (error) {
    console.error('Error clearing all caches:', error)
    return NextResponse.json(
      { error: 'Failed to clear all caches' },
      { status: 500 }
    )
  }
}
