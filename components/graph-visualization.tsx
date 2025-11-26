"use client"

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react"
import * as d3 from "d3"
import NodeDetailModal from "./node-detail-modal"
import EdgeDetailModal from "./edge-detail-modal"
import { useMobile } from "@/hooks/use-mobile"
import type { NodeData, LinkData, GraphData } from "@/types/graph"

interface GraphVisualizationProps {
  graphData?: GraphData | null
  selectedNodeId?: string
}

interface GraphVisualizationRef {
  highlightNode: (nodeId: string) => void
}

const GraphVisualization = forwardRef<GraphVisualizationRef, GraphVisualizationProps>(
  ({ graphData: propGraphData, selectedNodeId }, ref) => {
    const svgRef = useRef<SVGSVGElement | null>(null)
    const [selectedNode, setSelectedNode] = useState<NodeData | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedEdge, setSelectedEdge] = useState<LinkData | null>(null)
    const [isEdgeModalOpen, setIsEdgeModalOpen] = useState(false)
    const [lockedNodeId, setLockedNodeId] = useState<string | null>(null)
    const [graphData, setGraphData] = useState<GraphData | null>(propGraphData || null)
    const [isLoading, setIsLoading] = useState(!propGraphData)
    const [error, setError] = useState<string | null>(null)
    const { isMobile } = useMobile()

    const nodeSelection = useRef<d3.Selection<SVGCircleElement, NodeData, SVGGElement, unknown> | null>(null)
    const labelSelection = useRef<d3.Selection<SVGTextElement, NodeData, SVGGElement, unknown> | null>(null)
    const linkSelection = useRef<d3.Selection<SVGLineElement, LinkData, SVGGElement, unknown> | null>(null)
    const zoomBehavior = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
    const svgSelection = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null)
    const lockedNodeIdRef = useRef<string | null>(null)
    const highlightedNodeIdRef = useRef<string | null>(null)

    useImperativeHandle(ref, () => ({
      highlightNode: (nodeId: string) => {
        if (!nodeSelection.current || !labelSelection.current || !linkSelection.current) return

        // Update the highlighted node ref
        highlightedNodeIdRef.current = nodeId || null

        // Clear any locked node when a new search selection is made
        if (nodeId) {
          setLockedNodeId(null)
        }

        if (!nodeId) {
          // Reset all highlights
          nodeSelection.current
            .transition()
            .duration(300)
            .attr("fill", "#6b7280")
            .attr("r", (d) => 3 + d.connections * 1)

          labelSelection.current
            .transition()
            .duration(300)
            .style("fill", "#e2e8f0")
            .style("font-weight", (d) => (d.type.toLowerCase() === "episode" ? "bold" : "normal"))

          linkSelection.current
            .transition()
            .duration(300)
            .attr("stroke", "#4a5568")
            .attr("stroke-opacity", 0.6)
            .attr("stroke-width", (d) => Math.sqrt(d.value))
          return
        }

        // Find and highlight the selected node
        const targetNode = graphData?.nodes.find((n) => n.id === nodeId)
        if (!targetNode) return

        // Zoom and center on the selected node
        if (svgRef.current && zoomBehavior.current && svgSelection.current && targetNode.x !== undefined && targetNode.y !== undefined) {
          const width = svgRef.current.clientWidth
          const height = svgRef.current.clientHeight
          const scale = 2 // Zoom level

          // Calculate transform to center the node
          const transform = d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(scale)
            .translate(-targetNode.x, -targetNode.y)

          // Animate zoom
          svgSelection.current
            .transition()
            .duration(750)
            .call(zoomBehavior.current.transform as any, transform)
        }

        // Highlight the selected node
        nodeSelection.current
          .transition()
          .duration(300)
          .attr("fill", (d) => (d.id === nodeId ? "#14b8a6" : "#6b7280"))
          .attr("r", (d) => (d.id === nodeId ? (3 + d.connections * 1) * 1.5 : 3 + d.connections * 1))

        // Highlight the selected node's label
        labelSelection.current
          .transition()
          .duration(300)
          .style("fill", (d) => (d.id === nodeId ? "#ffffff" : "#e2e8f0"))
          .style("font-weight", (d) =>
            d.id === nodeId ? "bold" : d.type.toLowerCase() === "episode" ? "bold" : "normal",
          )

        // Highlight connected edges
        linkSelection.current
          .transition()
          .duration(300)
          .attr("stroke", (linkData) => {
            const source = typeof linkData.source === "string" ? linkData.source : linkData.source.id
            const target = typeof linkData.target === "string" ? linkData.target : linkData.target.id
            return source === nodeId || target === nodeId ? "#14b8a6" : "#4a5568"
          })
          .attr("stroke-opacity", (linkData) => {
            const source = typeof linkData.source === "string" ? linkData.source : linkData.source.id
            const target = typeof linkData.target === "string" ? linkData.target : linkData.target.id
            return source === nodeId || target === nodeId ? 1 : 0.6
          })
          .attr("stroke-width", (linkData) => {
            const source = typeof linkData.source === "string" ? linkData.source : linkData.source.id
            const target = typeof linkData.target === "string" ? linkData.target : linkData.target.id
            return source === nodeId || target === nodeId ? Math.sqrt(linkData.value) * 1.5 : Math.sqrt(linkData.value)
          })
      },
    }))

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

    const handleNodeClick = useCallback((event: MouseEvent, d: NodeData) => {
      setSelectedNode(d)
      setIsModalOpen(true)
    }, [])

    const handleModalClose = useCallback(() => {
      setIsModalOpen(false)
      setSelectedNode(null)
    }, [])

    const handleEdgeClick = useCallback((event: MouseEvent, d: LinkData) => {
      setSelectedEdge(d)
      setIsEdgeModalOpen(true)
    }, [])

    const handleEdgeModalClose = useCallback(() => {
      setIsEdgeModalOpen(false)
      setSelectedEdge(null)
    }, [])

    const applyLockedHighlight = useCallback((nodeId: string | null) => {
      if (!nodeSelection.current || !labelSelection.current || !linkSelection.current) return

      if (!nodeId) {
        // Reset all highlights
        nodeSelection.current
          .transition()
          .duration(300)
          .attr("fill", "#6b7280")
          .attr("r", (d) => 3 + d.connections * 1)

        labelSelection.current
          .transition()
          .duration(300)
          .style("fill", "#e2e8f0")
          .style("font-weight", (d) => (d.type.toLowerCase() === "episode" ? "bold" : "normal"))

        linkSelection.current
          .transition()
          .duration(300)
          .attr("stroke", "#4a5568")
          .attr("stroke-opacity", 0.6)
          .attr("stroke-width", (d) => Math.sqrt(d.value))
        return
      }

      // Apply locked highlight with blue glow
      nodeSelection.current
        .transition()
        .duration(300)
        .attr("fill", (d) => (d.id === nodeId ? "#3b82f6" : "#6b7280")) // Blue for locked node
        .attr("r", (d) => (d.id === nodeId ? (3 + d.connections * 1) * 1.5 : 3 + d.connections * 1))

      labelSelection.current
        .transition()
        .duration(300)
        .style("fill", (d) => (d.id === nodeId ? "#ffffff" : "#e2e8f0"))
        .style("font-weight", (d) =>
          d.id === nodeId ? "bold" : d.type.toLowerCase() === "episode" ? "bold" : "normal",
        )

      linkSelection.current
        .transition()
        .duration(300)
        .attr("stroke", (linkData) => {
          const source = typeof linkData.source === "string" ? linkData.source : linkData.source.id
          const target = typeof linkData.target === "string" ? linkData.target : linkData.target.id
          return source === nodeId || target === nodeId ? "#3b82f6" : "#4a5568" // Blue for connected edges
        })
        .attr("stroke-opacity", (linkData) => {
          const source = typeof linkData.source === "string" ? linkData.source : linkData.source.id
          const target = typeof linkData.target === "string" ? linkData.target : linkData.target.id
          return source === nodeId || target === nodeId ? 1 : 0.6
        })
        .attr("stroke-width", (linkData) => {
          const source = typeof linkData.source === "string" ? linkData.source : linkData.source.id
          const target = typeof linkData.target === "string" ? linkData.target : linkData.target.id
          return source === nodeId || target === nodeId ? Math.sqrt(linkData.value) * 1.5 : Math.sqrt(linkData.value)
        })
    }, [])

    // Apply locked highlight when lockedNodeId changes and keep ref in sync
    useEffect(() => {
      lockedNodeIdRef.current = lockedNodeId
      applyLockedHighlight(lockedNodeId)
    }, [lockedNodeId, applyLockedHighlight])

    useEffect(() => {
      if (!graphData || !svgRef.current || isLoading) {
        return
      }

      console.log("Rendering graph with", graphData.nodes.length, "nodes and", graphData.links.length, "links")

      const width = svgRef.current.clientWidth
      const height = svgRef.current.clientHeight

      const svg = d3.select(svgRef.current)
      svg.selectAll("*").remove() // Clear previous graph

      // Store SVG selection for zoom animation
      svgSelection.current = svg

      // Also remove any lingering tooltips
      d3.selectAll(".graph-tooltip").remove()

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

      // Add invisible background rect for click detection
      g.append("rect")
        .attr("width", width * 10) // Large enough to cover zoomed area
        .attr("height", height * 10)
        .attr("x", -width * 4.5)
        .attr("y", -height * 4.5)
        .attr("fill", "transparent")
        .attr("pointer-events", "all")
        .on("click", () => {
          setLockedNodeId(null)
        })

      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 8])
        .filter((event: any) => {
          // Allow all touch events and mouse events except right-click
          if (event.type === 'mousedown' && event.button === 2) return false
          return true
        })
        .on("zoom", (event) => {
          g.attr("transform", event.transform.toString())
        })

      // Store zoom behavior for programmatic zoom
      zoomBehavior.current = zoom

      svg.call(zoom as any)

      // Let D3 handle initial positioning naturally - don't pre-assign positions

      const simulation = d3
        .forceSimulation<NodeData, LinkData>(graphData.nodes)
        .force(
          "link",
          d3
            .forceLink<NodeData, LinkData>(graphData.links)
            .id((d) => d.id)
            .distance(120), // Increased distance to make room for labels
        )
        .force("charge", d3.forceManyBody().strength(-400))
        .force("center", d3.forceCenter(width / 2, height / 2).strength(0.15)) // Stronger centering to pull orphans back
        .force(
          "collide",
          d3
            .forceCollide<NodeData>()
            .radius((d) => 3 + d.connections * 1 + 15) // More space for external labels
            .iterations(2),
        )
        .force("radial", d3.forceRadial<NodeData>(0, width / 2, height / 2).strength((d) => {
          // Stronger radial force for nodes with fewer connections (orphans)
          // This keeps them from drifting to the edges
          return d.connections < 5 ? 0.3 : 0.1
        }))
        .velocityDecay(0.6) // Higher friction for less drift

      const link = g
        .append("g")
        .attr("stroke", "#4a5568") // Darker gray for better contrast
        .attr("stroke-opacity", 0.6)
        .selectAll("line")
        .data(graphData.links)
        .join("line")
        .attr("stroke-width", (d) => Math.sqrt(d.value))
        .attr("class", "graph-link")
        .style("cursor", "pointer")
        .on("mouseover", function(event, d) {
          // Highlight the hovered edge and make it thicker for easier clicking
          d3.select(this)
            .transition()
            .duration(200)
            .attr("stroke", "#14b8a6")
            .attr("stroke-opacity", 1)
            .attr("stroke-width", 4) // Thicker on hover for easier clicking
          
          // Remove any existing tooltips first
          d3.selectAll(".graph-tooltip").remove()
          
          // Get the SVG element and its bounding rect for positioning
          const svgElement = svgRef.current!
          const svgRect = svgElement.getBoundingClientRect()
          
          // Create tooltip positioned relative to the SVG container
          const tooltip = d3.select(svgElement.parentElement)
            .append("div")
            .attr("class", "graph-tooltip")
            .style("position", "absolute")
            .style("background", "rgba(0, 0, 0, 0.9)")
            .style("color", "white")
            .style("padding", "8px 12px")
            .style("border-radius", "6px")
            .style("font-size", "12px")
            .style("font-family", "system-ui, sans-serif")
            .style("pointer-events", "none")
            .style("z-index", "1000")
            .style("max-width", "200px")
            .style("box-shadow", "0 4px 6px rgba(0, 0, 0, 0.1)")
            .style("word-wrap", "break-word")
            .html("Click to view details")
            .style("opacity", 0)
          
          // Position tooltip relative to container
          const mouseX = event.clientX - svgRect.left
          const mouseY = event.clientY - svgRect.top
          
          tooltip
            .style("left", (mouseX + 10) + "px")
            .style("top", (mouseY - 10) + "px")
            .transition()
            .duration(200)
            .style("opacity", 1)
        })
        .on("mousemove", function(event, d) {
          // Update tooltip position relative to container
          const svgElement = svgRef.current!
          const svgRect = svgElement.getBoundingClientRect()
          const mouseX = event.clientX - svgRect.left
          const mouseY = event.clientY - svgRect.top
          
          d3.select(".graph-tooltip")
            .style("left", (mouseX + 10) + "px")
            .style("top", (mouseY - 10) + "px")
        })
        .on("mouseout", function(event, d) {
          // Determine the correct color to restore based on active selections
          const source = typeof d.source === "string" ? d.source : d.source.id
          const target = typeof d.target === "string" ? d.target : d.target.id

          let restoreColor = "#4a5568" // Default gray
          let restoreOpacity = 0.6
          let restoreWidth = Math.sqrt(d.value)

          // Check if this edge is connected to the locked node (blue)
          if (lockedNodeIdRef.current && (source === lockedNodeIdRef.current || target === lockedNodeIdRef.current)) {
            restoreColor = "#3b82f6" // Blue for locked
            restoreOpacity = 1
            restoreWidth = Math.sqrt(d.value) * 1.5
          }
          // Check if this edge is connected to the search-highlighted node (teal)
          else if (highlightedNodeIdRef.current && (source === highlightedNodeIdRef.current || target === highlightedNodeIdRef.current)) {
            restoreColor = "#14b8a6" // Teal for search
            restoreOpacity = 1
            restoreWidth = Math.sqrt(d.value) * 1.5
          }

          // Reset the edge to its appropriate state
          d3.select(this)
            .transition()
            .duration(200)
            .attr("stroke", restoreColor)
            .attr("stroke-opacity", restoreOpacity)
            .attr("stroke-width", restoreWidth)

          // Remove tooltip immediately on mouseout
          d3.selectAll(".graph-tooltip").remove()
        })
        .on("click", function(event, d) {
          event.stopPropagation() // Prevent background click from unlocking
          handleEdgeClick(event, d)
        })

      linkSelection.current = link

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
        .call(d3.drag<SVGCircleElement, NodeData>().on("start", dragstarted).on("drag", dragged).on("end", dragended))
        .on("click", function(event, d) {
          event.stopPropagation() // Prevent background click from unlocking
          handleNodeClick(event, d)
        })
        .on("contextmenu", function (event, d) {
          event.preventDefault() // Prevent default context menu
          event.stopPropagation() // Prevent event from bubbling
          // Toggle locked state
          setLockedNodeId((currentLocked) => (currentLocked === d.id ? null : d.id))
        })
        .on("mouseover", function (event, d) {
          // Don't show hover effect if a node is locked
          if (lockedNodeIdRef.current) return
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
          // If this is the locked node, restore to blue locked state instead of gray
          if (lockedNodeIdRef.current === d.id) {
            d3.select(this)
              .transition()
              .duration(200)
              .attr("fill", "#3b82f6") // Back to blue locked color
              .attr("r", (3 + d.connections * 1) * 1.5)

            // Keep edges highlighted in blue
            link
              .transition()
              .duration(200)
              .attr("stroke", (linkData) => {
                const source = typeof linkData.source === "string" ? linkData.source : linkData.source.id
                const target = typeof linkData.target === "string" ? linkData.target : linkData.target.id
                return source === d.id || target === d.id ? "#3b82f6" : "#4a5568"
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

            // Keep label highlighted
            labels
              .transition()
              .duration(200)
              .style("fill", (labelData) => (labelData.id === d.id ? "#ffffff" : "#e2e8f0"))
              .style("font-weight", (labelData) => (labelData.id === d.id ? "bold" : labelData.type.toLowerCase() === "episode" ? "bold" : "normal"))
            return
          }

          // If another node is locked, don't reset anything
          if (lockedNodeIdRef.current) return

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

      nodeSelection.current = node

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

      labelSelection.current = labels

      simulation.on("tick", () => {
        link
          .attr("x1", (d) => (d.source as NodeData).x!)
          .attr("y1", (d) => (d.source as NodeData).y!)
          .attr("x2", (d) => (d.target as NodeData).x!)
          .attr("y2", (d) => (d.target as NodeData).y!)

        node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!)

        labels.attr("x", (d) => d.x!).attr("y", (d) => d.y!)
      })

      let dragStartX = 0
      let dragStartY = 0
      let hasMovedThreshold = false

      function dragstarted(event: d3.D3DragEvent<SVGCircleElement, NodeData, NodeData>, d: NodeData) {
        // Record starting position - don't reheat yet
        dragStartX = event.x
        dragStartY = event.y
        hasMovedThreshold = false
        d.fx = d.x
        d.fy = d.y
      }

      function dragged(event: d3.D3DragEvent<SVGCircleElement, NodeData, NodeData>, d: NodeData) {
        d.fx = event.x
        d.fy = event.y

        // Only reheat simulation if mouse has moved > 3 pixels (actual drag, not just click)
        if (!hasMovedThreshold) {
          const dx = event.x - dragStartX
          const dy = event.y - dragStartY
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance > 3) {
            hasMovedThreshold = true
            // Restart simulation with gentle alpha
            simulation.alpha(0.1).alphaTarget(0.05).restart()
          }
        }
      }

      function dragended(event: d3.D3DragEvent<SVGCircleElement, NodeData, NodeData>, d: NodeData) {
        // Only cool down if we actually dragged
        if (hasMovedThreshold) {
          simulation.alphaTarget(0)
        }
        hasMovedThreshold = false
        d.fx = null
        d.fy = null
      }

      return () => {
        simulation.stop()
      }
    }, [graphData, handleNodeClick, handleEdgeClick, isLoading])

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
        <svg ref={svgRef} className="w-full h-full" style={{ touchAction: 'none' }}></svg>
        <NodeDetailModal
          node={selectedNode}
          isOpen={isModalOpen}
          onClose={handleModalClose}
          allNodes={graphData?.nodes || []}
        />
        <EdgeDetailModal
          edge={selectedEdge}
          nodes={graphData?.nodes || null}
          isOpen={isEdgeModalOpen}
          onClose={handleEdgeModalClose}
        />
      </div>
    )
  },
)

GraphVisualization.displayName = "GraphVisualization"

export default GraphVisualization
