import GraphVisualization from "@/components/graph-visualization"
import { Suspense } from "react"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-black text-white">
      <div className="w-full h-screen relative">
        <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading graph...</div>}>
          <GraphVisualization />
        </Suspense>
      </div>
    </main>
  )
}
