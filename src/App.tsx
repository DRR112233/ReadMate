import React, { useState, useEffect, useRef } from 'react';
import ReadingArea from './components/ReadingArea';
import Bookshelf from './components/Bookshelf';
import Companion from './components/Companion';
import { Message, Book, JournalEntry, Memo, PoemSlip, DEFAULT_STORY, DEFAULT_PERSONA } from './types';
import { initChat, sendMessage } from './services/geminiService';
import { Library, BookOpen, Heart, Feather, Bookmark, Share2 } from 'lucide-react';
import { createId } from './utils/id';
import { buildDailyPoemPrompt, buildEchoPrompt } from './utils/promptBuilders';
import { rememberConversationTurn, rememberMilestone, rememberUserInput } from './services/memoryService';
import { buildPromptEnvelope } from './utils/promptEnvelope';
import { motion, AnimatePresence } from 'motion/react';

type Tab = 'bookshelf' | 'reading' | 'companion';

interface BackupPayload {
  version: number;
  exportedAt: number;
  app: {
    books: Book[];
    journals: JournalEntry[];
    memos: Memo[];
    persona: string;
    companionName: string;
    companionAvatar: string;
    startDate: number;
    readingTime: number;
  };
  localStorageSnapshot: Record<string, string | null>;
}

export default function App() {
  const normalizeUserNote = (text?: string) =>
    (text || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[，。！？、,.!?;；:："“”"'`~（）()【】\[\]<>《》]/g, '');

  const isDuplicateUserNote = (entry: JournalEntry, existing: JournalEntry) => {
    const nextNote = normalizeUserNote(entry.userNote);
    if (!nextNote) return false;
    return normalizeUserNote(existing.userNote) === nextNote;
  };

  const dedupeJournals = (entries: JournalEntry[]) => {
    const seenManualNotes = new Set<string>();
    const result: JournalEntry[] = [];
    for (const entry of entries) {
      const normalized = normalizeUserNote(entry.userNote);
      if (normalized) {
        if (seenManualNotes.has(normalized)) continue;
        seenManualNotes.add(normalized);
      }
      result.push(entry);
    }
    return result;
  };

  const [activeTab, setActiveTab] = useState<Tab>('bookshelf');
  const [books, setBooks] = useState<Book[]>(() => {
    const saved = localStorage.getItem('app_books');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [persona, setPersona] = useState(() => {
    return localStorage.getItem('app_persona') || DEFAULT_PERSONA;
  });
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => {
    const saved = localStorage.getItem('app_journals');
    return saved ? dedupeJournals(JSON.parse(saved)) : [];
  });
  const [memos, setMemos] = useState<Memo[]>(() => {
    const saved = localStorage.getItem('app_memos');
    return saved ? JSON.parse(saved) : [];
  });
  const [poemSlips, setPoemSlips] = useState<PoemSlip[]>(() => {
    const saved = localStorage.getItem('app_poemSlips');
    return saved ? JSON.parse(saved) : [];
  });
  const [todayPoem, setTodayPoem] = useState<PoemSlip | null>(null);
  const [poemExpanded, setPoemExpanded] = useState(false);
  const [poemCollapsed, setPoemCollapsed] = useState(false);
  const [poemToast, setPoemToast] = useState('');
  const [anniversaryToast, setAnniversaryToast] = useState('');
  const [anniversaryQueue, setAnniversaryQueue] = useState<string[]>([]);
  const [milestones, setMilestones] = useState<{
    firstReadAt?: number;
    firstFinishedAt?: number;
    streak7At?: number;
    hundredChatsAt?: number;
  }>(() => {
    const saved = localStorage.getItem('app_milestones');
    return saved ? JSON.parse(saved) : {};
  });
  const [poemPosition, setPoemPosition] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('app_poemWidgetPosition');
    if (saved) return JSON.parse(saved);
    return { x: 0, y: 0 };
  });
  const poemLongPressTriggeredRef = useRef(false);
  const poemLongPressTimerRef = useRef<number | null>(null);
  const poemWidgetRef = useRef<HTMLDivElement | null>(null);
  const poemGeneratingRef = useRef(false);
  const poemGeneratedDateRef = useRef('');

  const [companionName, setCompanionName] = useState(() => localStorage.getItem('app_companionName') || '你的恋人');
  const [companionAvatar, setCompanionAvatar] = useState(() => localStorage.getItem('app_companionAvatar') || '');
  const [startDate] = useState(() => {
    let date = localStorage.getItem('app_startDate');
    if (!date) {
      date = Date.now().toString();
      localStorage.setItem('app_startDate', date);
    }
    return parseInt(date, 10);
  });
  const [readingTime, setReadingTime] = useState(() => parseInt(localStorage.getItem('app_readingTime') || '0', 10));
  const readingSessionStartRef = useRef<number | null>(null);
  const readingBaseMinutesRef = useRef<number>(parseInt(localStorage.getItem('app_readingTime') || '0', 10) || 0);

  useEffect(() => {
    const logKey = 'app_debugLogs';
    const maxLogs = 300;
    const appendLog = (level: 'log' | 'warn' | 'error', payload: unknown[]) => {
      try {
        const prev = JSON.parse(localStorage.getItem(logKey) || '[]') as any[];
        const entry = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          time: Date.now(),
          level,
          message: payload.map((item) => {
            if (typeof item === 'string') return item;
            try {
              return JSON.stringify(item);
            } catch {
              return String(item);
            }
          }).join(' ')
        };
        const next = [...prev, entry].slice(-maxLogs);
        localStorage.setItem(logKey, JSON.stringify(next));
      } catch {
        // ignore logging failures
      }
    };

    const originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    console.log = (...args: unknown[]) => {
      appendLog('log', args);
      originalConsole.log(...args);
    };
    console.warn = (...args: unknown[]) => {
      appendLog('warn', args);
      originalConsole.warn(...args);
    };
    console.error = (...args: unknown[]) => {
      appendLog('error', args);
      originalConsole.error(...args);
    };

    const handleWindowError = (event: ErrorEvent) => {
      appendLog('error', [`window.error: ${event.message}`, event.filename, event.lineno, event.colno]);
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      appendLog('error', ['unhandledrejection', event.reason]);
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const backupLocalStorageKeys = [
    'app_apiConfig',
    'app_apiPresets',
    'app_memoAiFrequency',
    'app_memory_store_v1',
    'app_costEstimatorConfig',
    'app_costEstimatorTemplate',
    'reading_fontSize',
    'reading_lineHeight',
    'reading_paragraphSpacing',
    'reading_aiFrequency',
    'reading_theme',
  ];

  useEffect(() => {
    let interval: any;

    const flushMinutes = (mins: number) => {
      setReadingTime(mins);
      localStorage.setItem('app_readingTime', String(mins));
      readingBaseMinutesRef.current = mins;
    };

    if (activeTab === 'reading') {
      if (!readingSessionStartRef.current) {
        readingSessionStartRef.current = Date.now();
        readingBaseMinutesRef.current = readingTime;
      }
      // Update UI periodically so用户不会一直看到 0
      interval = setInterval(() => {
        const start = readingSessionStartRef.current;
        if (!start) return;
        const elapsedMs = Date.now() - start;
        const addedMins = Math.floor(elapsedMs / 60000);
        const next = Math.max(readingBaseMinutesRef.current, readingTime) + addedMins;
        flushMinutes(next);
      }, 10000); // every 10s
    } else {
      const start = readingSessionStartRef.current;
      if (start) {
        const elapsedMs = Date.now() - start;
        const addedMins = Math.floor(elapsedMs / 60000);
        const next = Math.max(readingBaseMinutesRef.current, readingTime) + addedMins;
        flushMinutes(next);
      }
      readingSessionStartRef.current = null;
    }

    return () => clearInterval(interval);
  }, [activeTab, readingTime]);

  useEffect(() => {
    localStorage.setItem('app_books', JSON.stringify(books));
  }, [books]);

  useEffect(() => {
    localStorage.setItem('app_journals', JSON.stringify(journalEntries));
  }, [journalEntries]);

  useEffect(() => {
    localStorage.setItem('app_memos', JSON.stringify(memos));
  }, [memos]);
  useEffect(() => {
    localStorage.setItem('app_poemSlips', JSON.stringify(poemSlips));
  }, [poemSlips]);
  useEffect(() => {
    localStorage.setItem('app_poemWidgetPosition', JSON.stringify(poemPosition));
  }, [poemPosition]);
  useEffect(() => {
    localStorage.setItem('app_milestones', JSON.stringify(milestones));
  }, [milestones]);
  useEffect(() => {
    if (!poemToast) return;
    const timer = window.setTimeout(() => setPoemToast(''), 1200);
    return () => window.clearTimeout(timer);
  }, [poemToast]);
  useEffect(() => {
    if (!anniversaryToast) return;
    const timer = window.setTimeout(() => {
      if (anniversaryQueue.length > 0) {
        setAnniversaryToast(anniversaryQueue[0]);
        setAnniversaryQueue((prev) => prev.slice(1));
      } else {
        setAnniversaryToast('');
      }
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [anniversaryToast, anniversaryQueue]);

  useEffect(() => {
    localStorage.setItem('app_persona', persona);
    const context = activeBook ? activeBook.content || '' : '我们正在书架前挑选书籍。';
    initChat(context.substring(0, 5000), persona); // Limit context length
    // Initial greeting
    setMessages([
      {
        id: 'init',
        sender: 'ai',
        text: '亲爱的，今天想看点什么？我陪你一起看。',
        timestamp: Date.now(),
      }
    ]);
  }, [persona, activeBook]);

  const getPoemBookContext = () => {
    const target = activeBook || books.find((b) => (b.progress || 0) > 0) || books[0];
    const chapterContext = (target?.content || '').slice(0, 500) || '此刻翻开的是一页安静的文字。';
    return {
      bookTitle: target?.title || '未命名读物',
      chapterContext,
    };
  };

  const buildAnniversaryMessages = () => {
    const now = Date.now();
    const togetherDays = Math.max(1, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));
    const weekday = new Date(startDate).toLocaleDateString('zh-CN', { weekday: 'long' });
    const firstReadAt = milestones.firstReadAt || books.map((b) => b.addedAt || 0).filter(Boolean).sort((a, b) => a - b)[0];
    const firstFinishedAt =
      milestones.firstFinishedAt ||
      books
        .filter((b) => b.finishedAt || b.status === 'finished' || b.progress === 100)
        .map((b) => b.finishedAt || b.bookmarkAt || 0)
        .filter(Boolean)
        .sort((a, b) => a - b)[0];
    const totalChatCount =
      journalEntries.reduce((sum, j) => sum + (j.chatHistory?.length || 0) + (j.userNote ? 1 : 0), 0) + messages.length;

    setMilestones((prev) => {
      const next = { ...prev };
      if (!next.firstReadAt && firstReadAt) next.firstReadAt = firstReadAt;
      if (!next.firstFinishedAt && firstFinishedAt) next.firstFinishedAt = firstFinishedAt;
      if (!next.streak7At && togetherDays >= 7) next.streak7At = now;
      if (!next.hundredChatsAt && totalChatCount >= 100) next.hundredChatsAt = now;
      return next;
    });

    return [
      `今天是我们认识的第 ${togetherDays} 天。`,
      `你第一次让我陪你读书，是${weekday}。要不要读一会儿？`,
    ];
  };

  const generateTodayPoem = async () => {
    const today = new Date().toDateString();
    if (poemGeneratedDateRef.current === today) return;
    if (poemGeneratingRef.current) return;
    const cached = poemSlips.find((p) => new Date(p.date).toDateString() === today && p.source === 'daily');
    if (cached) {
      setTodayPoem(cached);
      setPoemCollapsed(false);
      poemGeneratedDateRef.current = today;
      return;
    }
    const ctx = getPoemBookContext();
    try {
      poemGeneratingRef.current = true;
      const basePrompt = buildDailyPoemPrompt(ctx.bookTitle, ctx.chapterContext);
      const envelope = buildPromptEnvelope({
        taskType: 'creative',
        prompt: basePrompt,
        persona,
        memory: {
          channel: 'daily-poem',
          bookTitle: ctx.bookTitle,
        },
      });
      const text = (await sendMessage(
        { messages: envelope.messages },
        { bypassChat: true, taskType: 'creative' }
      )).trim().replace(/^["'“”]+|["'“”]+$/g, '');
      const poem: PoemSlip = {
        id: createId(),
        text,
        bookTitle: ctx.bookTitle,
        chapterHint: activeBook?.bookmarkChapter || books.find((b) => b.id === activeBook?.id)?.bookmarkChapter || '当前章节',
        moodHint: '',
        date: Date.now(),
        source: 'daily',
      };
      setPoemSlips((prev) => [poem, ...prev]);
      setTodayPoem(poem);
      setPoemCollapsed(false);
      poemGeneratedDateRef.current = today;
      rememberMilestone(`生成今日诗签：${text}`, ctx.bookTitle);
    } catch (e) {
      console.error('Failed to generate daily poem', e);
    } finally {
      poemGeneratingRef.current = false;
    }
  };

  useEffect(() => {
    if (activeTab !== 'bookshelf' && activeTab !== 'reading') return;
    generateTodayPoem();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (activeTab === 'bookshelf' || activeTab === 'reading')) {
        generateTodayPoem();
        setPoemCollapsed(false);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, books, activeBook, poemSlips]);

  useEffect(() => {
    if (!(activeTab === 'bookshelf' || activeTab === 'reading')) return;
    const launchFlag = sessionStorage.getItem('app_anniversary_shown_once');
    if (launchFlag === '1') return;
    const [first, second] = buildAnniversaryMessages();
    setAnniversaryToast(first);
    setAnniversaryQueue(second ? [second] : []);
    sessionStorage.setItem('app_anniversary_shown_once', '1');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const getTaReadingProgress = (book: Book) => {
    const base = Math.max(0, Math.min(100, book.progress || 0));
    const seed = book.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 11;
    const offset = seed - 6; // mostly a bit behind user
    return Math.max(0, Math.min(100, base + offset));
  };

  useEffect(() => {
    if (!todayPoem || poemExpanded) return;
    const timer = setTimeout(() => setPoemCollapsed(true), 3000);
    return () => clearTimeout(timer);
  }, [todayPoem, poemExpanded]);
  useEffect(() => {
    if (!todayPoem) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (poemWidgetRef.current?.contains(target)) return;
      setPoemExpanded(false);
      setPoemCollapsed(true);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [todayPoem]);

  const savePoemToNotebook = (poem: PoemSlip) => {
    let inserted = false;
    setPoemSlips((prev) => {
      if (prev.some((p) => p.id === poem.id)) return prev;
      inserted = true;
      return [{ ...poem, source: 'manual' }, ...prev];
    });
    setPoemToast(inserted ? '已存入诗签本' : '这条诗签已在诗签本中');
  };

  const sharePoem = async (poem: PoemSlip) => {
    const text = `今日诗签\n${poem.text}`;
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title: '今日诗签', text });
        setPoemToast('已打开系统分享');
      } else {
        await navigator.clipboard.writeText(text);
        setPoemToast('诗签已复制，可直接粘贴分享');
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setPoemToast('系统分享不可用，已复制到剪贴板');
      } catch {
        setPoemToast('分享失败，请稍后再试');
      }
    }
  };

  const generateBookEcho = async (bookId: string) => {
    const target = books.find((b) => b.id === bookId);
    if (!target) return;
    const related = journalEntries.filter((j) => j.bookTitle === target.title);
    if (related.length === 0) {
      alert('这本书还没有可回放的批注记录。');
      return;
    }
    const notesText = related.map((j) => {
      const lines: string[] = [];
      if (j.quote) lines.push(`【高亮】${j.quote}`);
      if (j.userNote) lines.push(`【读者写】${j.userNote}`);
      if (j.chatHistory?.length) {
        j.chatHistory.forEach((m) =>
          lines.push(m.sender === 'user' ? `【读者问】${m.text}` : `【AI 说】${m.text}`)
        );
      } else if (j.aiResponse) {
        lines.push(`【AI 说】${j.aiResponse}`);
      }
      return lines.join('\n');
    }).join('\n\n');
    try {
      const basePrompt = buildEchoPrompt(target.title, notesText);
      const envelope = buildPromptEnvelope({
        taskType: 'summary',
        prompt: basePrompt,
        persona,
        memory: {
          channel: 'book-echo',
          bookTitle: target.title,
        },
      });
      const echo = await sendMessage(
        { messages: envelope.messages },
        { bypassChat: true, timeoutMs: 120000, taskType: 'summary' }
      );
      const updated: Book = {
        ...target,
        echoes: [{ id: createId(), content: echo.trim(), createdAt: Date.now() }, ...(target.echoes || [])],
      };
      handleUpdateBook(updated);
      rememberMilestone(`生成回声：${target.title}`, target.title);
      alert('已生成并保存到时光册。');
    } catch (e) {
      console.error(e);
      alert('生成回声失败，请稍后再试。');
    }
  };

  const handleOpenBook = (book: Book) => {
    setActiveBook(book);
    setActiveTab('reading');
  };

  const handleImportBook = (newBook: Book) => {
    setBooks(prev => [newBook, ...prev]);
  };

  const handleUpdateBook = (updatedBook: Book) => {
    setBooks(prev => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
    if (activeBook?.id === updatedBook.id) {
      setActiveBook(updatedBook);
    }
  };

  const handleDeleteBook = (id: string) => {
    setBooks(prev => prev.filter(b => b.id !== id));
    if (activeBook?.id === id) {
      setActiveBook(null);
      setActiveTab('bookshelf');
    }
  };

  const handleAddTaBook = (newBook: Book) => {
    setBooks(prev => [{ ...newBook, isTaRecommendation: true }, ...prev]);
  };

  const handleCreateBackup = (): BackupPayload => {
    const localStorageSnapshot: Record<string, string | null> = {};
    backupLocalStorageKeys.forEach((key) => {
      localStorageSnapshot[key] = localStorage.getItem(key);
    });

    return {
      version: 1,
      exportedAt: Date.now(),
      app: {
        books,
        journals: journalEntries,
        memos,
        persona,
        companionName,
        companionAvatar,
        startDate,
        readingTime,
      },
      localStorageSnapshot,
    };
  };

  const handleRestoreBackup = (payload: BackupPayload) => {
    if (!payload || payload.version !== 1 || !payload.app) {
      throw new Error('备份文件格式不正确');
    }

    const restoredBooks = Array.isArray(payload.app.books) ? payload.app.books : [];
    const restoredJournals = Array.isArray(payload.app.journals) ? dedupeJournals(payload.app.journals) : [];
    const restoredMemos = Array.isArray(payload.app.memos) ? payload.app.memos : [];

    setBooks(restoredBooks);
    setJournalEntries(restoredJournals);
    setMemos(restoredMemos);
    setPersona(payload.app.persona || DEFAULT_PERSONA);
    setCompanionName(payload.app.companionName || '你的恋人');
    setCompanionAvatar(payload.app.companionAvatar || '');
    setReadingTime(Number.isFinite(payload.app.readingTime) ? payload.app.readingTime : 0);

    localStorage.setItem('app_books', JSON.stringify(restoredBooks));
    localStorage.setItem('app_journals', JSON.stringify(restoredJournals));
    localStorage.setItem('app_memos', JSON.stringify(restoredMemos));
    localStorage.setItem('app_persona', payload.app.persona || DEFAULT_PERSONA);
    localStorage.setItem('app_companionName', payload.app.companionName || '你的恋人');
    localStorage.setItem('app_companionAvatar', payload.app.companionAvatar || '');
    localStorage.setItem('app_readingTime', String(Number.isFinite(payload.app.readingTime) ? payload.app.readingTime : 0));
    localStorage.setItem('app_startDate', String(Number.isFinite(payload.app.startDate) ? payload.app.startDate : Date.now()));

    if (payload.localStorageSnapshot && typeof payload.localStorageSnapshot === 'object') {
      backupLocalStorageKeys.forEach((key) => {
        const value = payload.localStorageSnapshot[key];
        if (typeof value === 'string') {
          localStorage.setItem(key, value);
        }
      });
    }
  };

  return (
    <div className="h-screen w-full bg-[#f3f4f6] flex justify-center items-center font-sans overflow-hidden">
      {/* Mobile Frame Container */}
      <div className="w-full h-full sm:h-[850px] sm:w-[400px] sm:rounded-[3rem] sm:border-[8px] sm:border-[#e5e0d8] sm:shadow-2xl bg-[#fdfbf7] relative flex flex-col overflow-hidden">
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden relative">
          {activeTab === 'bookshelf' && (
            <Bookshelf 
              books={books} 
              onOpenBook={handleOpenBook} 
              onImportBook={handleImportBook} 
              onDeleteBook={handleDeleteBook}
              onUpdateBook={handleUpdateBook}
            />
          )}
          {activeTab === 'reading' && activeBook && (
            <ReadingArea 
              book={activeBook} 
              journalEntries={journalEntries}
              onBack={() => setActiveTab('bookshelf')} 
              onUpdateBook={handleUpdateBook}
              onImportBook={handleImportBook}
              onSaveJournal={(entry) => setJournalEntries(prev => {
                if (prev.some(existing => isDuplicateUserNote(entry, existing))) {
                  return prev;
                }
                return dedupeJournals([entry, ...prev]);
              })}
              onUpdateJournal={(entry) => setJournalEntries(prev => {
                const next = prev.map(e => e.id === entry.id ? entry : e);
                return dedupeJournals(next);
              })}
              companionName={companionName}
              companionAvatar={companionAvatar}
              taReadingProgress={getTaReadingProgress(activeBook)}
              onShare={(text) => {
                // Logic to open chat and send message
                const userMsg: Message = {
                  id: createId(),
                  sender: 'user',
                  text: text,
                  timestamp: Date.now(),
                };
                setMessages(prev => [...prev, userMsg]);
                rememberUserInput({
                  source: 'share_quote',
                  text,
                  bookTitle: activeBook?.title,
                  channel: 'app-share',
                });
                // Trigger AI response
                const envelope = buildPromptEnvelope({
                  taskType: 'chat',
                  prompt: text,
                  persona,
                  memory: {
                    channel: 'app-share',
                    bookTitle: activeBook?.title,
                  },
                });
                sendMessage({ messages: envelope.messages }, { taskType: 'chat' }).then(res => {
                  const aiMsg: Message = {
                    id: createId(),
                    sender: 'ai',
                    text: res,
                    timestamp: Date.now(),
                  };
                  setMessages(prev => [...prev, aiMsg]);
                  rememberConversationTurn({
                    channel: 'app-share',
                    userText: text,
                    aiText: res,
                    bookTitle: activeBook?.title,
                  });
                }).catch(err => console.error(err));
              }}
            />
          )}
          {activeTab === 'companion' && (
            <Companion 
              persona={persona} 
              setPersona={setPersona} 
              journalEntries={journalEntries} 
              memos={memos}
              setMemos={setMemos}
              onUpdateJournal={(entry) => setJournalEntries(prev => {
                const next = prev.map(e => e.id === entry.id ? entry : e);
                return dedupeJournals(next);
              })}
              onDeleteJournal={(id) => setJournalEntries(prev => prev.filter(e => e.id !== id))}
              onAddTaBook={handleAddTaBook}
              companionName={companionName}
              setCompanionName={setCompanionName}
              companionAvatar={companionAvatar}
              setCompanionAvatar={setCompanionAvatar}
              startDate={startDate}
              readingTime={readingTime}
              books={books}
              poemSlips={poemSlips}
              onDeletePoemSlip={(id) => setPoemSlips((prev) => prev.filter((p) => p.id !== id))}
              onGenerateBookEcho={generateBookEcho}
              onCreateBackup={handleCreateBackup}
              onRestoreBackup={handleRestoreBackup}
            />
          )}
        </main>

        {(activeTab === 'bookshelf' || activeTab === 'reading') && todayPoem && (
          <div
            ref={poemWidgetRef}
            className="absolute z-30"
            style={{
              left: `calc(50% + ${poemPosition.x}px)`,
              top: `${64 + poemPosition.y}px`,
              transform: 'translateX(-50%)',
            }}
          >
            <AnimatePresence mode="wait">
              {!poemCollapsed || poemExpanded ? (
                <motion.div
                  key="poem-card"
                  initial={{ opacity: 0, y: -16, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  className="bg-white/95 backdrop-blur-md border border-[#e5e0d8] shadow-xl rounded-2xl px-4 py-3 min-w-[250px] max-w-[320px]"
                  onClick={() => {
                    if (poemLongPressTriggeredRef.current) {
                      poemLongPressTriggeredRef.current = false;
                      return;
                    }
                    setPoemExpanded((v) => !v);
                  }}
                  onMouseDown={() => {
                    poemLongPressTriggeredRef.current = false;
                    poemLongPressTimerRef.current = window.setTimeout(() => {
                      poemLongPressTriggeredRef.current = true;
                      savePoemToNotebook(todayPoem);
                    }, 700);
                  }}
                  onMouseUp={() => {
                    if (poemLongPressTimerRef.current) window.clearTimeout(poemLongPressTimerRef.current);
                  }}
                  onTouchStart={() => {
                    poemLongPressTriggeredRef.current = false;
                    poemLongPressTimerRef.current = window.setTimeout(() => {
                      poemLongPressTriggeredRef.current = true;
                      savePoemToNotebook(todayPoem);
                    }, 700);
                  }}
                  onTouchEnd={() => {
                    if (poemLongPressTimerRef.current) window.clearTimeout(poemLongPressTimerRef.current);
                  }}
                >
                  <div className="flex items-center gap-2 text-[#8E2A2A] text-xs font-serif mb-1"><Feather size={13} /> 今日诗签</div>
                  <div className="text-sm font-serif text-[#2c2826] leading-relaxed">{todayPoem.text}</div>
                  {poemExpanded && (
                    <div className="flex justify-end gap-2 mt-3">
                      <button onClick={(e) => { e.stopPropagation(); savePoemToNotebook(todayPoem); }} className="px-2 py-1 text-xs rounded-lg bg-[#f4ecd8] text-[#8E2A2A] flex items-center gap-1"><Bookmark size={12} /> 保存</button>
                      <button onClick={(e) => { e.stopPropagation(); sharePoem(todayPoem); }} className="px-2 py-1 text-xs rounded-lg bg-[#8E2A2A] text-white flex items-center gap-1"><Share2 size={12} /> 分享</button>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.button
                  key="poem-fab"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.22 }}
                  onClick={() => setPoemCollapsed(false)}
                  onMouseDown={(e) => {
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const base = { ...poemPosition };
                    const move = (ev: MouseEvent) => {
                      setPoemPosition({
                        x: Math.max(-140, Math.min(140, base.x + (ev.clientX - startX))),
                        y: Math.max(-80, Math.min(420, base.y + (ev.clientY - startY))),
                      });
                    };
                    const up = () => {
                      window.removeEventListener('mousemove', move);
                      window.removeEventListener('mouseup', up);
                    };
                    window.addEventListener('mousemove', move);
                    window.addEventListener('mouseup', up);
                  }}
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    if (!touch) return;
                    const startX = touch.clientX;
                    const startY = touch.clientY;
                    const base = { ...poemPosition };
                    const move = (ev: TouchEvent) => {
                      const t = ev.touches[0];
                      if (!t) return;
                      setPoemPosition({
                        x: Math.max(-140, Math.min(140, base.x + (t.clientX - startX))),
                        y: Math.max(-80, Math.min(420, base.y + (t.clientY - startY))),
                      });
                    };
                    const end = () => {
                      window.removeEventListener('touchmove', move);
                      window.removeEventListener('touchend', end);
                    };
                    window.addEventListener('touchmove', move, { passive: true });
                    window.addEventListener('touchend', end);
                  }}
                  className="w-10 h-10 rounded-full bg-white border border-[#e5e0d8] shadow-md text-[#8E2A2A] flex items-center justify-center"
                  title="拖动可调整位置"
                >
                  <Feather size={16} />
                </motion.button>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {!!poemToast && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.2 }}
                  className="mt-2 text-center text-[11px] text-white bg-[#8E2A2A] px-3 py-1 rounded-full shadow"
                >
                  {poemToast}
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {!!anniversaryToast && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mt-2 max-w-[320px] text-[12px] leading-relaxed text-[#5a4a3a] bg-[#fff7ea] border border-[#ecdcc4] px-3 py-2 rounded-xl shadow"
                >
                  {anniversaryToast}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Bottom Navigation Bar (Hidden when reading) */}
        {activeTab !== 'reading' && (
          <nav className="flex-none h-20 bg-[#fdfbf7]/90 backdrop-blur-md border-t border-[#e5e0d8] px-6 pb-4 pt-2 flex justify-between items-center z-20">
            <button 
              onClick={() => setActiveTab('bookshelf')}
              className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'bookshelf' ? 'text-[#8E2A2A]' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Library size={24} strokeWidth={activeTab === 'bookshelf' ? 2.5 : 2} />
              <span className="text-[10px] font-serif font-medium">书架</span>
            </button>
            
            <button 
              onClick={() => {
                if (activeBook) {
                  setActiveTab('reading');
                } else if (books.length > 0) {
                  // Open the first book or last read book
                  setActiveBook(books[0]);
                  setActiveTab('reading');
                }
              }}
              className="flex flex-col items-center gap-1 transition-colors text-gray-400 hover:text-gray-600"
            >
              <div className="w-12 h-12 -mt-6 rounded-full flex items-center justify-center shadow-lg bg-white text-gray-400 border border-[#e5e0d8]">
                <BookOpen size={24} strokeWidth={2} />
              </div>
              <span className="text-[10px] font-serif font-medium">阅读</span>
            </button>

            <button 
              onClick={() => setActiveTab('companion')}
              className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'companion' ? 'text-[#8E2A2A]' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Heart size={24} strokeWidth={activeTab === 'companion' ? 2.5 : 2} />
              <span className="text-[10px] font-serif font-medium">恋人</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}

