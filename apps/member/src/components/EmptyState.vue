<script setup lang="ts">
import { PackageOpen } from 'lucide-vue-next';

withDefaults(defineProps<{ title?: string; description?: string; actionLabel?: string }>(), {
  title: '暂无内容',
  description: '这里暂时没有可展示的内容',
  actionLabel: '',
});

defineEmits<{ action: [] }>();
</script>

<template>
  <div class="empty-state">
    <div class="empty-state-icon"><PackageOpen :size="26" stroke-width="1.7" aria-hidden="true" /></div>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <t-button v-if="actionLabel" theme="primary" variant="outline" size="small" @click="$emit('action')">
      {{ actionLabel }}
    </t-button>
  </div>
</template>
