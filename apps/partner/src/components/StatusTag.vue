<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'neutral' | 'brand' | 'green' | 'gold' | 'info' | 'danger';
}>(), { tone: 'neutral' });
</script>

<template>
  <span class="status-pill" :class="`status-pill--${tone}`"><slot /></span>
</template>
