# ReadMate -  AI 伴读系统

## 📖 项目简介
一款专为需要情感陪伴的用户设计的 AI 伴读应用。它不仅仅是一个电子书阅读器，更是一个拥有“灵魂”的虚拟恋人。通过先进的 AI 技术，应用内的虚拟恋人会陪你一起阅读，在字里行间留下情感批注，与你讨论书中的细节，并记录下你们共同阅读的点点滴滴。


## ✨ 核心功能
- **AI 恋人伴读**：支持自定义人设，TA 会根据你阅读的内容实时产生情感共鸣和批注。
- **全格式支持**：完美支持 EPUB 和 txt 格式书籍导入。
- **情绪手账**：自动记录阅读过程中的精彩片段和 TA 的深情回应，打造专属的情感回忆录。
- **互动礼物**：TA 会不定期为你创作专属的睡前故事或情书作为惊喜。
- **高级 API 配置**：支持 Google Gemini 原生接口及各类第三方 OpenAI 兼容接口（如 DeepSeek, SiliconFlow 等），支持模型自动抓取。
- **跨平台体验**：支持 PWA 安装，并可通过 Capacitor 打包为 Android 原生 APK。

## 🛠️ 技术栈
- **前端**：React 19 + TypeScript + Vite
- **动画**：Framer Motion
- **UI 样式**：Tailwind CSS
- **图标**：Lucide React
- **阅读引擎**：Epub.js + PDF.js
- **AI 引擎**：Google Generative AI SDK + OpenAI API 兼容层
- **移动端**：Capacitor (Android)

## 🚀 快速开始

### 1. 环境准备
确保你的电脑已安装 Node.js (建议 v18+) 和 Git。

### 2. 获取代码
```bash
git clone https://github.com/DRR112233/ReadMate.git
cd ReadMate
```

### 3. 安装依赖
```bash
npm install
```

### 4. 启动开发服务器
```bash
npm run dev
```

### 5. API 配置
启动应用后，在“恋人” -> “设置” -> “高级 API 设置”中配置你的 API Key 和 Base URL。

## 📱 安卓打包 (Capacitor)
1. 执行静态构建：`npm run static-build`
2. 同步到安卓工程：`npm run android-sync`
3. 使用 Android Studio 打开 `android` 目录进行打包。

## 🧾 版本号与变更记录（重要）

- **App 版本号**：来自 `package.json` 的 `version`
- **构建号（BUILD_ID）**：来自 `src/buildInfo.ts` 的 `BUILD_ID`
- **查看方式**：打开隐藏“开发诊断面板”，顶部会显示 `version` 与 `build`

### 更新规则（我们以后按这个来）

- **每次我修改代码并交付时**：
  - 递增 `package.json` 的 `version`（至少 patch +1）
  - 更新 `src/buildInfo.ts` 的 `BUILD_ID`
  - 在下面的 Changelog 追加一条记录

### Changelog

- **0.0.2 / 2026-04-17.2**
  - 修复：诊断面板版本号不再显示 `unknown`（稳定展示 `version/build`）
  - 改进：诊断面板支持“打开自动复制错误日志”开关，且点击日志可直接复制
  - 修复：书签恢复/保存的边界情况（避免有效书签被 0 覆盖）
  - 修复：原生端导出 JSON 明确使用 UTF-8 编码；导入备份兼容 BOM
  - 调整：统一“我的批注”与 TA 批注的展示风格

- **0.0.1 / 2026-04-17.1**
  - 修复：EPUB 封面持久化（重启后不丢）
  - 修复：书签显示章节名与时间
  - 改进：EPUB/PDF 导入结构化提取，减少排版/目录混乱
  - 新增：隐藏开发诊断面板（导出诊断/复制错误日志）
  - 新增：安卓一键热更新脚本（强制 `localhost:3000` + `adb reverse`）
  - 修复：原生端导出备份/诊断 JSON 编码（UTF-8），避免导入报错

## 📄 许可证
本项目仅供学习交流使用。

---
*由 AI 驱动，让阅读不再孤单。*
