"use client"

import GraphVisualization from "@/components/graph-visualization"
import SearchBar from "@/components/search-bar"
import { Suspense, useState, useRef } from "react"

export default function Home() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("")
  const graphRef = useRef<{ highlightNode: (nodeId: string) => void }>(null)

  const handleNodeSelect = (nodeId: string) => {
    setSelectedNodeId(nodeId)
    // Call the graph's highlight function if available
    if (graphRef.current && nodeId) {
      graphRef.current.highlightNode(nodeId)
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-black text-white">
      <div className="w-full p-4 bg-black/50 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-md mx-auto">
          <SearchBar onNodeSelect={handleNodeSelect} />
        </div>
      </div>

      <div className="flex-1 w-full relative">
        <Suspense fallback={<div className="flex items-center justify-center h-full">Loading graph...</div>}>
          <GraphVisualization ref={graphRef} selectedNodeId={selectedNodeId} />
        </Suspense>
      </div>
    </main>
  )
}
