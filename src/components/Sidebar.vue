<script setup lang="ts">
import { Datapack } from 'mc-datapack-loader';
import { ref } from 'vue';
import { useDatapackStore } from '../stores/useDatapackStore';
import { useRecentStore } from '../stores/useRecentStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { versionMetadata } from '../util';
import DatapackSelection from './DatapackList.vue';
import StructureRouteSearch from './StructureRouteSearch.vue';
import StructurePriorities from './StructurePriorities.vue';
import LocaleChanger from './LocaleChanger.vue';
import { useI18n } from 'vue-i18n';
import MenuButtons from './MenuButtons.vue';
import SettingsPanel from './SettingsPanel.vue';

import { EventTracker } from '../util/EventTracker';

    const datapackStore = useDatapackStore()
    const settingsStore = useSettingsStore()
    const recentStore = useRecentStore();

    const file_dragging = ref(false)
    const {t} = useI18n()

    async function dropHandler(ev: DragEvent){

        if (ev.dataTransfer === null){
            return
        }
        ev.preventDefault()
        file_dragging.value = false

        const datapackVersion = versionMetadata[settingsStore.mc_version].datapackFormat

        for (const item of ev.dataTransfer.items){
            if ("getAsFileSystemHandle" in item){
                const handle = await item.getAsFileSystemHandle()
                var datapack: Datapack
                if (handle instanceof FileSystemDirectoryHandle){
                    EventTracker.track(`add_datapack/folder/drag_and_drop`)
                    datapack = Datapack.fromFileSystemDirectoryHandle(handle, datapackVersion)
                    datapackStore.addDatapack(datapack, {kind: 'folder', handle})
                    recentStore.addRecentFileHandle(handle, datapack)
                } else if (handle instanceof FileSystemFileHandle) {
                    EventTracker.track(`add_datapack/zip/drag_and_drop`)
                    const file = await handle.getFile()
                    datapack = Datapack.fromZipFile(file, datapackVersion)
                    datapackStore.addDatapack(datapack, {kind: 'zip', file})
                    recentStore.storeAndAddRecent(file, datapack)
                }
            } else {
                if (["application/zip", 'application/java-archive', 'application/x-java-archive'].includes((item as DataTransferItem).type)){
                    const file = (item as DataTransferItem).getAsFile()
                    if (file){
                        EventTracker.track(`add_datapack/zip/drag_and_drop`)
                        const datapack = Datapack.fromZipFile(file, datapackVersion)
                        datapackStore.addDatapack(datapack, {kind: 'zip', file})
                        recentStore.storeAndAddRecent(file, datapack)
                    }
                }
            }
        }
    }

    function dragOverHandler(ev: DragEvent){

        ev.preventDefault()
    }


</script>

<template>
    <div class="sidebar"
        @drop="dropHandler"
        @dragover="dragOverHandler"
        @dragenter="file_dragging=true"
        @dragleave="file_dragging=false"
        :class="{file_dragging: file_dragging}"
    >
        <header class="sidebar-header"><span class="eyebrow">MINECRAFT</span><h1>{{ t('local.ui.title') }}</h1></header>
        <MenuButtons />
        <div class="sidebar-body">
            <details class="panel world-panel" open>
                <summary>{{ t('local.ui.world') }}</summary>
                <Suspense><SettingsPanel /></Suspense>
            </details>
            <StructurePriorities class="panel" />
            <StructureRouteSearch class="panel" />
            <DatapackSelection class="panel" />
            <details class="panel interface-panel">
                <summary>{{ t('local.ui.interface') }}</summary>
                <LocaleChanger />
            </details>
        </div>
    </div>
</template>

<style scoped>
.sidebar { height: 100%; width: var(--sidebar-width); display: flex; flex-direction: column; background: var(--surface); color: var(--text); box-sizing: border-box; border-inline-end: 1px solid var(--border); box-shadow: 8px 0 32px #0003; }
.sidebar-header {padding: 20px 60px 16px 20px;}
.eyebrow {font-size: 10px; letter-spacing: .18em; color: var(--accent); font-weight: 700;}
h1 {font-size: 20px; line-height: 1.4; margin: 3px 0 0; font-weight: 650;}
.sidebar-body {overflow-y: auto; overscroll-behavior: contain; min-height: 0; padding: 16px 12px 24px; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; scrollbar-color: #415369 transparent;}
.sidebar-body > * {flex-shrink: 0;}
.sidebar.file_dragging {outline: 2px solid var(--accent); outline-offset: -3px;}
</style>
