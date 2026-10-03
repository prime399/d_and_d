// Turns the controller's `lit` map (id -> recency counter) into the path the DM walked through the graph.
import type { Graph } from './graphModel';
import { pairKey } from './graphModel';

/** ids sorted oldest -> newest, only ids that exist in the graph */
export function litOrder(lit: Map<string, number>, g: Graph): string[] {
  return [...lit.entries()].filter(([id]) => g.byId.has(id)).sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

/** shortest path through the reference graph (BFS, bounded depth); null if not reachable */
export function shortestPath(g: Graph, from: string, to: string, maxDepth = 4): string[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string>([[from, '']]);
  let frontier = [from];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of g.neighbors.get(id) ?? []) {
        if (prev.has(nb)) continue;
        prev.set(nb, id);
        if (nb === to) {
          const path = [to];
          let cur = id;
          while (cur) {
            path.push(cur);
            cur = prev.get(cur)!;
          }
          return path.reverse();
        }
        next.push(nb);
      }
    }
    frontier = next;
  }
  return null;
}

export interface Hop {
  from: string;
  to: string;
  /** node ids walked along graph links, or just [from, to] for a jump */
  via: string[];
  /** true when the two lookups are not connected by references */
  jump: boolean;
}

export interface Traversal {
  /** last few lit ids, oldest -> newest */
  trail: string[];
  hops: Hop[];
  /** pairKeys of links that lie on the walked path */
  pathLinks: Set<string>;
}

export function buildTraversal(g: Graph, lit: Map<string, number>, length = 6): Traversal {
  const trail = litOrder(lit, g).slice(-length);
  const hops: Hop[] = [];
  const pathLinks = new Set<string>();
  for (let i = 1; i < trail.length; i++) {
    const from = trail[i - 1];
    const to = trail[i];
    const via = shortestPath(g, from, to);
    if (via) {
      for (let j = 1; j < via.length; j++) pathLinks.add(pairKey(via[j - 1], via[j]));
      hops.push({ from, to, via, jump: false });
    } else {
      hops.push({ from, to, via: [from, to], jump: true });
    }
  }
  return { trail, hops, pathLinks };
}
