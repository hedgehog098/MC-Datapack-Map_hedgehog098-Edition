<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
const {t} = useI18n()
const open = ref(window.innerWidth > 700)
</script>
<template>
    <button class="sidebar-toggle" :class="{open}" :aria-expanded="open" aria-controls="map-sidebar" :aria-label="t('toggle_sidebar.title')" :title="t('toggle_sidebar.title')" @click="open = !open">
        <font-awesome-icon :icon="open ? 'fa-angle-left' : 'fa-bars'" />
    </button>
    <aside id="map-sidebar" class="sidebar-slot" v-show="open"><slot /></aside>
</template>
<style scoped>
.sidebar-slot {width: var(--sidebar-width); height: 100%; flex-shrink: 0; z-index: 1000;}
.sidebar-toggle {position: absolute; top: 18px; inset-inline-start: 12px; z-index: 1100; width: 34px; height: 34px; padding: 8px; background: var(--control); border: 1px solid var(--border); color: var(--text); border-radius: 9px; box-shadow: 0 2px 10px #0002;}
.sidebar-toggle.open {inset-inline-start: calc(var(--sidebar-width) - 48px);}
.sidebar-toggle svg {height: 16px; width: 16px;}
@media(max-width: 700px) {.sidebar-slot {position: absolute; inset-inline-start: 0; top: 0;}}
</style>
