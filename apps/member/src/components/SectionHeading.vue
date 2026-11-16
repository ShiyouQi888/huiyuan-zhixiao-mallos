<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next';

withDefaults(defineProps<{
  title: string;
  subtitle?: string;
  actionLabel?: string;
  to?: string;
}>(), { subtitle: '', actionLabel: '', to: '' });

defineEmits<{ action: [] }>();
</script>

<template>
  <div class="section-heading">
    <div class="section-heading-copy">
      <h2>{{ title }}</h2>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <router-link v-if="to && actionLabel" :to="to" class="section-action">
      {{ actionLabel }} <ChevronRight :size="15" aria-hidden="true" />
    </router-link>
    <button v-else-if="actionLabel" type="button" class="section-action" @click="$emit('action')">
      {{ actionLabel }} <ChevronRight :size="15" aria-hidden="true" />
    </button>
  </div>
</template>
