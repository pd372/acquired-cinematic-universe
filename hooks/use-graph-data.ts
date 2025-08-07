import { useState, useEffect } from 'react'
import type { GraphData } from '@/types/graph'

export function useGraphData() {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchGraphData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const response = await fetch('/api/graph', {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        })
        
        if (!response.ok) {
          throw new Error(`Failed to fetch graph data: ${response.statusText}`)
        }
        
        const data = await response.json()
        setGraphData(data)
      } catch (err) {
        console.error('Error fetching graph data:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch graph data')
      } finally {
        setLoading(false)
      }
    }

    fetchGraphData()
  }) // No dependency array - fetch on every render

  return { graphData, loading, error }
}
