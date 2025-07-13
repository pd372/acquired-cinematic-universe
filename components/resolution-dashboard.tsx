"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, RefreshCw, Play, Trash, Key, Bug, GitMerge } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface StagingStats {
  pendingEntities: number
  pendingRelationships: number
  processedEntities: number
  processedRelationships: number
}

interface CacheStats {
  keys: number
  hits: number
  misses: number
  ksize: number
  vsize: number
}

interface ResolutionResult {
  entitiesProcessed: number
  entitiesCreated: number
  entitiesMerged: number
  relationshipsProcessed: number
  relationshipsCreated: number
  relationshipsSkipped: number
  errors: number
  timeTaken: number
  mergeDetails?: Array<{ source: string; target: string; reason: string }>
  robustMode?: boolean
}

export default function ResolutionDashboard() {
  const [stats, setStats] = useState<StagingStats | null>(null)
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<ResolutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [robustResult, setRobustResult] = useState<any>(null)

  // API Key dialog state
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null)

  // Fetch stats on load and periodically (no auth needed for stats)
  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  async function fetchStats() {
    try {
      setIsLoading(true)
      // Try to fetch stats without auth first (public endpoint)
      const response = await fetch("/api/staging-stats")

      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.status}`)
      }

      const data = await response.json()
      setStats(data.stats)
      setCacheStats(data.cacheStats)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch stats")
      console.error("Error fetching stats:", err)
    } finally {
      setIsLoading(false)
    }
  }

  async function debugAuth() {
    if (!apiKey.trim()) {
      setError("Please enter an API key to debug")
      return
    }

    try {
      setError(null)
      console.log("Debugging auth with API key length:", apiKey.length)

      const response = await fetch("/api/debug-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ testKey: apiKey }),
      })

      const data = await response.json()
      setDebugInfo(data.debug)
      console.log("Debug response:", data)

      if (!data.debug?.match) {
        setError("API key mismatch detected. Check the debug info below.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Debug failed")
      console.error("Debug error:", err)
    }
  }

  function promptForApiKey(action: () => Promise<void>) {
    setPendingAction(() => action)
    setShowApiKeyDialog(true)
    setApiKey("")
    setError(null) // Clear any previous errors
  }

  async function executeWithApiKey() {
    if (!apiKey.trim()) {
      setError("Please enter an API key")
      return
    }

    if (!pendingAction) return

    try {
      setShowApiKeyDialog(false)
      await pendingAction()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed")
      console.error("Operation error:", err)
    } finally {
      setPendingAction(null)
      setApiKey("")
    }
  }

  async function runResolution(params: {
    entityBatchSize?: number
    relationshipBatchSize?: number
    maxBatches?: number
    clearOlderThan?: number
    clearCache?: boolean
  }) {
    try {
      setIsRunning(true)
      setError(null)

      console.log("Making resolution request with API key length:", apiKey.length)

      const response = await fetch("/api/resolve-entities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(params),
      })

      console.log("Resolution response status:", response.status)

      if (response.status === 401) {
        const errorData = await response.json().catch(() => ({ error: "Unauthorized" }))
        throw new Error(`Authentication failed: ${errorData.error || "Invalid API key"}`)
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(`Failed to run resolution (${response.status}): ${errorData.error || response.statusText}`)
      }

      const data = await response.json()
      console.log("Resolution response data:", data)

      setResult(data.result)
      setStats(data.stats)
      setCacheStats(data.cacheStats)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to run resolution"
      setError(errorMessage)
      console.error("Error running resolution:", err)
    } finally {
      setIsRunning(false)
    }
  }

  async function runRobustRelationshipResolution(batchSize = 100) {
    try {
      setIsRunning(true)
      setError(null)

      console.log("Making robust relationship resolution request with API key length:", apiKey.length)

      const response = await fetch("/api/resolve-relationships-robust", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ batchSize }),
      })

      console.log("Robust relationship resolution response status:", response.status)

      if (response.status === 401) {
        const errorData = await response.json().catch(() => ({ error: "Unauthorized" }))
        throw new Error(`Authentication failed: ${errorData.error || "Invalid API key"}`)
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(
          `Failed to run robust resolution (${response.status}): ${errorData.error || response.statusText}`,
        )
      }

      const data = await response.json()
      console.log("Robust relationship resolution response data:", data)

      setRobustResult(data.result)
      setStats(data.stats)

      // Also update the main result to show in the Results tab
      setResult({
        ...data.result,
        entitiesProcessed: 0,
        entitiesCreated: 0,
        entitiesMerged: 0,
        relationshipsProcessed: data.result.processed,
        relationshipsCreated: data.result.created,
        relationshipsSkipped: data.result.skipped,
        errors: data.result.errors,
        timeTaken: 0,
        robustMode: true,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to run robust relationship resolution"
      setError(errorMessage)
      console.error("Error running robust relationship resolution:", err)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <>
      <Card className="w-full max-w-4xl bg-gray-900 border-gray-800 text-white">
        <CardHeader>
          <CardTitle className="text-[#00E5C7] flex items-center justify-between">
            Resolution Dashboard
            <Button
              variant="outline"
              size="icon"
              onClick={fetchStats}
              disabled={isLoading}
              className="h-8 w-8 rounded-full bg-transparent"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </CardTitle>
          <CardDescription>Monitor and manage the entity resolution process</CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="stats">
            <TabsList className="bg-gray-800">
              <TabsTrigger value="stats">Statistics</TabsTrigger>
              <TabsTrigger value="actions">Actions</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
              <TabsTrigger value="debug">Debug</TabsTrigger>
            </TabsList>

            <TabsContent value="stats" className="space-y-4 mt-4">
              {error && (
                <div className="bg-red-900/30 border border-red-700 p-3 rounded-md text-red-300">
                  <div className="font-medium">Error:</div>
                  <div className="text-sm mt-1">{error}</div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-800 p-4 rounded-md">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Staging Area</h3>
                  {stats ? (
                    <dl className="space-y-2">
                      <div className="flex justify-between">
                        <dt>Pending Entities:</dt>
                        <dd className="font-mono">{stats.pendingEntities}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Pending Relationships:</dt>
                        <dd className="font-mono">{stats.pendingRelationships}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Processed Entities:</dt>
                        <dd className="font-mono">{stats.processedEntities}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Processed Relationships:</dt>
                        <dd className="font-mono">{stats.processedRelationships}</dd>
                      </div>
                    </dl>
                  ) : (
                    <div className="text-gray-500">Loading stats...</div>
                  )}
                </div>

                <div className="bg-gray-800 p-4 rounded-md">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Entity Cache</h3>
                  {cacheStats ? (
                    <dl className="space-y-2">
                      <div className="flex justify-between">
                        <dt>Cached Entities:</dt>
                        <dd className="font-mono">{cacheStats.keys}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Cache Hits:</dt>
                        <dd className="font-mono">{cacheStats.hits}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Cache Misses:</dt>
                        <dd className="font-mono">{cacheStats.misses}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Hit Ratio:</dt>
                        <dd className="font-mono">
                          {cacheStats.hits + cacheStats.misses > 0
                            ? `${((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1)}%`
                            : "N/A"}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <div className="text-gray-500">Loading cache stats...</div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="actions" className="space-y-4 mt-4">
              <div className="bg-gray-800 p-4 rounded-md">
                <h3 className="text-sm font-medium text-gray-400 mb-4">Run Resolution</h3>

                <div className="space-y-4">
                  <Button
                    onClick={() =>
                      promptForApiKey(() =>
                        runResolution({ entityBatchSize: 100, relationshipBatchSize: 100, maxBatches: 5 }),
                      )
                    }
                    disabled={isRunning}
                    className="bg-[#00E5C7] text-black hover:bg-[#00C7AD] w-full"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Run Standard Resolution (5 batches)
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={() =>
                      promptForApiKey(() =>
                        runResolution({ entityBatchSize: 100, relationshipBatchSize: 100, maxBatches: 20 }),
                      )
                    }
                    disabled={isRunning}
                    variant="outline"
                    className="w-full"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Run Full Resolution (20 batches)
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={() =>
                      promptForApiKey(() =>
                        runResolution({
                          entityBatchSize: 50,
                          relationshipBatchSize: 50,
                          maxBatches: 2,
                          clearCache: true,
                        }),
                      )
                    }
                    disabled={isRunning}
                    variant="outline"
                    className="w-full"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Clear Cache & Run Test Resolution
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={() => promptForApiKey(() => runResolution({ clearOlderThan: 7 }))}
                    disabled={isRunning}
                    variant="destructive"
                    className="w-full"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Trash className="mr-2 h-4 w-4" />
                        Clean Up Processed Items (Older than 7 days)
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="bg-gray-800 p-4 rounded-md mt-4">
                <h3 className="text-sm font-medium text-gray-400 mb-4">Robust Relationship Resolution</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Advanced relationship resolution with cross-validation and business logic. Use this when standard
                  resolution misses obvious connections.
                </p>

                <div className="space-y-4">
                  <Button
                    onClick={() => promptForApiKey(() => runRobustRelationshipResolution(100))}
                    disabled={isRunning}
                    className="bg-purple-600 text-white hover:bg-purple-700 w-full"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <GitMerge className="mr-2 h-4 w-4" />
                        Run Robust Relationship Resolution
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={() => promptForApiKey(() => runRobustRelationshipResolution(50))}
                    disabled={isRunning}
                    variant="outline"
                    className="w-full"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Test Robust Resolution (50 items)
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="results" className="space-y-4 mt-4">
              {result ? (
                <div className="space-y-4">
                  <div className="bg-gray-800 p-4 rounded-md">
                    <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center">
                      {result.robustMode ? (
                        <>
                          <GitMerge className="mr-2 h-4 w-4" />
                          Last Robust Relationship Resolution Results
                        </>
                      ) : (
                        "Last Resolution Results"
                      )}
                    </h3>

                    <dl className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <dt className="text-xs text-gray-500">Entities Processed</dt>
                          <dd className="text-lg font-mono">{result.entitiesProcessed}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Entities Created</dt>
                          <dd className="text-lg font-mono">{result.entitiesCreated}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Entities Merged</dt>
                          <dd className="text-lg font-mono">{result.entitiesMerged}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Relationships Processed</dt>
                          <dd className="text-lg font-mono">{result.relationshipsProcessed}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Relationships Created</dt>
                          <dd className="text-lg font-mono">{result.relationshipsCreated}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Relationships Skipped</dt>
                          <dd className="text-lg font-mono">{result.relationshipsSkipped}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Errors</dt>
                          <dd className="text-lg font-mono">{result.errors}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Time Taken</dt>
                          <dd className="text-lg font-mono">{(result.timeTaken / 1000).toFixed(2)}s</dd>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-gray-700">
                        <dt className="text-xs text-gray-500 mb-1">Performance</dt>
                        <dd className="grid grid-cols-2 gap-2">
                          <div className="bg-gray-900 p-2 rounded">
                            <span className="text-xs text-gray-500">Entities/sec</span>
                            <div className="text-lg font-mono">
                              {result.entitiesProcessed > 0
                                ? (result.entitiesProcessed / (result.timeTaken / 1000)).toFixed(2)
                                : "0"}
                            </div>
                          </div>
                          <div className="bg-gray-900 p-2 rounded">
                            <span className="text-xs text-gray-500">Relationships/sec</span>
                            <div className="text-lg font-mono">
                              {result.relationshipsProcessed > 0
                                ? (result.relationshipsProcessed / (result.timeTaken / 1000)).toFixed(2)
                                : "0"}
                            </div>
                          </div>
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Merge Details */}
                  {result.mergeDetails && result.mergeDetails.length > 0 && (
                    <div className="bg-gray-800 p-4 rounded-md">
                      <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center">
                        <GitMerge className="mr-2 h-4 w-4" />
                        Entity Merges ({result.mergeDetails.length})
                      </h3>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {result.mergeDetails.map((merge, index) => (
                          <div key={index} className="bg-gray-900 p-3 rounded text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-yellow-400">"{merge.source}"</span>
                              <span className="text-gray-500 mx-2">→</span>
                              <span className="text-green-400">"{merge.target}"</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">{merge.reason}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-800 p-4 rounded-md text-center text-gray-500">
                  No resolution has been run yet. Go to the Actions tab to run a resolution.
                </div>
              )}

              {/* Robust Relationship Results */}
              {robustResult && (
                <div className="bg-gray-800 p-4 rounded-md mt-4">
                  <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center">
                    <GitMerge className="mr-2 h-4 w-4" />
                    Robust Relationship Resolution Results
                  </h3>

                  <dl className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <dt className="text-xs text-gray-500">Relationships Processed</dt>
                        <dd className="text-lg font-mono">{robustResult.processed}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Relationships Created</dt>
                        <dd className="text-lg font-mono text-green-400">{robustResult.created}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Relationships Skipped</dt>
                        <dd className="text-lg font-mono text-yellow-400">{robustResult.skipped}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Errors</dt>
                        <dd className="text-lg font-mono text-red-400">{robustResult.errors}</dd>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-700">
                      <dt className="text-xs text-gray-500 mb-1">Success Rate</dt>
                      <dd className="text-lg font-mono">
                        {robustResult.created + robustResult.skipped > 0
                          ? `${((robustResult.created / (robustResult.created + robustResult.skipped)) * 100).toFixed(1)}%`
                          : "0%"}
                      </dd>
                    </div>
                  </dl>

                  {/* Detailed Results */}
                  {robustResult.details && robustResult.details.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-medium text-gray-400 mb-2">Detailed Results (Top 10)</h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {robustResult.details.slice(0, 10).map((detail, index) => (
                          <div key={index} className="bg-gray-900 p-3 rounded text-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-blue-400">"{detail.source}"</span>
                              <span className="text-gray-500 mx-2">→</span>
                              <span className="text-green-400">"{detail.target}"</span>
                              <span className="text-xs text-gray-500 ml-2">
                                {(detail.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="text-xs text-gray-400">{detail.result}</div>
                          </div>
                        ))}
                        {robustResult.details.length > 10 && (
                          <div className="text-xs text-gray-500 text-center py-2">
                            ... and {robustResult.details.length - 10} more results
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="debug" className="space-y-4 mt-4">
              <div className="bg-gray-800 p-4 rounded-md">
                <h3 className="text-sm font-medium text-gray-400 mb-4">Authentication Debug</h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="debugApiKey">Test API Key</Label>
                    <Input
                      id="debugApiKey"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your internal API key to test"
                      className="bg-gray-700 border-gray-600"
                    />
                  </div>

                  <Button
                    onClick={debugAuth}
                    disabled={!apiKey.trim()}
                    className="w-full bg-transparent"
                    variant="outline"
                  >
                    <Bug className="mr-2 h-4 w-4" />
                    Debug Authentication
                  </Button>

                  {debugInfo && (
                    <div className="bg-gray-900 p-4 rounded-md">
                      <h4 className="text-sm font-medium text-gray-400 mb-2">Debug Results</h4>
                      <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <dt>Environment Key Exists:</dt>
                          <dd className={debugInfo.envKeyExists ? "text-green-400" : "text-red-400"}>
                            {debugInfo.envKeyExists ? "Yes" : "No"}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Environment Key Length:</dt>
                          <dd className="font-mono">{debugInfo.envKeyLength}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Environment Key Preview:</dt>
                          <dd className="font-mono">{debugInfo.envKeyPreview}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Your Key Length:</dt>
                          <dd className="font-mono">{debugInfo.testKeyLength}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Auth Header Length:</dt>
                          <dd className="font-mono">{debugInfo.authHeaderLength}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Keys Match:</dt>
                          <dd className={debugInfo.match ? "text-green-400" : "text-red-400"}>
                            {debugInfo.match ? "Yes" : "No"}
                          </dd>
                        </div>
                      </dl>

                      {!debugInfo.match && (
                        <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
                          <div className="font-medium">Key Mismatch Detected</div>
                          <div className="mt-1">
                            The API key you entered doesn't match the INTERNAL_API_KEY environment variable. Check for:
                            <ul className="list-disc list-inside mt-1 ml-2">
                              <li>Extra spaces or newlines</li>
                              <li>Different key values</li>
                              <li>Environment variable not set</li>
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="border-t border-gray-800 pt-4">
          <div className="text-xs text-gray-500">Last updated: {new Date().toLocaleTimeString()}</div>
        </CardFooter>
      </Card>

      {/* API Key Dialog */}
      <Dialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-[#00E5C7] flex items-center">
              <Key className="mr-2 h-5 w-5" />
              API Key Required
            </DialogTitle>
            <DialogDescription>Enter your internal API key to execute this operation.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dialogApiKey">Internal API Key</Label>
              <Input
                id="dialogApiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your internal API key"
                className="bg-gray-800 border-gray-700"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    executeWithApiKey()
                  }
                }}
              />
              <div className="text-xs text-gray-500">This should match your INTERNAL_API_KEY environment variable</div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApiKeyDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={executeWithApiKey}
              disabled={!apiKey.trim()}
              className="bg-[#00E5C7] text-black hover:bg-[#00C7AD]"
            >
              Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
