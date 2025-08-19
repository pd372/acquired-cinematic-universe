"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import * as d3 from "d3"
import NodeDetailModal from "./node-detail-modal"
import { useMobile } from "@/hooks/use-mobile"

interface GraphNode {
  id: string
  name: string
  type: string
  connections: number
  description?: string
  episodes?: Array<{
    id: string
    title: string
    url?: string
    date?: string
  }>
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  value: number
  description?: string
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

interface GraphVisualizationProps {
  graphData?: GraphData | null
}

export default function GraphVisualization({ graphData: propGraphData }: GraphVisualizationProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [graphData, setGraphData] = useState<GraphData | null>(propGraphData || null)
  const [isLoading, setIsLoading] = useState(!propGraphData)
  const [error, setError] = useState<string | null>(null)
  const { isMobile } = useMobile()

  // Fetch graph data if not provided as prop
  useEffect(() => {
    if (!propGraphData) {
      const fetchGraphData = async () => {
        try {
          setIsLoading(true)
          setError(null)
          console.log("Fetching graph data from API...")

          const response = await fetch("/api/graph", {
            cache: "no-store",
          })

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`HTTP ${response.status}: ${errorText}`)
          }

          const data = await response.json()
          console.log("Received graph data:", data)

          if (data.error) {
            throw new Error(data.error)
          }

          setGraphData(data)
        } catch (e: any) {
          console.error("Error fetching graph data:", e)
          setError(e.message)
        } finally {
          setIsLoading(false)
        }
      }

      fetchGraphData()
    } else {
      setGraphData(propGraphData)
      setIsLoading(false)
    }
  }, [propGraphData])

  const handleNodeClick = useCallback((event: MouseEvent, d: GraphNode) => {
    setSelectedNode(d)
    setIsModalOpen(true)
  }, [])

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false)
    setSelectedNode(null)
  }, [])

  useEffect(() => {
    if (!graphData || !svgRef.current || isLoading) {
      return
    }

    console.log("Rendering graph with", graphData.nodes.length, "nodes and", graphData.links.length, "links")

    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove() // Clear previous graph

    // If no data, show message
    if (graphData.nodes.length === 0) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .style("font-size", "18px")
        .style("fill", "#666")
        .text("No graph data available")
      return
    }

    const g = svg.append("g") // Group for zooming and panning

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        g.attr("transform", event.transform.toString())
      })

    svg.call(zoom as any)

    const simulation = d3
      .forceSimulation<GraphNode, GraphLink>(graphData.nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(graphData.links)
          .id((d) => d.id)
          .distance(120), // Increased distance to make room for labels
      )
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3
          .forceCollide<GraphNode>()
          .radius((d) => 3 + d.connections * 1 + 15) // More space for external labels
          .iterations(2),
      )

    const link = g
      .append("g")
      .attr("stroke", "#4a5568") // Darker gray for better contrast
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(graphData.links)
      .join("line")
      .attr("stroke-width", (d) => Math.sqrt(d.value))
      .attr("class", "graph-link")

    const node = g
      .append("g")
      .attr("stroke", "none") // Remove stroke for solid color
      .selectAll("circle")
      .data(graphData.nodes)
      .join("circle")
      .attr("r", (d) => 3 + d.connections * 1)
      .attr("fill", "#6b7280") // Gray by default
      .style("cursor", "pointer")
      .attr("class", "graph-node")
      .call(d3.drag<SVGCircleElement, GraphNode>().on("start", dragstarted).on("drag", dragged).on("end", dragended))
      .on("click", handleNodeClick)
      .on("mouseover", function (event, d) {
        // Highlight the hovered node with solid teal
        d3.select(this)
          .transition()
          .duration(200)
          .attr("fill", "#14b8a6") // Solid teal color
          .attr("r", (3 + d.connections * 1) * 1.2)

        // Highlight connected edges with solid teal
        link
          .transition()
          .duration(200)
          .attr("stroke", (linkData) => {
            const source = typeof linkData.source === "string" ? linkData.source : linkData.source.id
            const target = typeof linkData.target === "string" ? linkData.target : linkData.target.id
            return source === d.id || target === d.id ? "#14b8a6" : "#4a5568" // Solid teal for connected edges
          })
          .attr("stroke-opacity", (linkData) => {
            const source = typeof linkData.source === "string" ? linkData.source : linkData.source.id
            const target = typeof linkData.target === "string" ? linkData.target : linkData.target.id
            return source === d.id || target === d.id ? 1 : 0.6
          })
          .attr("stroke-width", (linkData) => {
            const source = typeof linkData.source === "string" ? linkData.source : linkData.source.id
            const target = typeof linkData.target === "string" ? linkData.target : linkData.target.id
            return source === d.id || target === d.id ? Math.sqrt(linkData.value) * 1.5 : Math.sqrt(linkData.value)
          })

        // Highlight the label for the hovered node
        labels
          .transition()
          .duration(200)
          .style("fill", (labelData) => (labelData.id === d.id ? "#ffffff" : "#e2e8f0")) // White for hovered, light gray for others
          .style("font-weight", (labelData) => (labelData.id === d.id ? "bold" : "normal"))
      })
      .on("mouseout", function (event, d) {
        // Reset the hovered node
        d3.select(this)
          .transition()
          .duration(200)
          .attr("fill", "#6b7280") // Back to gray
          .attr("r", 3 + d.connections * 1)

        // Reset all edges
        link
          .transition()
          .duration(200)
          .attr("stroke", "#4a5568")
          .attr("stroke-opacity", 0.6)
          .attr("stroke-width", (linkData) => Math.sqrt(linkData.value))

        // Reset all labels
        labels
          .transition()
          .duration(200)
          .style("fill", "#e2e8f0") // Back to light gray
          .style("font-weight", (d) => (d.type.toLowerCase() === "episode" ? "bold" : "normal"))
      })

    const labels = g
      .append("g")
      .attr("class", "labels")
      .selectAll("text")
      .data(graphData.nodes)
      .join("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .style("font-size", (d) => {
        const baseSize = 10
        const size = baseSize + d.connections * 0.3
        return `${Math.min(size, 16)}px`
      })
      .style("fill", "#e2e8f0") // Light gray for better contrast
      .style("pointer-events", "none")
      .text((d) => d.name)
      .style("font-weight", (d) => (d.type.toLowerCase() === "episode" ? "bold" : "normal"))
      .attr("dy", (d) => -(3 + d.connections * 1 + 8)) // Position labels above the nodes

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x!)
        .attr("y1", (d) => (d.source as GraphNode).y!)
        .attr("x2", (d) => (d.target as GraphNode).x!)
        .attr("y2", (d) => (d.target as GraphNode).y!)

      node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!)

      labels.attr("x", (d) => d.x!).attr("y", (d) => d.y!)
    })

    function dragstarted(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    }

    function dragged(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) {
      d.fx = event.x
      d.fy = event.y
    }

    function dragended(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
    }

    return () => {
      simulation.stop()
    }
  }, [graphData, handleNodeClick, isLoading])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading graph data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-red-600 mb-4">Error loading graph data</div>
          <p className="text-gray-600 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[500px] bg-gray-50 dark:bg-gray-950 rounded-lg shadow-inner">
      <svg ref={svgRef} className="w-full h-full"></svg>
      <NodeDetailModal node={selectedNode} isOpen={isModalOpen} onClose={handleModalClose} />
    </div>
  )
}
