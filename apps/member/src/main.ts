import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { Button, Checkbox, Input } from 'tdesign-mobile-vue';
import 'tdesign-mobile-vue/es/style/index.css';
import './styles.css';
import { initializeThemeMode } from './theme';

initializeThemeMode();

const app = createApp(App).use(createPinia()).use(router);
app.component('t-button', Button);
app.component('t-checkbox', Checkbox);
app.component('t-input', Input);
app.mount('#app');
