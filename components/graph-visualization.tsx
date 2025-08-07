'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { NodeDetailModal } from './node-detail-modal'
import type { GraphData, NodeData, LinkData } from '@/types/graph'

interface GraphVisualizationProps {
  graphData: GraphData | null
}

const GraphVisualization: React.FC<GraphVisualizationProps> = ({ graphData }) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null)
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 })

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (svgRef.current) {
        const container = svgRef.current.parentElement
        if (container) {
          const rect = container.getBoundingClientRect()
          setDimensions({
            width: Math.max(1200, rect.width - 40),
            height: Math.max(800, rect.height - 40)
          })
        }
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!graphData || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { width, height } = dimensions

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        svg.attr('transform', event.transform)
      })

    svg.call(zoom)

    const g = svg.append('g')

    // Create simulation
    const simulation = d3.forceSimulation<NodeData>(graphData.nodes)
      .force('link', d3.forceLink<NodeData, LinkData>(graphData.links).id(d => d.id).distance(100).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => 3 + d.connections * 1 + 5))

    // Create links
    const link = g.append('g')
      .selectAll('line')
      .data(graphData.links)
      .enter().append('line')
      .attr('stroke', '#4a5568')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1)

    // Create nodes
    const node = g.append('g')
      .selectAll('circle')
      .data(graphData.nodes)
      .enter().append('circle')
      .attr('r', d => 3 + d.connections * 1)
      .attr('fill', d => getNodeColor(d.type))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .call(d3.drag<SVGCircleElement, NodeData>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
      )
      .on('click', (event, d) => {
        event.stopPropagation()
        setSelectedNode(d)
      })

    // Add labels
    const label = g.append('g')
      .selectAll('text')
      .data(graphData.nodes)
      .enter().append('text')
      .text(d => d.name)
      .attr('font-size', d => d.type.toLowerCase() === 'episode' ? '12px' : '10px')
      .attr('font-weight', d => d.type.toLowerCase() === 'episode' ? 'bold' : 'normal')
      .attr('dx', 15)
      .attr('dy', 4)
      .attr('fill', '#e2e8f0')
      .style('pointer-events', 'none')

    // Add tooltips
    node.append('title')
      .text(d => `${d.name} (${d.type})\nConnections: ${d.connections}${d.description ? `\n${d.description}` : ''}`)

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as NodeData).x!)
        .attr('y1', d => (d.source as NodeData).y!)
        .attr('x2', d => (d.target as NodeData).x!)
        .attr('y2', d => (d.target as NodeData).y!)

      node
        .attr('cx', d => d.x!)
        .attr('cy', d => d.y!)

      label
        .attr('x', d => d.x!)
        .attr('y', d => d.y!)
    })

    // Add legend
    const legend = svg.append('g')
      .attr('transform', 'translate(20, 20)')

    const legendData = [
      { type: 'Episode', color: '#9f7aea' }, // Purple for episodes (main hubs)
      { type: 'Company', color: '#48bb78' }, // Green for companies
      { type: 'Person', color: '#ed8936' },  // Orange for people
      { type: 'Topic', color: '#4299e1' },   // Blue for topics
      { type: 'Industry', color: '#38b2ac' } // Teal for industries
    ]

    const legendItems = legend.selectAll('.legend-item')
      .data(legendData)
      .enter().append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(0, ${i * 20})`)

    legendItems.append('circle')
      .attr('r', 6)
      .attr('fill', d => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)

    legendItems.append('text')
      .attr('x', 15)
      .attr('y', 4)
      .attr('fill', '#e2e8f0')
      .attr('font-size', '12px')
      .text(d => d.type)

    return () => {
      simulation.stop()
    }
  }, [graphData, dimensions])

  const getNodeColor = (type: string): string => {
    switch (type.toLowerCase()) {
      case 'episode': return '#9f7aea' // Purple for episodes (main hubs)
      case 'company': return '#48bb78' // Green for companies
      case 'person': return '#ed8936'  // Orange for people
      case 'topic': return '#4299e1'   // Blue for topics
      case 'industry': return '#38b2ac' // Teal for industries
      default: return '#a0aec0' // Gray for others
    }
  }

  if (!graphData) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-400">Loading graph data...</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      <svg
        ref={svgRef}
        className="w-full h-full bg-gray-900 rounded-lg"
        style={{ minHeight: '600px' }}
      />
      {selectedNode && (
        <NodeDetailModal
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  )
}

export default GraphVisualization
