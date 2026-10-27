import type { Circuit, CircuitComponent, CircuitWire, Point } from "./types";

type TerminalPointFn = (component: CircuitComponent, terminalId: string) => Point;
type RouteObstacle = { wire: CircuitWire; points: Point[] };

const GRID = 10;
const MAX_X = 440;
const MAX_Y = 340;

function distance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
function samePoint(a: Point, b: Point, tolerance = 0.5): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}
function isHorizontal(a: Point, b: Point): boolean {
  return Math.abs(a.y - b.y) < 0.01;
}
function isVertical(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.01;
}
function overlapLength(a1: number, a2: number, b1: number, b2: number): number {
  return Math.min(Math.max(a1, a2), Math.max(b1, b2)) -
    Math.max(Math.min(a1, a2), Math.min(b1, b2));
}
function intersection(a: Point, b: Point, c: Point, d: Point): { point?: Point; overlap: boolean } | null {
  const h1 = isHorizontal(a, b), h2 = isHorizontal(c, d);
  const v1 = isVertical(a, b), v2 = isVertical(c, d);
  if (h1 && h2) {
    if (Math.abs(a.y - c.y) > 0.5) return null;
    const length = overlapLength(a.x, b.x, c.x, d.x);
    if (length < -0.5) return null;
    if (length > 0.5) return { overlap: true };
    return { point: { x: (Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) + Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))) / 2, y: a.y }, overlap: false };
  }
  if (v1 && v2) {
    if (Math.abs(a.x - c.x) > 0.5) return null;
    const length = overlapLength(a.y, b.y, c.y, d.y);
    if (length < -0.5) return null;
    if (length > 0.5) return { overlap: true };
    return { point: { x: a.x, y: (Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) + Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))) / 2 }, overlap: false };
  }
  if ((!h1 && !v1) || (!h2 && !v2)) return null;
  const hA = h1 ? a : c, hB = h1 ? b : d;
  const vA = h1 ? c : a, vB = h1 ? d : b;
  const point = { x: vA.x, y: hA.y };
  if (point.x < Math.min(hA.x, hB.x) - 0.5 || point.x > Math.max(hA.x, hB.x) + 0.5 ||
      point.y < Math.min(vA.y, vB.y) - 0.5 || point.y > Math.max(vA.y, vB.y) + 0.5) return null;
  return { point, overlap: false };
}
function sharedTerminalPoints(wire: CircuitWire, other: CircuitWire, getPoint: TerminalPointFn, components: CircuitComponent[]): Point[] {
  const ends = [wire.from, wire.to];
  const otherEnds = [other.from, other.to];
  const shared: Point[] = [];
  for (const end of ends) {
    if (!otherEnds.some((candidate) => candidate.componentId === end.componentId && candidate.terminalId === end.terminalId)) continue;
    const component = components.find((item) => item.id === end.componentId);
    if (component) shared.push(getPoint(component, end.terminalId));
  }
  return shared;
}
function segmentConflictsWithRoutes(a: Point, b: Point, current: CircuitWire, obstacles: RouteObstacle[], components: CircuitComponent[], getPoint: TerminalPointFn): boolean {
  for (const obstacle of obstacles) {
    const shared = sharedTerminalPoints(current, obstacle.wire, getPoint, components);
    for (let i = 1; i < obstacle.points.length; i++) {
      const hit = intersection(a, b, obstacle.points[i - 1], obstacle.points[i]);
      if (!hit) continue;
      if (hit.overlap) {
        // Shared trunks at the exact same pin are allowed; arbitrary overlapping
        // paths can visually merge unrelated nets and are therefore prohibited.
        const sharedTrunk = shared.length > 0 && shared.some((point) =>
          (samePoint(a, point, 7) || samePoint(b, point, 7)) &&
          (samePoint(obstacle.points[i - 1], point, 7) || samePoint(obstacle.points[i], point, 7)));
        if (!sharedTrunk) return true;
        continue;
      }
      if (hit.point && shared.some((point) => samePoint(hit.point!, point, 7))) continue;
      return true;
    }
  }
  return false;
}
function segmentHitsComponent(a: Point, b: Point, component: CircuitComponent, clearance = 3): boolean {
  const x1 = component.position.x - 32 - clearance;
  const x2 = component.position.x + 32 + clearance;
  const y1 = component.position.y - 28 - clearance;
  const y2 = component.position.y + 28 + clearance;
  if (isHorizontal(a, b)) {
    return a.y > y1 && a.y < y2 &&
      Math.max(Math.min(a.x, b.x), x1) < Math.min(Math.max(a.x, b.x), x2);
  }
  if (isVertical(a, b)) {
    return a.x > x1 && a.x < x2 &&
      Math.max(Math.min(a.y, b.y), y1) < Math.min(Math.max(a.y, b.y), y2);
  }
  return true;
}
function cellBlocked(x: number, y: number, fromComponentId: string, toComponentId: string, components: CircuitComponent[]): boolean {
  const point = { x, y };
  for (const component of components) {
    if (component.id === fromComponentId || component.id === toComponentId) continue;
    if (Math.abs(point.x - component.position.x) < 36 && Math.abs(point.y - component.position.y) < 32) return true;
  }
  return false;
}
function simplifyPath(input: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of input) {
    if (!deduped.length || !samePoint(deduped[deduped.length - 1], point)) deduped.push(point);
  }
  if (deduped.length <= 2) return deduped;
  const result: Point[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const previous = result[result.length - 1];
    const current = deduped[i];
    const next = deduped[i + 1];
    if (samePoint(previous, current) || (Math.abs(previous.x - current.x) < 0.01 && Math.abs(current.x - next.x) < 0.01) ||
        (Math.abs(previous.y - current.y) < 0.01 && Math.abs(current.y - next.y) < 0.01)) continue;
    result.push(current);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}
type SearchState = { x: number; y: number; dir: number; g: number; f: number; key: string };
function pushHeap(heap: SearchState[], value: SearchState): void {
  heap.push(value);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].f <= heap[index].f) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}
function popHeap(heap: SearchState[]): SearchState | undefined {
  if (!heap.length) return undefined;
  const first = heap[0];
  const last = heap.pop()!;
  if (heap.length) {
    heap[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1, right = left + 1;
      let smallest = index;
      if (left < heap.length && heap[left].f < heap[smallest].f) smallest = left;
      if (right < heap.length && heap[right].f < heap[smallest].f) smallest = right;
      if (smallest === index) break;
      [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
      index = smallest;
    }
  }
  return first;
}
function aStar(start: Point, goal: Point, wire: CircuitWire, fromComponent: CircuitComponent, toComponent: CircuitComponent,
  circuit: Circuit, obstacles: RouteObstacle[], getPoint: TerminalPointFn): Point[] | null {
  const sx = Math.max(0, Math.min(MAX_X, Math.round(start.x / GRID) * GRID));
  const sy = Math.max(0, Math.min(MAX_Y, Math.round(start.y / GRID) * GRID));
  const gx = Math.max(0, Math.min(MAX_X, Math.round(goal.x / GRID) * GRID));
  const gy = Math.max(0, Math.min(MAX_Y, Math.round(goal.y / GRID) * GRID));
  const initialKey = sx + ":" + sy + ":4";
  const open: SearchState[] = [];
  const best = new Map<string, number>([[initialKey, 0]]);
  const parents = new Map<string, string>();
  const stateByKey = new Map<string, { x: number; y: number; dir: number }>([[initialKey, { x: sx, y: sy, dir: 4 }]]);
  pushHeap(open, { x: sx, y: sy, dir: 4, g: 0, f: Math.abs(gx-sx) + Math.abs(gy-sy), key: initialKey });
  const directions = [{ x: GRID, y: 0, dir: 0 }, { x: 0, y: GRID, dir: 1 }, { x: -GRID, y: 0, dir: 2 }, { x: 0, y: -GRID, dir: 3 }];
  let finalKey: string | null = null;
  let visited = 0;
  while (open.length && visited < 10000) {
    const current = popHeap(open)!;
    if (current.g !== best.get(current.key)) continue;
    visited++;
    if (current.x === gx && current.y === gy) { finalKey = current.key; break; }
    for (const direction of directions) {
      const nx = current.x + direction.x, ny = current.y + direction.y;
      if (nx < 0 || nx > MAX_X || ny < 0 || ny > MAX_Y) continue;
      if (!(nx === gx && ny === gy) && cellBlocked(nx, ny, fromComponent.id, toComponent.id, circuit.components)) continue;
      const a = { x: current.x, y: current.y }, b = { x: nx, y: ny };
      if (circuit.components.some((component) => component.id !== fromComponent.id && component.id !== toComponent.id && segmentHitsComponent(a,b,component))) continue;
      if (segmentConflictsWithRoutes(a,b,wire,obstacles,circuit.components,getPoint)) continue;
      const bend = current.dir !== 4 && current.dir !== direction.dir ? 4 : 0;
      const g = current.g + GRID + bend;
      const key = nx + ":" + ny + ":" + direction.dir;
      if (g >= (best.get(key) ?? Infinity)) continue;
      best.set(key,g);
      parents.set(key,current.key);
      stateByKey.set(key,{x:nx,y:ny,dir:direction.dir});
      const h = Math.abs(gx-nx) + Math.abs(gy-ny);
      pushHeap(open,{x:nx,y:ny,dir:direction.dir,g,f:g+h,key});
    }
  }
  if (!finalKey) return null;
  const reversed: Point[] = [];
  let key: string | undefined = finalKey;
  while (key) {
    const state = stateByKey.get(key);
    if (state) reversed.push({x:state.x,y:state.y});
    key = parents.get(key);
  }
  const gridPath = reversed.reverse();
  const points = simplifyPath([
    start,
    {x:sx,y:start.y},
    {x:sx,y:sy},
    ...gridPath.slice(1),
    {x:gx,y:goal.y},
    goal,
  ]);
  // The short terminal-to-grid lead must also avoid unrelated symbols and routes.
  for (let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i];
    if (circuit.components.some((component) => component.id !== fromComponent.id && component.id !== toComponent.id && segmentHitsComponent(a,b,component))) return null;
    if (segmentConflictsWithRoutes(a,b,wire,obstacles,circuit.components,getPoint)) return null;
  }
  return points;
}
function fallbackRoute(from: Point, to: Point, wire: CircuitWire, fromComponent: CircuitComponent, toComponent: CircuitComponent,
  circuit: Circuit, obstacles: RouteObstacle[], getPoint: TerminalPointFn): Point[] {
  const candidates: Point[][] = [
    [from,{x:from.x,y:0},{x:to.x,y:0},to],
    [from,{x:from.x,y:MAX_Y},{x:to.x,y:MAX_Y},to],
    [from,{x:0,y:from.y},{x:0,y:to.y},to],
    [from,{x:MAX_X,y:from.y},{x:MAX_X,y:to.y},to],
  ];
  let best = candidates[0], bestScore = Infinity;
  for (const path of candidates) {
    let score = distance(from,to) + path.length * 4;
    for (let i=1;i<path.length;i++) {
      const a=path[i-1], b=path[i];
      for (const component of circuit.components) {
        if (component.id !== fromComponent.id && component.id !== toComponent.id && segmentHitsComponent(a,b,component)) score += 100000;
      }
      if (segmentConflictsWithRoutes(a,b,wire,obstacles,circuit.components,getPoint)) score += 1000000;
    }
    if (score < bestScore) {best=path;bestScore=score;}
  }
  return simplifyPath(best);
}

/**
 * Global, deterministic orthogonal routing. Explicit user-defined points remain
 * pinned first; automatic wires are then routed longest-first using A* over a
 * 10 px grid. Already routed paths and component bodies are treated as obstacles.
 */
export function routeOrthogonalWires(circuit: Circuit, getPoint: TerminalPointFn): Map<string, Point[]> {
  const routes = new Map<string, Point[]>();
  const componentsById = new Map(circuit.components.map((component) => [component.id, component]));
  const endpoints = (wire: CircuitWire): { from: Point; to: Point; fromComponent: CircuitComponent; toComponent: CircuitComponent } | null => {
    const fromComponent = componentsById.get(wire.from.componentId);
    const toComponent = componentsById.get(wire.to.componentId);
    if (!fromComponent || !toComponent) return null;
    return { from:getPoint(fromComponent,wire.from.terminalId),to:getPoint(toComponent,wire.to.terminalId),fromComponent,toComponent };
  };
  const obstacles: RouteObstacle[] = [];
  for (const wire of circuit.wires.filter((item) => item.points?.length)) {
    const ends = endpoints(wire);
    if (!ends) continue;
    const points = [ends.from,...(wire.points ?? []),ends.to];
    routes.set(wire.id,points);
    obstacles.push({wire,points});
  }
  const automatic = circuit.wires.filter((wire) => !wire.points?.length).map((wire) => {
    const ends = endpoints(wire);
    return ends ? {wire,...ends} : null;
  }).filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a,b) => distance(b.from,b.to)-distance(a.from,a.to) || a.wire.id.localeCompare(b.wire.id));
  for (const item of automatic) {
    let points = aStar(item.from,item.to,item.wire,item.fromComponent,item.toComponent,circuit,obstacles,getPoint);
    if (!points) points = fallbackRoute(item.from,item.to,item.wire,item.fromComponent,item.toComponent,circuit,obstacles,getPoint);
    routes.set(item.wire.id,points);
    obstacles.push({wire:item.wire,points});
  }
  return routes;
}
