# AI 调用点审计矩阵（Prompt / Memory 注入）

更新时间：2026-04-17

本文件用于“提示词工程 + 记忆系统”重构前的现状盘点，避免遗漏调用点，并为后续统一 `PromptEnvelope` 提供对照基线。

## 调用点总览

| 入口 | 文件/位置 | taskType | bypassChat | 提示词来源 | 记忆注入 channel | 记忆注入 bookTitle |
|---|---|---:|---:|---|---|---|
| 阅读对话生成回复 | `src/components/ChatArea.tsx` `handleGenerate()` | `chat` | 否 | `buildChatContextPrompt()` 或直接 `userText` | `reading-chat`（默认） | `memoryBookTitle`（可选） |
| 阅读页：行内回复 | `src/components/ReadingArea.tsx` `handleInlineReply()` | `chat` | 否 | `buildInlineReplyPrompt()` | `inline-reply` | `book.title` |
| 阅读页：主动批注 | `src/components/ReadingArea.tsx` proactive effect | `proactive` | 否 | `buildProactiveNotePrompt()` | `proactive-note` | `book.title` |
| 阅读页：手动批注后的回复 | `src/components/ReadingArea.tsx` `handleAddManualNote()` | `chat` | 否 | `buildManualNotePrompt()` | `manual-note` | `book.title` |
| 阅读页：划线分享（打开阅读聊天） | `src/components/ReadingArea.tsx` `handleShareSelection()` | `chat` | 否 | `buildShareQuotePrompt()` | `share-quote` | `book.title` |
| App：分享给 TA（触发全局 messages） | `src/App.tsx` `onShare` 传入 `ReadingArea` | `chat` | 否 | 用户原文 `text` | `app-share` | `activeBook?.title` |
| App：今日诗签 | `src/App.tsx` `generateTodayPoem()` | `creative` | 是 | `buildDailyPoemPrompt()` | `daily-poem` | `ctx.bookTitle` |
| App：回声生成 | `src/App.tsx` `generateBookEcho()` | `summary` | 是 | `buildEchoPrompt()` | `book-echo` | `target.title` |
| 伴侣页：送礼物书 | `src/components/Companion.tsx` `handleGiftBook()` | `creative` | 是 | 内联多行规则 prompt | `gift-book` | 无 |
| 伴侣页：API 测试 | `src/components/Companion.tsx` `handleTestApi()` | `utility` | 否 | 固定文本 | 无 | 无 |
| 便签：AI 评论（采样触发） | `src/components/Companion.tsx` 便签页保存按钮 onClick | `utility` | 否 | 内联一句 prompt | `memo-comment` | 无 |
| 词典：收录词条悄悄话 | `src/components/dictionary/DictionaryPage.tsx` `handleCollect()` | `utility` | 是 | `buildWhisperPrompt()` | `dictionary-whisper` | `candidate.bookTitle` |
| 词典：每日共写悄悄话 | `src/components/dictionary/DictionaryPage.tsx` `handleSubmitCoWrite()` | `utility` | 是 | `buildWhisperPrompt()` | `dictionary-daily` | 无 |

## 现状共性问题（为后续重构对照）

- **system 层级不稳定**：`bypassChat:true`/路由到辅助模型时，多数走 one-off；当前实现主要把 persona/记忆/约束混入同一段文本（user 消息），system 指令在这些路径下容易丢失或弱化。
- **记忆注入格式不统一**：注入内容是纯文本块（`【长期记忆】...`），缺少结构化字段（scope/confidence/evidence）来辅助模型自检与遵循。
- **可观测性不足**：目前缺少统一日志记录（注入了多少 facts/events/mistakes、估算 tokens、走主/辅模型），导致调参只能靠感觉。

