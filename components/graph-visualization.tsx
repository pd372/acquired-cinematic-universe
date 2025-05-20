"use client"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"
import type { NodeData, LinkData } from "@/types/graph"
import NodeDetailModal from "./node-detail-modal"
import { useGraphData } from "@/hooks/use-graph-data"
import SearchBar from "./search-bar"

export default function GraphVisualization() {
  const svgRef = useRef<SVGSVGElement>(null)
  const { graphData, isLoading, error } = useGraphData()
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null)
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null)
  const simulationRef = useRef<d3.Simulation<d3.SimulationNodeDatum, undefined> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<Element, unknown> | null>(null)
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)

  useEffect(() => {
    // Check if we have valid graph data with nodes and links
    if (!graphData || !svgRef.current || !graphData.nodes || !graphData.links || graphData.nodes.length === 0) {
      return
    }

    const svg = d3.select(svgRef.current)
    const width = window.innerWidth
    const height = window.innerHeight

    // Clear previous graph
    svg.selectAll("*").remove()

    // Create the simulation with reduced forces
    const simulation = d3
      .forceSimulation(graphData.nodes)
      .force(
        "link",
        d3
          .forceLink(graphData.links)
          .id((d: any) => d.id)
          .distance(100),
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3.forceCollide().radius((d) => (d as NodeData).connections * 2 + 20),
      )
      // Disable automatic alpha decay to prevent constant movement
      .alphaDecay(0.05) // Increase decay rate to stabilize faster
      .velocityDecay(0.7) // Increase velocity decay to reduce movement

    // Store simulation in ref for later use
    simulationRef.current = simulation

    // Create a group for the zoom functionality
    const g = svg.append("g")
    gRef.current = g

    // Add zoom behavior
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        g.attr("transform", event.transform)
      })

    zoomRef.current = zoom
    svg.call(zoom as any)

    // Create the links
    const link = g
      .append("g")
      .attr("stroke", "#555")
      .attr("stroke-opacity", 0.4)
      .selectAll("line")
      .data(graphData.links)
      .join("line")
      .attr("stroke-width", (d: LinkData) => Math.sqrt(d.value))
      .attr("data-source", (d: any) => d.source.id || d.source)
      .attr("data-target", (d: any) => d.target.id || d.target)

    // Create a group for each node
    const nodeGroup = g
      .append("g")
      .selectAll(".node-group")
      .data(graphData.nodes)
      .join("g")
      .attr("class", "node-group")
      .attr("data-id", (d: NodeData) => d.id)
      .call(drag(simulation) as any)
      .on("mouseover", handleNodeHover)
      .on("mouseout", handleNodeUnhover)
      .on("click", (event, d: NodeData) => {
        event.stopPropagation()
        setSelectedNode(d)
      })

    // Add the circle for each node
    nodeGroup
      .append("circle")
      .attr("r", (d: NodeData) => 3 + d.connections * 1)
      .attr("fill", "#e0e0e0") // Keep original neutral color
      .attr("stroke", "#999")
      .attr("stroke-width", 1)

    // Add the text label for each node
    nodeGroup
      .append("text")
      .attr("dx", (d: NodeData) => 8 + d.connections)
      .attr("dy", 4)
      .attr("font-size", "10px")
      .attr("pointer-events", "none")
      .text((d: NodeData) => d.name)
      .attr("fill", "#e0e0e0")
      .attr("class", "node-label")

    // Function to handle node hover - ONLY highlight, don't center
    function handleNodeHover(event: any, d: NodeData) {
      highlightNodeOnly(d.id)
    }

    // Function to handle node unhover
    function handleNodeUnhover() {
      if (!highlightedNodeId) {
        resetHighlighting()
      }
    }

    // Update positions on each tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y)

      nodeGroup.attr("transform", (d: any) => `translate(${d.x}, ${d.y})`)
    })

    // Close modal when clicking on the background
    svg.on("click", () => setSelectedNode(null))

    // Handle window resize
    const handleResize = () => {
      simulation.force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2)).restart()
    }

    window.addEventListener("resize", handleResize)

    // Run the simulation for a fixed number of ticks and then stop it
    // This helps position the nodes initially without continuous movement
    simulation.alpha(1).restart()

    // Stop the simulation after a short time to prevent continuous movement
    setTimeout(() => {
      simulation.stop()
    }, 3000)

    return () => {
      window.removeEventListener("resize", handleResize)
      simulation.stop()
    }
  }, [graphData])

  // Function to ONLY highlight a node without centering
  const highlightNodeOnly = (nodeId: string) => {
    if (!svgRef.current || !graphData || !graphData.nodes || !graphData.links) return

    // If nodeId is empty, reset highlighting
    if (!nodeId) {
      resetHighlighting()
      return
    }

    setHighlightedNodeId(nodeId)

    const svg = d3.select(svgRef.current)

    // Get all connected nodes
    const connectedNodeIds = new Set<string>()
    connectedNodeIds.add(nodeId)

    // Find all links connected to this node
    const connectedLinks = graphData.links.filter((link) => {
      const sourceId = typeof link.source === "string" ? link.source : link.source.id
      const targetId = typeof link.target === "string" ? link.target : link.target.id

      if (sourceId === nodeId) {
        connectedNodeIds.add(targetId)
        return true
      }
      if (targetId === nodeId) {
        connectedNodeIds.add(sourceId)
        return true
      }
      return false
    })

    // Highlight the current node
    svg
      .selectAll(".node-group")
      .filter((d: any) => d.id === nodeId)
      .select("circle")
      .transition()
      .duration(200)
      .attr("fill", "#00E5C7")
      .attr("stroke", "#00E5C7")
      .attr("stroke-width", 2)

    // Make text bigger
    svg
      .selectAll(".node-group")
      .filter((d: any) => d.id === nodeId)
      .select("text")
      .transition()
      .duration(200)
      .attr("font-size", "14px")
      .attr("font-weight", "bold")
      .attr("fill", "#ffffff")

    // Highlight connected links
    svg.selectAll("line").each(function (this: any, d: any) {
      const sourceId = typeof d.source === "string" ? d.source : d.source.id
      const targetId = typeof d.target === "string" ? d.target : d.target.id

      if (sourceId === nodeId || targetId === nodeId) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("stroke", "#00E5C7")
          .attr("stroke-opacity", 1)
          .attr("stroke-width", Math.sqrt(d.value) * 2)
      }
    })

    // Gray out unrelated nodes
    svg.selectAll(".node-group").each(function (this: any, d: any) {
      if (!connectedNodeIds.has(d.id) && d.id !== nodeId) {
        d3.select(this).transition().duration(200).style("opacity", 0.3)
      } else if (d.id !== nodeId) {
        // Keep connected nodes visible but don't highlight them
        d3.select(this).transition().duration(200).style("opacity", 1)
      }
    })

    // Gray out unrelated links
    svg.selectAll("line").each(function (this: any, d: any) {
      const sourceId = typeof d.source === "string" ? d.source : d.source.id
      const targetId = typeof d.target === "string" ? d.target : d.target.id

      if (sourceId !== nodeId && targetId !== nodeId) {
        d3.select(this).transition().duration(200).style("opacity", 0.1)
      }
    })
  }

  // Function to reset highlighting
  const resetHighlighting = () => {
    if (!svgRef.current) return

    setHighlightedNodeId(null)

    const svg = d3.select(svgRef.current)

    // Reset all nodes
    svg
      .selectAll(".node-group")
      .transition()
      .duration(200)
      .style("opacity", 1)
      .select("circle")
      .attr("fill", "#e0e0e0") // Reset to original neutral color
      .attr("stroke", "#999")
      .attr("stroke-width", 1)

    // Reset all text
    svg
      .selectAll(".node-group")
      .select("text")
      .transition()
      .duration(200)
      .attr("font-size", "10px")
      .attr("font-weight", "normal")
      .attr("fill", "#e0e0e0")

    // Reset all links
    svg
      .selectAll("line")
      .transition()
      .duration(200)
      .attr("stroke", "#555")
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", (d: any) => Math.sqrt(d.value))
      .style("opacity", 1)
  }

  // Drag function for nodes
  function drag(simulation: d3.Simulation<d3.SimulationNodeDatum, undefined>) {
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      event.subject.fx = event.subject.x
      event.subject.fy = event.subject.y
    }

    function dragged(event: any) {
      event.subject.fx = event.x
      event.subject.fy = event.y
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0)
      event.subject.fx = null
      event.subject.fy = null
    }

    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended)
  }

  // Handle search selection
  const handleSearchSelect = (nodeId: string) => {
    setHighlightedNodeId(nodeId)

    // Directly call the highlight function to highlight the selected node
    highlightNodeOnly(nodeId)

    // Find the node to show its details
    const node = graphData?.nodes?.find((n) => n.id === nodeId)
    if (node) {
      setSelectedNode(node)
    }
  }

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00E5C7] mx-auto mb-4"></div>
          <p className="text-white">Loading graph data...</p>
        </div>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md p-6 bg-gray-900 rounded-lg">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Graph</h2>
          <p className="text-gray-300 mb-4">{error.message || "Failed to load graph data"}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Search bar - absolutely positioned at the top */}
      <div className="fixed top-4 left-0 right-0 z-50 flex justify-center">
        <div className="w-full max-w-md px-4">
          <SearchBar onNodeSelect={handleSearchSelect} />
        </div>
      </div>

      {/* Graph visualization */}
      <div className="relative w-full h-full">
        <svg ref={svgRef} width="100%" height="100%" className="bg-black"></svg>
        {selectedNode && <NodeDetailModal node={selectedNode} onClose={() => setSelectedNode(null)} />}
      </div>
    </>
  )
}
