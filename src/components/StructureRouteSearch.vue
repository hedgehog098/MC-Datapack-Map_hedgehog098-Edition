<script setup lang="ts">
import { computed, ref } from 'vue'
import { Identifier } from 'deepslate'
import { useI18n } from 'vue-i18n'
import { useStructureRouteStore } from '../stores/useStructureRouteStore'
import { useSettingsStore } from '../stores/useSettingsStore'
const route = useStructureRouteStore(), settings = useSettingsStore()
const {t} = useI18n()
const selectionOpen = ref(!route.selected.length)
const filter = ref(''), groupName = ref(''), selectedGroup = ref(''), copyStatus = ref('')
const name = (id: string) => settings.getLocalizedName('structure', Identifier.parse(id), true)
const entries = computed(() => route.available.filter(s => `${name(s.id)} ${s.id}`.toLowerCase().includes(filter.value.toLowerCase())).sort((a,b) => settings.collator.compare(name(a.id), name(b.id))))
function saveGroup() {
    const value = groupName.value.trim().slice(0, 80)
    if (!value || !route.selected.length) return
    const group = {name: value, structures: [...route.selected]}
    const index = route.groups.findIndex(g => g.name === value)
    if (index >= 0) route.groups.splice(index, 1, group)
    else route.groups.push(group)
    selectedGroup.value = value
}
function loadGroup() {
    const group = route.groups.find(g => g.name === selectedGroup.value)
    if (group) {route.selected = [...group.structures]; groupName.value = group.name}
}
async function copyRoute() {
    const text = ['#\tStructure\tX\tZ', ...route.results.map((p,i) => `${i + 1}\t${p.id}\t${p.x}\t${p.z}`)].join('\n')
    try {await navigator.clipboard.writeText(text); copyStatus.value = 'copied'} catch {copyStatus.value = 'copyFailed'}
}
</script>
<template>
    <details class="route-search">
        <summary>{{ t('local.route.title') }}</summary>
        <p>{{ t('local.route.help') }}</p>
        <fieldset :disabled="route.running">
            <label>{{ t('local.route.group') }}
                <select v-model="selectedGroup" @change="loadGroup" :aria-label="t('local.route.group')">
                    <option value="">{{ t('local.route.chooseGroup') }}</option>
                    <option v-for="g in route.groups" :key="g.name" :value="g.name">{{ g.name }}</option>
                </select>
            </label>
            <div class="group-actions">
                <input v-model="groupName" maxlength="80" :placeholder="t('local.route.groupName')" :aria-label="t('local.route.groupName')" />
                <button type="button" @click="saveGroup" :disabled="!groupName.trim() || !route.selected.length">{{ t('local.route.saveGroup') }}</button>
                <button type="button" :disabled="!selectedGroup" @click="route.groups = route.groups.filter(g => g.name !== selectedGroup); selectedGroup = ''">{{ t('local.route.deleteGroup') }}</button>
            </div>
            <details class="selection" :open="selectionOpen" @toggle="selectionOpen = ($event.target as HTMLDetailsElement).open">
            <summary>{{ t('local.route.selectTypes', {count: route.selected.length}) }}</summary>
            <input class="filter" v-model="filter" :placeholder="t('local.route.filter')" :aria-label="t('local.route.filter')" />
            <div class="structure-choices">
                <label v-for="s in entries" :key="s.id" :title="s.id" :class="{unsupported: !s.supported}">
                    <input type="checkbox" v-model="route.selected" :value="s.id" :disabled="!s.supported" />
                    <span>{{ name(s.id) }}<small v-if="!s.supported"> · {{ t('local.route.unsupported') }}</small></span>
                </label>
            </div>
            <div class="selection-count">{{ t('local.route.selected', {count: route.selected.length}) }} <button type="button" @click="route.selected = []">{{ t('local.route.clearSelection') }}</button></div>
            </details>
            <label>{{ t('local.route.limit') }}<input type="number" min="1" max="500" step="1" v-model.number="route.limit" /></label>
            <label>{{ t('local.route.radius') }}<input type="number" min="1" max="1000000" step="1" v-model.number="route.radius" /></label>
            <label>{{ t('local.route.spacing') }}<input type="number" min="0" :max="route.radius" step="1" v-model.number="route.minDistance" /></label>
            <small>{{ t('local.route.spacingHelp') }}</small>
        </fieldset>
        <p>{{ t('local.route.origin', {x: Math.round(route.center.x), z: Math.round(route.center.z)}) }}</p>
        <button type="button" class="search-button" v-if="!route.running" @click="copyStatus = ''; selectionOpen = false; route.start()">{{ t('local.route.start') }}</button>
        <button type="button" class="search-button" v-else @click="route.stop()">{{ t('local.route.stop') }}</button>
        <p role="status" class="scan-status" aria-live="polite">{{ t(`local.route.status.${route.status}`) }}<template v-if="route.running"><br />{{ t('local.route.progress', {checked: route.checked, found: route.found, radius: route.scanRadius}) }}</template></p>
        <p v-if="route.error" role="alert" class="error">{{ t(`local.route.error.${route.error}`) }}</p>
        <div v-if="route.results.length" class="route-results">
            <p>{{ t('local.route.result', {count: route.results.length, distance: Math.round(route.totalDistance).toLocaleString()}) }}</p>
            <small>{{ t('local.route.routeNote', {x: Math.round(route.origin.x), z: Math.round(route.origin.z)}) }}</small>
            <button type="button" @click="copyRoute">{{ t('local.route.copy') }}</button>
            <span role="status" v-if="copyStatus">{{ t(`local.route.${copyStatus}`) }}</span>
            <ol>
                <li v-for="(p,i) in route.results" :key="`${p.id}:${p.x}:${p.z}`">
                    <span>{{ name(p.id) }}</span>
                    <button type="button" :aria-label="`${t('local.route.locate')} ${i + 1}`" @click="route.jump = {x: p.x, z: p.z}">X {{ p.x }} · Z {{ p.z }}</button>
                </li>
            </ol>
        </div>
        <details class="memories">
            <summary>{{ t('local.route.memories', {count: route.rememberedCount}) }}</summary>
            <p>{{ t('local.route.memoryHelp') }}</p>
            <p v-if="!route.memories.length">{{ t('local.route.noMemory') }}</p>
            <div v-for="(memory,index) in route.memories" :key="memory.created" class="memory">
                <span>{{ t('local.route.memory', {index: index + 1, count: memory.stops.length}) }} · {{ new Date(memory.created).toLocaleString() }}</span>
                <button type="button" :disabled="route.running || memory.world !== route.world" @click="route.restoreMemory(memory)">{{ t('local.route.restore') }}</button>
                <small v-if="memory.world !== route.world">{{ t('local.route.otherWorld') }}</small>
            </div>
            <button type="button" :disabled="route.running || !route.memories.length" @click="route.memories = []">{{ t('local.route.clearMemory') }}</button>
        </details>
    </details>
</template>
<style scoped>
.selection {margin: .75rem 0;}
summary {cursor: pointer; font-weight: 600;}
p, small {line-height: 1.5; font-size: .8rem; color: #c4dce9;}
fieldset {border: 0; padding: 0; margin: 0; min-width: 0;}
label {display: flex; justify-content: space-between; align-items: center; gap: .35rem; margin: .5rem 0; font-size: .85rem;}
input, select, button {border-radius: .3rem; padding: .35rem; box-sizing: border-box;}
input[type=number] {width: 7rem;}
select {max-width: 10rem;}
button {cursor: pointer; border: 1px solid #83a8c4;}
button:disabled {cursor: default; opacity: .5;}
.group-actions {display: flex; gap: .25rem; flex-wrap: wrap;}
.group-actions input {width: 100%;}
.filter {width: 100%; margin-top: .5rem;}
.structure-choices {max-height: 12rem; overflow: auto; background: #0d3048; padding: .25rem .4rem;}
.structure-choices label {justify-content: start; align-items: start; overflow-wrap: anywhere;}
.unsupported {opacity: .55;}
.selection-count {margin: .5rem 0; font-size: .8rem;}
.search-button {width: 100%; background: #b6e4ff; color: #03213a; font-weight: 600;}
.error {color: #ffb7a8;}
ol {padding-left: 1.5rem; max-height: 20rem; overflow-y: auto; font-size: .8rem;}
li {margin: .5rem 0;}
li span {display: block; overflow-wrap: anywhere;}
li button {margin-top: .2rem; font-variant-numeric: tabular-nums;}
.route-results > button {display: block; margin: .5rem 0;}
.memory {padding: .5rem 0; display: flex; flex-direction: column; gap: .3rem; font-size: .8rem;}
.memories {margin-top: .75rem;}
</style>
