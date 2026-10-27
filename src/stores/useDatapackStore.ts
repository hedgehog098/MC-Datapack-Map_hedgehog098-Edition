import { parseWorldgenStructure } from '../util/structures.js';
import { defineStore } from "pinia";

import { AnonymousDatapack, Datapack, DatapackList, ResourceLocation } from "mc-datapack-loader"
import { computed, onMounted, reactive, ref, watch, toRaw } from "vue";
import { DensityFunction, Holder, HolderSet, Identifier, NoiseParameters, StructureSet, WorldgenRegistries, WorldgenStructure, StructureTemplatePool, Structure, NbtFile, Registry, Json } from "deepslate";
import { useSettingsStore } from "./useSettingsStore.js";
import { updateUrlParam, versionMetadata } from "../util.js";
import { useI18n } from "vue-i18n";


import { DatapackSource, restoredDatapacks, saveDatapackSources } from '../util/datapackPersistence.js';

export const useDatapackStore = defineStore('datapacks', () => {
    const uri = window.location.search.substring(1)
    const datapacksParam = new URLSearchParams(uri).get('datapacks')?.split(',')

    const i18n = useI18n()
    const settingsStore = useSettingsStore()

    const metadata = versionMetadata[settingsStore.mc_version];
    const vanillaDatapack = Datapack.fromZipUrl(`./vanilla_datapacks/vanilla_${metadata.vanillaDatapack}.zip`, metadata.datapackFormat)

    let last_key = 0

    const ds: {datapack: Datapack, key: number, id?: string, source?: DatapackSource}[] = [{ datapack: vanillaDatapack, key: 0 }]

    const useSavedSources = datapacksParam === undefined || datapacksParam.join(',') === restoredDatapacks.flatMap(source => source.kind === 'modrinth' ? [`modrinth:${source.slug}`] : []).join(',')
    if (datapacksParam !== undefined && !useSavedSources) {
        for (const id of datapacksParam){
            const promise = getDatapackFromId(id)
            if (promise === undefined) continue
            ds.push({datapack: promise, key: ++last_key, id: id, source: {kind: 'modrinth', slug: id.slice('modrinth:'.length)}})
        }
    }

    for (const source of useSavedSources ? restoredDatapacks : []) {
        try {
            let datapack: Datapack | undefined
            let id: string | undefined
            switch (source.kind) {
                case 'zip': datapack = Datapack.fromZipFile(source.file, metadata.datapackFormat); break
                case 'files': datapack = Datapack.fromFileList(source.files, metadata.datapackFormat); break
                case 'folder': datapack = Datapack.fromFileSystemDirectoryHandle(source.handle, metadata.datapackFormat); break
                case 'url': datapack = Datapack.fromZipUrl(source.url, metadata.datapackFormat); break
                case 'modrinth': id = `modrinth:${source.slug}`; datapack = getDatapackFromId(id); break
            }
            if (datapack) ds.push({datapack, key: ++last_key, source, id})
        } catch (error) { console.warn('Could not restore datapack', error) }
    }

    const datapacks = reactive<{datapack: Datapack, key: number, id?: string, source?: DatapackSource}[]>(ds)

    var last_version = settingsStore.mc_version
    settingsStore.$subscribe(async () => {
        if (last_version === settingsStore.mc_version)
            return

        const metadata = versionMetadata[settingsStore.mc_version];
        const vanillaDatapack = Datapack.fromZipUrl(`./vanilla_datapacks/vanilla_${metadata.vanillaDatapack}.zip`, metadata.datapackFormat)
        datapacks[0].datapack = vanillaDatapack
        datapacks[0].key = ++last_key

        for (var i = 1; i < datapacks.length ; i++){
            datapacks[i].datapack.setPackVersion(metadata.datapackFormat)
        }

        last_version = settingsStore.mc_version
    })

    watch(datapacks, (new_datapacks) => {
        void saveDatapackSources(new_datapacks.flatMap(d => d.source ? [toRaw(d.source)] : []))
        const ids = new_datapacks.flatMap(d => d.id ? [d.id] : [])
        updateUrlParam('datapacks', ids.length > 0 ? ids.join(',') : undefined)
    })

    const datapack_list = new class implements DatapackList{
        async getDatapacks(): Promise<AnonymousDatapack[]> {
            return datapacks.map(d => d.datapack)
        }
    }

    const composite_datapack = Datapack.compose(datapack_list)

    const dimensions = computed(async () => {
        const world_preset_json = await composite_datapack.get(ResourceLocation.WORLDGEN_WORLD_PRESET, settingsStore.world_preset) as { dimensions: { [key: string]: unknown } }
        return (await composite_datapack.getIds(ResourceLocation.DIMENSION)).concat(Object.keys(world_preset_json.dimensions).map(i => Identifier.parse(i))).filter((value, index, self) =>
            index === self.findIndex((t) => (
                t.toString() === value.toString()
            ))
        )
    })

    const world_presets = computed(async () => {
        // TODO use deepslate HolderSet 
        const normal_world_preset_tag = await composite_datapack.get(ResourceLocation.WORLDGEN_WORLD_PRESET_TAG, Identifier.create("normal")) as { values: string[] }
        return normal_world_preset_tag.values.map(id => Identifier.parse(id))
    })

    const registered = computed(reloadDatapack)

    async function registerType<T>(location: ResourceLocation, registry: Registry<T>, loader: (json: any, id: Identifier) => (T | (() => T))): Promise<void>{
        registry.clear()
        await Promise.all((await composite_datapack.getIds(location)).map(id => new Promise<void>(async (resolve) => {
            try {
                const data = await composite_datapack.get(location, id)
                try {
                    registry.register(id, loader(data, id))
                } catch (e) {
                    console.warn(`Failed to register ${location.location}: ${id.toString()}: ${e}`)
                }
            } catch (e) {
                console.warn(`Failed to load ${location.location}: ${id.toString()}: ${e}`)
            }
            resolve()
        })))
    }

    async function registerTag<T>(location: ResourceLocation, registry: Registry<T>){
        await registerType(location, registry.getTagRegistry(), (json, id) => HolderSet.fromJson<T>(registry, json, id))
    }

    async function reloadDatapack() {
        const promises: Promise<void>[] = []
        promises.push(registerType(ResourceLocation.WORLDGEN_DENSITY_FUNCTION, WorldgenRegistries.DENSITY_FUNCTION, (json) => new DensityFunction.HolderHolder(Holder.parser(WorldgenRegistries.DENSITY_FUNCTION, DensityFunction.fromJson)(json))))
        promises.push(registerType(ResourceLocation.WORLDGEN_NOISE, WorldgenRegistries.NOISE, NoiseParameters.fromJson))
        promises.push(registerType(ResourceLocation.WORLDGEN_STRUCTURE_SET, StructureSet.REGISTRY, StructureSet.fromJson))
        promises.push(registerType(ResourceLocation.WORLDGEN_TEMPLATE_POOL, StructureTemplatePool.REGISTRY, StructureTemplatePool.fromJson))
        promises.push(registerType(versionMetadata[settingsStore.mc_version].resourceLocations.structure, Structure.REGISTRY, (arrayBuffer) => () => Structure.fromNbt(NbtFile.read(new Uint8Array(arrayBuffer)).root)))
        promises.push(new Promise(async (resolve) => {
            await registerType(ResourceLocation.WORLDGEN_BIOME, WorldgenRegistries.BIOME, () => {return {}})
            await registerTag(ResourceLocation.WORLDGEN_BIOME_TAG, WorldgenRegistries.BIOME)
            await registerType(ResourceLocation.WORLDGEN_STRUCTURE, WorldgenStructure.REGISTRY, worldgenStructureFromJson)
            await registerTag(ResourceLocation.WORLDGEN_STRUCTURE_TAG, WorldgenStructure.REGISTRY)
            resolve()
        }))
        await Promise.all(promises)
    }

    function worldgenStructureFromJson(obj: unknown){
        return parseWorldgenStructure(obj, versionMetadata[settingsStore.mc_version].dimensionPaddingEnabled)
    }

    function addDatapack(datapack: Datapack, source?: DatapackSource) {
        datapacks.push({ datapack: datapack, key: ++last_key, source })
    }

    async function removeDatapack(id: number) {
        datapacks.splice(id, 1)
    }

    function getDatapackFromId(id: string) {
        const [namespace, slug] = id.split(':', 2)
        if (namespace === "modrinth"){
            return Datapack.fromZipUrl(getModrinthUrl(slug), versionMetadata[settingsStore.mc_version].datapackFormat)
        }
    }

    async function addModrinthDatapack(slug: string){
        const url = await getModrinthUrl(slug)
        const datapack = Datapack.fromZipUrl(url, versionMetadata[settingsStore.mc_version].datapackFormat)
        datapacks.push({ datapack: datapack, key: ++last_key, id: `modrinth:${slug}`, source: {kind: 'modrinth', slug} })
        return datapack
    }


    async function getModrinthUrl(slug: string): Promise<string>{
        async function tryFetch(url: string ){
            const response = await (await fetch(url)).json().catch(() => {throw new Error('datapack not found')})
            if (!Array.isArray(response) || response.length === 0) return undefined
            return response
        }
    
        const versionsResponse = await tryFetch(`https://api.modrinth.com/v2/project/${slug}/version`)

        if (versionsResponse === undefined){
            throw new Error(`Modrinth project ${slug} not found`)
        }

        const version
            =  versionsResponse.find(v => v.loaders.includes('datapack') && v.game_versions.some((mc_version: string) => (versionMetadata[settingsStore.mc_version].canonicalNames.includes(mc_version)))) // Datapack of correct version
            ?? versionsResponse.find(v => v.loaders.includes('datapack')) // Datapack of any version
            ?? versionsResponse.find(v => v.game_versions.some((mc_version: string) => (versionMetadata[settingsStore.mc_version].canonicalNames.includes(mc_version)))) // Mod of correct version
            ?? versionsResponse[0] // Mod of any version

        const fileInfo = version.files.find((file: any) => file.primary)
    
        if (fileInfo.size > 2e+9) {
            throw new Error("File larger than 2 GB, not downloading")
        }
    
        if (!((fileInfo.filename as string).endsWith('.zip') || (fileInfo.filename as string).endsWith('.jar'))) {
            throw new Error("File is not a .zip or .jar file")
        }
    
        return fileInfo.url
    }    

    return { datapacks, composite_datapack, registered, reloadDatapack, addDatapack, removeDatapack, dimensions, world_presets, addModrinthDatapack }
})