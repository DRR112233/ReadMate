# 代码审查待办（不含“批注重复展示”）

> 说明：本清单只包含本轮审查中除“情绪手账批注重复展示”以外的问题。

## P0 - 安全与稳定性（优先）

- [ ] **替换 `dangerouslySetInnerHTML` 或加入严格白名单清洗**
  - 位置：`src/components/ChatArea.tsx`
  - 问题：AI 文本直接注入 HTML，存在 XSS/恶意注入风险。
  - 现状细节：`msg.text` 经过简单替换后直接写入 `dangerouslySetInnerHTML`。

- [ ] **评估并收敛 `rehypeRaw` 的使用范围**
  - 位置：`src/components/ReadingArea.tsx`、`src/components/Companion.tsx`
  - 问题：允许渲染原始 HTML，会放大模型输出/外部 API 返回内容的注入风险。
  - 建议方向：默认禁用 raw HTML，仅允许安全 Markdown 子集。

- [ ] **修复 ID 生成策略，避免时间戳碰撞**
  - 位置：多处（消息、手帐条目等）
  - 问题：`Date.now().toString()` 在高频操作下可能冲突，导致渲染 key/更新定位异常。
  - 建议方向：统一改为稳定唯一 ID（如 `crypto.randomUUID()`）。

## P1 - 架构与可维护性

- [ ] **拆分超大组件，降低职责耦合**
  - 位置：`src/components/Companion.tsx`、`src/components/ReadingArea.tsx`
  - 问题：单文件承担过多职责（视图切换、业务逻辑、数据写入、AI 交互、编辑态管理）。
  - 影响：改动风险高、复用困难、回归概率高。

- [ ] **抽象统一的 AI Prompt 构建层**
  - 位置：`src/components/ReadingArea.tsx`、`src/components/ChatArea.tsx`、`src/components/Companion.tsx`
  - 问题：Prompt 模板散落多处，风格和约束不一致，难以统一调整。
  - 建议方向：集中到 `promptBuilder`/`promptTemplates` 模块。

- [ ] **收敛“对话/手帐/AI回复”领域模型，明确单一事实来源**
  - 位置：`src/types.ts` 及相关读写逻辑
  - 问题：当前模型表达能力重叠，展示与存储边界不清晰，后续功能迭代易引发状态分叉。
  - 建议方向：定义领域对象层级、状态机与字段互斥关系。

## P1 - 数据与持久化风险

- [ ] **评估 localStorage 容量与性能上限**
  - 位置：`src/App.tsx`（`books/journals/memos` 全量存储）
  - 问题：书籍正文与历史记录体量增大后可能触发配额异常或性能抖动。
  - 建议方向：引入 IndexedDB 或分层持久化（元数据 vs 大文本）。

- [ ] **补齐备份恢复的数据校验与迁移策略**
  - 位置：`src/App.tsx`（`handleRestoreBackup`）
  - 问题：当前版本校验较浅，缺少字段级 schema 校验和跨版本迁移机制。
  - 影响：历史备份在字段演进后可能恢复异常或静默丢字段。

## P2 - 接口与工程规范一致性

- [ ] **统一 API 超时与错误处理策略**
  - 位置：`src/services/geminiService.ts`
  - 问题：`initChat` 内部请求与 `sendMessage` 的超时策略不一致（15s vs 可配置），错误语义不统一。
  - 影响：用户侧表现不稳定，排障成本高。

- [ ] **梳理并规范 baseUrl 拼接规则**
  - 位置：`src/services/geminiService.ts`
  - 问题：`/chat/completions` 自动拼接+清理逻辑存在边界分支，易导致 endpoint 拼接错误。
  - 建议方向：封装单一 `normalizeApiEndpoint()` 并加单测覆盖常见输入。

- [ ] **建立渲染安全规范与实现一致性**
  - 位置：全项目（特别是聊天与 Markdown 渲染链路）
  - 问题：提示词层“禁止 HTML”与渲染层“允许 raw HTML”存在规范冲突。
  - 建议方向：形成统一安全基线（输入约束 + 渲染白名单 + 测试用例）。

## 建议的处理顺序

1. 先做 P0（安全注入风险 + ID 唯一性）
2. 再做 P1（组件拆分、Prompt 抽象、持久化治理）
3. 最后做 P2（接口规范统一与工程化补强）
