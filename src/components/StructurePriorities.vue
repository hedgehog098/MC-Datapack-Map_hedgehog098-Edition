<script setup lang="ts">
import { Identifier } from 'deepslate'
import { useSearchStore } from '../stores/useBiomeSearchStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useI18n } from 'vue-i18n'
const search = useSearchStore()
const settings = useSettingsStore()
const {t} = useI18n()
</script>
<template>
    <details class="priorities">
        <summary>{{ t('local.priority.title') }}</summary>
        <p>{{ t('local.priority.help') }}</p>
        <p v-if="!search.structures.size">{{ t('local.priority.empty') }}</p>
        <label v-for="id in [...search.structures].sort()" :key="id" :title="id">
            <span>{{ settings.getLocalizedName('structure', Identifier.parse(id), true) }}</span>
            <select :aria-label="`${t('local.priority.title')} ${id}`" :value="search.priorities[id] ?? 'auto'" @change="search.priorities[id] = ($event.target as HTMLSelectElement).value">
                <option v-for="level in ['auto', 'high', 'medium', 'low']" :key="level" :value="level">{{ t(`local.priority.${level}`) }}</option>
            </select>
        </label>
    </details>
</template>
<style scoped>
summary { cursor: pointer; }
p { font-size: .8rem; line-height: 1.5; color: #b9d5e6; }
label { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin: .5rem 0; }
span { overflow-wrap: anywhere; font-size: .85rem; }
select { max-width: 9rem; padding: .3rem; border-radius: .3rem; }
</style>
