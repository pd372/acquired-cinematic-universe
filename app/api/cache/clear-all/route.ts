import { NextResponse } from 'next/server'
import { clearAllCache } from '@/lib/cache'

export async function POST() {
  try {
    clearAllCache()
    console.log('All cache cleared successfully.')
    return NextResponse.json({ message: 'All cache cleared.' })
  } catch (error: any) {
    console.error('Error clearing all cache:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
