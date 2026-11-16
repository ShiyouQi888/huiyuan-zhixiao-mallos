<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ChevronLeft } from 'lucide-vue-next';

withDefaults(defineProps<{ title: string; subtitle?: string; eyebrow?: string; back?: boolean }>(), {
  subtitle: '',
  eyebrow: '',
  back: false,
});

const router = useRouter();
</script>

<template>
  <header class="page-heading">
    <div v-if="back || eyebrow" class="page-heading-topline">
      <button v-if="back" type="button" class="page-back" aria-label="返回" @click="router.back()">
        <ChevronLeft :size="18" aria-hidden="true" />
      </button>
      <span v-if="eyebrow" class="page-eyebrow">{{ eyebrow }}</span>
    </div>
    <h1>{{ title }}</h1>
    <p v-if="subtitle">{{ subtitle }}</p>
    <slot />
  </header>
</template>
