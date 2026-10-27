export type Point = {x: number, z: number}
export type RouteStop = Point & {id: string}
export type RouteMemory = {world: string, created: number, origin: Point, stops: RouteStop[]}
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)
export const stopKey = (p: RouteStop) => `${p.id}|${p.x}|${p.z}`
export function rememberedKeys(memories: RouteMemory[], world: string): Set<string> {
    return new Set(memories.filter(m => m.world === world).flatMap(m => m.stops.map(stopKey)))
}
export function rememberRun(memories: RouteMemory[], run: RouteMemory): RouteMemory[] {
    return run.stops.length ? [run, ...memories].slice(0, 2) : memories
}
export function routeLength(origin: Point, stops: Point[]): number {
    let previous = origin, length = 0
    for (const stop of stops) { length += distance(previous, stop); previous = stop }
    return length
}
// Open route from a fixed starting point. Nearest neighbour followed by 2-opt;
// this is a TSP heuristic, not a guarantee of the global optimum.
export function optimizeRoute(origin: Point, stops: RouteStop[]): RouteStop[] {
    const remaining = [...stops], route: RouteStop[] = []
    let previous = origin
    while (remaining.length) {
        let best = 0
        for (let i = 1; i < remaining.length; i++) if (distance(previous, remaining[i]) < distance(previous, remaining[best])) best = i
        previous = remaining.splice(best, 1)[0]
        route.push(previous as RouteStop)
    }
    for (let pass = 0; pass < 30; pass++) {
        let improved = false
        for (let i = 0; i < route.length - 1; i++) for (let j = i + 1; j < route.length; j++) {
            const a = i ? route[i - 1] : origin, b = route[i], c = route[j], d = route[j + 1]
            const oldLength = distance(a, b) + (d ? distance(c, d) : 0)
            const newLength = distance(a, c) + (d ? distance(b, d) : 0)
            if (newLength + 1e-7 < oldLength) {
                route.splice(i, j - i + 1, ...route.slice(i, j + 1).reverse())
                improved = true
            }
        }
        if (!improved) break
    }
    return route
}
export type ScanBounds = {minX: number, minZ: number, maxX: number, maxZ: number}
export type ScanProgress = {checked: number, found: number, ring: number}
export type ScanOptions = {origin: Point, radius: number, limit: number, minDistance: number, excluded: Set<string>}
export function* squareRing(ring: number): Generator<[number, number]> {
    if (ring === 0) { yield [0, 0]; return }
    for (let x = -ring; x <= ring; x++) { yield [x, -ring]; yield [x, ring] }
    for (let z = -ring + 1; z < ring; z++) { yield [-ring, z]; yield [ring, z] }
}
export async function scanLocations<C>(options: ScanOptions, adapter: {
    candidates(bounds: ScanBounds): Iterable<C>,
    locate(candidate: C): RouteStop | undefined,
    cancelled(): boolean,
    progress(value: ScanProgress): void
}) {
    const {origin, radius, limit, minDistance, excluded} = options
    if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isFinite(radius) || radius < 1 || radius > 1000000 || !Number.isFinite(minDistance) || minDistance < 0 || minDistance > radius || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) throw new Error('Invalid search limits')
    const results: RouteStop[] = [], seen = new Set(excluded)
    const cellSize = 2048
    const centerX = Math.floor(origin.x / cellSize), centerZ = Math.floor(origin.z / cellSize)
    const maxRing = Math.ceil(radius / cellSize) + 1
    let checked = 0, ring = 0, deadline = performance.now() + 8
    const progress = () => adapter.progress({checked, found: results.length, ring: Math.min(radius, (ring + 1) * cellSize)})
    const finish = (reason: 'limit' | 'radius' | 'cancelled') => { progress(); return {stops: results, reason} }
    for (ring = 0; ring <= maxRing; ring++) for (const [dx, dz] of squareRing(ring)) {
        if (adapter.cancelled()) return finish('cancelled')
        const minX = (centerX + dx) * cellSize, minZ = (centerZ + dz) * cellSize
        const maxX = minX + cellSize - 1, maxZ = minZ + cellSize - 1
        const nearX = Math.max(minX, Math.min(origin.x, maxX)), nearZ = Math.max(minZ, Math.min(origin.z, maxZ))
        if (distance(origin, {x: nearX, z: nearZ}) > radius + 32) continue
        if (minX > 30000000 || minZ > 30000000 || maxX < -30000000 || maxZ < -30000000) continue
        for (const candidate of adapter.candidates({minX, minZ, maxX, maxZ})) {
            if (adapter.cancelled()) return finish('cancelled')
            const stop = adapter.locate(candidate)
            checked++
            if (stop && Math.abs(stop.x) <= 30000000 && Math.abs(stop.z) <= 30000000 && distance(origin, stop) <= radius && !seen.has(stopKey(stop)) && results.every(p => distance(p, stop) >= minDistance)) {
                results.push(stop); seen.add(stopKey(stop))
                if (results.length >= limit) return finish('limit')
            }
            if (performance.now() >= deadline) {
                progress(); await new Promise(resolve => setTimeout(resolve, 0)); deadline = performance.now() + 8
            }
        }
        if (performance.now() >= deadline) {
            progress(); await new Promise(resolve => setTimeout(resolve, 0)); deadline = performance.now() + 8
        }
    }
    return finish('radius')
}
