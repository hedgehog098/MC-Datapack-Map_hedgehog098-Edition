import { computed, onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { Identifier, StructurePlacement, StructureSet, WorldgenStructure } from 'deepslate'
import { useSettingsStore } from './useSettingsStore.js'
import { useLoadedDimensionStore } from './useLoadedDimensionStore.js'
import { useDatapackStore } from './useDatapackStore.js'
import { CachedBiomeSource } from '../util/CachedBiomeSource.js'
import { finiteNumber, readPreference, stringList, writePreference } from '../util/preferences.js'
import { supportedStructure } from '../util/structures.js'
import { optimizeRoute, rememberedKeys, rememberRun, routeLength, scanLocations } from '../util/structureRoutes.js'
import type { Point, RouteStop, RouteMemory, ScanBounds } from '../util/structureRoutes.js'

type Group = {name: string, structures: string[]}
export const useStructureRouteStore = defineStore('structure-routes', () => {
    const settings = useSettingsStore(), dimension = useLoadedDimensionStore(), datapacks = useDatapackStore()
    const saved = readPreference<any>('route-search', {}) ?? {}
    const selected = ref(stringList(saved.selected))
    const groups = ref<Group[]>(Array.isArray(saved.groups) ? saved.groups.filter((g: any) => g && typeof g.name === 'string').map((g: any) => ({name: g.name, structures: stringList(g.structures)})) : [])
    const limit = ref(finiteNumber(saved.limit, 50, 1, 500))
    const radius = ref(finiteNumber(saved.radius, 70000, 1, 1000000))
    const minDistance = ref(finiteNumber(saved.minDistance, 0, 0, 1000000))
    const savedMemory = readPreference<any>('route-memory', [])
    const memories = ref<RouteMemory[]>(Array.isArray(savedMemory) ? savedMemory.filter(m => m && typeof m.world === 'string' && Number.isFinite(m.created) && m.origin && Number.isFinite(m.origin.x) && Number.isFinite(m.origin.z) && Array.isArray(m.stops) && m.stops.every((p: any) => typeof p.id === 'string' && Number.isFinite(p.x) && Number.isFinite(p.z))).slice(0, 2) : [])
    const center = ref<Point>({x: 0, z: 0})
    const jump = ref<Point | null>(null)
    const origin = ref<Point>({x: 0, z: 0})
    const results = ref<RouteStop[]>([])
    const running = ref(false)
    const status = ref('idle')
    const error = ref('')
    const checked = ref(0), found = ref(0), scanRadius = ref(0)
    let generation = 0, userStopped = false
    const world = computed(() => JSON.stringify([
        settings.mc_version, String(settings.seed), String(settings.dimension), String(settings.world_preset),
        datapacks.datapacks.map(d => {
            const source = d.source
            if (source?.kind === 'zip') return ['zip', source.file.name, source.file.size, source.file.lastModified]
            if (source?.kind === 'folder') return ['folder', source.handle.name]
            if (source?.kind === 'files') return ['files', source.files.map(f => [f.webkitRelativePath, f.name, f.size, f.lastModified])]
            if (source?.kind === 'url') return ['url', source.url]
            if (source?.kind === 'modrinth') return ['modrinth', source.slug]
            return ['vanilla']
        })
    ]))
    const available = computed(() => {
        dimension.revision
        if (dimension.loading || dimension.loadError) return []
        return WorldgenStructure.REGISTRY.keys().map(id => ({id: id.toString(), supported: supportedStructure(WorldgenStructure.REGISTRY.getOrThrow(id))}))
    })
    const totalDistance = computed(() => routeLength(origin.value, results.value))
    const rememberedCount = computed(() => rememberedKeys(memories.value, world.value).size)
    watch([selected, groups, limit, radius, minDistance], () => writePreference('route-search', {selected: selected.value, groups: groups.value, limit: limit.value, radius: radius.value, minDistance: minDistance.value}), {deep: true})
    watch(memories, value => writePreference('route-memory', value), {deep: true, flush: 'sync'})
    function invalidate() {
        generation++
        if (running.value || results.value.length) status.value = 'worldChanged'
        running.value = false; results.value = []; error.value = ''
    }
    watch(world, invalidate, {flush: 'sync'})
    watch(() => dimension.loading, value => {if (value) invalidate()}, {flush: 'sync'})
    onScopeDispose(() => {generation++})
    function stop() { userStopped = true }
    function restoreMemory(memory: RouteMemory) {
        if (running.value || memory.world !== world.value) return
        origin.value = {...memory.origin}; results.value = [...memory.stops]; status.value = 'memory'
    }
    async function start() {
        if (running.value) return
        error.value = ''
        if (dimension.loading || dimension.loadError) {error.value = 'unavailable'; return}
        const chosen = new Set(selected.value)
        if (!chosen.size) {error.value = 'selection'; return}
        if ([...chosen].some(id => !available.value.some(a => a.id === id && a.supported))) {error.value = 'unsupported'; return}
        if (!Number.isInteger(limit.value) || limit.value < 1 || limit.value > 500 || !Number.isFinite(radius.value) || radius.value < 1 || radius.value > 1000000 || !Number.isFinite(minDistance.value) || minDistance.value < 0 || minDistance.value > radius.value) {error.value = 'limits'; return}
        const biomeSource = dimension.getBiomeSource()
        if (!biomeSource) {error.value = 'unavailable'; return}
        const sets = StructureSet.REGISTRY.keys().flatMap(id => {
            const set = StructureSet.REGISTRY.get(id)
            return set && set.structures.some(e => chosen.has(e.structure.key()?.toString() ?? '')) ? [set] : []
        })
        if (!sets.length) {error.value = 'unavailable'; return}
        const token = ++generation, worldSnapshot = world.value
        userStopped = false; running.value = true; status.value = 'searching'
        results.value = []; origin.value = {...center.value}; checked.value = found.value = scanRadius.value = 0
        const seed = settings.seed, cached = new CachedBiomeSource(biomeSource)
        const options = {origin: {...origin.value}, radius: radius.value, limit: limit.value, minDistance: minDistance.value, excluded: rememberedKeys(memories.value, worldSnapshot)}
        type Candidate = {set: StructureSet, x: number, z: number}
        function* candidates(bounds: ScanBounds): Generator<Candidate> {
            const minX = Math.floor(bounds.minX / 16), minZ = Math.floor(bounds.minZ / 16), maxX = Math.floor(bounds.maxX / 16), maxZ = Math.floor(bounds.maxZ / 16)
            for (const set of sets) {
                const p = set.placement
                if (p instanceof StructurePlacement.RandomSpreadStructurePlacement) {
                    if (!Number.isInteger(p.spacing) || p.spacing <= 0 || p.separation >= p.spacing) throw new Error('Invalid structure spacing')
                    for (let x = Math.floor(minX / p.spacing) * p.spacing; x <= maxX; x += p.spacing) for (let z = Math.floor(minZ / p.spacing) * p.spacing; z <= maxZ; z += p.spacing) {
                        const [cx, cz] = p.getPotentialStructureChunk(seed, x, z)
                        if (cx >= minX && cx <= maxX && cz >= minZ && cz <= maxZ) yield {set, x: cx, z: cz}
                    }
                } else {
                    for (const [x, z] of p.getPotentialStructureChunks(seed, minX, minZ, maxX, maxZ)) {
                        if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) yield {set, x, z}
                    }
                }
            }
        }
        try {
            await new Promise(resolve => setTimeout(resolve, 0))
            if (generation !== token) return
            const context = new WorldgenStructure.GenerationContext(seed, cached, dimension.noise_generator_settings, dimension.loaded_dimension.level_height ?? {minY: 0, height: 256})
            for (const set of sets) set.placement.prepare(biomeSource, dimension.sampler, seed)
            const result = await scanLocations(options, {
                candidates,
                locate: ({set, x, z}) => {
                    cached.setupCache(x * 4, z * 4)
                    const s = set.getStructureInChunk(x, z, context)
                    return s && chosen.has(s.id.toString()) ? {id: s.id.toString(), x: s.pos[0], z: s.pos[2]} : undefined
                },
                cancelled: () => userStopped || generation !== token,
                progress: progress => { if (generation === token) {checked.value = progress.checked; found.value = progress.found; scanRadius.value = progress.ring} }
            })
            if (generation !== token) return
            results.value = optimizeRoute(options.origin, result.stops)
            status.value = result.reason
            memories.value = rememberRun(memories.value, {world: worldSnapshot, created: Date.now(), origin: options.origin, stops: [...results.value]})
        } catch (e) {
            if (generation === token) {error.value = 'failed'; status.value = 'error'; console.error('Structure route search failed', e)}
        } finally { if (generation === token) running.value = false }
    }
    return {selected, groups, limit, radius, minDistance, memories, center, jump, origin, results, running, status, error, checked, found, scanRadius, available, totalDistance, rememberedCount, world, start, stop, restoreMemory}
})
