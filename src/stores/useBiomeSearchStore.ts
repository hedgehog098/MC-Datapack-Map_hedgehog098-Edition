import { Identifier, StructurePlacement, StructureSet, WorldgenStructure } from "deepslate";
import { defineStore } from "pinia";
import { computed, reactive, ref, watch } from "vue";


import { readPreference, writePreference, stringList } from "../util/preferences.js";

import { useLoadedDimensionStore } from './useLoadedDimensionStore.js';
import { supportedStructure } from '../util/structures.js';

export const useSearchStore = defineStore('search', () => {
    const dimensionStore = useLoadedDimensionStore()
    const biomes = reactive<Set<string>>(new Set(stringList(readPreference('biomes', []))))
    const structures = reactive<Set<string>>(new Set(stringList(readPreference('structures', []))))

    const disabled = ref(readPreference<boolean>('biomes-disabled', false) === true)
    const savedPriorities = readPreference<Record<string, string>>('structure-priorities', {})
    const priorities = reactive<Record<string, string>>(Object.fromEntries(Object.entries(savedPriorities ?? {}).filter(([, value]) => ['auto', 'high', 'medium', 'low'].includes(value))))
    watch(biomes, value => writePreference('biomes', [...value]))
    watch(structures, value => writePreference('structures', [...value]))
    watch(priorities, value => writePreference('structure-priorities', value))
    watch(disabled, value => writePreference('biomes-disabled', value))

    const structure_sets = computed(() => {
        dimensionStore.revision // Registries are rebuilt after world/datapack changes.
        structures.size // make sure any change to structures triggers recomputation
        const sets: Identifier[] = []

        var has_invalid_set = false
        for (const id of StructureSet.REGISTRY.keys()){
            const set = StructureSet.REGISTRY.get(id)
            if (!set) continue

            var set_needed = false
            var set_invalid = false

            for (const entry of set?.structures){
                if (structures.has(entry.structure.key()?.toString() ?? "<>")){
                    set_needed = true
                    const s = entry.structure.value()
                    if (!supportedStructure(s)){
                        set_invalid = true
                    }
                }
            }
            if (set_needed){
                if (set_invalid){
                    has_invalid_set = true
                } else {
                    sets.push(id)
                }
            }
        }
        return {sets, has_invalid: has_invalid_set}
    })

    return {biomes, structures, priorities, structure_sets, disabled}
})
