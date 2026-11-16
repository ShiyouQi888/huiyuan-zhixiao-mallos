<script setup lang="ts">
import type { Component } from 'vue';
import { PackageOpen } from 'lucide-vue-next';

withDefaults(defineProps<{
  title?: string;
  description?: string;
  icon?: Component;
}>(), {
  title: '暂无内容',
  description: '这里暂时没有可展示的内容',
  icon: PackageOpen,
});
</script>

<template>
  <div class="empty-state">
    <div class="empty-state-icon">
      <component :is="icon" :size="25" :stroke-width="1.7" aria-hidden="true" />
    </div>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <slot />
  </div>
</template>
