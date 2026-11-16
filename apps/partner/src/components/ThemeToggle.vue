<script setup lang="ts">
import { computed, ref } from 'vue';
import { Moon, Sun } from 'lucide-vue-next';
import { applyThemeMode, getThemeMode, type ThemeMode } from '../theme';

const mode = ref<ThemeMode>(getThemeMode());
const nextMode = computed<ThemeMode>(() => (mode.value === 'dark' ? 'light' : 'dark'));
const label = computed(() => `切换为${nextMode.value === 'light' ? '浅色' : '深色'}主题`);

function toggle() {
  mode.value = nextMode.value;
  applyThemeMode(mode.value);
}
</script>

<template>
  <button type="button" class="theme-toggle" :aria-label="label" :title="label" @click="toggle">
    <Sun v-if="mode === 'dark'" :size="16" aria-hidden="true" />
    <Moon v-else :size="16" aria-hidden="true" />
  </button>
</template>
