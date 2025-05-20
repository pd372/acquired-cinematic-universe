"use client"

import { useState, useEffect } from "react"
import type { GraphData } from "@/types/graph"

// Cache key for localStorage
const GRAPH_CACHE_KEY = "acquired_graph_data"
const CACHE_TTL = 3600 * 1000 // 1 hour in milliseconds

interface CachedData {
  data: GraphData
  timestamp: number
}

export function useGraphData() {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchGraphData() {
      try {
        setIsLoading(true)
        setError(null)

        // Try to get data from localStorage first
        const cachedData = getCachedData()

        if (cachedData) {
          console.log("Using cached graph data from localStorage")
          setGraphData(cachedData)
          setIsLoading(false)

          // Refresh in background if cache is older than 5 minutes
          if (Date.now() - cachedData.timestamp > 5 * 60 * 1000) {
            refreshDataInBackground()
          }

          return
        }

        // No cache or expired, fetch from API
        const data = await fetchFromApi()
        setGraphData(data)
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error occurred"))
        console.error("Error fetching graph data:", err)
      } finally {
        setIsLoading(false)
      }
    }

    async function refreshDataInBackground() {
      try {
        const data = await fetchFromApi()
        setGraphData(data)
      } catch (error) {
        console.error("Background refresh failed:", error)
        // Don't update error state to avoid UI disruption
      }
    }

    async function fetchFromApi(): Promise<GraphData> {
      const response = await fetch("/api/graph")

      if (!response.ok) {
        throw new Error(`Failed to fetch graph data: ${response.status}`)
      }

      const data = await response.json()

      // Check if the data has the expected structure
      if (!data || !data.nodes || !Array.isArray(data.nodes) || !data.links || !Array.isArray(data.links)) {
        console.warn("Graph API returned unexpected data structure:", data)
        throw new Error("Invalid data structure received from API")
      }

      // Cache the data in localStorage
      cacheData(data)

      return data
    }

    function getCachedData(): GraphData | null {
      try {
        if (typeof window === "undefined") return null

        const cachedJson = localStorage.getItem(GRAPH_CACHE_KEY)
        if (!cachedJson) return null

        const cached: CachedData = JSON.parse(cachedJson)

        // Check if cache is expired
        if (Date.now() - cached.timestamp > CACHE_TTL) {
          localStorage.removeItem(GRAPH_CACHE_KEY)
          return null
        }

        return cached.data
      } catch (error) {
        console.error("Error reading from cache:", error)
        return null
      }
    }

    function cacheData(data: GraphData) {
      try {
        if (typeof window === "undefined") return

        const cacheObject: CachedData = {
          data,
          timestamp: Date.now(),
        }

        localStorage.setItem(GRAPH_CACHE_KEY, JSON.stringify(cacheObject))
      } catch (error) {
        console.error("Error caching data:", error)
      }
    }

    fetchGraphData()
  }, [])

  return { graphData, isLoading, error }
}
