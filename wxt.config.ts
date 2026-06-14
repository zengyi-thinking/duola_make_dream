import { defineConfig } from 'wxt';

const buildEnv = (globalThis as {
  process?: {
    env?: Record<string, string | undefined>;
  };
}).process?.env ?? {};

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PocketBuddy',
    short_name: 'PocketBuddy',
    description: '把一个模糊想法放进口袋，拿出产品概念、视觉方向和 MVP 草图',
    version: buildEnv.POCKETBUDDY_EXTENSION_VERSION ?? '0.1.0.0',
    permissions: ['storage', 'activeTab', 'sidePanel', 'scripting'],
    host_permissions: [
      '<all_urls>',
      'https://api.minimaxi.com/*',
      'https://api.apimart.ai/*',
    ],
    action: {
      default_title: 'PocketBuddy',
    },
  },
});
