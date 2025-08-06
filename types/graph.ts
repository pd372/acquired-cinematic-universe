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
  description?: string
  episodes?: Episode[]
  relatedNodes?: RelatedNode[]
}

export interface LinkData {
  source: string
  target: string
  value: number
  description?: string
}

export interface GraphData {
  nodes: NodeData[]
  links: LinkData[]
}
