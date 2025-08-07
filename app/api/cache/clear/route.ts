import { NextResponse } from 'next/server'
import { clearCache } from '@/lib/cache'

export async function POST(request: Request) {
  try {
    const { key } = await request.json()
    if (!key) {
      return NextResponse.json({ error: 'Cache key is required' }, { status: 400 })
    }
    const cleared = clearCache(key)
    if (cleared) {
      console.log(`Cache key '${key}' cleared successfully.`)
      return NextResponse.json({ message: `Cache key '${key}' cleared.` })
    } else {
      console.log(`Cache key '${key}' not found.`)
      return NextResponse.json({ message: `Cache key '${key}' not found.` }, { status: 404 })
    }
  } catch (error: any) {
    console.error('Error clearing cache:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
