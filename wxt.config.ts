import { defineConfig } from 'wxt';

const buildEnv = (globalThis as {
  process?: {
    env?: Record<string, string | undefined>;
  };
}).process?.env ?? {};

const APP_ICONS = {
  16: 'icons/16.png',
  32: 'icons/32.png',
  48: 'icons/48.png',
  128: 'icons/128.png',
};

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PocketBuddy',
    short_name: 'PocketBuddy',
    description: '把一个模糊想法放进口袋，拿出产品概念、视觉方向和 MVP 草图',
    version: buildEnv.POCKETBUDDY_EXTENSION_VERSION ?? '0.1.0.0',
    icons: APP_ICONS,
    permissions: ['storage', 'activeTab', 'sidePanel', 'scripting'],
    host_permissions: [
      '<all_urls>',
      'https://api.minimaxi.com/*',
      'https://api.apimart.ai/*',
    ],
    action: {
      default_title: 'PocketBuddy',
      default_icon: APP_ICONS,
    },
  },
});
