<script setup lang="ts">
import { ref } from 'vue';
import { useDatapackStore } from '../stores/useDatapackStore';
import FindBiomeDropdown from './dropdown/FindBiomeDropdown.vue';
import OpenDropdown from './dropdown/OpenDropdown.vue';
import { vOnClickOutside }from '@vueuse/components';
import { useSearchStore } from '../stores/useBiomeSearchStore';
import StructureDropdown from './dropdown/StructureDropdown.vue';
import { useSettingsStore } from '../stores/useSettingsStore';
import { EventTracker } from '../util/EventTracker';
import { useI18n } from 'vue-i18n';

const i18n = useI18n()

const datapackStore = useDatapackStore()
const searchStore = useSearchStore()
const settingsStore = useSettingsStore()

const openDropdownOpen = ref(false)
const searchBiomeDropdownOpen = ref(false)
const structureDropdownOpen = ref(false)

function reload(event: MouseEvent){
    EventTracker.track("reload")
    datapackStore.$patch({})
}

function toggleBiomeSearch() {
    searchStore.disabled = !searchStore.disabled
    searchStore.$patch({})
}

function clearBiomeSearch() {
    searchStore.biomes.clear()
    searchStore.$patch({})
    searchBiomeDropdownOpen.value = false
}

function clearStructureSearch() {
    searchStore.structures.clear()
    searchStore.$patch({})
    structureDropdownOpen.value = false
}


</script>

<template>
    <div>
        <nav class="buttons" :aria-label="i18n.t('local.ui.tools')">
            <button class="button" :class="{open: openDropdownOpen}" :aria-expanded="openDropdownOpen" :title="i18n.t('menu.add.title')" @click="openDropdownOpen = !openDropdownOpen"><font-awesome-icon icon="fa-plus" />{{ i18n.t('local.ui.add') }}</button>
            <span class="group-button">
                <button class="button" :class="{open: searchBiomeDropdownOpen, active: searchStore.biomes.size > 0}" :aria-expanded="searchBiomeDropdownOpen" :title="i18n.t('menu.search_biome.title')" @click="searchBiomeDropdownOpen = !searchBiomeDropdownOpen" @contextmenu.prevent="clearBiomeSearch" @dblclick.prevent="clearBiomeSearch"><font-awesome-icon icon="fa-magnifying-glass" />{{ i18n.t('local.ui.biomes') }}</button>
                <button v-if="searchStore.biomes.size > 0" class="filter-toggle" :aria-label="i18n.t('menu.search_biome.toggle')" :aria-pressed="!searchStore.disabled" @click="toggleBiomeSearch"><font-awesome-icon :icon="!searchStore.disabled ? 'fa-toggle-on' : 'fa-toggle-off'" /></button>
            </span>
            <button class="button" :class="{open: structureDropdownOpen, active: searchStore.structures.size > 0}" :aria-expanded="structureDropdownOpen" :title="i18n.t('menu.structure_positions.title')" @click="structureDropdownOpen = !structureDropdownOpen" @contextmenu.prevent="clearStructureSearch" @dblclick.prevent="clearStructureSearch"><font-awesome-icon icon="fa-location-dot" />{{ i18n.t('local.ui.structures') }}</button>
            <button v-if="settingsStore.dev_mode" class="button" :aria-label="i18n.t('menu.reload_datapacks.title')" @click="reload"><font-awesome-icon icon="fa-rotate-right" /></button>
        </nav>
        <div class="dropdowns">
            <Transition>
                <OpenDropdown v-if="openDropdownOpen" v-on-click-outside="() => {openDropdownOpen=false}" @close="openDropdownOpen=false" tabindex="-1"/>
            </Transition>
            <Transition>
                <Suspense>
                    <FindBiomeDropdown v-if="searchBiomeDropdownOpen" v-on-click-outside="() => {searchBiomeDropdownOpen=false}" tabindex="-1"/>
                </Suspense>
            </Transition>
            <Transition>
                <Suspense>
                    <StructureDropdown v-if="structureDropdownOpen" v-on-click-outside="() => {structureDropdownOpen=false}" tabindex="-1"/>
                </Suspense>
            </Transition>
        </div>
    </div>
</template>

<style scoped>
.buttons {display: flex; gap: 6px; padding: 0 12px 16px; border-bottom: 1px solid var(--border);}
.button {flex: 1; display: flex; gap: 7px; justify-content: center; align-items: center; padding: 9px 6px; white-space: nowrap; font-size: 12px;}
.group-button {flex: 1; display: flex; gap: 2px;}
.filter-toggle {padding: 3px;}
.button.active, .button.open {background: #244c55; border-color: #4d9a9c; color: #a4f3e9;}
.dropdowns {height: 0; position: relative; z-index: 20;}
</style>
