const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);

// BFS to find shortest path from a given node to all other nodes
function bfsFromNode(nodeId, adjacencyList) {
  const distances = new Map();
  const queue = [[nodeId, 0]];
  distances.set(nodeId, 0);

  while (queue.length > 0) {
    const [currentNode, dist] = queue.shift();

    // Get neighbors
    const neighbors = adjacencyList.get(currentNode) || [];

    for (const neighbor of neighbors) {
      if (!distances.has(neighbor)) {
        distances.set(neighbor, dist + 1);
        queue.push([neighbor, dist + 1]);
      }
    }
  }

  // Find max distance (eccentricity)
  let maxDist = 0;
  let farthestNode = null;
  for (const [node, dist] of distances) {
    if (dist > maxDist) {
      maxDist = dist;
      farthestNode = node;
    }
  }

  return { maxDist, farthestNode, reachableNodes: distances.size };
}

(async () => {
  console.log('\n🔍 Calculating Graph Diameter...');
  console.log('==================================\n');

  // Get all connections
  const edges = await sql`
    SELECT "sourceEntityId", "targetEntityId"
    FROM "Connection"
  `;

  // Get all nodes
  const nodes = await sql`
    SELECT id, name, type FROM "Entity"
  `;

  console.log(`Processing ${nodes.length} nodes and ${edges.length} edges...\n`);

  // Build adjacency list (undirected graph)
  const adjacencyList = new Map();
  for (const edge of edges) {
    const src = edge.sourceEntityId;
    const tgt = edge.targetEntityId;

    if (!adjacencyList.has(src)) adjacencyList.set(src, []);
    if (!adjacencyList.has(tgt)) adjacencyList.set(tgt, []);

    adjacencyList.get(src).push(tgt);
    adjacencyList.get(tgt).push(src);
  }

  // Create node lookup
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Sample strategy: test from high-degree and low-degree nodes
  const nodeDegrees = nodes.map(n => ({
    id: n.id,
    name: n.name,
    type: n.type,
    degree: (adjacencyList.get(n.id) || []).length
  })).filter(n => n.degree > 0); // Only connected nodes

  // Sort by degree
  nodeDegrees.sort((a, b) => b.degree - a.degree);

  // Sample nodes: top hubs, some middle nodes, peripheral nodes
  const sampleNodes = [
    ...nodeDegrees.slice(0, 5),           // Top 5 hubs
    ...nodeDegrees.slice(Math.floor(nodeDegrees.length * 0.5), Math.floor(nodeDegrees.length * 0.5) + 3), // Middle
    ...nodeDegrees.slice(-5)              // Bottom 5 (peripheral)
  ];

  console.log('Sampling paths from strategic nodes...\n');

  let globalMaxDist = 0;
  let globalPath = null;

  for (const node of sampleNodes) {
    const result = bfsFromNode(node.id, adjacencyList);

    if (result.maxDist > globalMaxDist) {
      globalMaxDist = result.maxDist;
      globalPath = {
        from: node,
        toId: result.farthestNode,
        distance: result.maxDist
      };
    }

    const nameTrunc = node.name.substring(0, 30).padEnd(30);
    console.log(`From ${nameTrunc} (deg: ${String(node.degree).padStart(3)}): max dist = ${result.maxDist}, reaches ${result.reachableNodes} nodes`);
  }

  console.log('\n📏 DIAMETER ESTIMATE:');
  console.log('======================');
  console.log(`Longest shortest path found: ${globalMaxDist} hops\n`);

  if (globalPath) {
    const toNode = nodeMap.get(globalPath.toId);
    console.log('Example longest path:');
    console.log(`  From: ${globalPath.from.name} (${globalPath.from.type})`);
    console.log(`  To:   ${toNode.name} (${toNode.type})`);
    console.log(`  Distance: ${globalPath.distance} hops`);
    console.log(`\n  (To traverse this path, you'd need ${globalPath.distance} intermediate nodes)`);
  }

  // Check connected components
  const allNodeIds = new Set(nodes.map(n => n.id));
  const visited = new Set();
  const components = [];

  for (const nodeId of allNodeIds) {
    if (!visited.has(nodeId)) {
      const result = bfsFromNode(nodeId, adjacencyList);
      const componentSize = result.reachableNodes;
      components.push(componentSize);

      // Mark all reachable as visited
      const queue = [nodeId];
      const seen = new Set([nodeId]);
      while (queue.length > 0) {
        const curr = queue.shift();
        visited.add(curr);
        const neighbors = adjacencyList.get(curr) || [];
        for (const n of neighbors) {
          if (!seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
    }
  }

  console.log(`\n🌐 Connected Components: ${components.length}`);
  if (components.length > 1) {
    const sortedComponents = components.sort((a,b) => b-a);
    console.log(`   Largest component: ${sortedComponents[0]} nodes`);
    console.log(`   Other components: ${sortedComponents.slice(1).join(', ')} nodes each`);
    console.log('\nNote: The diameter shown is for the largest connected component.');
  } else {
    console.log('   The graph is fully connected!');
  }

  // Average shortest path length (for main component)
  console.log('\n📊 Path Statistics:');
  console.log('===================');
  console.log(`Network diameter: ~${globalMaxDist} hops`);
  console.log(`This means the farthest any two connected entities can be is ${globalMaxDist} steps.`);
  console.log(`\nFor reference:`);
  console.log(`  - 2-3 hops: "Small world" network (like social networks)`);
  console.log(`  - 4-6 hops: Typical knowledge graphs`);
  console.log(`  - 7+ hops: More distributed/specialized networks`);

  process.exit(0);
})();
