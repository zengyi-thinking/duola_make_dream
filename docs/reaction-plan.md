请你对当前 `duola_make_dream` 插件项目进行一次彻底重构。目标不是继续修补现有 UI，而是删除当前插件界面，重新设计工程结构、Agent 架构和前端功能。

## 一、重构目标

项目名：`duola_make_dream`
核心 Agent 名称：`PocketAgent`

最终产品定位：

> PocketAgent 是一个多阶段加工型 Graph Agent 系统，能够把用户的想法、网页、论文、文章和知识碎片，经过规划、调研、反思、结构化编排后，转化为可视化计划图、知识图谱、归档笔记和最终图片成果。

重点不是“输入一句话直接出图”，而是：

```text
输入想法 / 喂养网页
→ Agent 后台加工
→ 规划 / 调研 / 反思 / 编排
→ 生成图结构化计划
→ 展示关联记忆与调研节点
→ 用户确认
→ 调用生图 Agent
→ 生成最终图片 / 图谱
→ 存入长期记忆
```

## 二、先删除旧 UI

请删除或废弃当前 popup/side panel 中旧的：

* 创意 Tab
* 阅读 Tab
* 归档 Tab
* 当前杂乱的 memory 展示
* 当前直接文字堆叠式结果展示
* 当前提前展示关联召回的设计

保留可复用的底层模块，例如：

* storage
* messaging
* content script 页面提取能力
* memory store
* image adapter
* mindmap service
* agent 类型定义

但需要重新整理结构，不要让旧 UI 继续影响新设计。

## 三、重新设计五个页面

前端只保留五个主页面：

```text
1. 发明 Invent
2. 喂养 Feed
3. 记忆 Memory
4. 观察 Observe
5. 设置 Settings
```

### 1. 发明页 Invent

核心流程：

```text
输入 idea
→ 点击“生成产品雏形”
→ 显示可爱 3D 加工动画
→ 后台执行 Plan / Research / Reflect / Structure
→ 输出精美计划图面板
→ 在计划图下方展示关联记忆与调研信息图节点
→ 用户确认计划
→ 点击“生成图片”
→ 显示生图动画
→ 输出最终图片
```

要求：

* 关联召回不能在输入后立即出现；
* 必须在计划图生成后再展示；
* 关联信息必须用 Graph 节点展示；
* 如果没有用户历史记录，则展示 Agent 调研节点；
* 计划、调研、记忆、图片结果都必须图结构化展示；
* 禁止大段文字堆叠。

### 2. 喂养页 Feed

核心流程：

```text
用户点击“读取喂养”
→ Agent 读取当前页 / 论文 / 文章
→ 提取关键信息
→ 生成精美喂养笔记图
→ 自动归类目录
→ 用户确认后保存归档
```

同时支持：

```text
划词保存知识碎片
→ 碎片积累
→ 自动聚类整理
→ 生成知识节点
→ 存入记忆图谱
```

要求：

* 整页读取和划词喂养都要支持；
* 输出不是纯文本，而是知识节点图；
* 用户确认后才正式归档。

### 3. 记忆页 Memory

彻底重做。

展示内容：

* idea 生成成果图；
* 计划图；
* 最终图片；
* 网页 / 论文 / 文章归档笔记；
* 知识碎片整理结果；
* 长期记忆节点。

要求：

* 用 Graph 形式展示所有内容；
* 每个末端节点是一个笔记 / idea / 图片 / 计划；
* 点击节点后打开详情；
* 不要列表式堆叠。

### 4. 观察页 Observe

只展示 Agent 的经验沉淀：

* 成功经验图；
* 失败经验图。

用途：

```text
记录 Agent 在生成、调研、反思、执行中的成功经验和失败经验，
用于后续调用与避免重复错误。
```

不要展示复杂杂项。

### 5. 设置页 Settings

分五个模块：

1. Agent 身份定义
   * 四个头像代表四种 Agent personality；
   * 用户可选择主 Agent；
   * Agent prompt 对用户开放，可编辑。
2. 用户身份与风格
   * 用户领域；
   * 偏好；
   * 输出风格；
   * 创作方向；
   * 可编辑。
3. LLM 与生图模型配置
   * API Key；
   * Base URL；
   * LLM Model；
   * Image Model；
   * 保存后自动测试连接；
   * 返回 200 表示可用；
   * 支持开发者默认配置通过本地私有配置文件、环境变量或部署时注入；
   * 用户配置可覆盖默认配置；
   * **不要将真实 API Key、Access Token、Secret、密码等敏感凭据写入源码、构建产物、日志、输出报告或版本库。**
4. Tool 工具系统
   * 内置规划工具；
   * 搜索工具；
   * 执行工具；
   * 用户可让 Agent 创建小工具并注册。
5. Skill 系统
   * 内置生图 skill；
   * 内置网页分析提取 skill；
   * 用户可导入 skill；
   * skill 可被 Agent 调用。

## 四、Agent 架构重构

请把 Agent 设计成多阶段后台加工系统：

```text
PocketAgent
├─ Plan Agent
├─ Research Agent
├─ Reflect Agent
├─ Structure Agent
├─ Image Agent
├─ Feed Agent
├─ Memory Graph Agent
└─ Observe Agent
```

发明页主链路：

```text
idea.input
→ invent.plan
→ invent.research
→ invent.reflect
→ invent.structure
→ invent.graph.render
→ invent.image.generate
```

喂养页主链路：

```text
feed.readPage
→ feed.extract
→ feed.structure
→ feed.noteGraph.generate
→ feed.archive.confirm
```

记忆页主链路：

```text
memory.graph.load
→ memory.node.open
→ memory.node.update/delete
```

观察页主链路：

```text
observe.successGraph.load
observe.failureGraph.load
```

## 五、Graph 数据结构

请新增统一 Graph 数据结构：

```ts
type GraphNode = {
  id: string
  type: 'idea' | 'plan' | 'research' | 'note' | 'image' | 'memory' | 'success' | 'failure' | 'tool' | 'skill'
  title: string
  summary: string
  payload?: unknown
  createdAt: number
}

type GraphEdge = {
  id: string
  source: string
  target: string
  relation: string
}

type GraphView = {
  id: string
  title: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  createdAt: number
}
```

所有页面都尽量基于 GraphView 展示，不再使用普通列表作为主展示形态。

## 六、前端重构要求

请重新组织 popup/sidepanel 结构：

```text
entrypoints/popup/
  App.tsx
  pages/
    InventPage.tsx
    FeedPage.tsx
    MemoryPage.tsx
    ObservePage.tsx
    SettingsPage.tsx
  components/
    GraphCanvas.tsx
    ProcessingStage.tsx
    AgentAvatarSelector.tsx
    ModelConfigPanel.tsx
    ToolRegistryPanel.tsx
    SkillRegistryPanel.tsx
    NodeDetailDrawer.tsx
```

要求：

* `App.tsx` 只负责导航和全局布局；
* 每个页面独立组件；
* 所有结果优先图结构展示；
* 加载过程要有可爱 3D / 动态加工状态；
* 不要继续在一个文件中堆所有逻辑。

## 七、交互动画要求

发明页计划生成阶段显示：

```text
Planning...
Researching...
Reflecting...
Structuring...
Rendering Plan Graph...
```

生图阶段显示：

```text
Preparing Image Prompt...
Calling Image Agent...
Rendering Image...
Saving Result...
```

喂养页显示：

```text
Reading Page...
Extracting Key Ideas...
Building Note Graph...
Preparing Archive...
```

动画先用 mock / CSS / 组件占位即可，但状态链路必须打通。

## 八、存储重构

保留原 storage，但新增或重构为：

```text
agentProfiles
userProfile
modelConfig
toolRegistry
skillRegistry
inventGraphs
feedGraphs
memoryGraphs
observeGraphs
imageResults
archiveNotes
researchRecords
```

要求：

* 用户确认后才归档；
* 用户确认后才进入长期记忆；
* 所有图节点可追踪来源；
* 支持节点详情查看；
* 支持节点删除。

## 九、开发边界

当前阶段不要接真实复杂后端，可以保留 mock，但要保证架构可接入。

必须做到：

* 不默认读取网页；
* 用户点击喂养后才读取；
* API Key 不写死到公开代码、构建产物或输出内容中；
* 开发者默认配置可以通过环境变量、本地私有配置文件或部署配置注入；
* 用户设置可覆盖默认配置；
* 不再使用 Dora / 哆啦A梦 / 小叮当命名；
* 使用 PocketAgent / PocketBuddy / duola_make_dream 命名体系。

## 十、执行步骤

请按顺序执行：

1. 分析当前工程结构；
2. 标记可保留模块和需要删除的旧 UI；
3. 删除旧界面；
4. 新建五页面结构；
5. 新增 Graph 数据结构；
6. 重构 Agent 工作流；
7. 接入 mock 版发明流程；
8. 接入 mock 版喂养流程；
9. 接入记忆 Graph 展示；
10. 接入观察页成功/失败经验图；
11. 重做设置页；
12. 执行 `npm run compile`；
13. 执行 `npm run build`；
14. 输出修改报告。

## 十一、输出要求

完成后请输出：

1. 删除了哪些旧文件；
2. 保留了哪些底层模块；
3. 新增了哪些页面；
4. 新增了哪些组件；
5. Agent 工作流如何变化；
6. Graph 数据如何存储；
7. 发明页完整链路如何工作；
8. 喂养页完整链路如何工作；
9. 记忆页如何展示；
10. 观察页如何展示；
11. 设置页支持哪些配置；
12. `npm run compile` 结果；
13. `npm run build` 结果；
14. 仍然存在的 TODO。

请直接执行工程重构，不要只写方案。

**补充要求：**

* 我会在本地自行填写和测试 API Key。
* 不要在输出、代码模板、配置示例、日志或报告中写入任何真实 API Key、Access Token、Secret、Cookie、密码或其他敏感凭据。
* 如需提供配置示例，请使用占位符，例如：

```env
LLM_API_KEY=YOUR_API_KEY_HERE
IMAGE_API_KEY=YOUR_API_KEY_HERE
```

* 所有敏感配置必须通过环境变量、本地私有配置文件或用户设置界面注入。
* 请遵循安全最佳实践，不要将凭据硬编码到源码或输出内容中。
