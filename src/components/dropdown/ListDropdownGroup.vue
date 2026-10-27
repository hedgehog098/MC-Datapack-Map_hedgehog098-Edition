<script setup lang="ts">
import { computed } from '@vue/reactivity';
import { Identifier } from 'deepslate';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '../../stores/useSettingsStore';
import ListDropdownEntry from './ListDropdownEntry.vue';

const i18n = useI18n()

const props = defineProps({
        type: String,
        entries: Object,
        selected: Object,
        icons: Function,
        colors: Function,
        group_name: String
})

defineEmits(['toggle', 'disableGroup'])
const settingsStore = useSettingsStore()


const shown = ref(true)

const sorted_entries = computed(() => props.entries?.sort((a: any, b: any) => settingsStore.collator.compare(a.localized,b.localized)))

function isGroupSelected (selected: any, group_name: any) {
    if (!selected) return false
    return [...selected].findIndex((p: string) => p.startsWith(group_name + ":")) >= 0
}

</script>

<template>
    <div class="header"
        :class="{selected: isGroupSelected(selected, group_name)}"
        @click="shown = !shown"
        @keypress="$event => {
            if ($event.key === 'Enter')
                shown = !shown
        }"
        @contextmenu="$event => {
            if (isGroupSelected(selected, group_name)){
                $emit('disableGroup')
                $event.preventDefault()   
            }
        }"
        tabindex="0"
    >
        <font-awesome-icon class="open_icon" :icon="shown ? 'fa-angle-down' : i18n.t('locale.text_direction') === 'rtl' ? 'fa-angle-left' : 'fa-angle-right'"/>
        {{ group_name }}
    </div>
    <div class="group" v-if="shown">
        <ListDropdownEntry v-for="entry in sorted_entries" :type="type" :entry="entry" :selected="selected?.has(entry.id.toString())" :icons="icons" :colors="colors" @toggle="$emit('toggle', entry.id)" />
    </div>
</template>

<style scoped>
.header {
    background-color: var(--surface);
    padding: 0.5rem;
    cursor: pointer;
    user-select: none;
}

.header:hover {
    background-color: #2c4259;
}

.header.selected {
    background-color: #21434b;
}

.header.selected:hover {
    background-color: #31616a;
}


.open_icon {
    width: 1rem;
}

</style>