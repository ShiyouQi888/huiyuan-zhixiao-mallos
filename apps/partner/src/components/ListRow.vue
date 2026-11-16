<script setup lang="ts">
withDefaults(defineProps<{
  title: string;
  subtitle?: string;
  value?: string;
  valueHint?: string;
  valueTone?: 'default' | 'brand' | 'green' | 'gold' | 'muted';
  clickable?: boolean;
}>(), {
  subtitle: '',
  value: '',
  valueHint: '',
  valueTone: 'default',
  clickable: false,
});

defineEmits<{ click: [] }>();
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="list-row"
    :type="clickable ? 'button' : undefined"
    @click="clickable && $emit('click')"
  >
    <div class="list-row-main">
      <slot name="icon" />
      <div class="list-row-copy">
        <span class="list-row-title">{{ title }}</span>
        <span v-if="subtitle" class="list-row-sub">{{ subtitle }}</span>
      </div>
    </div>
    <div class="list-row-tail">
      <span v-if="value" class="list-row-value" :class="`list-row-value--${valueTone}`">
        {{ value }}
        <small v-if="valueHint">{{ valueHint }}</small>
      </span>
      <slot name="trailing" />
    </div>
  </component>
</template>
