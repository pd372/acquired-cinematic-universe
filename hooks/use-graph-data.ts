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
        console.log("=== useGraphData: Starting fetch ===")
        setIsLoading(true)
        setError(null)

        // Check for cache bypass flag in localStorage (for debugging)
        const bypassCache = localStorage.getItem("bypass_graph_cache") === "true"

        if (!bypassCache) {
          // Try to get data from localStorage first
          const cachedData = getCachedData()

          if (cachedData) {
            console.log("Using cached graph data from localStorage")
            console.log("Cached data:", {
              nodes: cachedData.nodes?.length || 0,
              links: cachedData.links?.length || 0
            })
            setGraphData(cachedData)
            setIsLoading(false)

            // Refresh in background if cache is older than 5 minutes
            if (Date.now() - cachedData.timestamp > 5 * 60 * 1000) {
              console.log("Cache is stale, refreshing in background...")
              refreshDataInBackground()
            }

            return
          }
        } else {
          console.log("Bypassing localStorage cache due to bypass flag")
        }

        // No cache or expired, fetch from API
        console.log("No cache found, fetching from API...")
        const data = await fetchFromApi(bypassCache)
        setGraphData(data)
      } catch (err) {
        console.error("Error in fetchGraphData:", err)
        setError(err instanceof Error ? err : new Error("Unknown error occurred"))
      } finally {
        setIsLoading(false)
      }
    }

    async function refreshDataInBackground() {
      try {
        const data = await fetchFromApi(false)
        console.log("Background refresh completed")
        setGraphData(data)
      } catch (error) {
        console.error("Background refresh failed:", error)
        // Don't update error state to avoid UI disruption
      }
    }

    async function fetchFromApi(bypassCache = false): Promise<GraphData> {
      const url = bypassCache ? "/api/graph?bypass=true" : "/api/graph"
      console.log(`Fetching from ${url}...`)
      
      const response = await fetch(url, {
        // Add cache-busting headers when bypassing
        headers: bypassCache ? {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache"
        } : {}
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("API response not ok:", response.status, errorText)
        throw new Error(`Failed to fetch graph data: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      console.log("API response received:", {
        nodes: data.nodes?.length || 0,
        links: data.links?.length || 0,
        hasError: !!data.error
      })

      // Check for API error response
      if (data.error) {
        throw new Error(`API Error: ${data.error}${data.details ? ` - ${data.details}` : ''}`)
      }

      // Check if the data has the expected structure
      if (!data || !data.nodes || !Array.isArray(data.nodes) || !data.links || !Array.isArray(data.links)) {
        console.warn("Graph API returned unexpected data structure:", data)
        throw new Error("Invalid data structure received from API")
      }

      // Cache the data in localStorage only if not bypassing
      if (!bypassCache) {
        cacheData(data)
      }

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
          console.log("Cache expired, removing...")
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
        console.log("Data cached successfully")
      } catch (error) {
        console.error("Error caching data:", error)
      }
    }

    fetchGraphData()
  }, [])

  // Function to clear client-side cache (can be called from components)
  const clearClientCache = () => {
    try {
      localStorage.removeItem(GRAPH_CACHE_KEY)
      localStorage.removeItem("bypass_graph_cache")
      console.log("Client-side cache cleared")
    } catch (error) {
      console.error("Error clearing client-side cache:", error)
    }
  }

  // Function to enable cache bypass (for debugging)
  const enableCacheBypass = () => {
    localStorage.setItem("bypass_graph_cache", "true")
    console.log("Cache bypass enabled")
  }

  // Function to disable cache bypass
  const disableCacheBypass = () => {
    localStorage.removeItem("bypass_graph_cache")
    console.log("Cache bypass disabled")
  }

  return { 
    graphData, 
    isLoading, 
    error, 
    clearClientCache, 
    enableCacheBypass, 
    disableCacheBypass 
  }
}
