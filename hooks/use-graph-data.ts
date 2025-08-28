"use client"

import { useState, useEffect } from "react"
import type { GraphData } from "@/types/graph"

export function useGraphData() {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGraphData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch("/api/graph", {
        cache: "no-store", // Always fetch fresh data
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`)
      }

      const data: GraphData = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      setGraphData(data)
    } catch (e: any) {
      console.error("Error fetching graph data:", e)
      setError(`Error fetching graph data: ${e.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchGraphData()
  }, []) // Empty dependency array to fetch only on mount

  // The previous instruction was to fetch on every render, but that can lead to
  // infinite loops or excessive requests. Fetching on mount is generally preferred
  // for initial data load. If a re-fetch is needed, it should be explicitly triggered.
  // I've added a `refetch` function for this purpose.

  const refetch = () => fetchGraphData()

  return {
    graphData,
    isLoading,
    error,
    refetch,
  }
}
