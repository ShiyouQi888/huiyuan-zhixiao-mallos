<script setup lang="ts">
import { X } from 'lucide-vue-next';

withDefaults(defineProps<{
  modelValue: boolean;
  title: string;
  eyebrow?: string;
  description?: string;
  cancelText?: string;
  confirmText?: string;
  confirmLoading?: boolean;
  confirmDisabled?: boolean;
  hint?: string;
  alert?: boolean;
}>(), {
  eyebrow: '',
  description: '',
  cancelText: '取消',
  confirmText: '确认',
  confirmLoading: false,
  confirmDisabled: false,
  hint: '',
  alert: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  cancel: [];
  confirm: [];
}>();

function cancel() {
  emit('update:modelValue', false);
  emit('cancel');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="overlay-scrim app-modal" @click.self="cancel">
      <section class="app-modal-card" :role="alert ? 'alertdialog' : 'dialog'" aria-modal="true" :aria-label="title">
        <header class="app-modal-head">
          <div>
            <span v-if="eyebrow" class="page-eyebrow">{{ eyebrow }}</span>
            <h2>{{ title }}</h2>
            <p v-if="description">{{ description }}</p>
          </div>
          <button type="button" class="app-modal-close" aria-label="关闭" @click="cancel"><X :size="17" aria-hidden="true" /></button>
        </header>
        <slot />
        <div class="app-modal-actions">
          <button type="button" class="app-modal-cancel" @click="cancel">{{ cancelText }}</button>
          <t-button theme="primary" block :loading="confirmLoading" :disabled="confirmDisabled" @click="emit('confirm')">{{ confirmText }}</t-button>
        </div>
        <p v-if="hint" class="app-modal-hint">{{ hint }}</p>
        <slot name="footer" />
      </section>
    </div>
  </Teleport>
</template>
