import { NextRequest, NextResponse } from "next/server"
import { db } from '@/lib/db'
import type { GraphData, NodeData, LinkData } from '@/types/graph'

interface GraphNode {
  id: string
  name: string
  type: 'Episode' | 'Company' | 'Person' | 'Topic' | 'Industry' | 'Location' | 'Product'
  connections: number
  episodeId?: string
}

interface GraphLink {
  source: string
  target: string
  relationship: string
  strength: number
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

interface DatabaseNode {
  id: string
  name: string
  type: string
  description: string | null
  episode_id: string | null
  episode_title: string | null
  episode_url: string | null
}

interface DatabaseLink {
  source_id: string
  target_id: string
  relationship_type: string
}

function createEpisodeCentricGraph(nodes: NodeData[], links: LinkData[]): { nodes: NodeData[], links: LinkData[] } {
  // Step 1: Find episodes and companies with same names
  const episodes = nodes.filter(n => n.type.toLowerCase() === 'episode')
  const episodeNames = new Set(episodes.map(e => e.name.toLowerCase()))
  
  // Step 2: Remove company entities that have the same name as episodes
  const duplicateCompanies = nodes.filter(n => 
    n.type.toLowerCase() === 'company' && 
    episodeNames.has(n.name.toLowerCase())
  )
  
  const duplicateCompanyIds = new Set(duplicateCompanies.map(c => c.id))
  
  // Step 3: Filter out duplicate companies
  const filteredNodes = nodes.filter(n => !duplicateCompanyIds.has(n.id))
  
  // Step 4: Update links - redirect links from duplicate companies to episodes
  const updatedLinks = links.map(link => {
    let newLink = { ...link }
    
    // Find matching episode for source
    if (duplicateCompanyIds.has(link.source)) {
      const duplicateCompany = duplicateCompanies.find(c => c.id === link.source)
      if (duplicateCompany) {
        const matchingEpisode = episodes.find(e => 
          e.name.toLowerCase() === duplicateCompany.name.toLowerCase()
        )
        if (matchingEpisode) {
          newLink.source = matchingEpisode.id
        }
      }
    }
    
    // Find matching episode for target
    if (duplicateCompanyIds.has(link.target)) {
      const duplicateCompany = duplicateCompanies.find(c => c.id === link.target)
      if (duplicateCompany) {
        const matchingEpisode = episodes.find(e => 
          e.name.toLowerCase() === duplicateCompany.name.toLowerCase()
        )
        if (matchingEpisode) {
          newLink.target = matchingEpisode.id
        }
      }
    }
    
    return newLink
  }).filter(link => 
    // Remove self-loops and ensure both source and target exist
    link.source !== link.target &&
    filteredNodes.some(n => n.id === link.source) &&
    filteredNodes.some(n => n.id === link.target)
  )
  
  // Step 5: Ensure all non-episode entities are connected to episodes
  const episodeIds = new Set(episodes.map(e => e.id))
  const connectedNodeIds = new Set<string>()
  
  // Track which nodes are connected
  updatedLinks.forEach(link => {
    connectedNodeIds.add(link.source)
    connectedNodeIds.add(link.target)
  })
  
  // Find orphaned non-episode nodes
  const orphanedNodes = filteredNodes.filter(n => 
    n.type.toLowerCase() !== 'episode' && 
    !connectedNodeIds.has(n.id)
  )
  
  // Connect orphaned nodes to their episodes
  const orphanLinks: LinkData[] = []
  orphanedNodes.forEach(node => {
    if (node.episodes && node.episodes.length > 0) {
      // Connect to the first episode it's mentioned in
      const episodeId = node.episodes[0].id
      if (episodeIds.has(episodeId)) {
        orphanLinks.push({
          source: episodeId,
          target: node.id,
          relationship: 'mentioned in episode'
        })
      }
    }
  })
  
  const finalLinks = [...updatedLinks, ...orphanLinks]
  
  // Step 6: Calculate connection counts
  const connectionCounts = new Map<string, number>()
  finalLinks.forEach(link => {
    connectionCounts.set(link.source, (connectionCounts.get(link.source) || 0) + 1)
    connectionCounts.set(link.target, (connectionCounts.get(link.target) || 0) + 1)
  })
  
  // Update node connection counts
  const finalNodes = filteredNodes.map(node => ({
    ...node,
    connections: connectionCounts.get(node.id) || 0
  }))
  
  return { nodes: finalNodes, links: finalLinks }
}

export async function GET(request: NextRequest) {
  try {
    console.log('Fetching graph data from database...')
    
    // Fetch all entities with episode information
    const entitiesQuery = `
      SELECT DISTINCT
        e.id,
        e.name,
        e.type,
        e.description,
        ep.id as episode_id,
        ep.title as episode_title,
        ep.url as episode_url
      FROM entities e
      LEFT JOIN entity_episodes ee ON e.id = ee.entity_id
      LEFT JOIN episodes ep ON ee.episode_id = ep.id
      ORDER BY e.name
    `
    
    const entityRows = await db(entitiesQuery) as DatabaseNode[]
    console.log(`Found ${entityRows.length} entity-episode relationships`)
    
    // Group entities and collect episode information
    const entityMap = new Map<string, NodeData>()
    
    entityRows.forEach(row => {
      if (!entityMap.has(row.id)) {
        entityMap.set(row.id, {
          id: row.id,
          name: row.name,
          type: row.type,
          description: row.description,
          connections: 0,
          episodes: []
        })
      }
      
      const entity = entityMap.get(row.id)!
      
      // Add episode information if it exists and isn't already added
      if (row.episode_id && row.episode_title && row.episode_url) {
        const episodeExists = entity.episodes?.some(ep => ep.id === row.episode_id)
        if (!episodeExists) {
          entity.episodes = entity.episodes || []
          entity.episodes.push({
            id: row.episode_id,
            title: row.episode_title,
            url: row.episode_url
          })
        }
      }
    })
    
    // Fetch all episodes as entities
    const episodesQuery = `
      SELECT DISTINCT
        id,
        title as name,
        'Episode' as type,
        description,
        url
      FROM episodes
      ORDER BY title
    `
    
    const episodeRows = await db(episodesQuery) as Array<{
      id: string
      name: string
      type: string
      description: string | null
      url: string
    }>
    
    console.log(`Found ${episodeRows.length} episodes`)
    
    // Add episodes as nodes
    episodeRows.forEach(episode => {
      if (!entityMap.has(episode.id)) {
        entityMap.set(episode.id, {
          id: episode.id,
          name: episode.name,
          type: episode.type,
          description: episode.description,
          connections: 0,
          episodes: [{
            id: episode.id,
            title: episode.name,
            url: episode.url
          }]
        })
      }
    })
    
    // Fetch relationships
    const relationshipsQuery = `
      SELECT DISTINCT
        source_entity_id as source_id,
        target_entity_id as target_id,
        relationship_type
      FROM entity_relationships
      WHERE source_entity_id != target_entity_id
    `
    
    const relationshipRows = await db(relationshipsQuery) as DatabaseLink[]
    console.log(`Found ${relationshipRows.length} relationships`)
    
    // Convert to arrays
    const nodes = Array.from(entityMap.values())
    const links: LinkData[] = relationshipRows.map(row => ({
      source: row.source_id,
      target: row.target_id,
      relationship: row.relationship_type
    }))
    
    console.log(`Initial graph: ${nodes.length} nodes, ${links.length} links`)
    
    // Create episode-centric graph
    const { nodes: finalNodes, links: finalLinks } = createEpisodeCentricGraph(nodes, links)
    
    console.log(`Final graph: ${finalNodes.length} nodes, ${finalLinks.length} links`)
    
    const graphData: GraphData = {
      nodes: finalNodes,
      links: finalLinks
    }
    
    return NextResponse.json(graphData)
  } catch (error) {
    console.error('Error fetching graph data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch graph data' },
      { status: 500 }
    )
  }
}
