# PocketBuddy · 把想法放进口袋的 AI 小助手

> 会读、会记、会生图的口袋 Agent。
> 把浏览时冒出的灵感、读到的网页、划出来的金句，全都收进"口袋"里，变成可以随时回看的笔记、记忆、灵感图谱和产品灵感。

---

## 它能帮你做什么？

你在刷网页时，是不是经常这样：

- 看到一个观点，想 **"诶这个想法好像能做成产品"**，但又说不清具体长什么样
- 读了一篇长文，想把 **核心要点** 存下来，但懒得自己整理
- 划了某段金句，想 **"以后做参考用"**，但又怕忘了它在哪
- 灵感来了想随手记一下，又不想打开 Notion 那种重型工具

**PocketBuddy 就是为这种时刻准备的**：一个安静待在浏览器侧边栏里的小家伙。你随手把东西"放进口袋"，它会帮你：

| 你做的事 | PocketBuddy 帮你做的 |
|----------|---------------------|
| 划一段网页文字 | 自动捕获，作为"灵感片段" |
| 点"读取当前页" | 提取标题、要点、可记住的内容 |
| 点"分析当前页" | 输出摘要、关键观点、产品机会、长期记忆候选 |
| 写一句话想法 | 生成产品概念 + 视觉方向 + 3 步 MVP 计划 |
| 给生成结果点反馈 | 记住你的口味，下次更对路 |
| 喂过的内容越来越多 | 它越来越懂你，记忆也越来越准 |

---

## 它由 4 块小工具（"道具"）组成

藏在背景里干活的，主要是 4 个小工具：

- **IdeaLens · 想法透镜** —— 把你模糊的一句话，整理成一个清晰的产品概念
- **ProductCamera · 概念取景器** —— 把产品概念翻译成一段高质量的英文图片生成 prompt
- **ShrinkLight · 压缩灯** —— 把概念压缩成"3 步 MVP + 3 个后续任务"
- **MemoryBread · 记忆面包** —— 把你最近的偏好（视觉、主题）整理成一段简短的回顾

每个工具都有"模板 + LLM"两套实现：默认走模板保证能跑通，接上真实 LLM 后效果更准。LLM 报错会自动降级到模板，不会让你卡住。

---

## 4 个 Tab 就是 4 个用法

打开 PocketBuddy 的侧边栏，你会看到 5 个 tab：

### 1. 发明（Creative）
写一句"我想做一个……"，它会给你：
- 产品名、定位、目标用户
- 4 个核心功能点
- 视觉方向建议
- 一段图片生成 prompt
- 3 步 MVP 计划
- 3 个后续优化方向

不满意？点 5 个反馈按钮中的一个（更极简 / 更可爱 / 更产品化 / 更有科技感 / 不喜欢），它会记住你的口味。

### 2. 喂养（Reading）
把你正在读的网页"喂"给 Agent：
- **读取当前页**：提取标题、概要、可见文字
- **分析当前页**：深度分析，输出摘要、关键观点、可记住的知识点、产品机会
- **保存为笔记**：把这次分析存为可检索的笔记

### 3. 归档（Archive）
所有保存过的笔记都在这里。支持搜索、按类型过滤（论文/文章/想法）、按标签过滤。点任意一条能看详情、再生成知识卡片图、再生成思维导图。

### 4. 观察（Observation）
看 Agent 怎么被你"喂"出来的：
- 当前用户画像（视觉偏好、语气偏好、避开的风格）
- 时间线：所有想法、产物、反馈、记忆变化的历史
- 手动备份 / 还原（类似 git 的快照）

### 5. 设置（Settings）
- LLM 供应商：默认 mock（本地模拟），可切到 MiniMax / Anthropic / 自定义
- 图片生成：默认 mock，可切到真实 GPT Image API
- 完整的数据管理（清除所有本地数据）

---

## 隐私设计（重要）

PocketBuddy 是 **隐私优先** 的浏览器插件：

- ✅ 所有数据只存在 **本地浏览器**（`browser.storage.local`），不上传任何第三方
- ✅ API Key 只用于本地发起请求，**不会上传到任何服务器**
- ✅ 最小权限：只申请 `storage` / `activeTab` / `sidePanel` / `scripting` 4 个权限
- ✅ 静态扫描：项目自带 `scripts/privacy-check.mjs`，每次构建自动跑，防止误用 `localStorage` / `document.URL` 等高风险 API
- ✅ 划词 / 读取当前页时主动 **跳过表单输入框**（input / textarea / contenteditable），绝不读取你的密码和聊天内容
- ✅ `prefers-reduced-motion: reduce` 时所有动效自动降级

---

## 视觉 / 动效小细节

为了不让一个"工具型插件"显得太冷，做了 6 个小心思：

1. **光晕呼吸背景** —— 整个侧边栏背景跟随 Agent 心情（idle / warm / thinking / spark）缓慢变化
2. **口袋泡泡** —— 点"生成产品雏形"时，按钮位置会迸出一圈小蓝点
3. **卡片错落入场** —— 新生成的卡片从下往上依次出现
4. **思维导图展开** —— 节点点击展开，子节点有过渡动画
5. **Tab 滑动指示条** —— 切换 Tab 时蓝色指示条像液体一样滑过去
6. **墨水光标** —— 在输入框打字时，每个字符位置扩散一圈水波

这些都用 [Framer Motion](https://www.framer.com/motion/) 实现，全部尊重 `prefers-reduced-motion`（开了"减少动效"的人会自动看到静态版本）。

---

## 技术栈

- **WXT 0.20** —— 现代浏览器插件脚手架（Vite + TypeScript + 热更新）
- **React 19** + **TypeScript 5.9**
- **Framer Motion 12** —— 动效
- **idb 8** —— IndexedDB 封装（备用，目前主要用 `browser.storage.local`）
- **sharp** —— 头像压缩

后端（可选）：
- **LLM**：Anthropic Messages 协议兼容（MiniMax / Anthropic / 自定义 endpoint）
- **图片**：OpenAI Images 协议兼容（apimart.ai 等代理）

---

## 怎么安装 / 开发

### 1. 安装依赖

```bash
pnpm install
```

### 2. 开发模式（带热更新）

```bash
pnpm dev           # Chrome
pnpm dev:firefox   # Firefox
```

WXT 会自动打开浏览器，插件在 `.output/chrome-mv3` 目录下，刷新插件即可看到改动。

### 3. 生产构建

```bash
pnpm build         # 打包到 .output/chrome-mv3
pnpm zip           # 打成 zip，方便提交 Chrome Web Store
```

### 4. 加载到 Chrome

1. 打开 `chrome://extensions/`
2. 右上角打开"开发者模式"
3. 点"加载已解压的扩展程序"
4. 选择 `.output/chrome-mv3` 目录

### 5. 在 Firefox 加载

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点"临时载入附加组件"
3. 选择 `.output/firefox-mv2/manifest.json`

---

## 自带的脚本

```bash
# 类型检查
pnpm compile

# 隐私静态扫描（必跑，会拦下 hardcode API key / location.href 等）
pnpm privacy-check

# 端到端测试（用 puppeteer + Edge headless 真机验证）
node scripts/e2e-final.mjs
node scripts/e2e-deep.mjs
```

`scripts/e2e-final.mjs` 跑完会输出 `readCurrent` / `analyzeCurrent` / `idea.submit` 三条主链路的真实结果，能直接看到 "✅ success" 还是 "❌ error"。

---

## 项目结构（极简版）

```
entrypoints/
  background.ts         # 核心：处理所有消息、调度 Agent、读写存储
  content.ts            # content script：划词、读取当前页（在网页里跑）
  sidepanel/            # UI：4 个 Tab 在这里
    App.tsx
    tabs/{Creative,Reading,Archive,Observation,Settings}Tab.tsx

lib/
  agent/                # Agent 编排 + 5 个 Gadget 道具
    gadgets/{idea-lens,product-camera,shrink-light,memory-bread,anywhere-door}.ts
    orchestrators/      # 业务流程
  llm/                  # LLM 客户端（Anthropic 兼容 + JSON 解析）
  image/                # 图片生成 adapter
  mindmap/              # 思维导图生成
  memory/               # 记忆与用户画像
  page/                 # 页面提取 + 分类 + 分析
  storage/              # 存储 schema
  messaging/            # 强类型消息总线

components/             # 6 个独立 UI 组件
  Aurora/                # 光晕呼吸背景
  PocketBuddyAvatar/    # 4 个原创头像 + 4 个 mood 动画
  StaggerStack/         # 错落入场
  PocketBurst/           # 口袋泡泡
  AnimatedTree/         # 思维导图树
  InkRipple/            # 墨水光标
  TabIndicator/         # 滑动指示条
```

整个项目 ~6000 行 TypeScript，紧凑但有结构。

---

## 它不是什么？

诚实地说，PocketBuddy **不是** 一个完整 AI 助手。它没有联网能力，不能替你点网页，不能写完整代码。但它是一个**好的养料采集器**：

> 当你刷网页 / 读书 / 想点东西时，**它帮你把零散的灵感和上下文攒起来**，
> 攒得够多，喂给一个更强的 AI，就能真正派上用场。

可以把它理解成 **"私人版的稍后读 + 灵感口袋 + 微型 RAG"**。

---

## 设计哲学

- **隐私优先**：数据不出本机，权限申请最小
- **渐进式 AI**：没接 LLM 也能用（走 mock 模板），接了 LLM 体验更好，挂了自动降级
- **克制不喧宾夺主**：插件不该抢你的注意力，只在需要时出现
- **透明的失败**：所有错误都用 banner 直接告诉你，附带原始原因
- **有温度的交互**：4 个原创头像 + 6 个动效细节，让工具也有点小可爱

---

## License

这个项目目前是私人的口袋灵感采集器，欢迎 fork 改造成你自己的版本。
里面的 4 个 PNG 头像（云屿、小口袋云云、蓝白口袋精灵、星澈）是原创设计，**不基于任何受版权保护的角色**，可以自由使用。

---

**一个口号：**
> 灵感不是稀缺，遗漏才是。
> PocketBuddy 帮你把口袋装满，把遗漏清空。 ✨
