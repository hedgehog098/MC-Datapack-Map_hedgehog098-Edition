import * as L from "leaflet"
//import { last, range, takeWhile } from "lodash";
import { Climate } from "deepslate";
import { calculateHillshade, getCustomDensityFunction, hashCode } from "../util.js";
import MultiNoiseCalculator from "../webworker/MultiNoiseCalculator?worker"
import { useSearchStore } from "../stores/useBiomeSearchStore.js";
import { useLoadedDimensionStore } from "../stores/useLoadedDimensionStore.js";
import { useSettingsStore } from "../stores/useSettingsStore.js";
import { useDatapackStore } from "../stores/useDatapackStore.js";
import { Ref, toRaw, watch, effectScope } from "vue";
import { ResourceLocation } from "mc-datapack-loader";

const WORKER_COUNT = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))

type Tile = {
	coords: L.Coords,
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	done: L.DoneCallback,
    surfaceValues?: Float64Array,
    terrainValues?: Float64Array,
    biomeValues?: Uint16Array,
    palette?: string[],
    requestId: number,
	step?: number,
	isRendering?: boolean,
	workerId: number
}

export class BiomeLayer extends L.GridLayer {
	private next_worker_id = 0
    private requestId = 0
    private disposed = false
    private effects = effectScope(true)

	private Tiles: { [key: string]: Tile } = {}
	private tileSize = 0
	private calcResolution = 0

	private workers: Worker[] = []

	private datapackStore = useDatapackStore()
	private loadedDimensionStore = useLoadedDimensionStore()
	private searchStore = useSearchStore()
	private settingsStore = useSettingsStore()

	private datapackLoader: Promise<any> | undefined

	private generationVersion = 0
    private workerUpdates: Promise<void> = Promise.resolve()
	private waveImage: Promise<HTMLImageElement>

	constructor(options: L.GridLayerOptions, private do_hillshade: Ref<boolean>, private show_sealevel: Ref<boolean>, private project_down: Ref<boolean>, private y: Ref<number>) {
		super(options)
		this.tileSize = options.tileSize as number
		this.calcResolution = 1 / 4

		this.createWorkers()
		this.datapackLoader = this.updateWorkers({
			dimension: true,
			registires: true,
			settings: true,
		}),

			this.waveImage = new Promise((resolve) => {
				const waveImage = new Image()
				waveImage.onload = () => resolve(waveImage)
				waveImage.src = "images/wave.png"
			})


		this.effects.run(() => {
		watch([this.searchStore.biomes, () => this.searchStore.disabled], ([biomes, disabled], [oldBiomes, oldDisabled]) => {
			// Do not re-render if no biomes were filtered, regardless of the disabled state
			if (oldDisabled !== disabled && oldBiomes.size === 0 && biomes.size === 0) return
			this.rerender() 
		})

		watch(do_hillshade, () => {
			this.rerender()
		})

		watch(show_sealevel, () => {
			this.rerender()
		})

		watch(this.project_down, () => {
			this.datapackLoader = this.updateWorkers({
				settings: true
			})
			this.redraw()
		})

		watch(this.y, () => {
			this.datapackLoader = this.updateWorkers({
				settings: true
			})
			this.redraw()
		})

		watch(() => this.loadedDimensionStore.revision, async () => {
			await (this.datapackLoader = this.updateWorkers({
				settings: true,
				dimension: true,
				registires: true
			}))
			this.redraw()
		})

        })
	}

    onRemove(map: L.Map): this {
        this.disposed = true
        this.effects.stop()
        this.workers.forEach(worker => worker.terminate())
        this.Tiles = {}
        return super.onRemove(map)
    }

	// ===== Draw tiles that have generated biomes =====
	async renderTile(tile: Tile) {
		tile.isRendering = false
		if (tile.surfaceValues === undefined || tile.terrainValues === undefined || tile.biomeValues === undefined || tile.palette === undefined || tile.step === undefined) {
			console.warn("trying to render empty tile")
			return
		}

		tile.ctx.clearRect(0, 0, this.tileSize, this.tileSize)

		const waveImage = await this.waveImage

		if (this.disposed) return
        const width = this.tileSize * this.calcResolution + 2

		const project_down = this.project_down.value
		const do_hillshade = this.do_hillshade.value
		const show_sealevel = this.show_sealevel.value
		const getBiomeColor = this.loadedDimensionStore.getBiomeColor

		for (let x = 0; x < this.tileSize * this.calcResolution; x++) {
			for (let z = 0; z < this.tileSize * this.calcResolution; z++) {
				const biome = tile.palette[tile.biomeValues[(x + 1) * width + (z + 1)]]

				if (this.searchStore.biomes.size > 0
					&& !this.searchStore.biomes.has(biome)
					&& !this.searchStore.disabled
				) {
					continue
				}

				let hillshade = 1.0
				const y = project_down ? Math.min(tile.surfaceValues[(x + 1) * width + (z + 1)], this.y.value) : this.y.value
				const belowSurface = y < tile.surfaceValues[(x + 1) * width + (z + 1)]
				if (do_hillshade && tile.terrainValues[(x + 1) * width + (z + 1)] < 0){
					hillshade = 0.15
				} else if (do_hillshade && project_down && !belowSurface) {

					hillshade = calculateHillshade(
						tile.surfaceValues[(x + 2) * width + (z + 1)] - tile.surfaceValues[(x) * width + (z + 1)],
						tile.surfaceValues[(x + 1) * width + (z + 2)] - tile.surfaceValues[(x + 1) * width + (z)],
						tile.step
					)
				}

				let biomeColor = getBiomeColor(biome)
				tile.ctx.fillStyle = `rgb(${biomeColor.r * hillshade}, ${biomeColor.g * hillshade}, ${biomeColor.b * hillshade})`

				tile.ctx.fillRect(x / this.calcResolution, z / this.calcResolution, 1 / this.calcResolution, 1 / this.calcResolution)

				if (show_sealevel && !belowSurface) {
					if (y < this.loadedDimensionStore.noise_generator_settings.seaLevel - 2) {
						tile.ctx.drawImage(waveImage, x / this.calcResolution % 16, z / this.calcResolution % 16, 4, 4, x / this.calcResolution, z / this.calcResolution, 4, 4)
					}
				}

			}
		}

	}

	async rerender() {

		for (const key in this.Tiles) {
			if (!this.Tiles[key].isRendering) {
				this.Tiles[key].isRendering = true
				setTimeout(() => { const tile = this.Tiles[key]; if (tile && !this.disposed) void this.renderTile(tile) }, 0)
			}
		}
	}


	// ==== Manage workers to generate biomes of tiles
	private createWorkers() {
		this.workers = []
		for (let i = 0; i < WORKER_COUNT; i++) {
			const worker = new MultiNoiseCalculator()
			worker.onmessage = (ev) => {
				if (this.disposed || ev.data.generationVersion !== this.generationVersion) {
					return
				}
				const tile = this.Tiles[ev.data.key]
				if (tile === undefined || tile.requestId !== ev.data.requestId)
					return

				tile.surfaceValues = ev.data.surfaceValues
                tile.terrainValues = ev.data.terrainValues
                tile.biomeValues = ev.data.biomeValues
                tile.palette = ev.data.palette
				tile.step = ev.data.step

				tile.isRendering = true
				this.renderTile(tile)

				tile.done()
				tile.done = () => { /* nothing */ }
			}

			this.workers.push(worker)
		}
	}

    updateWorkers(update: {registires?: boolean, dimension?: boolean, settings?: boolean}): Promise<void> {
        const pending = this.workerUpdates.then(() => this.performWorkerUpdate(update))
        this.workerUpdates = pending.catch(error => console.error('Worker update failed', error))
        return pending
    }

	private async performWorkerUpdate(do_update: {
		registires?: boolean,
		dimension?: boolean,
		settings?: boolean,
	}) {
		this.generationVersion++
		const update: any = { generationVersion: this.generationVersion }

		if (do_update.registires) {
			update.densityFunctions = {}
			for (const id of await this.datapackStore.composite_datapack.getIds(ResourceLocation.WORLDGEN_DENSITY_FUNCTION)) {
				update.densityFunctions[id.toString()] = await this.datapackStore.composite_datapack.get(ResourceLocation.WORLDGEN_DENSITY_FUNCTION, id)
			}

			update.noises = {}
			for (const id of await this.datapackStore.composite_datapack.getIds(ResourceLocation.WORLDGEN_NOISE)) {
				update.noises[id.toString()] = await this.datapackStore.composite_datapack.get(ResourceLocation.WORLDGEN_NOISE, id)
			}
		}

		if (do_update.dimension) {
			update.biomeSourceJson = toRaw(this.loadedDimensionStore.loaded_dimension.biome_source_json)
			update.noiseGeneratorSettingsJson = toRaw(this.loadedDimensionStore.loaded_dimension.noise_settings_json)
			update.surfaceDensityFunctionId = getCustomDensityFunction("snowcapped_surface", this.loadedDimensionStore.loaded_dimension.noise_settings_id!, this.settingsStore.dimension)?.toString() ?? "<none>"
			update.terrainDensityFunctionId = getCustomDensityFunction("map_simple_terrain", this.loadedDimensionStore.loaded_dimension.noise_settings_id!, this.settingsStore.dimension)?.toString() ?? "<none>"
		}

		if (do_update.settings) {
			update.seed = this.settingsStore.seed
			update.y = this.y.value
			update.project_down = this.project_down.value
		}

		if (!this.disposed && update.generationVersion === this.generationVersion) this.workers.forEach(w => w.postMessage({ update }))
	}

	generateTile(key: string, coords: L.Coords, worker_id: number) {
		// @ts-expect-error: _tileCoordsToBounds does not exist
		const tileBounds = this._tileCoordsToBounds(coords);
		const west = tileBounds.getWest(),
			east = tileBounds.getEast(),
			north = tileBounds.getNorth(),
			south = tileBounds.getSouth();

		const crs = this._map.options.crs!,
			min = crs.project(L.latLng(north, west)).multiplyBy(0.25),
			max = crs.project(L.latLng(south, east)).multiplyBy(0.25);

		min.y *= -1
		max.y *= -1

		const task = {
			key,
            requestId: this.Tiles[key].requestId,
            generationVersion: this.generationVersion,
			min,
			max,
			tileSize: this.tileSize * this.calcResolution
		}

		this.workers[worker_id].postMessage({ task })
	}

	createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
		const tile = L.DomUtil.create("canvas", "leaflet-tile")
		tile.width = tile.height = this.tileSize

		tile.onselectstart = tile.onmousemove = L.Util.falseFn

		const ctx = tile.getContext("2d")!

		if (!this._map) {
			return tile;
		}

        const key = this._tileCoordsToKey(coords)
        const entry: Tile = {coords, canvas: tile, ctx, done, workerId: this.next_worker_id, requestId: ++this.requestId}
        this.Tiles[key] = entry
        this.next_worker_id = (this.next_worker_id + 1) % WORKER_COUNT
        this.datapackLoader?.then(() => {
            if (this.disposed || this.Tiles[key] !== entry) return
            this.generateTile(key, coords, entry.workerId)
        })

		return tile
	}

    _removeTile(key: string) {
        const tile = this.Tiles[key]
        if (tile && !this.disposed) this.workers[tile.workerId].postMessage({ cancel: key })
        delete this.Tiles[key]
        // Leaflet must remove its own entry even if calculation has not started yet.
        // @ts-expect-error: Leaflet internal lifecycle method
        L.GridLayer.prototype._removeTile.call(this, key)
    }
}
