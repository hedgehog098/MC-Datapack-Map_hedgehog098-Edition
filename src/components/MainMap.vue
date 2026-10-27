<script setup lang="ts">
import "leaflet/dist/leaflet.css";
import L, { control } from "leaflet";
import { BiomeLayer } from "../MapLayers/BiomeLayer";
import { Graticule } from "../MapLayers/Graticule";
import { onMounted, onBeforeUnmount, computed, ref, watch, watchEffect } from 'vue';
import BiomeTooltip from './BiomeTooltip.vue';
import { BlockPos, Chunk, ChunkPos, DensityFunction, Identifier, RandomState, Structure, StructurePlacement, StructureSet, WorldgenStructure } from 'deepslate';
import YSlider from './YSlider.vue';
import { useSearchStore } from '../stores/useBiomeSearchStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useLoadedDimensionStore } from '../stores/useLoadedDimensionStore'
import { CachedBiomeSource } from '../util/CachedBiomeSource';
import MapButton from './MapButton.vue';
import { SpawnTarget } from '../util/SpawnTarget';
import { useI18n } from 'vue-i18n';
import { versionMetadata } from "../util";

import { readPreference, writePreference, finiteNumber, priorityMinZoom, parseCoordinates } from '../util/preferences'
import { useStructureRouteStore } from '../stores/useStructureRouteStore'
const routeStore = useStructureRouteStore()
const savedView = readPreference<Record<string, any>>('view', {}) ?? {}
const coordinateX = ref('')
const coordinateZ = ref('')
const coordinateError = ref(false)
function centerMap(x: number, z: number) {
    // Leaflet's pan path rounds to screen pixels, which shifts block coordinates at low zoom.
    const options = {animate: false, reset: true}
    map.setView([-z, x], map.getZoom(), options)
}
function goToCoordinates() {
    const position = parseCoordinates(coordinateX.value, coordinateZ.value)
    coordinateError.value = !position
    if (position) centerMap(position[0], position[1])
}
function saveView() {
    if (!map) return
    const center = map.getCenter()
    routeStore.center = {x: center.lng, z: -center.lat}
    writePreference('view', {x: center.lng, z: -center.lat, zoom: map.getZoom(),
        hillshade: do_hillshade.value, sealevel: show_sealevel.value, project: project_down.value,
        y: y.value, graticule: show_graticule.value})
}
function saveOnHide() { if (document.visibilityState === 'hidden') saveView() }
const searchStore = useSearchStore()
const settingsStore = useSettingsStore()
const loadedDimensionStore = useLoadedDimensionStore()
const i18n = useI18n()

let mapResizeObserver: ResizeObserver | undefined
let resizeFrame = 0
let biomeLayer: BiomeLayer
let graticule: Graticule

const tooltip_left = ref(0)
const tooltip_top = ref(0)
const tooltip_biome = ref(Identifier.create("void"))
const tooltip_position = ref(BlockPos.ZERO)
const show_tooltip = ref(false)
const show_info = ref(false)

const do_hillshade = ref(savedView.hillshade !== false)
const show_sealevel = ref(savedView.sealevel === true)
const project_down = ref(savedView.project !== false)

const y = ref(finiteNumber(savedView.y, 320, -4096, 4096))

const show_graticule = ref(savedView.graticule === true)
watch([do_hillshade, show_sealevel, project_down, y, show_graticule], saveView)

watch(show_graticule, (value) => {
    if (value) {
        map.addLayer(graticule)
    } else {
        map.removeLayer(graticule)
    }
})

var map: L.Map
var zoom: L.Control.Zoom
var markers: L.LayerGroup
var spawnMarker: L.Marker

var marker_map = new Map<string, { marker?: L.Marker, structure?: {id: Identifier, pos: BlockPos}, pending?: boolean, failed?: boolean}>()
var needs_zoom = ref(false)
const hiddenLevels = ref<Record<string, number>>({})
const markerLoading = ref(false)
const markerTotal = ref(0)
const markerCompleted = ref(0)
const markerErrors = ref(0)
const imageLoading = ref(0)
const imageErrors = ref(0)
const imageStates = new Map<L.Marker, 'loading' | 'failed'>()
function refreshImageStatus() {
    imageLoading.value = [...imageStates.values()].filter(v => v === 'loading').length
    imageErrors.value = [...imageStates.values()].filter(v => v === 'failed').length
}
const hiddenDescription = computed(() => Object.entries(hiddenLevels.value).map(([level, count]) => i18n.t('local.visibility.hiddenLevel', {level: i18n.t(`local.visibility.${level}`), count})).join('；'))
watch(() => routeStore.jump, position => {
    if (position && map) centerMap(position.x, position.z)
})



onMounted(() => {
    map = L.map("map", {
        zoom: finiteNumber(savedView.zoom, -2, -6, 1),
        minZoom: -6,
        maxZoom: 1,
        center: [-finiteNumber(savedView.z, 0, -30000000, 30000000), finiteNumber(savedView.x, 0, -30000000, 30000000)],
        zoomControl: false,
        attributionControl: false,
        crs: L.CRS.Simple
    })

    mapResizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame)
        resizeFrame = requestAnimationFrame(() => {
            const size = map.getSize(), element = map.getContainer()
            if (size.x === element.clientWidth && size.y === element.clientHeight) return
            const center = map.getCenter()
            map.invalidateSize({animate: false})
            centerMap(center.lng, -center.lat)
        })
    })
    mapResizeObserver.observe(document.getElementById('map_container')!)

    zoom = L.control.zoom({
        position: i18n.t('locale.text_direction') === 'ltr' ? 'topright' : 'topleft'
    })
    zoom.addTo(map)

    biomeLayer = new BiomeLayer({
            tileSize: 256,
            minZoom: -6,
            keepBuffer: 1,
            updateWhenIdle: true
        },
        do_hillshade,
        show_sealevel,
        project_down,
        y
    )

    map.addLayer(biomeLayer)

    spawnMarker = L.marker({lat: 0, lng: 0}, {
        icon: L.icon({
            iconUrl: "images/spawn_icon.png",
            iconAnchor: [16, 16],
            popupAnchor: [0, -10]
        }),
    }).bindPopup(L.popup())

    updateSpawnMarker()

    markers = L.layerGroup().addTo(map)

    map.addEventListener("mousemove", (evt: L.LeafletMouseEvent) => {
        if (loadedDimensionStore.loading || loadedDimensionStore.loadError) return
        tooltip_left.value = evt.originalEvent.pageX-4
        tooltip_top.value = evt.originalEvent.pageY-4

        const pos = getPosition(map, evt.latlng)

        const biome = loadedDimensionStore.getBiomeSource()?.getBiome(pos[0] >> 2, pos[1] >> 2, pos[2] >> 2, loadedDimensionStore.sampler) ?? Identifier.create("plains")

        tooltip_biome.value = biome
        tooltip_position.value = pos
        show_tooltip.value = true
    })


    map.addEventListener("mouseout", (evt: L.LeafletMouseEvent) => {
        show_tooltip.value = false
    })

    map.addEventListener("contextmenu", async (evt: L.LeafletMouseEvent) => {
        if (loadedDimensionStore.loading || loadedDimensionStore.loadError) return
        const pos = getPosition(map, evt.latlng)
        navigator.clipboard.writeText(`/execute in ${settingsStore.dimension.toString()} run tp ${pos[0].toFixed(0)} ${(pos[1] + (project_down.value ? 10 : 0)).toFixed(0)} ${pos[2].toFixed()}`)
        show_info.value = true
        setTimeout(() => show_info.value = false, 2000)
    })


    map.on("moveend", (evt) => {
        scheduleMarkers()
        saveView()
    })

    graticule = new Graticule()
    if (show_graticule.value) map.addLayer(graticule)
    window.addEventListener('pagehide', saveView)
    document.addEventListener('visibilitychange', saveOnHide)
    routeStore.center = {x: map.getCenter().lng, z: -map.getCenter().lat}
    updateMarkers()

    /*
    layer.on("tileunload", (evt) => {
        // @ts-expect-error: _tileCoordsToBounds does not exist
        const tileBounds = layer._tileCoordsToBounds(evt.coords);

    })*/

});

watch(i18n.locale, () => {
    zoom.setPosition(i18n.t('locale.text_direction') === 'ltr' ? 'topright' : 'topleft')
})

function getPosition(map: L.Map, latlng: L.LatLng) {
    const crs = map.options.crs!
    const pos = crs.project(latlng)
    pos.y *= -1

    const surface = (loadedDimensionStore.surface_density_function)?.compute(DensityFunction.context((pos.x >> 2) << 2, y.value, (pos.y >> 2) << 2)) ?? Number.POSITIVE_INFINITY

    const pos_y: number = project_down.value ? Math.min(surface, y.value) : y.value
    return BlockPos.create(pos.x, pos_y, pos.y)
}

function isInBounds(pos: ChunkPos, min: ChunkPos, max: ChunkPos) {
    return (pos[0] >= min[0] && pos[0] <= max[0] && pos[1] >= min[1] && pos[1] <= max[1])
}


let structureTasks: (() => void)[] = []
let structureTaskIndex = 0
let structureTimer: ReturnType<typeof setTimeout> | undefined
function runStructureTasks() {
    if (loadedDimensionStore.loading || loadedDimensionStore.loadError) return
    const deadline = performance.now() + 6
    while (structureTaskIndex < structureTasks.length && performance.now() < deadline) {
        try { structureTasks[structureTaskIndex++]() }
        catch (error) { markerErrors.value++; console.warn('Structure marker calculation failed', error) }
    }
    markerCompleted.value = structureTaskIndex
    if (structureTaskIndex < structureTasks.length) structureTimer = setTimeout(runStructureTasks, 0)
    else { structureTasks = []; structureTaskIndex = 0; markerLoading.value = false }
}
let markerTimer: ReturnType<typeof setTimeout> | undefined
function scheduleMarkers() {
    clearTimeout(markerTimer)
    markerLoading.value = true
    markerTotal.value = markerCompleted.value = 0
    markerTimer = setTimeout(updateMarkers, 80)
}
onBeforeUnmount(() => {
    saveView()
    mapResizeObserver?.disconnect()
    cancelAnimationFrame(resizeFrame)
    clearTimeout(markerTimer)
    clearTimeout(structureTimer)
    structureTasks = []
    window.removeEventListener('pagehide', saveView)
    document.removeEventListener('visibilitychange', saveOnHide)
    markers?.clearLayers()
    marker_map.clear()
    map?.remove()
})

function updateMarkers() {
    if (!map || !markers || loadedDimensionStore.loading || loadedDimensionStore.loadError) return
    clearTimeout(structureTimer)
    structureTasks = []
    structureTaskIndex = 0
    markerTotal.value = markerCompleted.value = markerErrors.value = 0
    markerLoading.value = false
    hiddenLevels.value = {}
    for (const [key, value] of marker_map) if (value.pending) marker_map.delete(key)
    const biomeSource = loadedDimensionStore.getBiomeSource()
    if (biomeSource === undefined) {
        return
    }

    const cachedBiomeSource = new CachedBiomeSource(biomeSource)
    const context = new WorldgenStructure.GenerationContext(settingsStore.seed, cachedBiomeSource, loadedDimensionStore.noise_generator_settings, loadedDimensionStore.loaded_dimension.level_height ?? {minY: 0, height: 256})

    const bounds = map.getBounds()

    const crs = map.options.crs!
    const minPos = crs.project(bounds.getNorthWest())
    const maxPos = crs.project(bounds.getSouthEast())

    const minChunk = ChunkPos.create(minPos.x >> 4, -minPos.y >> 4)
    const maxChunk = ChunkPos.create(maxPos.x >> 4, -maxPos.y >> 4)

    var _needs_zoom = false
    const hiddenIds: Record<string, Set<string>> = {}

    const keptMarkers: Set<string> = new Set()

    const scheduler = (task: () => void) => structureTasks.push(task)

    for (const id of searchStore.structure_sets.sets) {
        const set = StructureSet.REGISTRY.get(id)
        if (!set) continue

        let minZoom = 2

        if (set.placement instanceof StructurePlacement.ConcentricRingsStructurePlacement){
            set.placement.prepare(biomeSource, loadedDimensionStore.sampler, settingsStore.seed)
            minZoom = -2
        } else if (set.placement instanceof StructurePlacement.RandomSpreadStructurePlacement) {
            const chunkFrequency = (set.placement.frequency) / (set.placement.spacing * set.placement.spacing)
            minZoom = -Math.log2(1/(chunkFrequency * 128))
        }

        const visibleStructures = new Set(set.structures.flatMap(entry => {
            const key = entry.structure.key()?.toString()
            return key && searchStore.structures.has(key) && map.getZoom() >= priorityMinZoom(searchStore.priorities[key], minZoom) ? [key] : []
        }))
        for (const entry of set.structures) {
            const key = entry.structure.key()?.toString()
            if (key && searchStore.structures.has(key) && !visibleStructures.has(key)) {
                const level = searchStore.priorities[key] ?? 'auto'
                hiddenIds[level] ??= new Set<string>()
                hiddenIds[level].add(key)
                _needs_zoom = true
            }
        }

        if (visibleStructures.size){
            const chunks: ChunkPos[] = set.placement.getPotentialStructureChunks(settingsStore.seed, minChunk[0], minChunk[1], maxChunk[0], maxChunk[1])

            for (const chunk of chunks) {
                const storage_id = `${id.toString()} ${chunk[0]},${chunk[1]}`
                const inBounds = isInBounds(chunk, minChunk, maxChunk)
                const stored = marker_map.get(storage_id)

                if (inBounds){
                    if (stored === undefined) {
                        const m: { marker?: L.Marker, structure?: {id: Identifier, pos: BlockPos}, pending?: boolean, failed?: boolean } = {pending: true}

                        marker_map.set(storage_id, m)


                        scheduler(() => {
                            if (marker_map.get(storage_id) !== m) return

                            try {
                            cachedBiomeSource.setupCache(chunk[0] << 2, chunk[1] << 2)
                            const structure = set.getStructureInChunk(chunk[0], chunk[1], context)

                            const marker = structure && searchStore.structures.has(structure.id.toString()) && map.getZoom() >= priorityMinZoom(searchStore.priorities[structure.id.toString()], minZoom) ? getMarker(structure.id, structure.pos) : undefined
                            m.pending = false
                            m.structure = structure
                            m.marker = marker
                            } catch (error) { m.failed = true; throw error }
                            finally { m.pending = false }
                        })
                    } else {
                        if (stored.structure){
                            const should_have_marker = visibleStructures.has(stored.structure.id.toString())
                            if (should_have_marker && stored.marker === undefined){
                                stored.marker = getMarker(stored.structure.id, stored.structure.pos)
                            } else if (!should_have_marker && stored.marker !== undefined){
                                markers.removeLayer(stored.marker)
                                stored.marker = undefined
                            }
                        }
                    }
                    keptMarkers.add(storage_id)
                }
            }
        } else {
            _needs_zoom = true
        }
    }

    for (const key of marker_map.keys()){
        if (!keptMarkers.has(key)){
            const marker = marker_map.get(key)
            if (marker?.marker) markers.removeLayer(marker.marker)
            marker_map.delete(key)
        }
    }

    hiddenLevels.value = Object.fromEntries(Object.entries(hiddenIds).map(([level, ids]) => [level, ids.size]))
    markerErrors.value = [...marker_map.values()].filter(m => m.failed).length
    markerTotal.value = structureTasks.length
    markerLoading.value = structureTasks.length > 0
    if (structureTasks.length) structureTimer = setTimeout(runStructureTasks, 0)
    needs_zoom.value = _needs_zoom
}

function getMarker(structureId: Identifier, pos: BlockPos) {
    const crs = map.options.crs!
    const mapPos = new L.Point(pos[0], -pos[2])
    const popup = L.popup().setContent(() => `${settingsStore.getLocalizedName("structure", structureId, false)}<br />${i18n.t("map.coords.xyz", {x: pos[0], y: pos[1], z: pos[2]})}`)
    const marker = L.marker(crs.unproject(mapPos))
    marker.bindPopup(popup).addTo(markers)
    const iconUrl = loadedDimensionStore.getIcon(structureId)
    marker.setIcon(L.icon({
        iconUrl: iconUrl,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        shadowUrl: 'shadow.png',
        shadowSize: [40, 40],
        shadowAnchor: [20, 20],
        popupAnchor: [0, -10]
    }))
    const element = marker.getElement() as HTMLImageElement | undefined
    if (element) {
        const finish = () => {
            if (element.naturalWidth > 0) imageStates.delete(marker)
            else imageStates.set(marker, 'failed')
            refreshImageStatus()
        }
        if (!element.complete) {
            imageStates.set(marker, 'loading')
            element.addEventListener('load', finish)
            element.addEventListener('error', finish)
        } else if (!element.naturalWidth) imageStates.set(marker, 'failed')
        marker.once('remove', () => {
            element.removeEventListener('load', finish)
            element.removeEventListener('error', finish)
            imageStates.delete(marker)
            refreshImageStatus()
        })
        refreshImageStatus()
    }
    return marker
}

function updateSpawnMarker(){
    if (settingsStore.dimension.toString() === "minecraft:overworld"){
        const crs = map.options.crs!
        const spawnTarget = SpawnTarget.fromJson(loadedDimensionStore.loaded_dimension.noise_settings_json?.spawn_target, versionMetadata[settingsStore.mc_version].spawnAlgorithm)
        const spawn = spawnTarget.getSpawnPoint(loadedDimensionStore.sampler)
        const pos = new L.Point(spawn[0] + 7, - spawn[1] - 7)
        spawnMarker.setLatLng(crs.unproject(pos))
        spawnMarker.bindPopup(L.popup().setContent(() => `${i18n.t("map.tooltip.spawn")}<br />${i18n.t("map.coords.xz", {x: spawn[0] + 7, z: spawn[1] + 7})}`))
        spawnMarker.addTo(map)
    } else {
        spawnMarker.removeFrom(map)
    }

}

watch(() => loadedDimensionStore.revision, () => {
    if (!map || !markers) return
    for (const marker of marker_map.values()){
        if (marker.marker) markers.removeLayer(marker.marker)
    }
    marker_map.clear()
    updateMarkers()
    updateSpawnMarker()

    const level_height = loadedDimensionStore.loaded_dimension.level_height
    if (level_height){
        if (project_down.value && loadedDimensionStore.surface_density_function !== undefined){
            y.value = level_height.minY + level_height.height || y.value
        } else {
            y.value = Math.max(Math.min(y.value, level_height.minY + level_height.height), level_height.minY)
        }
    } 
})

watch(() => loadedDimensionStore.loading, value => {
    if (value) {
        clearTimeout(markerTimer)
        clearTimeout(structureTimer)
        structureTasks = []
        markerLoading.value = false
        show_tooltip.value = false
    }
}, {flush: 'sync'})

watch([searchStore.structures, searchStore.priorities], scheduleMarkers, {deep: true})

</script>
  
<template>
    <div id="map_container">
        <div id="map">
        </div>
    <div class="top" role="status" aria-live="polite">
        <div class="info" v-if="loadedDimensionStore.loading">{{ i18n.t('local.visibility.worldLoading') }}</div>
        <div class="info unsupported" v-if="loadedDimensionStore.loadError">{{ i18n.t('local.visibility.worldError') }}</div>
        <div class="info marker-loading" v-if="markerLoading">{{ markerTotal ? i18n.t('local.visibility.loading', {done: markerCompleted, total: markerTotal}) : i18n.t('local.visibility.preparing') }}</div>
        <div class="info image-loading" v-if="imageLoading">{{ i18n.t('local.visibility.images', {count: imageLoading}) }}</div>
        <div class="info unsupported" v-if="markerErrors || imageErrors">{{ i18n.t('local.visibility.errors', {calculations: markerErrors, images: imageErrors}) }}</div>
        <Transition>
            <div class="info zoom" v-if="needs_zoom">
                {{ hiddenDescription }}
            </div>
        </Transition>
        <Transition>
            <div class="info unsupported" v-if="searchStore.structure_sets.has_invalid">
                {{ i18n.t('map.error.structures_unsupported') }}
            </div>
        </Transition>
    </div>
        <form class="coordinate-jump" @submit.prevent="goToCoordinates">
            <label>X <input v-model="coordinateX" aria-label="X" inputmode="numeric" placeholder="0" required /></label>
            <label>Z <input v-model="coordinateZ" aria-label="Z" inputmode="numeric" placeholder="0" required /></label>
            <button type="submit">{{ i18n.t('local.coordinates.go') }}</button>
            <span v-if="coordinateError" role="alert">{{ i18n.t('local.coordinates.error') }}</span>
        </form>
        <div class="map_options">
            <Suspense>
                <YSlider class="slider" v-model:y="y" />
            </Suspense>
            <MapButton icon="fa-arrows-down-to-line" :disabled="loadedDimensionStore.loading || loadedDimensionStore.loadError || loadedDimensionStore.surface_density_function === undefined" v-model="project_down" :title="i18n.t('map.setting.project')" />
            <MapButton icon="fa-mountain-sun" :disabled="loadedDimensionStore.loading || loadedDimensionStore.loadError || (!project_down || loadedDimensionStore.surface_density_function === undefined) && ! loadedDimensionStore.terrain_density_function" v-model="do_hillshade"  :title="i18n.t('map.setting.hillshade')" />
            <MapButton icon="fa-water" :disabled="loadedDimensionStore.loading || loadedDimensionStore.loadError || loadedDimensionStore.surface_density_function === undefined" v-model="show_sealevel" :title="i18n.t('map.setting.sealevel')" />
            <MapButton icon="fa-table-cells" v-model="show_graticule" :title="i18n.t('map.setting.graticule')" />
        </div>
    </div>
    <BiomeTooltip id="tooltip" v-if="show_tooltip" :style="{ left: tooltip_left + 'px', top: tooltip_top + 'px' }"
        :biome="tooltip_biome" :pos="tooltip_position" />
    <Transition>
        <div class="info bottom teleport" v-if="show_info">
            {{ i18n.t('map.info.teleport_command_copied') }}
        </div>
    </Transition>
</template>

<style scoped>
.coordinate-jump { position: absolute; bottom: 1rem; right: .75rem; z-index: 600; display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; max-width: calc(100% - 2rem); background: var(--surface); border: 1px solid var(--border); box-shadow: 0 8px 24px #0003; color: white; padding: .6rem; border-radius: .5rem; }
.coordinate-jump input { width: 6.5rem; padding: .3rem; }
.coordinate-jump button { padding: .35rem .7rem; cursor: pointer; }
.coordinate-jump span { width: 100%; font-size: .8rem; }
#map_container {
    width: 0;
    min-width: 0;
    flex-grow: 1;
    position: relative;
}

#map {
    width: 100%;
    height: 100%;
    cursor: crosshair;
    background: white url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill-opacity=".25" ><rect x="20" width="20" height="20" /><rect y="20" width="20" height="20" /></svg>');
    background-size: 25px 25px;
}

#map.leaflet-drag-target {
    cursor: grab;
}

.map_options {
    position: absolute;
    z-index: 600;
    top: 5rem;
    right: 0.85rem;
    display: flex;
    flex-direction: column;
    align-items: end;
    gap: 0.5rem;
}

.map_options:dir(rtl) {
    right: unset;
    left: 0.85rem;
}

#tooltip {
    position: absolute;
    pointer-events: none;
    z-index: 500;
}


.top{
    position: absolute;
    z-index: 500;
    left: 50%;
    transform: translateX(-50%);
    top: 0.5rem;
    max-width: calc(100% - 7rem);
    pointer-events: none;
}

.bottom {
    position: absolute;
    z-index: 500;
    left: 50%;
    transform: translateX(-50%);
    bottom: 0.5rem;
}

.info {
    padding: 0.3rem;
    padding-left: 1rem;
    padding-right: 1rem;
    border-radius: 8px;
    background-color: #122536ed;
    box-shadow: 0 3px 12px #0003;
    font-size: 12px;
    border: 1px solid #395164;
    color: rgb(255, 255, 255);
    user-select: none;
    margin: 0.2rem;
}

.teleport {
    color: rgb(189, 189, 189);
}

.unsupported {
    background-color: rgb(165, 33, 33);
    border: 2px solid white
}


</style>