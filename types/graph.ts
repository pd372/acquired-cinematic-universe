export interface Episode {
  id: string
  title: string
  url: string
  date: string
}

export interface RelatedNode {
  id: string
  name: string
  type: string
}

export interface NodeData {
  id: string
  name: string
  type: "Company" | "Person" | "Topic" | "Episode"
  connections: number
  // description and episodes removed - now fetched via /api/node/[id] on demand
  relatedNodes?: RelatedNode[]
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

export interface LinkData {
  source: string | NodeData
  target: string | NodeData
  value: number
  description?: string
}

export interface GraphData {
  nodes: NodeData[]
  links: LinkData[]
  error?: string
}
