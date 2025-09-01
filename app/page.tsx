"use client"

import GraphVisualization from "@/components/graph-visualization"
import SearchBar from "@/components/search-bar"
import { Suspense, useState, useRef } from "react"

export default function Home() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("")
  const graphRef = useRef<{ highlightNode: (nodeId: string) => void }>(null)

  const handleNodeSelect = (nodeId: string) => {
    setSelectedNodeId(nodeId)
    if (graphRef.current && nodeId) {
      graphRef.current.highlightNode(nodeId)
    }
  }

  return (
    <main className="h-screen bg-black text-white overflow-hidden relative">
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4">
        <SearchBar onNodeSelect={handleNodeSelect} />
      </div>

      <div className="w-full h-full">
        <Suspense fallback={<div className="flex items-center justify-center h-full">Loading graph...</div>}>
          <GraphVisualization ref={graphRef} selectedNodeId={selectedNodeId} />
        </Suspense>
      </div>
    </main>
  )
}
