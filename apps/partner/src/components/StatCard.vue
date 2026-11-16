<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'brand' | 'green' | 'gold';
  clickable?: boolean;
}>(), {
  hint: '',
  tone: 'default',
  clickable: false,
});

defineEmits<{ click: [] }>();
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="stat-card"
    :class="`stat-card--${tone}`"
    :type="clickable ? 'button' : undefined"
    @click="clickable && $emit('click')"
  >
    <span class="stat-card-label">{{ label }}</span>
    <span class="stat-card-value">{{ value }}</span>
    <span v-if="hint" class="stat-card-hint">{{ hint }}</span>
    <slot />
  </component>
</template>
