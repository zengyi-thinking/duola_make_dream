# PocketBuddy 落地执行计划（施工图）

> 本文档是**可逐步执行的施工图**，配合 [docs/pocketbuddy-original-goal-plan.md](./pocketbuddy-original-goal-plan.md)（差距审计）使用。
> 审计文档回答"离原始目标还差多远"，本文档回答"按什么顺序、改哪些文件、怎么验证、怎么测"。
> 原始目标：**把网页、论文、文章和脑中的想法，转成笔记、记忆、图片、图谱和可执行的小产品方案。**

---

## 0. 怎么用这份文档

1. 从上到下按阶段执行，**每个阶段都必须通过"验收标准 + 真实浏览器测试"才算完成**。
2. 每个阶段有 `T.x.y` 编号的任务（文件级），改完一项就在本文档对应行打勾。
3. 真实测试一律用 **puppeteer-core + 本地 Edge**，加载 `.output/chrome-mv3` 构建产物。
4. 凡是"跑起来了 / 验证通过"，必须有脚本输出的成功/失败样本作为证据，不接受口头确认。

---

## 1. 总览：6 阶段路线图 + 当前状态

| 阶段 | 目标 | 状态 | 优先级 | 依赖 |
|---|---|---|---|---|
| **阶段 1** | 真模型链路验证（LLM + 生图真实可用） | ✅ 已完成 | P0 | 无 |
| 阶段 2 | 语义记忆升级（关键词→关系网召回） | ⏳ 待开始 | P1 | 阶段 1 |
| 阶段 3 | 主动式编排（响应式→半主动） | ⏳ 待开始 | P1 | 阶段 2 |
| 阶段 4 | 输出适配扩展（导出 + 外接 + 互导） | ⏳ 待开始 | P2 | 阶段 1 |
| 阶段 5 | 观察因果链（输入→变化→输出可追溯） | ⏳ 待开始 | P2 | 阶段 2 |
| 阶段 6 | gadget 系统化（注册/权限/试运行） | ⏳ 待开始 | P3 | 阶段 3 |

> P0 = 必须先做，是"让 agent 真正跑起来"的前提；P1/P2/P3 可在阶段 1 验证通过后滚动推进。

---

## 2. 真实测试基线（贯穿所有阶段）

### 2.1 工具链
- `puppeteer-core` + 本地 `msedge.exe`（路径见各脚本顶部 `EDGE` 常量）
- 加载产物：`.output/chrome-mv3`（`npm run build` 生成）
- 通过 CDP 直接对 background service worker 发 `chrome.runtime.sendMessage`，模拟 sidepanel 的真实调用

### 2.2 真实凭据来源（安全约定）
- **凭据来自** `D:\DevProject\Virtuea\.env`（`MINIMAX_API_KEY` / `GPT_IMAGE_API_KEY`）
- **使用方式**：测试脚本运行时读取该 `.env`，注入到扩展 `browser.storage.local` 的 `runtimeConfig`，**跑完即弃**
- **红线**：凭据绝不进入本项目代码、不进入 git、不写入本文档。`.gitignore` 已忽略 `.env`
- 正常使用：用户在 sidepanel「设置」页手动填写（设置页已持久化到 `browser.storage.local`）

### 2.3 现有测试脚本
| 脚本 | 用途 |
|---|---|
| [scripts/e2e-inject.mjs](../scripts/e2e-inject.mjs) | content script 注入链路 |
| [scripts/e2e-deep.mjs](../scripts/e2e-deep.mjs) | 老标签页注入桥接 |
| [scripts/e2e-final.mjs](../scripts/e2e-final.mjs) | idea.submit 本地闭环（mock） |
| **scripts/e2e-live-model.mjs** | 🆕 真模型综合 smoke（LLM + 生图 + 降级，阶段 1 新增） |

### 2.4 通用跑测命令
```bash
npm run build                       # 先构建
node scripts/e2e-live-model.mjs     # 阶段1：真实 LLM + 生图 + 降级
npm run privacy-check               # 隐私静态检查
```

---

## 3. 阶段 1：真模型链路验证 🔧 进行中

> 这是审计文档"建议验证顺序"的第 1 步，也是"让 agent 真正跑起来"的硬前提。

### 3.1 目标
- `llmProvider='minimax'` 时，真实 LLM 能稳定返回，且结果随输入变化（不再千篇一律）。
- `imageMode='proxy'` 时，真实图片代理能稳定返回真实图片 URL/data。
- 任何失败都能优雅降级，**不卡死 sidepanel、不崩溃 background**。

### 3.2 任务清单

- [x] **T1.1 修复生图参数格式 bug**
  - 文件：[lib/image/adapter.ts](../lib/image/adapter.ts) `callImageApi`
  - 问题：原发 `{ size:'1024x1024' }`（OpenAI DALL·E 风格），与 apimart `gpt-image-2` 的宽高比格式不兼容。
  - 改法：改为 `{ size:'16:9', resolution:'2k' }`；进一步发现 apimart 是**异步任务模式**（返回 task_id），已重写为「提交 → 轮询 `GET /v1/tasks/{id}` → 取 `result.images[].url[]`」。

- [x] **T1.2 默认模型对齐 MiniMax-M3**
  - 文件：[lib/storage/schema.ts](../lib/storage/schema.ts) `DEFAULT_RUNTIME_CONFIG.llmModel`：`'MiniMax-M2.7'` → `'MiniMax-M3'`。

- [x] **T1.3 真模型综合 smoke 脚本** → [scripts/e2e-live-model.mjs](../scripts/e2e-live-model.mjs)
  - 注入真实配置（从 Virtuea `.env` 读 key）→ Part A：`idea.submit` 验真实 LLM → Part B：`image.generate` 验真实生图 → Part C：错 key 验失败降级。

### 3.3 验收标准（✅ 2026-06-13 全部通过）
1. ✅ `npm run compile` 零类型错误。
2. ✅ `npm run build` 成功（964.98 kB），manifest `host_permissions` 含两个 API 域名。
3. ✅ `npm run privacy-check` 0 命中（85 文件）。
4. ✅ **真实 LLM**：MiniMax-M3 返回「口袋识页——把每一个网页装进口袋」，语义相关、非模板。
5. ✅ **真实生图**：apimart gpt-image-2 异步任务打通，返回真实图片 URL（`https://upload.apib.ai/...`）。
6. ✅ **失败降级**：错 key → LLM 401→模板降级、图片 401→failed，不崩。

> 已知限制：apimart 返回的图片 URL 约 24h 后过期（`expires_at`）。阶段 4 将补「下载转 base64 永久存储」。

### 3.4 失败降级验证（必做）
- 场景 A：`llmApiKey` 填错 → gadget 内 catch → 回退 mock 模板，artifact 仍生成，标记未用 LLM。
- 场景 B：`imageApiKey` 填错 → record.status==='failed'，previewText 带错误码。
- 场景 C：超时 → LLM 30s abort；图片异步轮询最多 180s（45×4s），超时返回"图片生成超时"，不卡。

---

## 4. 阶段 2：语义记忆升级 ⏳

### 4.1 目标
recall 从"关键词 + 近期性 + 标签"的启发式排序，升级为能"找关系"的混合检索，并能解释"为什么这条被召回"。

### 4.2 任务清单（骨架，阶段 1 完成后细化）
- [ ] **T2.1 记忆结构化标签增强**：给 `ArchiveNote` / `ApprovedMemory` / `ProductArtifact` 增加可计算的语义标签字段。
- [ ] **T2.2 关系边建模**：在 memory 层建立 `主题↔上下文↔产物↔反馈` 的关联边（可先用本地邻接表，不引入向量库）。
- [ ] **T2.3 hybrid recall**：[lib/agent/insights.ts](../lib/agent/insights.ts) `buildKnowledgeRecall` 在现有关键词召回上叠加主题聚类召回 + 关系图扩展。
- [ ] **T2.4 召回解释**：`RecallItem.reason` 升级为结构化"为什么召回"（命中类型 + 证据片段）。

### 4.3 验收标准
- 同一主题多次输入后，召回结果更稳定、更聚焦。
- 每条召回都能给出"为什么"（命中类型 + 证据）。
- e2e：连续投喂同一主题 3 次，第 4 次召回命中率 > 现状。

---

## 5. 阶段 3：主动式编排 ⏳

### 5.1 目标
Agent 从"纯点击响应"升级为"半主动"：关键状态变化后主动给出下一步建议。

### 5.2 任务清单（骨架）
- [ ] **T3.1 任务状态机**：定义 `idle / reading / inventing / awaiting-feedback / archived` 等状态及转移。
- [ ] **T3.2 下一步建议引擎**：基于当前状态 + 记忆 + 画像，产出 `NextStepSuggestion[]`。
- [ ] **T3.3 主动提示 UI**：sidepanel 在关键节点展示"建议下一步"卡片（非打断式）。
- [ ] **T3.4 建议可执行**：点击建议直接触发对应动作。

### 5.3 验收标准
- 完成一次阅读/发明后，Agent 主动给出 ≥1 条与当前记忆/画像相关的建议。
- 建议可一键执行。

---

## 6. 阶段 4：输出适配扩展 ⏳

### 6.1 目标
让产物不止停留在插件内，可导出、可外接、可互导。

### 6.2 任务清单（骨架）
- [ ] **T4.1 markdown 导出**：artifact / note / image prompt 一键导出 .md。
- [ ] **T4.2 图片下载**：真实图片支持下载到本地。
- [ ] **T4.3 互导路径**：图片↔图谱↔笔记↔概念 之间建立跳转/引用。
- [ ] **T4.4 外接占位**：预留 Notion/Obsidian 等外部笔记导出协议（先留接口）。

### 6.3 验收标准
- artifact、note、image 均可导出为结构化 markdown。
- 真实图片可下载。

---

## 7. 阶段 5：观察因果链 ⏳

### 7.1 目标
观察页能回答"是哪一段输入，如何改变了哪个偏好/输出风格/工具选择"。

### 7.2 任务清单（骨架）
- [ ] **T5.1 因果事件流**：记录 `输入→画像变化→产物变化` 的因果边。
- [ ] **T5.2 观察页因果视图**：在时间线上展示因果链（不只是平铺事件）。
- [ ] **T5.3 反馈溯源**：每次反馈能定位到触发它的那次喂养/发明。

### 7.3 验收标准
- 观察页能展示"输入→变化→输出"链条。
- 能定位某次偏好变化由哪次喂养触发。

---

## 8. 阶段 6：gadget 系统化 ⏳

### 8.1 目标
从"命名可爱的一组 helper"升级为"可扩展的道具体系"。

### 8.2 任务清单（骨架）
- [ ] **T6.1 统一道具协议**：定义 `Gadget` 接口（id / describe / permissions / run / version）。
- [ ] **T6.2 道具注册表**：现有 7 个 gadget 迁移到注册表，支持动态列举。
- [ ] **T6.3 权限边界**：每个 gadget 声明它能读/写的数据域。
- [ ] **T6.4 试运行 + 版本记录**：gadget 调用记入 harness patch 体系，可回放。

### 8.3 验收标准
- 新道具可按统一协议接入，被 agent core 识别、调用、观察。
- gadget 调用有版本记录，可回放。

---

## 9. 验证总顺序（审计文档建议）

1. ✅ 阶段 1：真实模型 smoke test（**当前**）
2. recall / memory 准确性验证（阶段 2）
3. 端到端："网页输入 → 产物输出 → 记忆变化 → 观察页回放"（阶段 2/5 交叉）
4. 导出 + gadget 系统化（阶段 4/6）

---

## 变更记录

| 日期 | 阶段 | 变更 |
|---|---|---|
| 2026-06-13 | 全文 | 初版落地执行计划，阶段 1 开始执行 |
| 2026-06-13 | 阶段 1 | 真模型链路验证全部通过（LLM + 生图 + 降级），apimart 异步任务协议接入 |
