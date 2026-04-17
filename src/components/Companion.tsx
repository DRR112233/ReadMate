import React, { useState, useEffect } from 'react';
import { Heart, Calendar, Clock, BookOpen, ChevronRight, ChevronLeft, Save, Quote, Settings, Gift, Loader2, X, PenTool, Sparkles, Archive, Trash2, BookText, Pin, Brain } from 'lucide-react';
import { JournalEntry, Book, Memo, PoemSlip } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { updateApiConfig, sendMessage, fetchModels, getAiCallLogs, clearAiCallLogs } from '../services/geminiService';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';
import { BUILD_ID } from '../buildInfo';
import { createId } from '../utils/id';
import { useInlineEditor } from '../hooks/useInlineEditor';
import DictionaryPage from './dictionary/DictionaryPage';
import {
  clearAllMemory,
  deleteMemoryEvent,
  deleteMemoryFact,
  deleteMemoryMistake,
  getMistakeKindLabel,
  getMemorySnapshot,
  getMemoryStats,
  rememberConversationTurn,
  rememberMilestone,
  rememberUserInput,
  submitMemoryFactFeedback,
  togglePinMemoryFact,
  updateMemoryMistakeKind,
  type MemoryEvent,
  type MemoryFact,
  type MemoryMistake,
} from '../services/memoryService';
import { buildPromptEnvelope } from '../utils/promptEnvelope';

interface CompanionProps {
  persona: string;
  setPersona: (p: string) => void;
  journalEntries: JournalEntry[];
  memos: Memo[];
  setMemos: React.Dispatch<React.SetStateAction<Memo[]>>;
  onUpdateJournal: (entry: JournalEntry) => void;
  onDeleteJournal: (id: string) => void;
  onAddTaBook: (book: Book) => void;
  companionName: string;
  setCompanionName: (name: string) => void;
  companionAvatar: string;
  setCompanionAvatar: (avatar: string) => void;
  startDate: number;
  readingTime: number;
  books: Book[];
  poemSlips: PoemSlip[];
  onDeletePoemSlip: (id: string) => void;
  onGenerateBookEcho: (bookId: string) => Promise<void>;
  onCreateBackup: () => any;
  onRestoreBackup: (payload: any) => void;
}

type View = 'main' | 'persona' | 'journal' | 'api-settings' | 'gifts' | 'profile' | 'memos' | 'poem-slips' | 'time-capsule' | 'dictionary' | 'memory';
type JournalFilter = 'all' | 'manual' | 'chat' | 'proactive';
type TaskType = 'critical' | 'creative' | 'summary' | 'chat' | 'proactive' | 'utility' | 'memory';
type RouteTarget = 'primary' | 'auxiliary';
type TaskRoutingConfig = Record<TaskType, RouteTarget>;
type TaskTokenConfig = Record<TaskType, number>;
interface CostEstimatorConfig {
  dau: number;
  avgReadingMinutesPerUser: number;
  avgChatRoundsPerUser: number;
  avgManualNotesPerUser: number;
  avgShareQuotesPerUser: number;
  avgInlineRepliesPerUser: number;
  avgMemosPerUser: number;
  avgDictionaryActionsPerUser: number;
  giftBookRate: number;
  echoRate: number;
  avgInputTokens: TaskTokenConfig;
  avgOutputTokens: TaskTokenConfig;
  unitPrice: {
    currency: 'CNY' | 'USD';
    primaryInputPer1M: number;
    primaryOutputPer1M: number;
    auxiliaryInputPer1M: number;
    auxiliaryOutputPer1M: number;
  };
}
interface PricingTemplate {
  id: string;
  label: string;
  currency: 'CNY' | 'USD';
  primaryInputPer1M: number;
  primaryOutputPer1M: number;
  auxiliaryInputPer1M: number;
  auxiliaryOutputPer1M: number;
}
const defaultTaskRouting: TaskRoutingConfig = {
  critical: 'primary',
  creative: 'primary',
  summary: 'primary',
  chat: 'auxiliary',
  proactive: 'auxiliary',
  utility: 'auxiliary',
  memory: 'auxiliary',
};
const taskRouteLabels: Array<{ key: TaskType; label: string; hint: string }> = [
  { key: 'critical', label: '关键任务', hint: '高质量、低容错回复' },
  { key: 'creative', label: '创作任务', hint: '礼物故事、每日诗签' },
  { key: 'summary', label: '总结任务', hint: '回声、长文本汇总' },
  { key: 'chat', label: '普通聊天', hint: '阅读对话与即时回复' },
  { key: 'proactive', label: '主动触发', hint: '自动批注等高频任务' },
  { key: 'utility', label: '工具类任务', hint: '测试连接、词典短句' },
  { key: 'memory', label: '记忆维护', hint: '记忆提炼与低风险处理' },
];
const defaultCostEstimator: CostEstimatorConfig = {
  dau: 1,
  avgReadingMinutesPerUser: 40,
  avgChatRoundsPerUser: 8,
  avgManualNotesPerUser: 2,
  avgShareQuotesPerUser: 3,
  avgInlineRepliesPerUser: 1,
  avgMemosPerUser: 2,
  avgDictionaryActionsPerUser: 0.6,
  giftBookRate: 0.08,
  echoRate: 0.12,
  avgInputTokens: {
    chat: 360,
    proactive: 280,
    utility: 220,
    creative: 650,
    summary: 900,
    critical: 500,
    memory: 180,
  },
  avgOutputTokens: {
    chat: 140,
    proactive: 90,
    utility: 70,
    creative: 520,
    summary: 320,
    critical: 180,
    memory: 120,
  },
  unitPrice: {
    currency: 'CNY',
    primaryInputPer1M: 4,
    primaryOutputPer1M: 12,
    auxiliaryInputPer1M: 0.8,
    auxiliaryOutputPer1M: 2.4,
  },
};
const pricingTemplates: PricingTemplate[] = [
  {
    id: 'custom',
    label: '自定义（保持当前）',
    currency: 'CNY',
    primaryInputPer1M: 0,
    primaryOutputPer1M: 0,
    auxiliaryInputPer1M: 0,
    auxiliaryOutputPer1M: 0,
  },
  {
    id: 'balanced-cny',
    label: '参考档（均衡）',
    currency: 'CNY',
    primaryInputPer1M: 4,
    primaryOutputPer1M: 12,
    auxiliaryInputPer1M: 0.8,
    auxiliaryOutputPer1M: 2.4,
  },
  {
    id: 'economy-cny',
    label: '参考档（经济）',
    currency: 'CNY',
    primaryInputPer1M: 2.5,
    primaryOutputPer1M: 7.5,
    auxiliaryInputPer1M: 0.5,
    auxiliaryOutputPer1M: 1.5,
  },
  {
    id: 'balanced-usd',
    label: '参考档（USD）',
    currency: 'USD',
    primaryInputPer1M: 0.55,
    primaryOutputPer1M: 1.65,
    auxiliaryInputPer1M: 0.11,
    auxiliaryOutputPer1M: 0.33,
  },
];

export default function Companion({ 
  persona, 
  setPersona, 
  journalEntries, 
  memos,
  setMemos,
  onUpdateJournal,
  onDeleteJournal,
  onAddTaBook,
  companionName,
  setCompanionName,
  companionAvatar,
  setCompanionAvatar,
  startDate,
  readingTime,
  books,
  poemSlips,
  onDeletePoemSlip,
  onGenerateBookEcho,
  onCreateBackup,
  onRestoreBackup
}: CompanionProps) {
  const [view, setView] = useState<View>('main');
  const [journalFilter, setJournalFilter] = useState<JournalFilter>('all');
  const [tempPersona, setTempPersona] = useState(persona);
  const [tempName, setTempName] = useState(companionName);
  const [tempAvatar, setTempAvatar] = useState(companionAvatar);
  const [isGifting, setIsGifting] = useState(false);
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [editJournalText, setEditJournalText] = useState('');
  const memoEditor = useInlineEditor();
  const userNoteEditor = useInlineEditor();
  const messageEditor = useInlineEditor();
  const [journalToDelete, setJournalToDelete] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle'|'testing'|'success'|'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [memoAiFrequency, setMemoAiFrequency] = useState(() => {
    const saved = localStorage.getItem('app_memoAiFrequency');
    return saved ? parseFloat(saved) : 0.5;
  });
  const [costEstimator, setCostEstimator] = useState<CostEstimatorConfig>(() => {
    const saved = localStorage.getItem('app_costEstimatorConfig');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...defaultCostEstimator,
          ...parsed,
          avgInputTokens: { ...defaultCostEstimator.avgInputTokens, ...(parsed.avgInputTokens || {}) },
          avgOutputTokens: { ...defaultCostEstimator.avgOutputTokens, ...(parsed.avgOutputTokens || {}) },
        };
      } catch {
        // ignore parse error and use defaults
      }
    }
    return defaultCostEstimator;
  });
  const [pricingTemplateId, setPricingTemplateId] = useState('custom');

  useEffect(() => {
    localStorage.setItem('app_memoAiFrequency', memoAiFrequency.toString());
  }, [memoAiFrequency]);
  useEffect(() => {
    localStorage.setItem('app_costEstimatorConfig', JSON.stringify(costEstimator));
  }, [costEstimator]);
  useEffect(() => {
    localStorage.setItem('app_costEstimatorTemplate', pricingTemplateId);
  }, [pricingTemplateId]);
  useEffect(() => {
    const saved = localStorage.getItem('app_costEstimatorTemplate');
    if (saved && pricingTemplates.some((tpl) => tpl.id === saved)) {
      setPricingTemplateId(saved);
    }
  }, []);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [devTapCount, setDevTapCount] = useState(0);
  const [lastDevTapAt, setLastDevTapAt] = useState(0);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [devLogs, setDevLogs] = useState<Array<{ id: string; time: number; level: string; message: string }>>([]);
  const [aiCallLogs, setAiCallLogs] = useState<any[]>([]);
  const [autoCopyErrorsOnOpen, setAutoCopyErrorsOnOpen] = useState(() => {
    const v = localStorage.getItem('app_dev_autoCopyErrorsOnOpen');
    return v ? v === '1' : true;
  });
  const [memoryWriterLlmEnabled, setMemoryWriterLlmEnabled] = useState(() => {
    try {
      return localStorage.getItem('app_memoryWriter_llm') === '1';
    } catch {
      return false;
    }
  });
  const [chapterTestLine, setChapterTestLine] = useState('');
  const [chapterTestResult, setChapterTestResult] = useState<boolean | null>(null);
  const [echoLoadingBookId, setEchoLoadingBookId] = useState<string | null>(null);
  const [expandedMemoryBookId, setExpandedMemoryBookId] = useState<string | null>(null);
  const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([]);
  const [memoryEvents, setMemoryEvents] = useState<MemoryEvent[]>([]);
  const [memoryMistakes, setMemoryMistakes] = useState<MemoryMistake[]>([]);
  const [memoryStats, setMemoryStats] = useState(() => getMemoryStats());

  const daysTogether = Math.max(1, Math.ceil((Date.now() - startDate) / (1000 * 60 * 60 * 24)));
  const finishedBooks = books.filter(b => b.progress === 100 || b.status === 'finished').length;
  const readingHours = Math.floor(readingTime / 60);
  const readingMinutes = readingTime % 60;
  
  const handleUpdateBook = (book: Book) => {
    // This is a placeholder, App.tsx handles this
  };

  const loadDevLogs = () => {
    try {
      const logs = JSON.parse(localStorage.getItem('app_debugLogs') || '[]');
      setDevLogs(Array.isArray(logs) ? logs : []);
    } catch {
      setDevLogs([]);
    }
  };
  const loadAiLogs = () => {
    try {
      setAiCallLogs(getAiCallLogs());
    } catch {
      setAiCallLogs([]);
    }
  };

  useEffect(() => {
    if (showDevPanel) {
      loadDevLogs();
      loadAiLogs();
    }
  }, [showDevPanel]);

  useEffect(() => {
    localStorage.setItem('app_dev_autoCopyErrorsOnOpen', autoCopyErrorsOnOpen ? '1' : '0');
  }, [autoCopyErrorsOnOpen]);
  useEffect(() => {
    try {
      localStorage.setItem('app_memoryWriter_llm', memoryWriterLlmEnabled ? '1' : '0');
    } catch {
      // ignore
    }
  }, [memoryWriterLlmEnabled]);

  const copyText = async (text: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Clipboard.write({ string: text });
        return true;
      }
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        // Fallback for some WebView policies
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  };

  const handleSecretTap = () => {
    const now = Date.now();
    const withinWindow = now - lastDevTapAt < 1200;
    const nextCount = withinWindow ? devTapCount + 1 : 1;
    setDevTapCount(nextCount);
    setLastDevTapAt(now);
    if (nextCount >= 5) {
      setShowDevPanel(true);
      setDevTapCount(0);
      setLastDevTapAt(0);
      loadDevLogs();
      if (autoCopyErrorsOnOpen) {
        // The tap sequence is a user gesture; copying here is more reliable.
        setTimeout(() => copyRecentErrors(), 50);
      }
    }
  };

  const getDiagnosticPayload = () => {
    const appBooks = JSON.parse(localStorage.getItem('app_books') || '[]');
    const appJournals = JSON.parse(localStorage.getItem('app_journals') || '[]');
    const appMemos = JSON.parse(localStorage.getItem('app_memos') || '[]');
    const appLogs = JSON.parse(localStorage.getItem('app_debugLogs') || '[]');
    return {
      generatedAt: Date.now(),
      platform: Capacitor.getPlatform(),
      userAgent: navigator.userAgent,
      build: {
        appVersion: (import.meta as any)?.env?.VITE_APP_VERSION || null,
        buildId: BUILD_ID,
      },
      appSummary: {
        books: Array.isArray(appBooks) ? appBooks.length : 0,
        journals: Array.isArray(appJournals) ? appJournals.length : 0,
        memos: Array.isArray(appMemos) ? appMemos.length : 0,
      },
      readingSettings: {
        fontSize: localStorage.getItem('reading_fontSize'),
        lineHeight: localStorage.getItem('reading_lineHeight'),
        paragraphSpacing: localStorage.getItem('reading_paragraphSpacing'),
        theme: localStorage.getItem('reading_theme'),
      },
      logs: Array.isArray(appLogs) ? appLogs.slice(-200) : [],
    };
  };

  const exportDiagnosticReport = async () => {
    try {
      const payload = getDiagnosticPayload();
      const body = JSON.stringify(payload, null, 2);
      const date = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `readmate-diagnostics-${date}.json`;

      if (Capacitor.isNativePlatform()) {
        const file = await Filesystem.writeFile({
          path: `ReadMate/${fileName}`,
          data: body,
          encoding: Encoding.UTF8,
          directory: Directory.Documents,
          recursive: true,
        });
        try {
          await Share.share({
            title: 'ReadMate 诊断报告',
            text: '用于排查问题的诊断报告',
            url: file.uri,
            dialogTitle: '导出诊断报告',
          });
        } catch {
          // ignore share cancel
        }
      } else {
        const blob = new Blob([body], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      alert('诊断报告已导出。');
    } catch (error) {
      console.error('Export diagnostics failed:', error);
      alert('导出失败，请稍后重试。');
    }
  };

  const clearDebugLogs = () => {
    localStorage.removeItem('app_debugLogs');
    setDevLogs([]);
    alert('调试日志已清空。');
  };

  const runChapterTest = async () => {
    try {
      const mod = await import('../utils/chapter');
      const ok = mod.isChapterTitleLine(chapterTestLine);
      setChapterTestResult(ok);
    } catch {
      setChapterTestResult(null);
    }
  };

  const resetReadingPrefs = () => {
    ['reading_fontSize', 'reading_lineHeight', 'reading_paragraphSpacing', 'reading_aiFrequency', 'reading_theme'].forEach((k) => {
      localStorage.removeItem(k);
    });
    alert('阅读设置已重置，重新进入阅读页后生效。');
  };

  const copyQuickSummary = async () => {
    const payload = getDiagnosticPayload();
    const summary = [
      `平台: ${payload.platform}`,
      `时间: ${new Date(payload.generatedAt).toLocaleString()}`,
      `书籍: ${payload.appSummary.books}`,
      `手账: ${payload.appSummary.journals}`,
      `便签: ${payload.appSummary.memos}`,
      `日志条数: ${payload.logs.length}`,
    ].join('\n');
    const ok = await copyText(summary);
    alert(ok ? '诊断摘要已复制。' : summary);
  };

  const copyRecentErrors = async () => {
    const logs = [...devLogs].filter((log) => log.level === 'error' || log.level === 'warn');
    const recent = logs.slice(-30).reverse();
    if (recent.length === 0) {
      alert('最近没有 error/warn 日志。');
      return;
    }
    const text = recent.map((log) => {
      const ts = new Date(log.time).toLocaleString();
      return `[${ts}] [${log.level}] ${log.message}`;
    }).join('\n');
    const ok = await copyText(text);
    alert(ok ? `已复制最近 ${recent.length} 条错误/警告日志。` : text);
  };

  const startEditJournal = (entry: JournalEntry) => {
    setEditingJournalId(entry.id);
    setEditJournalText(entry.aiResponse);
  };

  const saveEditJournal = (entry: JournalEntry) => {
    patchJournal(entry, { aiResponse: editJournalText });
    setEditingJournalId(null);
  };

  const autoResizeTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const patchJournal = (entry: JournalEntry, patch: Partial<JournalEntry>) => {
    onUpdateJournal({
      ...entry,
      ...patch,
    });
  };

  const startEditUserNote = (entry: JournalEntry) => {
    userNoteEditor.start(entry.id, entry.userNote || '');
  };

  const saveEditUserNote = (entry: JournalEntry) => {
    patchJournal(entry, { userNote: userNoteEditor.text });
    userNoteEditor.cancel();
  };

  const deleteUserNote = (entry: JournalEntry) => {
    patchJournal(entry, { userNote: '' });
  };

  const startEditMessage = (entry: JournalEntry, index: number) => {
    const msg = entry.chatHistory?.[index];
    if (!msg) return;
    messageEditor.start(`${entry.id}:${index}`, msg.text);
  };

  const saveEditMessage = (entry: JournalEntry, index: number) => {
    const history = [...(entry.chatHistory || [])];
    if (!history[index]) return;
    history[index] = { ...history[index], text: messageEditor.text };
    patchJournal(entry, { chatHistory: history });
    messageEditor.cancel();
  };

  const deleteMessage = (entry: JournalEntry, index: number) => {
    const history = [...(entry.chatHistory || [])];
    history.splice(index, 1);
    patchJournal(entry, { chatHistory: history });
  };

  const confirmDeleteJournal = () => {
    if (journalToDelete) {
      onDeleteJournal(journalToDelete);
      setJournalToDelete(null);
    }
  };

  const resolveEntryType = (entry: JournalEntry): 'manual' | 'chat' | 'proactive' =>
    entry.entryType ||
    (entry.userNote ? 'manual' : (entry.chatHistory && entry.chatHistory.length > 0 ? 'chat' : 'proactive'));

  const getSeasonFromDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const month = date.getMonth();
    const year = date.getFullYear();
    if (month >= 2 && month <= 4) return { key: `${year}-spring`, label: `${year}年 · 春天`, icon: '🌸' };
    if (month >= 5 && month <= 7) return { key: `${year}-summer`, label: `${year}年 · 夏天`, icon: '🌿' };
    if (month >= 8 && month <= 10) return { key: `${year}-autumn`, label: `${year}年 · 秋天`, icon: '🍂' };
    return { key: `${year}-winter`, label: `${year}年 · 冬天`, icon: '❄️' };
  };

  const generateGiftCover = (title: string) => {
    const safeTitle = (title || '夜读').replace(/[<>&"]/g, '');
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f9efe3" />
      <stop offset="55%" stop-color="#efe0ce" />
      <stop offset="100%" stop-color="#d9bea0" />
    </linearGradient>
  </defs>
  <rect width="300" height="400" rx="16" fill="url(#bg)"/>
  <rect x="18" y="18" width="264" height="364" rx="12" fill="none" stroke="#8E2A2A" stroke-opacity="0.28"/>
  <text x="36" y="86" fill="#8E2A2A" font-size="14" font-family="serif">TA 的礼物</text>
  <text x="36" y="170" fill="#2c2826" font-size="28" font-family="serif" font-weight="700">${safeTitle}</text>
  <text x="36" y="212" fill="#6b5a4a" font-size="16" font-family="serif">给你的睡前故事</text>
  <circle cx="246" cy="336" r="24" fill="#8E2A2A" fill-opacity="0.12"/>
  <path d="M246 328c-4-8-18-4-14 6 2 4 6 7 14 14 8-7 12-10 14-14 4-10-10-14-14-6z" fill="#8E2A2A"/>
</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const handleGiftBook = async () => {
    setIsGifting(true);
    try {
      const prompt = `请你作为我的恋人，为我写一篇专属的短篇睡前故事（约800字）。
要求：
1. 故事要温馨、治愈，带有一点点浪漫色彩。
2. 请在第一行写上书名，格式为：书名：《xxx》
3. 第二行写上作者，格式为：作者：TA
4. 第三行写上一句给我的留言，格式为：留言：xxx
5. 之后是正文内容。`;
      
      const envelope = buildPromptEnvelope({
        taskType: 'creative',
        prompt,
        memory: {
          channel: 'gift-book',
        },
      });
      const response = await sendMessage(
        { messages: envelope.messages },
        { timeoutMs: 120000, bypassChat: true, taskType: 'creative' }
      );
      
      let title = '专属睡前故事';
      let author = 'TA 的心意';
      let taNote = '亲爱的，这是我为你写的故事，希望你能喜欢。';
      let content = response;

      const titleMatch = response.match(/书名：[《]?([^》\n]+)[》]?/);
      if (titleMatch) title = titleMatch[1].trim();

      const authorMatch = response.match(/作者：([^\n]+)/);
      if (authorMatch) author = authorMatch[1].trim();

      const noteMatch = response.match(/留言：([^\n]+)/);
      if (noteMatch) taNote = noteMatch[1].trim();

      // Clean up the content by removing the metadata lines
      content = content.replace(/书名：[^\n]+\n/, '')
                       .replace(/作者：[^\n]+\n/, '')
                       .replace(/留言：[^\n]+\n/, '')
                       .trim();

      const newBook: Book = {
        id: `ta-${Date.now()}`,
        title,
        author,
        cover: generateGiftCover(title),
        progress: 0,
        addedAt: Date.now(),
        isTaRecommendation: true,
        taNote,
        content
      };
      
      onAddTaBook(newBook);
      rememberMilestone(`生成礼物书：《${title}》`, title);
      alert(`TA 为你写了一本《${title}》，快去书架看看吧！`);
    } catch (error) {
      console.error("Failed to generate gift book:", error);
      alert("TA 现在有点累，晚点再为你准备礼物吧。");
    } finally {
      setIsGifting(false);
    }
  };
  
  // API Config State
  const [apiConfig, setApiConfig] = useState(() => {
    const saved = localStorage.getItem('app_apiConfig');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        geminiKey: parsed.apiKey || process.env.GEMINI_API_KEY || '',
        baseUrl: parsed.baseUrl || 'https://generativelanguage.googleapis.com',
        model: parsed.model || 'gemini-1.5-flash',
        auxiliaryModel: parsed.auxiliaryModel || '',
        enableAuxiliaryRouting: parsed.enableAuxiliaryRouting || false,
        taskRouting: {
          ...defaultTaskRouting,
          ...(parsed.taskRouting || {}),
        },
        ttsProvider: parsed.ttsProvider || 'none',
        ttsKey: parsed.ttsKey || '',
        ttsVoiceId: parsed.ttsVoiceId || 'alloy'
      };
    }
    return {
      geminiKey: process.env.GEMINI_API_KEY || '',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-1.5-flash',
      auxiliaryModel: '',
      enableAuxiliaryRouting: false,
      taskRouting: defaultTaskRouting,
      ttsProvider: 'none',
      ttsKey: '',
      ttsVoiceId: 'alloy'
    };
  });

  const [apiPresets, setApiPresets] = useState<any[]>(() => {
    const saved = localStorage.getItem('app_apiPresets');
    return saved ? JSON.parse(saved) : [
      { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-1.5-flash' },
      { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      { name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V2.5' }
    ];
  });

  useEffect(() => {
    localStorage.setItem('app_apiPresets', JSON.stringify(apiPresets));
  }, [apiPresets]);

  const reloadMemoryPanel = () => {
    const snapshot = getMemorySnapshot();
    setMemoryFacts(snapshot.facts);
    setMemoryEvents(snapshot.events);
    setMemoryMistakes(snapshot.mistakes || []);
    setMemoryStats(getMemoryStats());
  };

  useEffect(() => {
    if (view === 'memory') {
      reloadMemoryPanel();
    }
  }, [view]);

  const costEstimate = useMemo(() => {
    const dau = Math.max(0, Number(costEstimator.dau) || 0);
    const readingHours = Math.max(0, Number(costEstimator.avgReadingMinutesPerUser) || 0) / 60;
    const proactivePerUser = Math.min(48, Math.max(0, 36 * readingHours));
    const dailyPoemPerUser = 1;
    const chatPerUser = Math.max(0, Number(costEstimator.avgChatRoundsPerUser) || 0);
    const manualPerUser = Math.max(0, Number(costEstimator.avgManualNotesPerUser) || 0);
    const sharePerUser = Math.max(0, Number(costEstimator.avgShareQuotesPerUser) || 0);
    const inlinePerUser = Math.max(0, Number(costEstimator.avgInlineRepliesPerUser) || 0);
    const memoPerUser = (Math.max(0, Number(costEstimator.avgMemosPerUser) || 0)) * memoAiFrequency;
    const dictionaryPerUser = Math.max(0, Number(costEstimator.avgDictionaryActionsPerUser) || 0);
    const giftPerUser = Math.max(0, Number(costEstimator.giftBookRate) || 0);
    const echoPerUser = Math.max(0, Number(costEstimator.echoRate) || 0);

    const callsByTask: Record<TaskType, number> = {
      chat: dau * (chatPerUser + manualPerUser + sharePerUser + inlinePerUser),
      proactive: dau * proactivePerUser,
      utility: dau * (memoPerUser + dictionaryPerUser),
      creative: dau * (dailyPoemPerUser + giftPerUser),
      summary: dau * echoPerUser,
      critical: 0,
      memory: 0,
    };

    const primaryTasks = Object.entries(callsByTask)
      .filter(([task]) => (apiConfig.taskRouting?.[task as TaskType] || defaultTaskRouting[task as TaskType]) === 'primary')
      .reduce((sum, [, count]) => sum + count, 0);
    const auxiliaryTasks = Object.entries(callsByTask)
      .filter(([task]) => (apiConfig.taskRouting?.[task as TaskType] || defaultTaskRouting[task as TaskType]) === 'auxiliary')
      .reduce((sum, [, count]) => sum + count, 0);

    const taskToken = (task: TaskType) =>
      Math.max(1, Number(costEstimator.avgInputTokens?.[task] || 0)) +
      Math.max(1, Number(costEstimator.avgOutputTokens?.[task] || 0));

    const totalTokensPerDay = (Object.entries(callsByTask) as Array<[TaskType, number]>)
      .reduce((sum, [task, count]) => sum + count * taskToken(task), 0);

    const tokenByModelPerDay = (Object.entries(callsByTask) as Array<[TaskType, number]>).reduce(
      (acc, [task, count]) => {
        const input = Math.max(1, Number(costEstimator.avgInputTokens?.[task] || 0)) * count;
        const output = Math.max(1, Number(costEstimator.avgOutputTokens?.[task] || 0)) * count;
        const route = (apiConfig.taskRouting?.[task] || defaultTaskRouting[task]);
        if (route === 'auxiliary') {
          acc.auxInput += input;
          acc.auxOutput += output;
        } else {
          acc.primaryInput += input;
          acc.primaryOutput += output;
        }
        return acc;
      },
      { primaryInput: 0, primaryOutput: 0, auxInput: 0, auxOutput: 0 }
    );

    const price = costEstimator.unitPrice;
    const costPerDay =
      (tokenByModelPerDay.primaryInput / 1_000_000) * Math.max(0, Number(price.primaryInputPer1M) || 0) +
      (tokenByModelPerDay.primaryOutput / 1_000_000) * Math.max(0, Number(price.primaryOutputPer1M) || 0) +
      (tokenByModelPerDay.auxInput / 1_000_000) * Math.max(0, Number(price.auxiliaryInputPer1M) || 0) +
      (tokenByModelPerDay.auxOutput / 1_000_000) * Math.max(0, Number(price.auxiliaryOutputPer1M) || 0);

    return {
      callsByTask,
      totalCallsPerDay: Object.values(callsByTask).reduce((sum, n) => sum + n, 0),
      totalCallsPerMonth: Object.values(callsByTask).reduce((sum, n) => sum + n, 0) * 30,
      totalTokensPerDay,
      tokenLowPerDay: totalTokensPerDay * 0.75,
      tokenHighPerDay: totalTokensPerDay * 1.35,
      tokenLowPerMonth: totalTokensPerDay * 0.75 * 30,
      tokenHighPerMonth: totalTokensPerDay * 1.35 * 30,
      primaryTasks,
      auxiliaryTasks,
      tokenByModelPerDay,
      costLowPerDay: costPerDay * 0.75,
      costHighPerDay: costPerDay * 1.35,
      costLowPerMonth: costPerDay * 0.75 * 30,
      costHighPerMonth: costPerDay * 1.35 * 30,
    };
  }, [apiConfig.taskRouting, costEstimator, memoAiFrequency]);

  const applyPricingTemplate = (templateId: string) => {
    setPricingTemplateId(templateId);
    const template = pricingTemplates.find((tpl) => tpl.id === templateId);
    if (!template || template.id === 'custom') return;
    setCostEstimator({
      ...costEstimator,
      unitPrice: {
        currency: template.currency,
        primaryInputPer1M: template.primaryInputPer1M,
        primaryOutputPer1M: template.primaryOutputPer1M,
        auxiliaryInputPer1M: template.auxiliaryInputPer1M,
        auxiliaryOutputPer1M: template.auxiliaryOutputPer1M,
      },
    });
  };

  const handleSavePreset = () => {
    const name = prompt("请输入预设名称：");
    if (name) {
      setApiPresets([...apiPresets, {
        name,
        baseUrl: apiConfig.baseUrl,
        model: apiConfig.model,
        apiKey: apiConfig.geminiKey,
        auxiliaryModel: apiConfig.auxiliaryModel,
        enableAuxiliaryRouting: apiConfig.enableAuxiliaryRouting,
        taskRouting: apiConfig.taskRouting,
      }]);
    }
  };

  const handleLoadPreset = (preset: any) => {
    setApiConfig({
      ...apiConfig,
      baseUrl: preset.baseUrl,
      model: preset.model,
      geminiKey: preset.apiKey || apiConfig.geminiKey,
      auxiliaryModel: preset.auxiliaryModel || apiConfig.auxiliaryModel,
      enableAuxiliaryRouting: typeof preset.enableAuxiliaryRouting === 'boolean'
        ? preset.enableAuxiliaryRouting
        : apiConfig.enableAuxiliaryRouting,
      taskRouting: {
        ...defaultTaskRouting,
        ...(preset.taskRouting || {}),
      },
    });
  };

  const handleSavePersona = () => {
    setPersona(tempPersona);
    setView('main');
  };

  const handleSaveApi = () => {
    updateApiConfig({
      apiKey: apiConfig.geminiKey,
      baseUrl: apiConfig.baseUrl,
      model: apiConfig.model,
      auxiliaryModel: apiConfig.auxiliaryModel,
      enableAuxiliaryRouting: apiConfig.enableAuxiliaryRouting,
      taskRouting: apiConfig.taskRouting,
    });
    // Also save TTS config to localStorage
    localStorage.setItem('app_apiConfig', JSON.stringify({
      apiKey: apiConfig.geminiKey,
      baseUrl: apiConfig.baseUrl,
      model: apiConfig.model,
      auxiliaryModel: apiConfig.auxiliaryModel,
      enableAuxiliaryRouting: apiConfig.enableAuxiliaryRouting,
      taskRouting: apiConfig.taskRouting,
      ttsProvider: apiConfig.ttsProvider,
      ttsKey: apiConfig.ttsKey,
      ttsVoiceId: apiConfig.ttsVoiceId
    }));
    setView('main');
  };

  const handleTestApi = async () => {
    setTestStatus('testing');
    setTestMessage('');
    try {
      // Temporarily update config for test
      updateApiConfig({
        apiKey: apiConfig.geminiKey,
        baseUrl: apiConfig.baseUrl,
        model: apiConfig.model,
        auxiliaryModel: apiConfig.auxiliaryModel,
        enableAuxiliaryRouting: apiConfig.enableAuxiliaryRouting,
        taskRouting: apiConfig.taskRouting,
      });
      const res = await sendMessage('你好，这是一条测试消息。请回复“连接成功”。', { taskType: 'utility' });
      setTestStatus('success');
      setTestMessage(res);
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err.message || '连接失败，请检查配置。');
    }
  };

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setTestMessage('');
    try {
      updateApiConfig({
        apiKey: apiConfig.geminiKey,
        baseUrl: apiConfig.baseUrl,
        auxiliaryModel: apiConfig.auxiliaryModel,
        enableAuxiliaryRouting: apiConfig.enableAuxiliaryRouting,
        taskRouting: apiConfig.taskRouting,
      });
      const models = await fetchModels();
      setAvailableModels(models);
      if (models.length > 0 && !models.includes(apiConfig.model)) {
        setApiConfig({ ...apiConfig, model: models[0] });
      }
      setTestStatus('success');
      setTestMessage(`成功获取 ${models.length} 个模型`);
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err.message || '获取模型失败，请检查 URL 和 Key');
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSaveProfile = () => {
    setCompanionName(tempName);
    setCompanionAvatar(tempAvatar);
    localStorage.setItem('app_companionName', tempName);
    localStorage.setItem('app_companionAvatar', tempAvatar);
    setView('main');
  };

  const handleExportBackup = () => {
    try {
      const payload = onCreateBackup();
      const backupString = JSON.stringify(payload, null, 2);
      const date = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `readmate-backup-${date}.json`;

      if (Capacitor.isNativePlatform()) {
        Filesystem.writeFile({
          path: `ReadMate/${fileName}`,
          data: backupString,
          encoding: Encoding.UTF8,
          directory: Directory.Documents,
          recursive: true,
        }).then(async (file) => {
          try {
            await Share.share({
              title: 'ReadMate 备份文件',
              text: '请保存这个备份文件，便于恢复数据。',
              url: file.uri,
              dialogTitle: '导出备份文件',
            });
            alert('备份文件已生成，请在弹出的系统分享面板中保存。');
          } catch {
            alert('备份文件已保存到手机文档目录：Documents/ReadMate');
          }
        }).catch((err) => {
          console.error('Native backup write failed:', err);
          alert('备份失败：无法写入手机文件。');
        });
        return;
      }

      const blob = new Blob([backupString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert('备份文件已下载，请妥善保存。');
    } catch (error) {
      console.error('Backup export failed:', error);
      alert('备份失败，请稍后重试。');
    }
  };

  const handleImportBackup = async (file: File | null) => {
    if (!file) return;
    setIsRestoringBackup(true);
    try {
      const text = await file.text();
      const cleanText = text.replace(/^\uFEFF/, '').trim();
      const parsed = JSON.parse(cleanText);
      onRestoreBackup(parsed);
      alert('恢复成功，建议重新进入对应页面查看最新数据。');
    } catch (error) {
      console.error('Backup restore failed:', error);
      alert('恢复失败：文件格式不正确或已损坏。');
    } finally {
      setIsRestoringBackup(false);
    }
  };

  return (
    <div className="h-full w-full bg-paper flex flex-col overflow-hidden relative">
      <AnimatePresence mode="wait">
        {view === 'main' && (
          <motion.div 
            key="main"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="h-full flex flex-col overflow-y-auto"
          >
            {/* Header Profile */}
            <div className="pt-16 pb-8 px-6 flex flex-col items-center bg-gradient-to-b from-[#f4ecd8]/50 to-transparent">
              <div className="relative">
                {companionAvatar ? (
                  <img src={companionAvatar} alt="Avatar" className="w-24 h-24 rounded-full object-cover shadow-inner border-4 border-white" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-[#8E2A2A]/10 flex items-center justify-center text-[#8E2A2A] shadow-inner border-4 border-white">
                    <Heart size={40} fill="currentColor" />
                  </div>
                )}
                <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-400 border-2 border-white rounded-full"></div>
              </div>
              <h2 className="mt-4 text-xl font-serif font-bold text-[#2c2826]">{companionName}</h2>
              <p className="text-sm text-gray-500 mt-1 font-serif" onClick={handleSecretTap}>专属陪伴 · 懂你所想</p>
            </div>

            {/* Stats / Milestones */}
            <div className="px-6 mb-8">
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-[#e5e0d8] flex justify-between items-center">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-[#8E2A2A]/5 flex items-center justify-center text-[#8E2A2A]">
                    <Calendar size={18} />
                  </div>
                  <span className="text-xs text-gray-400 font-serif">相伴天数</span>
                  <span className="text-lg font-serif font-semibold text-[#2c2826]">{daysTogether}</span>
                </div>
                <div className="w-px h-12 bg-[#e5e0d8]"></div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-[#8E2A2A]/5 flex items-center justify-center text-[#8E2A2A]">
                    <Clock size={18} />
                  </div>
                  <span className="text-xs text-gray-400 font-serif">共读时长</span>
                  <span className="text-lg font-serif font-semibold text-[#2c2826]">{readingHours > 0 ? `${readingHours}h ` : ''}{readingMinutes}m</span>
                </div>
                <div className="w-px h-12 bg-[#e5e0d8]"></div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-[#8E2A2A]/5 flex items-center justify-center text-[#8E2A2A]">
                    <BookOpen size={18} />
                  </div>
                  <span className="text-xs text-gray-400 font-serif">读完书籍</span>
                  <span className="text-lg font-serif font-semibold text-[#2c2826]">{finishedBooks}</span>
                </div>
              </div>
            </div>

            {/* Menu Options */}
            <div className="px-6 flex flex-col gap-3 pb-8">
              <h3 className="text-sm font-serif font-medium text-gray-400 mb-2 px-2">互动与设置</h3>
              
              <button 
                onClick={handleGiftBook}
                disabled={isGifting}
                className="flex items-center justify-between p-4 bg-gradient-to-r from-[#8E2A2A] to-[#6b1f1f] rounded-2xl shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                    <Gift size={16} />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-serif font-bold text-white">TA 的礼物</span>
                    <span className="text-[10px] text-white/70 font-serif">让 TA 为你挑选一本书</span>
                  </div>
                </div>
                {isGifting ? (
                  <Loader2 size={18} className="text-white animate-spin" />
                ) : (
                  <ChevronRight size={18} className="text-white/50" />
                )}
              </button>

              <button 
                onClick={() => setView('profile')}
                className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-[#e5e0d8] active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#8E2A2A]/5 flex items-center justify-center text-[#8E2A2A]">
                    <Heart size={16} />
                  </div>
                  <span className="text-sm font-serif font-medium text-[#2c2826]">修改恋人资料</span>
                </div>
                <ChevronRight size={18} className="text-gray-300" />
              </button>

              <button 
                onClick={() => setView('journal')}
                className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#e5e0d8] shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#f4ecd8] flex items-center justify-center text-[#8E2A2A]">
                    <Quote size={16} />
                  </div>
                  <span className="text-sm font-serif font-medium text-[#2c2826]">情绪手账</span>
                </div>
                <div className="flex items-center gap-2">
                  {journalEntries.length > 0 && (
                    <span className="text-xs bg-[#f4ecd8] text-[#8E2A2A] px-2 py-0.5 rounded-full">{journalEntries.length} 条</span>
                  )}
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </button>

              <button 
                onClick={() => setView('persona')}
                className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#e5e0d8] shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#f4ecd8] flex items-center justify-center text-[#8E2A2A]">
                    <Heart size={16} />
                  </div>
                  <span className="text-sm font-serif font-medium text-[#2c2826]">人设自定义</span>
                </div>
                <ChevronRight size={18} className="text-gray-300" />
              </button>

              <button 
                onClick={() => setView('memos')}
                className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#e5e0d8] shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#f4ecd8] flex items-center justify-center text-[#8E2A2A]">
                    <BookOpen size={16} />
                  </div>
                  <span className="text-sm font-serif font-medium text-[#2c2826]">便签记录</span>
                </div>
                <div className="flex items-center gap-2">
                  {memos && memos.length > 0 && (
                    <span className="text-xs bg-[#f4ecd8] text-[#8E2A2A] px-2 py-0.5 rounded-full">
                      {memos.length} 条
                    </span>
                  )}
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </button>
              <button 
                onClick={() => setView('poem-slips')}
                className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#e5e0d8] shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#f4ecd8] flex items-center justify-center text-[#8E2A2A]">
                    <Sparkles size={16} />
                  </div>
                  <span className="text-sm font-serif font-medium text-[#2c2826]">诗签本</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-[#f4ecd8] text-[#8E2A2A] px-2 py-0.5 rounded-full">{poemSlips.length} 条</span>
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </button>
              <button 
                onClick={() => setView('time-capsule')}
                className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#e5e0d8] shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#f4ecd8] flex items-center justify-center text-[#8E2A2A]">
                    <Archive size={16} />
                  </div>
                  <span className="text-sm font-serif font-medium text-[#2c2826]">时光册</span>
                </div>
                <ChevronRight size={18} className="text-gray-300" />
              </button>
              <button 
                onClick={() => setView('dictionary')}
                className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#e5e0d8] shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#f4ecd8] flex items-center justify-center text-[#8E2A2A]">
                    <BookText size={16} />
                  </div>
                  <span className="text-sm font-serif font-medium text-[#2c2826]">我们的词典</span>
                </div>
                <ChevronRight size={18} className="text-gray-300" />
              </button>
              <button
                onClick={() => setView('memory')}
                className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#e5e0d8] shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#f4ecd8] flex items-center justify-center text-[#8E2A2A]">
                    <Brain size={16} />
                  </div>
                  <span className="text-sm font-serif font-medium text-[#2c2826]">记忆管理</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-[#f4ecd8] text-[#8E2A2A] px-2 py-0.5 rounded-full">{memoryStats.facts + memoryStats.events}</span>
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </button>

              <button 
                onClick={() => setView('api-settings')}
                className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#e5e0d8] shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#f4ecd8] flex items-center justify-center text-[#8E2A2A]">
                    <Settings size={16} />
                  </div>
                  <span className="text-sm font-serif font-medium text-[#2c2826]">高级 API 设置</span>
                </div>
                <ChevronRight size={18} className="text-gray-300" />
              </button>

              <div className="p-4 bg-white rounded-2xl border border-[#e5e0d8] shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-serif font-medium text-[#2c2826]">数据备份</span>
                  <span className="text-[10px] text-gray-400 font-serif">本地 JSON</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleExportBackup}
                    className="py-2.5 rounded-xl bg-[#8E2A2A] text-white text-xs font-serif font-bold hover:bg-[#6b1f1f] transition-colors"
                  >
                    一键备份
                  </button>
                  <label className={`py-2.5 rounded-xl text-center text-xs font-serif font-bold border transition-colors cursor-pointer ${isRestoringBackup ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-[#f4ecd8] text-[#8E2A2A] border-[#eaddc5] hover:bg-[#eaddc5]'}`}>
                    恢复备份
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      disabled={isRestoringBackup}
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        handleImportBackup(file);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {view === 'api-settings' && (
          <motion.div 
            key="api-settings"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute inset-0 bg-paper flex flex-col z-10"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#e5e0d8]">
              <button onClick={() => setView('main')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                <ChevronLeft size={24} />
              </button>
              <span className="text-sm font-serif font-medium text-gray-800">高级 API 设置</span>
              <button onClick={handleSaveApi} className="p-2 text-[#8E2A2A] hover:bg-[#f4ecd8] rounded-full">
                <Save size={20} />
              </button>
            </div>
            <div className="flex-1 p-6 overflow-y-auto space-y-8">
              {/* API Presets */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-serif font-bold text-[#8E2A2A] uppercase tracking-widest">API 预设</h3>
                  <button onClick={handleSavePreset} className="text-xs text-[#8E2A2A] bg-[#f4ecd8] px-2 py-1 rounded-md font-serif">保存当前为预设</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {apiPresets.map((preset, idx) => (
                    <div key={idx} className="flex items-center bg-white border border-[#e5e0d8] rounded-lg overflow-hidden">
                      <button
                        onClick={() => handleLoadPreset(preset)}
                        className="px-3 py-1.5 text-xs font-serif hover:bg-[#f4ecd8] hover:text-[#8E2A2A] transition-colors"
                      >
                        {preset.name}
                      </button>
                      <button
                        onClick={() => {
                          const newName = prompt("修改预设名称：", preset.name);
                          if (newName) {
                            setApiPresets(apiPresets.map((p, i) => i === idx ? { ...p, name: newName } : p));
                          }
                        }}
                        className="px-2 py-1.5 text-gray-400 hover:text-[#8E2A2A] hover:bg-[#f4ecd8] transition-colors border-l border-[#e5e0d8]"
                      >
                        <PenTool size={12} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`确定要删除预设 "${preset.name}" 吗？`)) {
                            setApiPresets(apiPresets.filter((_, i) => i !== idx));
                          }
                        }}
                        className="px-2 py-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors border-l border-[#e5e0d8]"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* LLM Config */}
              <section>
                <h3 className="text-xs font-serif font-bold text-[#8E2A2A] uppercase tracking-widest mb-4">模型配置 (LLM)</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-serif text-gray-400 mb-1">API Base URL (支持第三方)</label>
                    <input
                      type="text"
                      value={apiConfig.baseUrl}
                      onChange={(e) => setApiConfig({...apiConfig, baseUrl: e.target.value})}
                      className="w-full p-3 rounded-xl border border-[#e5e0d8] bg-white focus:outline-none focus:ring-2 focus:ring-[#8E2A2A] text-sm font-serif"
                      placeholder="https://api.openai.com/v1"
                    />
                    <p className="text-[10px] text-gray-400 mt-1 font-serif">支持 OpenAI 兼容接口。注意：通常需要包含 /v1 (例如 https://api.deepseek.com/v1)。系统会自动处理 /chat/completions。</p>
                  </div>
                  <div>
                    <label className="block text-xs font-serif text-gray-400 mb-1">API Key</label>
                    <input
                      type="password"
                      value={apiConfig.geminiKey}
                      onChange={(e) => setApiConfig({...apiConfig, geminiKey: e.target.value})}
                      className="w-full p-3 rounded-xl border border-[#e5e0d8] bg-white focus:outline-none focus:ring-2 focus:ring-[#8E2A2A] text-sm font-serif"
                      placeholder="输入你的 API Key..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-serif text-gray-400 mb-1">模型名称 (Model)</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={apiConfig.model}
                          onChange={(e) => setApiConfig({...apiConfig, model: e.target.value})}
                          className="w-full p-3 rounded-xl border border-[#e5e0d8] bg-white focus:outline-none focus:ring-2 focus:ring-[#8E2A2A] text-sm font-serif pr-10"
                          placeholder="例如: gemini-1.5-flash, deepseek-chat..."
                        />
                        {availableModels.length > 0 && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            <select 
                              className="w-6 h-6 opacity-0 absolute inset-0 cursor-pointer z-10"
                              onChange={(e) => setApiConfig({...apiConfig, model: e.target.value})}
                              value={apiConfig.model}
                            >
                              <option value="" disabled>选择模型</option>
                              {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <ChevronRight size={16} className="text-gray-400 rotate-90" />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleFetchModels}
                        disabled={isFetchingModels || !apiConfig.geminiKey}
                        className="px-4 rounded-xl bg-[#f4ecd8] text-[#8E2A2A] text-xs font-serif hover:bg-[#eaddc5] disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
                        title="从 API 获取可用模型列表"
                      >
                        {isFetchingModels ? <Loader2 size={12} className="animate-spin" /> : <BookOpen size={12} />}
                        自动抓取
                      </button>
                    </div>
                    {availableModels.length > 0 && (
                      <p className="text-[10px] text-green-600 mt-1 font-serif">已获取 {availableModels.length} 个模型，点击右侧小箭头可快速选择。</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-serif text-gray-400 mb-1">辅助模型 (可选)</label>
                    <input
                      type="text"
                      value={apiConfig.auxiliaryModel}
                      onChange={(e) => setApiConfig({ ...apiConfig, auxiliaryModel: e.target.value })}
                      className="w-full p-3 rounded-xl border border-[#e5e0d8] bg-white focus:outline-none focus:ring-2 focus:ring-[#8E2A2A] text-sm font-serif"
                      placeholder="例如: gemini-1.5-flash / gpt-4o-mini"
                    />
                    <p className="text-[10px] text-gray-400 mt-1 font-serif">用于主动批注、便签评论、词典悄悄话等非关键任务。</p>
                  </div>
                  <div className="flex items-center justify-between bg-white rounded-xl border border-[#e5e0d8] px-3 py-2">
                    <div>
                      <p className="text-xs font-serif text-[#2c2826]">启用辅助模型自动路由</p>
                      <p className="text-[10px] text-gray-400 font-serif">开启后，低优先任务默认走辅助模型。</p>
                    </div>
                    <button
                      onClick={() => setApiConfig({ ...apiConfig, enableAuxiliaryRouting: !apiConfig.enableAuxiliaryRouting })}
                      className={`w-12 h-7 rounded-full transition-colors relative ${apiConfig.enableAuxiliaryRouting ? 'bg-[#8E2A2A]' : 'bg-gray-200'}`}
                      aria-label="辅助模型路由开关"
                    >
                      <span
                        className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${apiConfig.enableAuxiliaryRouting ? 'translate-x-5' : 'translate-x-0.5'}`}
                      />
                    </button>
                  </div>
                  <div className="bg-white rounded-xl border border-[#e5e0d8] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-serif text-[#2c2826]">路由策略面板</p>
                      <button
                        onClick={() => setApiConfig({ ...apiConfig, taskRouting: defaultTaskRouting })}
                        className="text-[10px] px-2 py-1 rounded-md bg-[#f4ecd8] text-[#8E2A2A] font-serif"
                      >
                        恢复默认
                      </button>
                    </div>
                    <div className="space-y-2">
                      {taskRouteLabels.map((item) => {
                        const currentRoute = (apiConfig.taskRouting?.[item.key] || defaultTaskRouting[item.key]) as RouteTarget;
                        return (
                          <div key={item.key} className="rounded-lg border border-[#f0e7da] px-2 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="text-xs font-serif text-[#2c2826]">{item.label}</div>
                                <div className="text-[10px] text-gray-400 font-serif">{item.hint}</div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setApiConfig({
                                    ...apiConfig,
                                    taskRouting: { ...defaultTaskRouting, ...(apiConfig.taskRouting || {}), [item.key]: 'primary' },
                                  })}
                                  className={`px-2 py-1 text-[10px] rounded-md border ${
                                    currentRoute === 'primary'
                                      ? 'bg-[#8E2A2A] text-white border-[#8E2A2A]'
                                      : 'bg-white text-gray-500 border-[#e5e0d8]'
                                  }`}
                                >
                                  主模型
                                </button>
                                <button
                                  onClick={() => setApiConfig({
                                    ...apiConfig,
                                    taskRouting: { ...defaultTaskRouting, ...(apiConfig.taskRouting || {}), [item.key]: 'auxiliary' },
                                  })}
                                  disabled={!apiConfig.auxiliaryModel}
                                  className={`px-2 py-1 text-[10px] rounded-md border ${
                                    currentRoute === 'auxiliary'
                                      ? 'bg-[#8E2A2A] text-white border-[#8E2A2A]'
                                      : 'bg-white text-gray-500 border-[#e5e0d8]'
                                  } disabled:opacity-40`}
                                >
                                  辅助模型
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              {/* TTS Config */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-serif font-bold text-[#8E2A2A] uppercase tracking-widest">语音配置 (TTS - 可选)</h3>
                  <span className="text-[10px] font-serif text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">OPTIONAL</span>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-serif text-gray-400 mb-1">语音服务商</label>
                    <select 
                      value={apiConfig.ttsProvider}
                      onChange={(e) => setApiConfig({...apiConfig, ttsProvider: e.target.value as any})}
                      className="w-full p-3 rounded-xl border border-[#e5e0d8] bg-white focus:outline-none focus:ring-2 focus:ring-[#8E2A2A] text-sm font-serif"
                    >
                      <option value="none">不使用语音 (关闭)</option>
                      <option value="openai">OpenAI TTS</option>
                      <option value="elevenlabs">ElevenLabs</option>
                      <option value="custom">自定义 (OpenAI 兼容)</option>
                    </select>
                  </div>
                  {apiConfig.ttsProvider !== 'none' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-4 overflow-hidden"
                    >
                      <div>
                        <label className="block text-xs font-serif text-gray-400 mb-1">TTS API Key</label>
                        <input
                          type="password"
                          value={apiConfig.ttsKey}
                          onChange={(e) => setApiConfig({...apiConfig, ttsKey: e.target.value})}
                          className="w-full p-3 rounded-xl border border-[#e5e0d8] bg-white focus:outline-none focus:ring-2 focus:ring-[#8E2A2A] text-sm font-serif"
                          placeholder="TTS 服务的 API Key..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-serif text-gray-400 mb-1">Voice ID / 模型</label>
                        <input
                          type="text"
                          value={apiConfig.ttsVoiceId}
                          onChange={(e) => setApiConfig({...apiConfig, ttsVoiceId: e.target.value})}
                          className="w-full p-3 rounded-xl border border-[#e5e0d8] bg-white focus:outline-none focus:ring-2 focus:ring-[#8E2A2A] text-sm font-serif"
                          placeholder="例如: alloy, echo, onyx..."
                        />
                      </div>
                    </motion.div>
                  )}
                </div>
              </section>

              {/* Behavior Config */}
              <section>
                <h3 className="text-xs font-serif font-bold text-[#8E2A2A] uppercase tracking-widest mb-4">行为偏好</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-serif text-gray-400 mb-1">
                      便签回复频率 ({(memoAiFrequency * 100).toFixed(0)}%)
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={memoAiFrequency}
                      onChange={(e) => setMemoAiFrequency(parseFloat(e.target.value))}
                      className="w-full accent-[#8E2A2A]"
                    />
                    <p className="text-[10px] text-gray-400 mt-1 font-serif">控制 TA 在你写便签时主动回复的概率。0% 为从不回复，100% 为每次必回。</p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-serif font-bold text-[#8E2A2A] uppercase tracking-widest mb-4">成本估算器</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white rounded-xl border border-[#e5e0d8] p-3">
                      <label className="block text-[11px] text-gray-500 mb-1 font-serif">日活用户 DAU</label>
                      <input
                        type="number"
                        min="0"
                        value={costEstimator.dau}
                        onChange={(e) => setCostEstimator({ ...costEstimator, dau: Number(e.target.value) })}
                        className="w-full p-2 rounded-lg border border-[#e5e0d8] text-sm"
                      />
                    </div>
                    <div className="bg-white rounded-xl border border-[#e5e0d8] p-3">
                      <label className="block text-[11px] text-gray-500 mb-1 font-serif">人均阅读分钟/天</label>
                      <input
                        type="number"
                        min="0"
                        value={costEstimator.avgReadingMinutesPerUser}
                        onChange={(e) => setCostEstimator({ ...costEstimator, avgReadingMinutesPerUser: Number(e.target.value) })}
                        className="w-full p-2 rounded-lg border border-[#e5e0d8] text-sm"
                      />
                    </div>
                    <div className="bg-white rounded-xl border border-[#e5e0d8] p-3">
                      <label className="block text-[11px] text-gray-500 mb-1 font-serif">人均聊天轮次</label>
                      <input
                        type="number"
                        min="0"
                        value={costEstimator.avgChatRoundsPerUser}
                        onChange={(e) => setCostEstimator({ ...costEstimator, avgChatRoundsPerUser: Number(e.target.value) })}
                        className="w-full p-2 rounded-lg border border-[#e5e0d8] text-sm"
                      />
                    </div>
                    <div className="bg-white rounded-xl border border-[#e5e0d8] p-3">
                      <label className="block text-[11px] text-gray-500 mb-1 font-serif">人均手动批注</label>
                      <input
                        type="number"
                        min="0"
                        value={costEstimator.avgManualNotesPerUser}
                        onChange={(e) => setCostEstimator({ ...costEstimator, avgManualNotesPerUser: Number(e.target.value) })}
                        className="w-full p-2 rounded-lg border border-[#e5e0d8] text-sm"
                      />
                    </div>
                    <div className="bg-white rounded-xl border border-[#e5e0d8] p-3">
                      <label className="block text-[11px] text-gray-500 mb-1 font-serif">人均划线分享</label>
                      <input
                        type="number"
                        min="0"
                        value={costEstimator.avgShareQuotesPerUser}
                        onChange={(e) => setCostEstimator({ ...costEstimator, avgShareQuotesPerUser: Number(e.target.value) })}
                        className="w-full p-2 rounded-lg border border-[#e5e0d8] text-sm"
                      />
                    </div>
                    <div className="bg-white rounded-xl border border-[#e5e0d8] p-3">
                      <label className="block text-[11px] text-gray-500 mb-1 font-serif">人均便签条数</label>
                      <input
                        type="number"
                        min="0"
                        value={costEstimator.avgMemosPerUser}
                        onChange={(e) => setCostEstimator({ ...costEstimator, avgMemosPerUser: Number(e.target.value) })}
                        className="w-full p-2 rounded-lg border border-[#e5e0d8] text-sm"
                      />
                    </div>
                    <div className="bg-white rounded-xl border border-[#e5e0d8] p-3">
                      <label className="block text-[11px] text-gray-500 mb-1 font-serif">人均词典动作</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={costEstimator.avgDictionaryActionsPerUser}
                        onChange={(e) => setCostEstimator({ ...costEstimator, avgDictionaryActionsPerUser: Number(e.target.value) })}
                        className="w-full p-2 rounded-lg border border-[#e5e0d8] text-sm"
                      />
                    </div>
                    <div className="bg-white rounded-xl border border-[#e5e0d8] p-3">
                      <label className="block text-[11px] text-gray-500 mb-1 font-serif">人均内联回复</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={costEstimator.avgInlineRepliesPerUser}
                        onChange={(e) => setCostEstimator({ ...costEstimator, avgInlineRepliesPerUser: Number(e.target.value) })}
                        className="w-full p-2 rounded-lg border border-[#e5e0d8] text-sm"
                      />
                    </div>
                    <div className="bg-white rounded-xl border border-[#e5e0d8] p-3">
                      <label className="block text-[11px] text-gray-500 mb-1 font-serif">礼物触发率(0~1)</label>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={costEstimator.giftBookRate}
                        onChange={(e) => setCostEstimator({ ...costEstimator, giftBookRate: Number(e.target.value) })}
                        className="w-full p-2 rounded-lg border border-[#e5e0d8] text-sm"
                      />
                    </div>
                    <div className="bg-white rounded-xl border border-[#e5e0d8] p-3">
                      <label className="block text-[11px] text-gray-500 mb-1 font-serif">回声触发率(0~1)</label>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={costEstimator.echoRate}
                        onChange={(e) => setCostEstimator({ ...costEstimator, echoRate: Number(e.target.value) })}
                        className="w-full p-2 rounded-lg border border-[#e5e0d8] text-sm"
                      />
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-[#e5e0d8] p-3">
                    <div className="text-xs font-serif text-[#2c2826] mb-2">任务平均 Token 假设（输入+输出）</div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['chat', 'proactive', 'utility', 'creative', 'summary'] as TaskType[]).map((task) => (
                        <div key={task} className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-500 w-16">{task}</span>
                          <input
                            type="number"
                            min="1"
                            value={costEstimator.avgInputTokens[task]}
                            onChange={(e) => setCostEstimator({
                              ...costEstimator,
                              avgInputTokens: { ...costEstimator.avgInputTokens, [task]: Number(e.target.value) },
                            })}
                            className="w-16 p-1.5 rounded border border-[#e5e0d8] text-xs"
                            title="输入token"
                          />
                          <span className="text-[10px] text-gray-400">+</span>
                          <input
                            type="number"
                            min="1"
                            value={costEstimator.avgOutputTokens[task]}
                            onChange={(e) => setCostEstimator({
                              ...costEstimator,
                              avgOutputTokens: { ...costEstimator.avgOutputTokens, [task]: Number(e.target.value) },
                            })}
                            className="w-16 p-1.5 rounded border border-[#e5e0d8] text-xs"
                            title="输出token"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-[#e5e0d8] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-serif text-[#2c2826]">单价设置（每 1M Tokens）</div>
                      <div className="flex items-center gap-2">
                        <select
                          value={pricingTemplateId}
                          onChange={(e) => applyPricingTemplate(e.target.value)}
                          className="text-xs border border-[#e5e0d8] rounded px-2 py-1"
                        >
                          {pricingTemplates.map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>{tpl.label}</option>
                          ))}
                        </select>
                        <select
                          value={costEstimator.unitPrice.currency}
                          onChange={(e) => setCostEstimator({
                            ...costEstimator,
                            unitPrice: { ...costEstimator.unitPrice, currency: e.target.value as 'CNY' | 'USD' },
                          })}
                          className="text-xs border border-[#e5e0d8] rounded px-2 py-1"
                        >
                          <option value="CNY">CNY</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-[#f0e7da] p-2">
                        <div className="text-[11px] text-gray-500 mb-1">主模型输入</div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={costEstimator.unitPrice.primaryInputPer1M}
                          onChange={(e) => setCostEstimator({
                            ...costEstimator,
                            unitPrice: { ...costEstimator.unitPrice, primaryInputPer1M: Number(e.target.value) },
                          })}
                          className="w-full p-1.5 text-xs rounded border border-[#e5e0d8]"
                        />
                      </div>
                      <div className="rounded-lg border border-[#f0e7da] p-2">
                        <div className="text-[11px] text-gray-500 mb-1">主模型输出</div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={costEstimator.unitPrice.primaryOutputPer1M}
                          onChange={(e) => setCostEstimator({
                            ...costEstimator,
                            unitPrice: { ...costEstimator.unitPrice, primaryOutputPer1M: Number(e.target.value) },
                          })}
                          className="w-full p-1.5 text-xs rounded border border-[#e5e0d8]"
                        />
                      </div>
                      <div className="rounded-lg border border-[#f0e7da] p-2">
                        <div className="text-[11px] text-gray-500 mb-1">辅模型输入</div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={costEstimator.unitPrice.auxiliaryInputPer1M}
                          onChange={(e) => setCostEstimator({
                            ...costEstimator,
                            unitPrice: { ...costEstimator.unitPrice, auxiliaryInputPer1M: Number(e.target.value) },
                          })}
                          className="w-full p-1.5 text-xs rounded border border-[#e5e0d8]"
                        />
                      </div>
                      <div className="rounded-lg border border-[#f0e7da] p-2">
                        <div className="text-[11px] text-gray-500 mb-1">辅模型输出</div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={costEstimator.unitPrice.auxiliaryOutputPer1M}
                          onChange={(e) => setCostEstimator({
                            ...costEstimator,
                            unitPrice: { ...costEstimator.unitPrice, auxiliaryOutputPer1M: Number(e.target.value) },
                          })}
                          className="w-full p-1.5 text-xs rounded border border-[#e5e0d8]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#fffdf9] rounded-xl border border-[#eadfcd] p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs font-serif">
                      <div>日调用总数：<span className="text-[#8E2A2A] font-bold">{Math.round(costEstimate.totalCallsPerDay)}</span></div>
                      <div>月调用总数：<span className="text-[#8E2A2A] font-bold">{Math.round(costEstimate.totalCallsPerMonth)}</span></div>
                      <div>主模型调用/日：<span className="text-[#8E2A2A] font-bold">{Math.round(costEstimate.primaryTasks)}</span></div>
                      <div>辅助模型调用/日：<span className="text-[#8E2A2A] font-bold">{Math.round(costEstimate.auxiliaryTasks)}</span></div>
                    </div>
                    <div className="text-xs font-serif text-gray-600">
                      日 Token 区间：<span className="text-[#8E2A2A] font-bold">{Math.round(costEstimate.tokenLowPerDay).toLocaleString()}</span> ~ <span className="text-[#8E2A2A] font-bold">{Math.round(costEstimate.tokenHighPerDay).toLocaleString()}</span>
                    </div>
                    <div className="text-xs font-serif text-gray-600">
                      月 Token 区间：<span className="text-[#8E2A2A] font-bold">{Math.round(costEstimate.tokenLowPerMonth).toLocaleString()}</span> ~ <span className="text-[#8E2A2A] font-bold">{Math.round(costEstimate.tokenHighPerMonth).toLocaleString()}</span>
                    </div>
                    <div className="text-xs font-serif text-gray-600">
                      日成本区间：<span className="text-[#8E2A2A] font-bold">{costEstimator.unitPrice.currency} {costEstimate.costLowPerDay.toFixed(2)}</span> ~ <span className="text-[#8E2A2A] font-bold">{costEstimator.unitPrice.currency} {costEstimate.costHighPerDay.toFixed(2)}</span>
                    </div>
                    <div className="text-xs font-serif text-gray-600">
                      月成本区间：<span className="text-[#8E2A2A] font-bold">{costEstimator.unitPrice.currency} {costEstimate.costLowPerMonth.toFixed(2)}</span> ~ <span className="text-[#8E2A2A] font-bold">{costEstimator.unitPrice.currency} {costEstimate.costHighPerMonth.toFixed(2)}</span>
                    </div>
                    <div className="text-[10px] text-gray-400 font-serif">
                      区间按 0.75x~1.35x 波动系数估算，适合做容量预算，不代表最终账单。
                    </div>
                  </div>
                </div>
              </section>

              {/* Test Connection */}
              <section className="pt-4 border-t border-[#e5e0d8]">
                <button
                  onClick={handleTestApi}
                  disabled={testStatus === 'testing'}
                  className="w-full py-3 rounded-xl bg-[#f4ecd8] text-[#8E2A2A] font-serif font-medium hover:bg-[#eaddc5] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {testStatus === 'testing' && <Loader2 size={16} className="animate-spin" />}
                  测试连接
                </button>
                {testMessage && (
                  <div className={`mt-3 p-3 rounded-xl text-xs font-serif ${testStatus === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {testMessage}
                  </div>
                )}
              </section>
            </div>
          </motion.div>
        )}

        {view === 'memory' && (
          <motion.div
            key="memory"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute inset-0 bg-paper flex flex-col z-10"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#e5e0d8]">
              <button onClick={() => setView('main')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                <ChevronLeft size={24} />
              </button>
              <span className="text-sm font-serif font-medium text-gray-800">记忆管理</span>
              <button onClick={reloadMemoryPanel} className="p-2 text-[#8E2A2A] hover:bg-[#f4ecd8] rounded-full" title="刷新">
                <BookOpen size={18} />
              </button>
            </div>
            <div className="flex-1 p-6 overflow-y-auto space-y-5">
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-white rounded-xl border border-[#e5e0d8] p-3 text-center">
                  <div className="text-[10px] text-gray-400 font-serif">事实</div>
                  <div className="text-lg text-[#8E2A2A] font-serif font-bold">{memoryStats.facts}</div>
                </div>
                <div className="bg-white rounded-xl border border-[#e5e0d8] p-3 text-center">
                  <div className="text-[10px] text-gray-400 font-serif">事件</div>
                  <div className="text-lg text-[#8E2A2A] font-serif font-bold">{memoryStats.events}</div>
                </div>
                <div className="bg-white rounded-xl border border-[#e5e0d8] p-3 text-center">
                  <div className="text-[10px] text-gray-400 font-serif">会话</div>
                  <div className="text-lg text-[#8E2A2A] font-serif font-bold">{memoryStats.conversations}</div>
                </div>
                <div className="bg-white rounded-xl border border-[#e5e0d8] p-3 text-center">
                  <div className="text-[10px] text-gray-400 font-serif">踩雷</div>
                  <div className="text-lg text-[#8E2A2A] font-serif font-bold">{memoryMistakes.length}</div>
                </div>
              </div>

              <div className="text-[11px] text-gray-500 font-serif bg-white rounded-xl border border-[#e5e0d8] px-3 py-2">
                {(() => {
                  const pos = memoryFacts.reduce((sum, f) => sum + (f.positiveFeedbackCount || 0), 0);
                  const neg = memoryFacts.reduce((sum, f) => sum + (f.negativeFeedbackCount || 0), 0);
                  const total = pos + neg;
                  const wrongRate = total > 0 ? `${Math.round((neg / total) * 100)}%` : '—';
                  const relapse = memoryMistakes.reduce((sum, m) => sum + Math.max(0, (m.hitCount || 0) - 1), 0);
                  return `纠错率：${wrongRate}（👍${pos} / 👎${neg}） · 复发次数：${relapse}`;
                })()}
              </div>

              <div className="bg-white rounded-2xl border border-[#e5e0d8] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-serif font-bold text-[#2c2826]">长期记忆</h4>
                  <span className="text-[10px] text-gray-400">支持置顶</span>
                </div>
                {memoryFacts.length === 0 ? (
                  <p className="text-xs text-gray-400 font-serif">还没有可用的长期记忆。</p>
                ) : (
                  memoryFacts.slice(0, 40).map((fact) => (
                    <div key={fact.id} className="border border-[#f0e6d8] rounded-xl p-3">
                      <div className="text-sm font-serif text-[#2c2826]">{fact.text}</div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
                        <span>
                          {fact.tags.join(' / ') || 'memory'}
                          {typeof fact.positiveFeedbackCount === 'number' || typeof fact.negativeFeedbackCount === 'number'
                            ? ` · 👍${fact.positiveFeedbackCount || 0} 👎${fact.negativeFeedbackCount || 0}`
                            : ''}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              submitMemoryFactFeedback(fact.id, 'correct');
                              reloadMemoryPanel();
                            }}
                            className="px-2 py-0.5 text-[10px] rounded border border-[#dbead4] text-green-600 hover:bg-green-50"
                            title="记对了"
                          >
                            记对了
                          </button>
                          <button
                            onClick={() => {
                              submitMemoryFactFeedback(fact.id, 'wrong');
                              reloadMemoryPanel();
                            }}
                            className="px-2 py-0.5 text-[10px] rounded border border-[#f5d5d5] text-red-600 hover:bg-red-50"
                            title="记错了"
                          >
                            记错了
                          </button>
                          <button
                            onClick={() => {
                              togglePinMemoryFact(fact.id);
                              reloadMemoryPanel();
                            }}
                            className={`p-1 rounded ${fact.pinned ? 'text-[#8E2A2A]' : 'text-gray-400 hover:text-[#8E2A2A]'}`}
                            title="置顶"
                          >
                            <Pin size={12} />
                          </button>
                          <button
                            onClick={() => {
                              deleteMemoryFact(fact.id);
                              reloadMemoryPanel();
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 rounded"
                            title="删除"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="bg-white rounded-2xl border border-[#e5e0d8] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-serif font-bold text-[#2c2826]">踩雷清单</h4>
                  <span className="text-[10px] text-gray-400">点“记错了”会进入这里</span>
                </div>
                {memoryMistakes.length === 0 ? (
                  <p className="text-xs text-gray-400 font-serif">暂无踩雷项。你标记“记错了”后，系统会自动记住并提醒后续不要重复。</p>
                ) : (
                  <div className="space-y-2">
                    {memoryMistakes.slice(0, 30).map((m) => (
                      <div key={m.id} className="border border-[#f0e6d8] rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-serif text-[#2c2826]">{m.text}</div>
                          <span className="shrink-0 px-2 py-0.5 text-[10px] rounded-full border border-[#e5e0d8] bg-[#fdfbf7] text-gray-600 font-serif">
                            {getMistakeKindLabel(m.kind)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
                          <span>
                            👎×{m.hitCount} · {new Date(m.lastHitAt || m.createdAt).toLocaleString()}
                          </span>
                          <button
                            onClick={() => {
                              deleteMemoryMistake(m.id);
                              reloadMemoryPanel();
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 rounded"
                            title="删除踩雷项"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {[
                            { id: 'inference', label: '推断' },
                            { id: 'exaggeration', label: '夸张' },
                            { id: 'time_mismatch', label: '时间' },
                            { id: 'boundary', label: '越界' },
                            { id: 'tone', label: '语气' },
                            { id: 'identity', label: '称呼' },
                            { id: 'other', label: '其他' },
                          ].map((k) => (
                            <button
                              key={k.id}
                              onClick={() => {
                                updateMemoryMistakeKind(m.id, k.id as any);
                                reloadMemoryPanel();
                              }}
                              className={`px-2 py-0.5 text-[10px] rounded border ${
                                (m.kind || 'unknown') === k.id
                                  ? 'border-[#8E2A2A] text-[#8E2A2A] bg-[#f4ecd8]'
                                  : 'border-[#e5e0d8] text-gray-600 hover:bg-[#f4ecd8]/40'
                              }`}
                              title={`标注为：${k.label}`}
                            >
                              {k.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-[#e5e0d8] p-4 space-y-3">
                <h4 className="text-sm font-serif font-bold text-[#2c2826]">事件流</h4>
                {memoryEvents.length === 0 ? (
                  <p className="text-xs text-gray-400 font-serif">暂无事件。</p>
                ) : (
                  memoryEvents.slice(0, 60).map((event) => (
                    <div key={event.id} className="border-b border-[#f3eee6] pb-2 last:border-0">
                      <div className="text-sm font-serif text-[#2c2826]">{event.text}</div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
                        <span>{new Date(event.createdAt).toLocaleString()}</span>
                        <button
                          onClick={() => {
                            deleteMemoryEvent(event.id);
                            reloadMemoryPanel();
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 rounded"
                          title="删除"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => {
                  if (!confirm('确定清空所有记忆吗？此操作不可撤销。')) return;
                  clearAllMemory();
                  reloadMemoryPanel();
                }}
                className="w-full py-3 rounded-xl bg-red-50 text-red-600 border border-red-100 text-xs font-serif font-bold"
              >
                清空全部记忆
              </button>
            </div>
          </motion.div>
        )}

        {view === 'profile' && (
          <motion.div 
            key="profile"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute inset-0 bg-paper flex flex-col z-10"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#e5e0d8]">
              <button onClick={() => setView('main')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                <ChevronLeft size={24} />
              </button>
              <span className="text-sm font-serif font-medium text-gray-800">修改恋人资料</span>
              <button onClick={handleSaveProfile} className="p-2 text-[#8E2A2A] hover:bg-[#f4ecd8] rounded-full">
                <Save size={20} />
              </button>
            </div>
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              <div>
                <label className="block text-xs font-serif text-gray-400 mb-2">恋人昵称</label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="w-full p-3 rounded-xl border border-[#e5e0d8] bg-white focus:outline-none focus:ring-2 focus:ring-[#8E2A2A] text-sm font-serif"
                  placeholder="例如：你的恋人"
                />
              </div>
              <div>
                <label className="block text-xs font-serif text-gray-400 mb-2">头像链接 (URL)</label>
                <input
                  type="text"
                  value={tempAvatar}
                  onChange={(e) => setTempAvatar(e.target.value)}
                  className="w-full p-3 rounded-xl border border-[#e5e0d8] bg-white focus:outline-none focus:ring-2 focus:ring-[#8E2A2A] text-sm font-serif"
                  placeholder="输入图片链接，留空则使用默认头像"
                />
                {tempAvatar && (
                  <div className="mt-4 flex justify-center">
                    <img src={tempAvatar} alt="Preview" className="w-24 h-24 rounded-full object-cover shadow-md border-4 border-white" />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {view === 'persona' && (
          <motion.div 
            key="persona"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute inset-0 bg-paper flex flex-col z-10"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#e5e0d8]">
              <button onClick={() => setView('main')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                <ChevronLeft size={24} />
              </button>
              <span className="text-sm font-serif font-medium text-gray-800">人设自定义</span>
              <button onClick={handleSavePersona} className="p-2 text-[#8E2A2A] hover:bg-[#f4ecd8] rounded-full">
                <Save size={20} />
              </button>
            </div>
            <div className="flex-1 p-6 overflow-y-auto">
              <p className="text-sm text-gray-500 mb-4 font-serif">
                在这里输入提示词，定义你想要的恋人性格、语气和互动方式。保存后，TA 将以全新的面貌陪伴你。
              </p>
              <textarea
                value={tempPersona}
                onChange={(e) => setTempPersona(e.target.value)}
                className="w-full h-64 p-4 rounded-2xl border border-[#e5e0d8] bg-white focus:outline-none focus:ring-2 focus:ring-[#8E2A2A] focus:border-transparent resize-none text-sm text-[#2c2826] leading-relaxed font-serif"
                placeholder="例如：你是一个傲娇的学霸，表面上对什么都不屑一顾，但其实很关心我..."
              />
            </div>
          </motion.div>
        )}

        {view === 'journal' && (
          <motion.div 
            key="journal"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute inset-0 bg-paper flex flex-col z-10"
          >
            <div className="flex items-center px-4 py-3 bg-white border-b border-[#e5e0d8]">
              <button onClick={() => setView('main')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                <ChevronLeft size={24} />
              </button>
              <span className="text-sm font-serif font-medium text-gray-800 ml-2">情绪手账</span>
            </div>
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'all', label: '全部' },
                  { key: 'manual', label: '我的批注' },
                  { key: 'chat', label: '分享聊天' },
                  { key: 'proactive', label: '主动批注' },
                ] as Array<{ key: JournalFilter; label: string }>).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setJournalFilter(item.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-serif border transition-colors ${
                      journalFilter === item.key
                        ? 'bg-[#8E2A2A] text-white border-[#8E2A2A]'
                        : 'bg-white text-gray-600 border-[#e5e0d8] hover:bg-[#f4ecd8]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {journalEntries.filter((entry) => {
                if (journalFilter === 'all') return true;
                return resolveEntryType(entry) === journalFilter;
              }).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Quote size={48} className="mb-4 opacity-20" />
                  <p className="text-sm font-serif">
                    {journalEntries.length === 0 ? '还没有记录哦' : '这个分类下还没有记录'}
                  </p>
                  <p className="text-xs mt-1 font-serif">
                    {journalEntries.length === 0 ? '在阅读时划线分享，TA的回应会记录在这里' : '试试切换其他筛选标签看看'}
                  </p>
                </div>
              ) : (
                journalEntries
                  .filter((entry) => {
                    if (journalFilter === 'all') return true;
                    return resolveEntryType(entry) === journalFilter;
                  })
                  .map(entry => (
                  (() => {
                    const resolvedEntryType = resolveEntryType(entry);
                    const entryTypeLabel =
                      resolvedEntryType === 'manual'
                        ? '我的批注'
                        : resolvedEntryType === 'chat'
                          ? '分享聊天'
                          : '主动批注';
                    return (
                  <div key={entry.id} className="bg-white rounded-2xl p-5 shadow-sm border border-[#e5e0d8]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-serif font-medium text-[#8E2A2A] bg-[#f4ecd8] px-2 py-1 rounded-md">{entry.bookTitle}</span>
                        <span className="text-[10px] font-serif text-gray-500 bg-gray-100 px-2 py-1 rounded-md">{entryTypeLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-serif text-gray-400">{new Date(entry.date).toLocaleDateString()}</span>
                        <button 
                          onClick={() => startEditJournal(entry)}
                          className="p-1 text-gray-400 hover:text-[#8E2A2A] transition-colors"
                        >
                          <Settings size={14} />
                        </button>
                        <button 
                          onClick={() => setJournalToDelete(entry.id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 italic border-l-2 border-[#e5e0d8] pl-3 mb-4 font-serif">
                      "{entry.quote}"
                    </p>
                    {resolvedEntryType === 'manual' && !!entry.userNote && (
                      <div className="mb-4 pl-3">
                        <span className="text-[10px] text-gray-400 block mb-1">我的批注：</span>
                        <p className="text-sm font-hand text-2xl text-[#8E2A2A] whitespace-pre-wrap transform -rotate-1">{entry.userNote}</p>
                      </div>
                    )}
                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#8E2A2A]/10 flex-shrink-0 flex items-center justify-center text-[#8E2A2A] mt-0.5">
                        <Heart size={10} fill="currentColor" />
                      </div>
                      {editingJournalId === entry.id ? (
                        <div className="flex-1 flex flex-col gap-2">
                          <textarea 
                            value={editJournalText}
                            onChange={(e) => setEditJournalText(e.target.value)}
                            className="w-full p-3 rounded-xl border border-[#e5e0d8] text-sm font-serif focus:outline-none focus:ring-1 focus:ring-[#8E2A2A] min-h-[100px]"
                          />
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => setEditingJournalId(null)}
                              className="px-3 py-1 text-xs font-serif text-gray-500 hover:bg-gray-100 rounded-lg"
                            >
                              取消
                            </button>
                            <button 
                              onClick={() => saveEditJournal(entry)}
                              className="px-3 py-1 text-xs font-serif bg-[#8E2A2A] text-white rounded-lg shadow-sm"
                            >
                              保存
                            </button>
                          </div>
                        </div>
                      ) : resolvedEntryType === 'chat' && entry.chatHistory && entry.chatHistory.length > 0 ? (
                        <div className="flex-1 space-y-3">
                          {entry.chatHistory.map((msg, i) => (
                            <div key={i} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} gap-1`}>
                              <span className="text-[10px] text-gray-400">{msg.sender === 'user' ? '我' : 'TA'}</span>
                              <div className={`px-3 py-2 rounded-xl text-sm w-full ${msg.sender === 'user' ? 'bg-[#8E2A2A] text-white' : 'bg-gray-100 text-[#2c2826]'}`}>
                                {messageEditor.activeKey === `${entry.id}:${i}` ? (
                                  <div className="space-y-2">
                                    <textarea
                                      value={messageEditor.text}
                                      onChange={(e) => messageEditor.setText(e.target.value)}
                                      className="w-full p-2 rounded-lg text-sm text-[#2c2826] border border-[#e5e0d8]"
                                    />
                                    <div className="flex justify-end gap-2">
                                      <button onClick={() => messageEditor.cancel()} className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">取消</button>
                                      <button onClick={() => saveEditMessage(entry, i)} className="text-xs px-2 py-1 rounded bg-[#8E2A2A] text-white">保存</button>
                                    </div>
                                  </div>
                                ) : msg.text}
                              </div>
                              <div className="flex gap-2 text-[10px] text-gray-400">
                                <button onClick={() => startEditMessage(entry, i)} className="hover:text-[#8E2A2A]">编辑</button>
                                <button onClick={() => deleteMessage(entry, i)} className="hover:text-red-500">删除</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex-1 space-y-3">
                          {resolvedEntryType !== 'manual' && !!entry.userNote && (
                            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                              <div className="text-[10px] text-gray-400 mb-1">我的批注</div>
                              {userNoteEditor.activeKey === entry.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={userNoteEditor.text}
                                    onChange={(e) => userNoteEditor.setText(e.target.value)}
                                    className="w-full p-2 rounded-lg text-sm border border-[#e5e0d8]"
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button onClick={() => userNoteEditor.cancel()} className="text-xs px-2 py-1 rounded bg-gray-200">取消</button>
                                    <button onClick={() => saveEditUserNote(entry)} className="text-xs px-2 py-1 rounded bg-[#8E2A2A] text-white">保存</button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm whitespace-pre-wrap">{entry.userNote}</p>
                              )}
                              <div className="flex gap-2 text-[10px] text-gray-400 mt-1">
                                <button onClick={() => startEditUserNote(entry)} className="hover:text-[#8E2A2A]">编辑</button>
                                <button onClick={() => deleteUserNote(entry)} className="hover:text-red-500">删除</button>
                              </div>
                            </div>
                          )}
                          <div className="font-hand text-xl text-[#5b4636] leading-relaxed tracking-wide">
                            <Markdown rehypePlugins={[rehypeRaw]}>{entry.aiResponse}</Markdown>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                    );
                  })()
                ))
              )}
            </div>

            {/* Journal Delete Confirmation */}
            <AnimatePresence>
              {journalToDelete && (
                <>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50"
                    onClick={() => setJournalToDelete(null)}
                  />
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 shadow-2xl z-50 w-[85%] max-w-sm border border-[#e5e0d8]"
                  >
                    <h3 className="text-lg font-serif font-bold text-[#2c2826] mb-2">删除记录</h3>
                    <p className="text-sm text-gray-500 mb-6">确定要删除这条心情记录吗？</p>
                    <div className="flex justify-end gap-3">
                      <button 
                        onClick={() => setJournalToDelete(null)}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        取消
                      </button>
                      <button 
                        onClick={confirmDeleteJournal}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-[#8E2A2A] text-white hover:bg-[#6b1f1f] transition-colors shadow-sm"
                      >
                        确认删除
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {view === 'memos' && (
          <motion.div 
            key="memos"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute inset-0 bg-paper flex flex-col z-10"
          >
            <div className="flex items-center px-4 py-3 bg-white border-b border-[#e5e0d8]">
              <button onClick={() => setView('main')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                <ChevronLeft size={24} />
              </button>
              <span className="text-sm font-serif font-medium text-gray-800 ml-2">便签记录</span>
            </div>
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e5e0d8]">
                <textarea
                  value={editJournalText}
                  onChange={(e) => setEditJournalText(e.target.value)}
                  onInput={(e) => autoResizeTextarea(e.currentTarget)}
                  onFocus={(e) => autoResizeTextarea(e.currentTarget)}
                  placeholder="写下你的随笔或待办..."
                  className="w-full p-4 text-base font-serif focus:outline-none resize-none min-h-[140px] rounded-xl border border-[#e5e0d8] bg-[#fdfbf7] leading-relaxed"
                />
                <div className="flex justify-end mt-2">
                  <button 
                    onClick={async () => {
                      if (!editJournalText.trim()) return;
                      const newMemo: Memo = {
                        id: createId(),
                        content: editJournalText,
                        timestamp: Date.now(),
                      };
                      setMemos([newMemo, ...memos]);
                      setEditJournalText('');
                      // Ask AI to comment based on frequency
                      if (Math.random() < memoAiFrequency) {
                        try {
                          rememberUserInput({
                            source: 'memo',
                            text: newMemo.content,
                            channel: 'memo-comment',
                          });
                          const basePrompt = `用户写了一条便签：“${newMemo.content}”。请给出一句简短、温馨的评论或鼓励。`;
                          const envelope = buildPromptEnvelope({
                            taskType: 'utility',
                            prompt: basePrompt,
                            memory: {
                              channel: 'memo-comment',
                            },
                          });
                          const aiRes = await sendMessage({ messages: envelope.messages }, { taskType: 'utility' });
                          setMemos(prev => prev.map(m => m.id === newMemo.id ? { ...m, aiComment: aiRes } : m));
                          rememberConversationTurn({
                            channel: 'memo-comment',
                            userText: newMemo.content,
                            aiText: aiRes,
                          });
                        } catch (e) {
                          console.error(e);
                        }
                      }
                    }}
                    className="px-4 py-1.5 text-xs font-serif bg-[#8E2A2A] text-white rounded-lg shadow-sm"
                  >
                    记录
                  </button>
                </div>
              </div>

              {memos.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-gray-400 py-10">
                  <BookOpen size={48} className="mb-4 opacity-20" />
                  <p className="text-sm font-serif">还没有便签哦</p>
                </div>
              ) : (
                memos.map(memo => (
                  <div key={memo.id} className="bg-white rounded-2xl p-4 shadow-sm border border-[#e5e0d8]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-serif text-gray-400">{new Date(memo.timestamp).toLocaleString()}</span>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            memoEditor.start(memo.id, memo.content);
                          }}
                          className="p-1 text-gray-400 hover:text-[#8E2A2A] transition-colors"
                        >
                          <PenTool size={14} />
                        </button>
                        <button 
                          onClick={() => setMemos(memos.filter(m => m.id !== memo.id))}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    {memoEditor.activeKey === memo.id ? (
                      <div className="mt-2">
                        <textarea
                          value={memoEditor.text}
                          onChange={(e) => memoEditor.setText(e.target.value)}
                          onInput={(e) => autoResizeTextarea(e.currentTarget)}
                          onFocus={(e) => autoResizeTextarea(e.currentTarget)}
                          className="w-full p-4 text-base font-serif border border-[#e5e0d8] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#8E2A2A] resize-none min-h-[140px] bg-[#fdfbf7] leading-relaxed"
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button 
                            onClick={() => memoEditor.cancel()}
                            className="px-3 py-1 text-xs font-serif text-gray-500 hover:bg-gray-100 rounded-md"
                          >
                            取消
                          </button>
                          <button 
                            onClick={() => {
                              setMemos(memos.map(m => m.id === memo.id ? { ...m, content: memoEditor.text } : m));
                              memoEditor.cancel();
                            }}
                            className="px-3 py-1 text-xs font-serif bg-[#8E2A2A] text-white rounded-md"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-[#2c2826] font-serif whitespace-pre-wrap mb-3">{memo.content}</p>
                    )}
                    {memo.aiComment && !memoEditor.activeKey && (
                      <div className="bg-[#f4ecd8]/50 rounded-xl p-3 border border-[#eaddc5]">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-5 h-5 rounded-full bg-[#8E2A2A]/10 flex items-center justify-center text-[#8E2A2A]">
                            <Heart size={10} fill="currentColor" />
                          </div>
                          <span className="text-xs font-serif font-medium text-[#8E2A2A]">{companionName}</span>
                        </div>
                        <p className="text-xs text-gray-600 font-serif ml-7">{memo.aiComment}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}

        {view === 'poem-slips' && (
          <motion.div 
            key="poem-slips"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute inset-0 poem-collection flex flex-col z-10"
          >
            <div className="flex items-center px-4 py-3 bg-white border-b border-[#e5e0d8]">
              <button onClick={() => setView('main')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"><ChevronLeft size={24} /></button>
              <span className="text-sm font-serif font-medium text-gray-800 ml-2">诗签本</span>
            </div>
            <div className="flex-1 p-6 overflow-y-auto">
              {poemSlips.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Sparkles size={48} className="mb-4 opacity-20" />
                  <p className="text-sm font-serif">还没有收藏诗签</p>
                </div>
              ) : (
                <div className="columns-2 gap-4 [column-fill:_balance]">
                  {poemSlips
                    .slice()
                    .sort((a, b) => b.date - a.date)
                    .map((poem) => (
                    <div key={poem.id} className="poem-note-card break-inside-avoid mb-4 bg-white rounded-2xl border border-[#e5e0d8] p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-gray-400 font-serif">{new Date(poem.date).toLocaleString()}</span>
                        <button onClick={() => onDeletePoemSlip(poem.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                      <p className="poem-note-text text-sm font-serif text-[#2c2826] leading-relaxed">{poem.text}</p>
                      <div className="poem-note-meta text-[10px] text-gray-400 mt-2 pt-2">
                        {poem.bookTitle || '未知书目'} · {poem.source === 'daily' ? '今日诗签' : '手动收藏'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {view === 'time-capsule' && (
          <motion.div 
            key="time-capsule"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute inset-0 bg-paper flex flex-col z-10"
          >
            <div className="flex items-center px-4 py-3 bg-white border-b border-[#e5e0d8]">
              <button onClick={() => setView('main')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"><ChevronLeft size={24} /></button>
              <span className="text-sm font-serif font-medium text-gray-800 ml-2">时光册</span>
            </div>
            <div className="flex-1 px-4 py-5 overflow-y-auto timeline-root">
              {(() => {
                const finishedBooks = books
                  .filter((b) => b.status === 'finished' || b.progress === 100)
                  .map((book) => {
                    const finishedAt = book.finishedAt || book.bookmarkAt || Date.now();
                    const season = getSeasonFromDate(finishedAt);
                    const poems = poemSlips.filter((p) => p.bookTitle === book.title);
                    const activeDays = Math.max(
                      1,
                      Math.ceil((finishedAt - (book.addedAt || startDate)) / (1000 * 60 * 60 * 24))
                    );
                    return { book, finishedAt, season, poems, activeDays };
                  })
                  .sort((a, b) => b.finishedAt - a.finishedAt);
                const groups = finishedBooks.reduce((acc, item) => {
                  if (!acc[item.season.key]) {
                    acc[item.season.key] = { ...item.season, items: [] as typeof finishedBooks };
                  }
                  acc[item.season.key].items.push(item);
                  return acc;
                }, {} as Record<string, { key: string; label: string; icon: string; items: typeof finishedBooks }>);
                const groupedList = Object.values(groups).sort((a, b) => b.items[0].finishedAt - a.items[0].finishedAt);
                const totalPoems = finishedBooks.reduce((sum, item) => sum + item.poems.length, 0);
                const earliestPoem = poemSlips.length > 0 ? poemSlips.slice().sort((a, b) => a.date - b.date)[0] : null;

                if (finishedBooks.length === 0) {
                  return (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Archive size={48} className="mb-4 opacity-20" />
                  <p className="text-sm font-serif">还没有读完的书</p>
                </div>
                  );
                }

                return (
                  <>
                    <div className="timeline-header-card mb-5">
                      <div className="timeline-header-title">时光册</div>
                      <div className="timeline-header-sub">{finishedBooks.length} 本书 · {totalPoems} 枚诗签</div>
                      <div className="timeline-mood-card mt-4">
                        <div>
                          <div className="timeline-mood-main">你在这里留下了 {totalPoems} 首诗</div>
                          <div className="timeline-mood-sub">
                            {earliestPoem ? `最早的一枚，是 ${new Date(earliestPoem.date).toLocaleDateString()}` : '第一枚诗签正在路上'}
                          </div>
                        </div>
                      </div>
                    </div>
                    {groupedList.map((group) => (
                      <div key={group.key} className="timeline-season-section mb-6">
                        <div className="timeline-season-row mb-3">
                          <span className="timeline-season-icon">{group.icon}</span>
                          <span className="timeline-season-text">{group.label}</span>
                          <span className="timeline-season-line" />
                        </div>
                        {group.items.map(({ book, poems, activeDays, finishedAt }) => {
                          const isExpanded = expandedMemoryBookId === book.id;
                          const latestEcho = book.echoes?.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
                          return (
                            <div key={book.id} className="memory-card bg-[#fffdfa] rounded-3xl border border-[#e8ddd0]/70 p-3 mb-3 shadow-sm">
                              <div className="flex gap-3">
                                <img src={book.cover} alt={book.title} className="w-16 h-24 object-cover rounded-xl border border-[#efe8dc] shadow-sm" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-base font-serif text-[#3a2e20] truncate">《{book.title}》</div>
                                    <div className="text-[11px] text-[#b0a090]">{new Date(finishedAt).toLocaleDateString()}</div>
                                  </div>
                                  <div className="text-[13px] text-[#6b5a4a] mt-2 border-b border-dashed border-[#e8ddd0] pb-2">
                                    你和它相处了 {activeDays} 天。那时你已和 TA 相伴第 {Math.max(1, Math.ceil((finishedAt - startDate) / (1000 * 60 * 60 * 24)))} 天。
                                  </div>
                                  <div className="flex gap-4 mt-2 text-[12px] text-[#8b7a6a]">
                                    <div>📜 <span className="font-medium text-[#5a4a3a]">{poems.length}</span> 枚诗签</div>
                                    <div>🎐 <span className="font-medium text-[#5a4a3a]">{book.echoes?.length || 0}</span> 篇回声</div>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 flex items-center justify-between">
                                <button
                                  onClick={() => setExpandedMemoryBookId(isExpanded ? null : book.id)}
                                  className="text-xs px-3 py-1.5 rounded-full bg-[#f4ecd8] text-[#8E2A2A] hover:bg-[#eadac4]"
                                >
                                  {isExpanded ? '收起点滴' : '展开点滴'}
                                </button>
                                <button
                                  onClick={async () => {
                                    setEchoLoadingBookId(book.id);
                                    await onGenerateBookEcho(book.id);
                                    setEchoLoadingBookId(null);
                                  }}
                                  disabled={echoLoadingBookId === book.id}
                                  className="px-3 py-1.5 text-xs rounded-full bg-[#8E2A2A] text-white disabled:opacity-50 flex items-center gap-1"
                                >
                                  {echoLoadingBookId === book.id ? <Loader2 size={12} className="animate-spin" /> : null}
                                  听回声
                                </button>
                              </div>
                              {isExpanded && (
                                <div className="mt-3 pt-3 border-t border-[#ede5db]">
                                  {!!latestEcho && (
                                    <div className="mb-3">
                                      <div className="text-[11px] tracking-[0.16em] text-[#b0a090] mb-2">那时的回声</div>
                                      <div className="bg-[#f8f4ee] border-l-3 border-[#d4b89a] rounded-xl p-3 text-sm leading-relaxed text-[#5a4a3a]">
                                        {latestEcho.content}
                                      </div>
                                    </div>
                                  )}
                                  {poems.length > 0 && (
                                    <div>
                                      <div className="text-[11px] tracking-[0.16em] text-[#b0a090] mb-2">沿途的诗签</div>
                                      <div className="space-y-2">
                                        {poems.slice(0, 6).map((poem) => (
                                          <div key={poem.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-[#f8f4ee]">
                                            <span className="text-[#b8a893]">✦</span>
                                            <span className="text-[13px] leading-relaxed text-[#6b5a4a]">{poem.text}</span>
                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          </motion.div>
        )}

        {view === 'dictionary' && (
          <motion.div
            key="dictionary"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute inset-0 z-10"
          >
            <DictionaryPage
              journals={journalEntries}
              books={books}
              companionName={companionName}
              onClose={() => setView('main')}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDevPanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm z-[180]"
              onClick={() => setShowDevPanel(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 24, stiffness: 190 }}
              className="absolute bottom-0 left-0 right-0 z-[190] bg-[#fdfbf7] rounded-t-3xl border-t border-[#e5e0d8] p-5 max-h-[75vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-serif font-bold text-[#2c2826]">开发诊断面板</h3>
                <button onClick={() => setShowDevPanel(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full">
                  <X size={18} />
                </button>
              </div>
              <div className="mb-3 text-[11px] font-mono text-gray-500 bg-white rounded-xl border border-[#e5e0d8] px-3 py-2">
                version: {((import.meta as any)?.env?.VITE_APP_VERSION || 'unknown')}  |  build: {BUILD_ID}
              </div>
              <div className="mb-4 flex items-center justify-between bg-white rounded-xl border border-[#e5e0d8] px-3 py-2">
                <div className="text-xs font-serif text-gray-600">打开面板自动复制错误日志</div>
                <button
                  onClick={() => {
                    const next = !autoCopyErrorsOnOpen;
                    setAutoCopyErrorsOnOpen(next);
                    if (next) {
                      // copy immediately when enabling
                      setTimeout(() => copyRecentErrors(), 50);
                    }
                  }}
                  className={`w-12 h-7 rounded-full transition-colors relative ${autoCopyErrorsOnOpen ? 'bg-[#8E2A2A]' : 'bg-gray-200'}`}
                  aria-label="自动复制错误日志开关"
                >
                  <span
                    className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${autoCopyErrorsOnOpen ? 'translate-x-5' : 'translate-x-0.5'}`}
                  />
                </button>
              </div>
              <div className="mb-4 flex items-center justify-between bg-white rounded-xl border border-[#e5e0d8] px-3 py-2">
                <div className="text-xs font-serif text-gray-600">
                  启用 LLM 记忆写入器（辅助模型，限频）
                  <div className="text-[11px] text-gray-400 font-serif mt-0.5">
                    默认关闭；开启后会额外产生少量记忆写入调用。
                  </div>
                </div>
                <button
                  onClick={() => setMemoryWriterLlmEnabled((v) => !v)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${memoryWriterLlmEnabled ? 'bg-[#8E2A2A]' : 'bg-gray-200'}`}
                  aria-label="LLM 记忆写入器开关"
                >
                  <span
                    className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${memoryWriterLlmEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}
                  />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button onClick={exportDiagnosticReport} className="py-2.5 rounded-xl bg-[#8E2A2A] text-white text-xs font-serif font-bold">
                  导出诊断报告
                </button>
                <button onClick={copyQuickSummary} className="py-2.5 rounded-xl bg-[#f4ecd8] text-[#8E2A2A] text-xs font-serif font-bold border border-[#eaddc5]">
                  复制诊断摘要
                </button>
                <button onClick={copyRecentErrors} className="col-span-2 py-2.5 rounded-xl bg-[#fff4f4] text-[#8E2A2A] text-xs font-serif font-bold border border-[#ffdede]">
                  复制最近错误日志（error/warn）
                </button>
                <button onClick={loadDevLogs} className="py-2.5 rounded-xl bg-white text-gray-700 text-xs font-serif font-bold border border-[#e5e0d8]">
                  刷新日志
                </button>
                <button onClick={loadAiLogs} className="py-2.5 rounded-xl bg-white text-gray-700 text-xs font-serif font-bold border border-[#e5e0d8]">
                  刷新 AI 调用
                </button>
                <button onClick={clearDebugLogs} className="py-2.5 rounded-xl bg-white text-red-600 text-xs font-serif font-bold border border-red-100">
                  清空日志
                </button>
                <button
                  onClick={() => {
                    clearAiCallLogs();
                    loadAiLogs();
                  }}
                  className="py-2.5 rounded-xl bg-white text-red-600 text-xs font-serif font-bold border border-red-100"
                >
                  清空 AI 调用
                </button>
                <button onClick={resetReadingPrefs} className="col-span-2 py-2.5 rounded-xl bg-white text-[#8E2A2A] text-xs font-serif font-bold border border-[#e5e0d8]">
                  重置阅读设置（字号/主题/间距）
                </button>
              </div>

              <div className="mb-4 bg-white rounded-2xl border border-[#e5e0d8] p-4">
                <div className="text-xs font-serif font-bold text-[#2c2826] mb-2">分章正则测试</div>
                <div className="text-[11px] text-gray-500 font-serif mb-2">输入一行标题，立即判断是否会被识别为“章节”。</div>
                <input
                  value={chapterTestLine}
                  onChange={(e) => {
                    setChapterTestLine(e.target.value);
                    setChapterTestResult(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') runChapterTest();
                  }}
                  placeholder="例如：第十二章 风起"
                  className="w-full px-3 py-2 rounded-xl border border-[#e5e0d8] text-sm font-serif"
                />
                <div className="mt-2 flex items-center justify-between">
                  <button
                    onClick={runChapterTest}
                    className="px-3 py-1.5 rounded-xl bg-[#f4ecd8] text-[#8E2A2A] text-xs font-serif font-bold border border-[#eaddc5]"
                  >
                    测试
                  </button>
                  {chapterTestResult !== null && (
                    <div className={`text-xs font-serif font-bold ${chapterTestResult ? 'text-green-600' : 'text-red-600'}`}>
                      {chapterTestResult ? '命中：会被当作章节标题' : '未命中：不会被当作章节标题'}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-gray-500 font-serif mb-2">
                最近日志（{devLogs.length} 条，最多展示 80 条）
              </div>
              <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-[#e5e0d8] p-3 space-y-2">
                {devLogs.length === 0 ? (
                  <p className="text-xs text-gray-400 font-serif">暂无日志</p>
                ) : (
                  devLogs.slice(-80).reverse().map((log) => (
                    <button
                      key={log.id}
                      onClick={async () => {
                        const ts = new Date(log.time).toLocaleString();
                        const text = `[${ts}] [${log.level}] ${log.message}`;
                        const ok = await copyText(text);
                        alert(ok ? '已复制该条日志。' : text);
                      }}
                      className="w-full text-left text-[11px] font-mono leading-relaxed border-b border-[#f3eee6] pb-2 hover:bg-[#f4ecd8]/30 rounded-lg px-1"
                      title="点击复制该条日志"
                    >
                      <div className="text-gray-400">
                        [{new Date(log.time).toLocaleTimeString()}] {log.level}
                      </div>
                      <div className="text-[#2c2826] break-words">{log.message}</div>
                    </button>
                  ))
                )}
              </div>

              <div className="mt-4 text-[11px] text-gray-500 font-serif mb-2">
                AI 调用记录（{aiCallLogs.length} 条，最多展示 80 条）
              </div>
              <div className="overflow-y-auto bg-white rounded-2xl border border-[#e5e0d8] p-3 space-y-2 max-h-[26vh]">
                {aiCallLogs.length === 0 ? (
                  <p className="text-xs text-gray-400 font-serif">暂无 AI 调用记录（会自动记录每次 sendMessage）。</p>
                ) : (
                  aiCallLogs.slice(0, 80).map((log) => (
                    <button
                      key={log.id}
                      onClick={async () => {
                        const ts = new Date(log.at).toLocaleString();
                        const text = `[${ts}] task=${log.taskType} route=${log.routedTo} model=${log.usedModel} chars=${log.promptChars} msgs=${log.messageCount} bypassChat=${String(log.bypassChat)}`;
                        const ok = await copyText(text);
                        alert(ok ? '已复制该条 AI 调用记录。' : text);
                      }}
                      className="w-full text-left text-[11px] font-mono leading-relaxed border-b border-[#f3eee6] pb-2 hover:bg-[#f4ecd8]/30 rounded-lg px-1"
                      title="点击复制该条记录"
                    >
                      <div className="text-gray-400">
                        [{new Date(log.at).toLocaleTimeString()}] {log.taskType} · {log.routedTo} · {log.usedModel}
                      </div>
                      <div className="text-[#2c2826] break-words">
                        chars={log.promptChars} · msgs={log.messageCount} · bypass={String(log.bypassChat)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
