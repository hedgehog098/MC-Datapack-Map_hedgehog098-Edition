<script setup lang="ts">
    const props = defineProps({
            icon: String,
            modelValue: Boolean,
            disabled: Boolean,
            title: String
        })

    const emits = defineEmits([
        'update:modelValue'
    ])

    function toggle() {
        if (!props.disabled){
            emits('update:modelValue', !props.modelValue)
        }
    }

</script>

<template>
    <button type="button" class="map-button" :class="{active: modelValue}" :disabled="disabled" :title="title" :aria-label="title" :aria-pressed="modelValue" @click="toggle"><font-awesome-icon :icon="icon" /></button>
</template>
<style scoped>
.map-button {width: 34px; height: 34px; padding: 7px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 3px 10px #0003; color: var(--text);}
.map-button.active {background: var(--accent); color: #12363b; border-color: var(--accent);}
.map-button:disabled {opacity: .4;}
.map-button svg {width: 16px; height: 16px;}
</style>
