import { NextRequest, NextResponse } from 'next/server'
import { clearAllCache } from '@/lib/cache'
import { verifyAuthHeader } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    if (!verifyAuthHeader(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    clearAllCache()
    console.log('All cache cleared successfully.')
    return NextResponse.json({ message: 'All cache cleared.' })
  } catch (error: any) {
    console.error('Error clearing all cache:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
