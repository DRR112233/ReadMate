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

## 📄 许可证
本项目仅供学习交流使用。

---
*由 AI 驱动，让阅读不再孤单。*
