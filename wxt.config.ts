import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PocketBuddy',
    short_name: 'PocketBuddy',
    description: '把一个模糊想法放进口袋，拿出产品概念、视觉方向和 MVP 草图',
    permissions: ['storage', 'activeTab', 'sidePanel'],
    host_permissions: [
      'https://api.minimaxi.com/*',
      'https://api.apimart.ai/*',
    ],
    action: {
      default_title: 'PocketBuddy',
    },
  },
});
