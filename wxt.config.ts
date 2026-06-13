import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '哆啦造梦',
    description: '你的 AI 伙伴，像哆啦A梦一样帮你把想法变成现实',
    permissions: ['storage', 'activeTab'],
  },
});
