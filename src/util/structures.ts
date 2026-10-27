import { Json, WorldgenStructure } from 'deepslate'

/** Deepslate 0.25 only accepts tags or arrays in a structure's biome holder set. */
export function parseWorldgenStructure(obj: unknown, dimensionPaddingEnabled = true) {
    const root = {...(Json.readObject(obj) ?? {})}
    if (typeof root.biomes === 'string' && !root.biomes.startsWith('#')) {
        root.biomes = [root.biomes]
    }
    if (!dimensionPaddingEnabled) delete root.dimension_padding
    return WorldgenStructure.fromJson(root)
}

export function supportedStructure(s: WorldgenStructure): boolean {
    return !(s instanceof WorldgenStructure.MineshaftStructure || s instanceof WorldgenStructure.NetherFossilStructure || s instanceof WorldgenStructure.OceanMonumentStructure || s instanceof WorldgenStructure.RuinedPortalStructure)
}
