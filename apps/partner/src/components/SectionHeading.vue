<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next';

withDefaults(defineProps<{
  title: string;
  subtitle?: string;
  actionLabel?: string;
}>(), { subtitle: '', actionLabel: '' });

defineEmits<{ action: [] }>();
</script>

<template>
  <div class="section-heading">
    <div class="section-heading-copy">
      <h2>{{ title }}</h2>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <button v-if="actionLabel" type="button" class="section-action" @click="$emit('action')">
      {{ actionLabel }} <ChevronRight :size="15" aria-hidden="true" />
    </button>
  </div>
</template>
