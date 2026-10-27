<script setup lang="ts">
import { Datapack, PackMcmeta } from 'mc-datapack-loader';
import { TextComponent } from '../util/TextComponent';
import MinecraftText from './MinecraftText.vue';
import { useSettingsStore } from '../stores/useSettingsStore';
import { versionMetadata } from '../util';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

    const i18n = useI18n()

    const props = defineProps({
        datapack: Object,
        removable: Boolean
    })

    const settings = useSettingsStore()


    const datapack = (props.datapack as Datapack)!
    const image = await datapack.getImage()
    const mcMeta = await datapack.getMcmeta()
    const supported = computed(() => mcMeta !== undefined ? PackMcmeta.MatchFormatRange(mcMeta.formats, versionMetadata[settings.mc_version].datapackFormat) : false)
    const desciption = TextComponent.parse(mcMeta?.description ?? "")

</script>

<template>
    <div class="datapack" :class="{ unsupported: !supported}">
        <img class="image" :src="image" alt="pack.png" />
        <div class="description">
            <MinecraftText :component="desciption" />
        </div>
        <button v-if="removable" class="close_button" :aria-label="i18n.t('datapack_list.remove_datapack.title')" :title="i18n.t('datapack_list.remove_datapack.title')" @click="$emit('close')"><font-awesome-icon icon="fa-xmark" /></button>
    </div>
</template>

<style scoped>
.datapack {width: 100%; min-height: 56px; background: #203145; border: 1px solid var(--border); border-radius: 8px; display: flex; align-items: center; padding: 8px; gap: 10px;}
.datapack.unsupported {border-color: #ad7047; background: #3b302a;}
.image {width: 36px; height: 36px; border-radius: 5px; flex-shrink: 0; image-rendering: pixelated;}
.description {flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 12px; line-height: 1.5; max-height: 5rem; overflow: auto;}
.close_button {width: 28px; height: 28px; flex-shrink: 0; padding: 5px;}
.close_button:hover {color: #ffb4b4; border-color: #af6262;}
</style>
