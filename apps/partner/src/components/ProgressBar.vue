<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  value: number;
  label?: string;
  hint?: string;
  tone?: 'brand' | 'green' | 'gold';
}>(), {
  label: '',
  hint: '',
  tone: 'brand',
});

const width = computed(() => Math.max(0, Math.min(100, Number.isFinite(props.value) ? props.value : 0)));
const rounded = computed(() => Math.round(width.value));
</script>

<template>
  <div class="progress" :class="`progress--${tone}`">
    <div v-if="label || hint" class="progress-head">
      <span>{{ label }}</span>
      <span>{{ hint }}</span>
    </div>
    <div class="progress-track" role="progressbar" :aria-valuenow="rounded" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-fill" :style="{ width: `${width}%` }" />
    </div>
  </div>
</template>
