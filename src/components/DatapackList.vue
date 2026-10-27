<script setup lang="ts">
import DatapackEntry from './DatapackEntry.vue';
import { useDatapackStore } from '../stores/useDatapackStore';

import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { readPreference, writePreference } from '../util/preferences';
const {t} = useI18n();
const expanded = ref(readPreference<boolean>('datapacks-expanded', false) === true);
watch(expanded, value => writePreference('datapacks-expanded', value));
const store = useDatapackStore();
</script>

<template>
    <details class="datapack-section" :open="expanded" @toggle="expanded = ($event.target as HTMLDetailsElement).open">
        <summary>{{ t('local.ui.datapacks') }} <span class="count">{{ store.datapacks.length }}</span></summary>
        <div class="datapack_list">
        <Suspense>
            <DatapackEntry v-for="(datapack, index) in store.datapacks" :datapack="datapack.datapack" :key="datapack.key" :removable="index > 0" @close="store.removeDatapack(index)"/>
        </Suspense>

        </div>
    </details>
</template>

<style scoped>
.datapack_list {
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: .5rem;
}


.count {margin-inline-start: auto; font-size: 12px; background: var(--control); color: var(--muted); border-radius: 6px; padding: 1px 7px;}
</style>
