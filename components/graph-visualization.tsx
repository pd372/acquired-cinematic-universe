'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import * as d3 from 'd3'
import NodeDetailModal from './node-detail-modal' // Default export
import { useMobile } from '@/hooks/use-mobile' // Named export
import { GraphData, GraphNode, GraphLink } from '@/lib/db' // Assuming types are exported from lib/db

interface GraphVisualizationProps {
  graphData: GraphData | null
}

export default function GraphVisualization({ graphData }: GraphVisualizationProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { isMobile } = useMobile()

  const handleNodeClick = useCallback((event: MouseEvent, d: GraphNode) => {
    setSelectedNode(d)
    setIsModalOpen(true)
  }, [])

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false)
    setSelectedNode(null)
  }, [])

  useEffect(() => {
    if (!graphData || !svgRef.current) {
      return
    }

    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove() // Clear previous graph

    const g = svg.append('g') // Group for zooming and panning

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString())
      })

    svg.call(zoom as any) // Apply zoom behavior

    const simulation = d3
      .forceSimulation<GraphNode, GraphLink>(graphData.nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(graphData.links).id((d) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<GraphNode>().radius((d) => 3 + d.connections * 1 + 5).iterations(2)) // Prevent overlap

    const link = g
      .append('g')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(graphData.links)
      .join('line')
      .attr('stroke-width', (d) => Math.sqrt(d.value))

    const node = g
      .append('g')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .selectAll('circle')
      .data(graphData.nodes)
      .join('circle')
      .attr('r', (d) => 3 + d.connections * 1) // Size based on connections
      .attr('fill', (d) => {
        switch (d.type.toLowerCase()) {
          case 'company':
            return '#10b981' // Green
          case 'person':
            return '#f59e0b' // Orange
          case 'topic':
            return '#3b82f6' // Blue
          case 'episode':
            return '#8b5cf6' // Purple - Distinct color for episodes
          case 'industry':
            return '#ef4444' // Red
          case 'location':
            return '#06b6d4' // Cyan
          case 'product':
            return '#84cc16' // Lime
          default:
            return '#6b7280' // Gray
        }
      })
      .call(
        d3
          .drag<SVGCircleElement, GraphNode>()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended)
      )
      .on('click', handleNodeClick)

    const labels = g
      .append('g')
      .attr('class', 'labels')
      .selectAll('text')
      .data(graphData.nodes)
      .join('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .style('font-size', (d) => {
        const baseSize = 8
        const size = baseSize + d.connections * 0.5
        return `${Math.min(size, 18)}px` // Cap font size
      })
      .style('fill', '#333')
      .style('pointer-events', 'none') // So clicks go to the circle
      .text((d) => d.name)
      .style('font-weight', (d) => (d.type.toLowerCase() === 'episode' ? 'bold' : 'normal')) // Bold episodes

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => d.source.x!)
        .attr('y1', (d) => d.source.y!)
        .attr('x2', (d) => d.target.x!)
        .attr('y2', (d) => d.target.y!)

      node.attr('cx', (d) => d.x!).attr('cy', (d) => d.y!)

      labels.attr('x', (d) => d.x!).attr('y', (d) => d.y!)
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

    // Add legend
    const legendData = [
      { type: 'Episode', color: '#8b5cf6', label: 'Episodes' },
      { type: 'Company', color: '#10b981', label: 'Companies' },
      { type: 'Person', color: '#f59e0b', label: 'People' },
      { type: 'Topic', color: '#3b82f6', label: 'Topics' },
      { type: 'Industry', color: '#ef4444', label: 'Industries' },
      { type: 'Location', color: '#06b6d4', label: 'Locations' },
      { type: 'Product', color: '#84cc16', label: 'Products' },
      { type: 'Other', color: '#6b7280', label: 'Other' },
    ]

    const legend = svg.append('g')
      .attr('transform', `translate(${width - 150}, 20)`) // Position top-right

    legend.selectAll('.legend-item')
      .data(legendData)
      .enter().append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(0, ${i * 20})`)
      .each(function(d) {
        d3.select(this).append('rect')
          .attr('width', 10)
          .attr('height', 10)
          .attr('fill', d.color)
          .attr('stroke', '#333')
          .attr('stroke-width', 1)
        d3.select(this).append('text')
          .attr('x', 15)
          .attr('y', 9)
          .text(d.label)
          .style('font-size', '12px')
          .style('fill', '#333')
      })

    // Cleanup function
    return () => {
      simulation.stop()
    }
  }, [graphData, handleNodeClick])

  if (!graphData) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading graph data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[500px] bg-gray-50 dark:bg-gray-950 rounded-lg shadow-inner">
      {graphData.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400">
          No graph data available. Please process an episode.
        </div>
      )}
      <svg ref={svgRef} className="w-full h-full"></svg>
      <NodeDetailModal node={selectedNode} isOpen={isModalOpen} onClose={handleModalClose} />
    </div>
  )
}
