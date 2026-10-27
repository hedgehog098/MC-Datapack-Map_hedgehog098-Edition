// Versioned, defensive storage. A denied/quota-limited storage must not break the map.
const prefix = 'mc-datapack-map:v1:'
export function readPreference<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(prefix + key)
        return raw === null ? fallback : JSON.parse(raw)
    } catch { return fallback }
}
export function writePreference(key: string, value: unknown) {
    try {
        const serialized = JSON.stringify(value)
        if (localStorage.getItem(prefix + key) !== serialized) localStorage.setItem(prefix + key, serialized)
    } catch (error) { console.warn('Could not save map preferences', error) }
}
export function stringList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter(v => typeof v === 'string') : []
}
export function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback
}
export function priorityMinZoom(priority: unknown, automatic: number): number {
    // Higher priority remains visible further out. Auto preserves upstream density rules.
    return priority === 'high' ? -6 : priority === 'medium' ? -3 : priority === 'low' ? -1 : automatic
}
export function parseCoordinates(x: string, z: string): [number, number] | undefined {
    if (!x.trim() || !z.trim()) return undefined
    const values = [Number(x), Number(z)]
    return values.every(v => Number.isFinite(v) && Math.abs(v) <= 30000000) ? values as [number, number] : undefined
}
