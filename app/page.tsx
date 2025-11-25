"use client"

import GraphVisualization from "@/components/graph-visualization"
import SearchBar from "@/components/search-bar"
import CreateEntityModal from "@/components/create-entity-modal"
import { useAuth } from "@/components/auth-provider"
import { Suspense, useState, useRef } from "react"

export default function Home() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("")
  const [isCreateEntityOpen, setIsCreateEntityOpen] = useState(false)
  const graphRef = useRef<{ highlightNode: (nodeId: string) => void }>(null)
  const { isAdmin } = useAuth()

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

      {/* Floating Action Button to Create Entity - Only visible to admins */}
      {isAdmin && (
        <button
          onClick={() => setIsCreateEntityOpen(true)}
          className="fixed bottom-8 right-8 z-50 w-14 h-14 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
          title="Create New Entity"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      <div className="w-full h-full">
        <Suspense fallback={<div className="flex items-center justify-center h-full">Loading graph...</div>}>
          <GraphVisualization ref={graphRef} selectedNodeId={selectedNodeId} />
        </Suspense>
      </div>

      {/* Create Entity Modal */}
      {isAdmin && (
        <CreateEntityModal isOpen={isCreateEntityOpen} onClose={() => setIsCreateEntityOpen(false)} />
      )}
    </main>
  )
}
