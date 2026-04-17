import React, { useState, useEffect, useRef } from 'react';
import { Message, Book } from '../types';
import { MessageCircleHeart, ChevronLeft, Settings, Heart, X, Type, Moon, Sun, Coffee, Bookmark, PenTool, MessageCircle, List, Send, Loader2 } from 'lucide-react';
import { sendMessage } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import ChatArea from './ChatArea';
import { Annotation } from '../types';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { isChapterTitleLine } from '../utils/chapter';

interface ReadingAreaProps {
  book: Book;
  journalEntries: import('../types').JournalEntry[];
  onBack: () => void;
  onUpdateBook: (book: Book) => void;
  onImportBook: (book: Book) => void;
  onShare: (text: string) => void;
  onSaveJournal: (entry: import('../types').JournalEntry) => void;
  onUpdateJournal?: (entry: import('../types').JournalEntry) => void;
  companionName: string;
  companionAvatar: string;
}

type Theme = 'light' | 'dark' | 'sepia';

export default function ReadingArea({ 
  book, 
  journalEntries, 
  onBack, 
  onUpdateBook, 
  onImportBook, 
  onShare, 
  onSaveJournal,
  onUpdateJournal,
  companionName,
  companionAvatar
}: ReadingAreaProps) {
  const [selectedText, setSelectedText] = useState('');
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]); // Internal messages for this session
  const [activeJournalId, setActiveJournalId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [activeQuote, setActiveQuote] = useState('');
  const [activeParagraphIdx, setActiveParagraphIdx] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showBookmarkToast, setShowBookmarkToast] = useState(false);
  const [showTaNote, setShowTaNote] = useState(book.isTaRecommendation && !book.hasSeenNote);
  const [expandedParagraph, setExpandedParagraph] = useState<string | null>(null);
  const [replyingToNoteId, setReplyingToNoteId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const hasBookmark = book.lastReadPosition !== undefined && book.lastReadPosition > 0;
  const lastScrollTopRef = useRef(0);
  const formatBookmarkTime = (timestamp?: number) => {
    if (!timestamp) return '';
    try {
      return new Date(timestamp).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const handleInlineReply = async (noteId: string, quote: string, existingHistory: Message[] = []) => {
    if (!replyText.trim() || !onUpdateJournal) return;
    setIsReplying(true);

    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: replyText, timestamp: Date.now() };
    const updatedHistory = [...existingHistory, userMsg];

    // Optimistic update
    const entry = journalEntries.find(e => e.id === noteId);
    if (entry) {
      onUpdateJournal({ ...entry, chatHistory: updatedHistory });
    }

    try {
      const prompt = `我在读《${book.title}》时，关于这句话：“${quote}”，我回复了你：“${replyText}”。请你作为一个恋人，给我回一条简短、深情且有共鸣的留言。`;
      const response = await sendMessage(prompt);
      const aiMsg: Message = { id: Date.now().toString(), sender: 'ai', text: response, timestamp: Date.now() };
      
      if (entry) {
        onUpdateJournal({ ...entry, chatHistory: [...updatedHistory, aiMsg] });
      }
    } catch (error) {
      console.error('Inline reply failed:', error);
    } finally {
      setIsReplying(false);
      setReplyText('');
      setReplyingToNoteId(null);
    }
  };
  const [showTOC, setShowTOC] = useState(false);
  const [readingProgress, setReadingProgress] = useState(book.progress || 0);
  
  // Reading Settings
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('reading_fontSize');
    return saved ? parseInt(saved, 10) : 18;
  });
  const [lineHeight, setLineHeight] = useState(() => {
    const saved = localStorage.getItem('reading_lineHeight');
    return saved ? parseFloat(saved) : 1.8;
  });
  const [paragraphSpacing, setParagraphSpacing] = useState(() => {
    const saved = localStorage.getItem('reading_paragraphSpacing');
    return saved ? parseInt(saved, 10) : 24;
  });
  const [aiFrequency, setAiFrequency] = useState(() => {
    const saved = localStorage.getItem('reading_aiFrequency');
    return saved ? parseFloat(saved) : 0.3;
  });
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('reading_theme');
    return (saved as Theme) || 'light';
  });

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('reading_fontSize', fontSize.toString());
    localStorage.setItem('reading_lineHeight', lineHeight.toString());
    localStorage.setItem('reading_paragraphSpacing', paragraphSpacing.toString());
    localStorage.setItem('reading_aiFrequency', aiFrequency.toString());
    localStorage.setItem('reading_theme', theme);
  }, [fontSize, lineHeight, paragraphSpacing, aiFrequency, theme]);

  // Proactive AI Notes
  useEffect(() => {
    if (!book.content || isChatOpen || aiFrequency === 0) return;

    const triggerProactiveNote = async () => {
      if (!scrollRef.current) return;
      
      const paragraphs = book.content.split('\n\n');
      
      // Estimate current visible paragraph index based on scroll position
      const scrollRatio = scrollRef.current.scrollTop / Math.max(1, scrollRef.current.scrollHeight);
      const estimatedCurrentIdx = Math.floor(scrollRatio * paragraphs.length);
      
      // Pick a paragraph near the current view (within +/- 2 paragraphs)
      const offset = Math.floor(Math.random() * 5) - 2;
      const targetIdx = Math.max(0, Math.min(paragraphs.length - 1, estimatedCurrentIdx + offset));
      const paragraph = paragraphs[targetIdx];
      
      if (!paragraph || paragraph.length < 20) return; // Skip very short paragraphs

      try {
        const response = await sendMessage(`我们正在读这段话：“${paragraph.substring(0, 100)}...”。请你作为一个恋人，针对这段话或者其中的某个点，写一条简短的、充满情感的批注（50字以内）。`);
        
        const newEntry: import('../types').JournalEntry = {
          id: Date.now().toString(),
          bookTitle: book.title,
          quote: paragraph.substring(0, Math.min(paragraph.length, 30)), // Simplified quote
          aiResponse: response,
          date: Date.now(),
          paragraphIdx: targetIdx,
        };
        
        onSaveJournal(newEntry);
      } catch (error) {
        console.error('Proactive note failed:', error);
      }
    };

    // Trigger based on frequency (check every 15 seconds)
    // Higher frequency = higher chance to trigger
    const timer = setInterval(() => {
      if (Math.random() < aiFrequency * 0.5) { // Max 50% chance every 15s if frequency is 1.0
        triggerProactiveNote();
      }
    }, 15000);

    return () => clearInterval(timer);
  }, [book.id, isChatOpen, aiFrequency]);

  // Sync messages to active journal entry
  useEffect(() => {
    if (activeJournalId && messages.length > 0 && onUpdateJournal) {
      const entry = journalEntries.find(e => e.id === activeJournalId);
      if (entry) {
        onUpdateJournal({ ...entry, chatHistory: messages });
      }
    }
  }, [messages, activeJournalId]);

  // Restore scroll position on mount
  useEffect(() => {
    if (!scrollRef.current || !hasBookmark) return;
    const target = book.lastReadPosition || 0;
    // Wait for layout to settle before restoring to avoid missing position on remount.
    const rafId = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = target;
        lastScrollTopRef.current = target;
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [book.id, book.lastReadPosition, hasBookmark]);

  // Auto-save on unmount
  useEffect(() => {
    const handleScroll = () => {
      if (scrollRef.current) {
        const currentPos = scrollRef.current.scrollTop;
        lastScrollTopRef.current = currentPos;
        const { scrollHeight, clientHeight } = scrollRef.current;
        const progress = scrollHeight > clientHeight 
          ? Math.round((currentPos / (scrollHeight - clientHeight)) * 100) 
          : 100;
        setReadingProgress(progress);
      }
    };

    const scrollEl = scrollRef.current;
    if (scrollEl) {
      scrollEl.addEventListener('scroll', handleScroll);
    }

    return () => {
      if (scrollEl) {
        scrollEl.removeEventListener('scroll', handleScroll);
        const currentPos = Math.max(lastScrollTopRef.current, scrollEl.scrollTop);
        if (currentPos <= 0 && (book.lastReadPosition || 0) > 0) {
          // Avoid overriding a valid bookmark with 0 during fast route transitions.
          return;
        }
        const { scrollHeight, clientHeight } = scrollEl;
        const progress = scrollHeight > clientHeight 
          ? Math.round((currentPos / (scrollHeight - clientHeight)) * 100) 
          : 100;
        onUpdateBook({
          ...book,
          lastReadPosition: currentPos,
          progress: Math.min(100, progress)
        });
      }
    };
  }, [book.id]);

  const paragraphs = book.content ? book.content.split('\n').filter(p => p.trim().length > 0) : [];
  const fallbackQuoteParagraphIndex = React.useMemo(() => {
    const result = new Map<string, number>();
    const entries = journalEntries.filter(e => e.bookTitle === book.title && e.paragraphIdx === undefined);
    for (const entry of entries) {
      const quote = (entry.quote || '').trim();
      if (!quote) continue;
      const firstMatchIdx = paragraphs.findIndex((p) => p.includes(quote));
      if (firstMatchIdx >= 0) {
        result.set(entry.id, firstMatchIdx);
      }
    }
    return result;
  }, [journalEntries, book.title, paragraphs]);
  const chapters = React.useMemo(() => {
    const extractedChapters: { title: string, index: number }[] = [];

    const normalizeLine = (raw: string) => raw.trim().replace(/\s+/g, ' ');

    paragraphs.forEach((p, idx) => {
      const text = normalizeLine(p);
      if (!isChapterTitleLine(text)) return;
      extractedChapters.push({ title: text, index: idx });
    });

    // Fallback: if nothing matched, chunk by length so TOC is still usable.
    if (extractedChapters.length === 0 && paragraphs.length > 0) {
      for (let i = 0; i < paragraphs.length; i += 30) {
        extractedChapters.push({ title: `片段 ${Math.floor(i / 30) + 1}`, index: i });
      }
    }

    // Deduplicate consecutive identical titles (can happen with repeated headers).
    const deduped: { title: string; index: number }[] = [];
    for (const c of extractedChapters) {
      const prev = deduped[deduped.length - 1];
      if (prev && prev.title === c.title) continue;
      deduped.push(c);
    }
    return deduped;
  }, [paragraphs]);
  
  const jumpToChapter = (index: number) => {
    if (scrollRef.current) {
      const paragraphs = scrollRef.current.querySelectorAll('.reading-paragraph');
      if (paragraphs[index]) {
        paragraphs[index].scrollIntoView({ behavior: 'smooth' });
        setShowTOC(false);
      }
    }
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
  };

  const getCurrentParagraphIdx = () => {
    if (!scrollRef.current) return 0;
    const paragraphNodes = Array.from(scrollRef.current.querySelectorAll('[data-paragraph-idx]')) as HTMLElement[];
    if (paragraphNodes.length === 0) return 0;
    const scrollTop = scrollRef.current.scrollTop;
    let currentIdx = 0;
    for (const node of paragraphNodes) {
      const idx = parseInt(node.dataset.paragraphIdx || '0', 10);
      if (node.offsetTop <= scrollTop + 12) {
        currentIdx = idx;
      } else {
        break;
      }
    }
    return currentIdx;
  };

  const getChapterTitleByParagraphIdx = (paragraphIdx: number) => {
    if (!chapters.length) return '未命名章节';
    let currentChapter = chapters[0];
    for (const chapter of chapters) {
      if (chapter.index <= paragraphIdx) {
        currentChapter = chapter;
      } else {
        break;
      }
    }
    return currentChapter?.title || '未命名章节';
  };

  const handleSaveBookmark = () => {
    if (!scrollRef.current) return;
    const currentPos = scrollRef.current.scrollTop;
    lastScrollTopRef.current = currentPos;
    const { scrollHeight, clientHeight } = scrollRef.current;
    const progress = scrollHeight > clientHeight 
      ? Math.round((currentPos / (scrollHeight - clientHeight)) * 100) 
      : 100;

    const currentParagraphIdx = getCurrentParagraphIdx();
    const bookmarkChapter = getChapterTitleByParagraphIdx(currentParagraphIdx);

    onUpdateBook({
      ...book,
      lastReadPosition: currentPos,
      progress: Math.min(100, progress),
      bookmarkAt: Date.now(),
      bookmarkChapter
    });
    setShowBookmarkToast(true);
    setTimeout(() => setShowBookmarkToast(false), 2000);
  };

  const persistReadingPosition = () => {
    if (!scrollRef.current) return;
    const currentPos = Math.max(lastScrollTopRef.current, scrollRef.current.scrollTop);
    if (currentPos <= 0 && (book.lastReadPosition || 0) > 0) return;
    const { scrollHeight, clientHeight } = scrollRef.current;
    const progress = scrollHeight > clientHeight
      ? Math.round((currentPos / (scrollHeight - clientHeight)) * 100)
      : 100;
    const currentParagraphIdx = getCurrentParagraphIdx();
    const bookmarkChapter = getChapterTitleByParagraphIdx(currentParagraphIdx);
    onUpdateBook({
      ...book,
      lastReadPosition: currentPos,
      progress: Math.min(100, progress),
      bookmarkAt: book.bookmarkAt || Date.now(),
      bookmarkChapter: book.bookmarkChapter || bookmarkChapter
    });
  };

  const handleBack = () => {
    // Save once more before leaving reading page, avoids missing bookmark on fast transitions.
    persistReadingPosition();
    onBack();
  };

  const closeTaNote = () => {
    setShowTaNote(false);
    onUpdateBook({ ...book, hasSeenNote: true });
  };

  const handleSelection = () => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        const text = selection.toString().trim();
        setSelectedText(text);
        
        // Find paragraph index
        const anchorElement = selection.anchorNode?.parentElement;
        const paragraphEl = anchorElement?.closest('[data-paragraph-idx]');
        if (paragraphEl) {
          setActiveParagraphIdx(parseInt(paragraphEl.getAttribute('data-paragraph-idx') || '0', 10));
        }

        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          setSelectionPos({
            x: rect.left + rect.width / 2,
            y: rect.top - 40,
          });
        } catch (e) {
          // Fallback if getRangeAt fails
          setSelectionPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        }
      } else {
        setSelectedText('');
        setActiveParagraphIdx(null);
        setSelectionPos(null);
      }
    }, 100); // Small delay for mobile selection to settle
  };

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelection);
    return () => {
      document.removeEventListener('selectionchange', handleSelection);
    };
  }, []);

  const handleAddManualNote = () => {
    const quoteToUse = activeQuote || selectedText;
    if (!quoteToUse || !noteText.trim()) return;
    const resolvedParagraphIdx = activeParagraphIdx ?? getCurrentParagraphIdx();

    const newJournalId = Date.now().toString();
    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: noteText, timestamp: Date.now() };

    // Optimistically save journal with just user note
    onSaveJournal({
      id: newJournalId,
      quote: quoteToUse,
      userNote: noteText,
      aiResponse: '...', // Placeholder until AI replies
      date: Date.now(),
      bookTitle: book.title,
      chatHistory: [userMsg],
      paragraphIdx: resolvedParagraphIdx
    });
    
    // Trigger AI response to the user's note
    const triggerAiReply = async () => {
      try {
        const prompt = `我在读《${book.title}》时，看到这句话：“${quoteToUse}”。我写下了这段批注：“${noteText}”。请你作为一个恋人，针对我的批注或者这段话，给我回一条简短、深情且有共鸣的留言（50字以内）。`;
        const response = await sendMessage(prompt);
        const aiMsg: Message = { id: Date.now().toString(), sender: 'ai', text: response, timestamp: Date.now() };
        
        if (onUpdateJournal) {
          onUpdateJournal({
            id: newJournalId,
            quote: quoteToUse,
            userNote: noteText,
            aiResponse: response,
            date: Date.now(),
            bookTitle: book.title,
            chatHistory: [userMsg, aiMsg],
            paragraphIdx: resolvedParagraphIdx
          });
        }
      } catch (error) {
        console.error('AI reply to note failed:', error);
        if (onUpdateJournal) {
          onUpdateJournal({
            id: newJournalId,
            quote: quoteToUse,
            userNote: noteText,
            aiResponse: '（TA 暂时走神了，没有回复）',
            date: Date.now(),
            bookTitle: book.title,
            chatHistory: [userMsg],
            paragraphIdx: resolvedParagraphIdx
          });
        }
      }
    };

    triggerAiReply();

    setNoteText('');
    setShowNoteInput(false);
    setSelectionPos(null);
    setSelectedText('');
    setActiveQuote('');
  };

  const handleShareSelection = async () => {
    const quote = activeQuote || selectedText;
    if (!quote) return;
    
    setIsChatOpen(true);
    setSelectionPos(null);
    setSelectedText('');
    setActiveQuote('');
    window.getSelection()?.removeAllRanges();

    const ctxIdx = activeParagraphIdx ?? getCurrentParagraphIdx();
    const prev = paragraphs[Math.max(0, ctxIdx - 1)] || '';
    const cur = paragraphs[ctxIdx] || '';
    const next = paragraphs[Math.min(paragraphs.length - 1, ctxIdx + 1)] || '';
    const contextBlock = [prev, cur, next].filter(Boolean).join('\n\n');

    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: `我划线了这句话：“${quote}”`, timestamp: Date.now() };
    setMessages([userMsg]);

    try {
      const res = await sendMessage(
        `我在读《${book.title}》时划线了这句话：“${quote}”。\n\n为了给你更多语境，这里是这一段及上下文（上一段/本段/下一段）：\n${contextBlock}\n\n请你作为一个恋人，针对这句话写一条简短、深情的留言（50字以内）。`
      );
      const aiMsg: Message = { id: (Date.now() + 1).toString(), sender: 'ai', text: res, timestamp: Date.now() };
      setMessages(prev => [...prev, aiMsg]);
      
      // “分享给 TA”仅用于阅读聊天，不写入情绪手账
    } catch (e) {
      console.error(e);
    }
  };

  const getThemeStyles = () => {
    switch (theme) {
      case 'dark': return 'bg-[#1a1a1a] text-[#e5e5e5]';
      case 'sepia': return 'bg-[#f4ecd8] text-[#5b4636]';
      case 'light': default: return 'bg-paper text-[#3a3532]';
    }
  };

  return (
    <div className={`relative h-full w-full flex flex-col overflow-hidden transition-colors duration-300 ${getThemeStyles()}`}>
      {/* Top Bar */}
      <div className={`flex flex-col z-10 sticky top-0 transition-colors duration-300 ${theme === 'dark' ? 'bg-[#1a1a1a]/90' : theme === 'sepia' ? 'bg-[#f4ecd8]/90' : 'bg-[#fdfbf7]/90'} backdrop-blur-md border-b ${theme === 'dark' ? 'border-gray-800' : 'border-[#e5e0d8]'}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleBack} className="p-2 text-gray-500 hover:bg-gray-200/50 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
          <span className="text-sm font-serif font-medium text-gray-400 tracking-widest truncate max-w-[150px]">{book.title}</span>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowTOC(true)}
              className="p-2 text-gray-500 hover:bg-gray-200/50 rounded-full transition-colors"
              title="目录"
            >
              <List size={20} />
            </button>
            <button 
              onClick={handleSaveBookmark}
              className="p-2 text-[#8E2A2A] hover:bg-gray-200/50 rounded-full transition-colors relative"
            >
              <Bookmark size={20} fill={hasBookmark ? "currentColor" : "none"} />
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-500 hover:bg-gray-200/50 rounded-full transition-colors"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
        {hasBookmark && (
          <div className="px-4 pb-2 text-[11px] font-serif text-[#8E2A2A]/80 flex items-center gap-2 truncate">
            <Bookmark size={12} fill="currentColor" />
            <span className="truncate">书签：{book.bookmarkChapter || '未命名章节'}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">{formatBookmarkTime(book.bookmarkAt) || '刚刚'}</span>
          </div>
        )}
        {/* Progress Bar */}
        <div className="h-[2px] w-full bg-gray-200/30">
          <motion.div 
            className="h-full bg-[#8E2A2A]"
            initial={{ width: 0 }}
            animate={{ width: `${readingProgress}%` }}
            transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
          />
        </div>
      </div>

      {/* Bookmark Toast */}
      <AnimatePresence>
        {showBookmarkToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-[#8E2A2A] text-white px-4 py-2 rounded-full shadow-lg z-50 flex items-center gap-2 text-sm font-medium"
          >
            <Bookmark size={16} fill="currentColor" />
            已保存书签：{book.bookmarkChapter || '当前章节'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Presence Stardust */}
      <div className="absolute top-16 right-6 z-20 pointer-events-none">
        <motion.div 
          animate={{ 
            opacity: isChatOpen ? [0.8, 1, 0.8] : [0.2, 0.6, 0.2],
            scale: isChatOpen ? [1, 1.5, 1] : [1, 1.2, 1],
            boxShadow: isChatOpen 
              ? ['0 0 4px 1px rgba(229,229,229,0.8)', '0 0 12px 3px rgba(229,229,229,1)', '0 0 4px 1px rgba(229,229,229,0.8)']
              : ['0 0 2px 0px rgba(229,229,229,0.5)', '0 0 4px 1px rgba(229,229,229,0.8)', '0 0 2px 0px rgba(229,229,229,0.5)']
          }}
          transition={{ duration: isChatOpen ? 1.5 : 4, repeat: Infinity, ease: "easeInOut" }}
          className="w-1 h-1 rounded-full bg-[#e5e5e5]"
        />
      </div>

      {/* Reading Content */}
      <div 
        ref={scrollRef}
        className={`flex-1 overflow-y-auto px-6 sm:px-12 pb-32 scroll-smooth transition-all duration-700 ${isChatOpen ? 'blur-sm scale-[0.98] opacity-60' : ''}`}
        onMouseUp={handleSelection}
        onTouchEnd={handleSelection}
        onScroll={handleScroll}
      >
        <div className="max-w-2xl mx-auto pt-12">
          <h1 className={`text-3xl sm:text-4xl font-serif font-black mb-16 text-center tracking-wide leading-tight ${theme === 'dark' ? 'text-gray-200' : 'text-[#2c2826]'}`}>{book.title}</h1>
          <div 
            className="prose prose-lg font-serif tracking-wide transition-all duration-300 drop-cap text-justify relative"
            style={{ 
              fontSize: `${fontSize}px`, 
              lineHeight: lineHeight,
              color: 'inherit' 
            }}
          >
            {/* Visual Bookmark Marker */}
            {hasBookmark && (
              <div 
                className="absolute left-[-60px] right-[-60px] border-t border-dashed border-[#8E2A2A]/30 flex justify-end"
                style={{ top: `${Math.max(2, Math.min(98, book.progress || 0))}%` }}
              >
                <div className="flex items-center gap-1 -mt-3 bg-paper px-2 text-[#8E2A2A]/60">
                  <Bookmark size={12} fill="currentColor" />
                  <span className="text-[10px] font-serif">上次阅读至此</span>
                </div>
              </div>
            )}

            {book.content ? (
              paragraphs.map((paragraph, idx) => {
                // Find chat-based annotations
                const chatNotes = journalEntries.filter(entry => {
                  if (entry.bookTitle !== book.title) return false;
                  if (entry.paragraphIdx !== undefined) return entry.paragraphIdx === idx;
                  return fallbackQuoteParagraphIndex.get(entry.id) === idx;
                });

                // Find manual annotations
                const manualNotes = (book.annotations || []).filter(ann => ann.paragraphIdx === idx);

                const allNotes = [
                  ...chatNotes.map(n => ({ 
                    id: n.id, 
                    text: n.quote, 
                    kind: 'journal' as const,
                    userNote: n.userNote,
                    aiResponse: n.aiResponse,
                    sender: (n.userNote ? 'user' : 'ai') as const,
                    chatHistory: n.chatHistory,
                  })),
                  ...manualNotes.map(n => ({ id: n.id, text: n.text, kind: 'manual' as const, comment: n.comment, sender: n.sender, chatHistory: undefined }))
                ];

                // Highlight the annotated text within the paragraph
                let renderedParts: React.ReactNode[] = [paragraph];
                if (allNotes.length > 0) {
                  allNotes.forEach(note => {
                    const newParts: React.ReactNode[] = [];
                    renderedParts.forEach((part, pIdx) => {
                      if (typeof part === 'string') {
                        // If the note text is longer than the paragraph, we just highlight the whole paragraph
                        const matchText = note.text.includes(paragraph) ? paragraph : note.text;
                        const firstIdx = part.indexOf(matchText);
                        if (firstIdx === -1) {
                          newParts.push(part);
                        } else {
                          const before = part.slice(0, firstIdx);
                          const after = part.slice(firstIdx + matchText.length);
                          newParts.push(before);
                          newParts.push(
                            <React.Fragment key={`${note.id}-first`}>
                              <span 
                                className="note-highlight relative cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const selection = window.getSelection()?.toString();
                                  if (!selection) {
                                    // Use paragraph-scoped key to avoid "one click opens multiple notes"
                                    const key = `${idx}:${note.id}`;
                                    setExpandedParagraph(expandedParagraph === key ? null : key);
                                  }
                                }}
                              >
                                {matchText}
                              </span>
                              {/* Inline Expandable Note */}
                              <AnimatePresence>
                                {expandedParagraph === `${idx}:${note.id}` && (
                                  <motion.div 
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="block w-full overflow-hidden my-3"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="p-4 bg-[#f4ecd8]/60 rounded-2xl border border-[#e5e0d8] shadow-inner">
                                      <div className="flex flex-col gap-3">
                                        {(() => {
                                          const firstSender =
                                            (note as any).chatHistory?.[0]?.sender ||
                                            ((note as any).userNote ? 'user' : 'ai') ||
                                            note.sender;
                                          const topLabel = firstSender === 'user' ? '我的批注' : 'TA 的批注';
                                          return (
                                            <div className="flex items-center gap-2">
                                              {firstSender === 'user' ? (
                                                <div className="w-6 h-6 rounded-full bg-[#8E2A2A]/10 flex items-center justify-center text-[#8E2A2A]">
                                                  <PenTool size={12} />
                                                </div>
                                              ) : (
                                                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[#8E2A2A] shadow-sm">
                                                  <Heart size={12} fill="currentColor" />
                                                </div>
                                              )}
                                              <span className="text-xs font-serif font-bold text-gray-500">
                                                {topLabel}
                                              </span>
                                            </div>
                                          );
                                        })()}
                                        <div className="pl-8 font-serif text-sm text-[#2c2826] leading-relaxed">
                                          {/* Always show the original note content (not replaced by replies). */}
                                          {note.kind === 'journal' ? (
                                            (() => {
                                              const firstSender =
                                                note.chatHistory?.[0]?.sender ||
                                                (note.userNote ? 'user' : 'ai');
                                              const blocks: Array<{ owner: 'user' | 'ai'; content: string }> = [];
                                              if (note.userNote && note.userNote.trim()) {
                                                blocks.push({ owner: 'user', content: note.userNote });
                                              }
                                              if (note.aiResponse && note.aiResponse.trim() && note.aiResponse !== '...') {
                                                blocks.push({ owner: 'ai', content: note.aiResponse });
                                              }
                                              const userBlock = blocks.find((b) => b.owner === 'user');
                                              const aiBlock = blocks.find((b) => b.owner === 'ai');
                                              const ordered: Array<{ owner: 'user' | 'ai'; content: string }> =
                                                blocks.length <= 1
                                                  ? blocks
                                                  : (firstSender === 'ai'
                                                      ? [aiBlock, userBlock].filter((b): b is { owner: 'user' | 'ai'; content: string } => !!b)
                                                      : [userBlock, aiBlock].filter((b): b is { owner: 'user' | 'ai'; content: string } => !!b));
                                              return (
                                                <div className="space-y-3">
                                                  {ordered.map((b, bi) => (
                                                    <div key={bi}>
                                                      <div className="text-[10px] text-gray-400 mb-1">{b.owner === 'user' ? '我' : 'TA'}</div>
                                                      {b.owner === 'user' ? (
                                                        <div className="whitespace-pre-wrap font-hand text-2xl text-[#8E2A2A] tracking-wide transform -rotate-1">
                                                          {b.content}
                                                        </div>
                                                      ) : (
                                                        <div className="font-hand text-xl text-[#5b4636] leading-relaxed tracking-wide">
                                                          <Markdown rehypePlugins={[rehypeRaw]}>{b.content}</Markdown>
                                                        </div>
                                                      )}
                                                    </div>
                                                  ))}
                                                </div>
                                              );
                                            })()
                                          ) : (
                                            note.sender === 'user' ? (
                                              <div className="whitespace-pre-wrap font-hand text-2xl text-[#8E2A2A] tracking-wide transform -rotate-1">
                                                {(note as any).comment}
                                              </div>
                                            ) : (
                                              <div className="font-hand text-xl text-[#5b4636] leading-relaxed tracking-wide">
                                                <Markdown rehypePlugins={[rehypeRaw]}>{(note as any).comment}</Markdown>
                                              </div>
                                            )
                                          )}

                                          {/* Replies drawer (chat-style only for the dialog thread). */}
                                          {note.chatHistory && note.chatHistory.length > 0 && (
                                            <div className="mt-3 border-l-2 border-[#e5e0d8] pl-3 space-y-2">
                                              {note.chatHistory.map((msg, i) => (
                                                <div key={i} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                                                  <span className="text-[10px] text-gray-400 mb-1">{msg.sender === 'user' ? '我' : 'TA'}</span>
                                                  <div className={`px-3 py-2 rounded-xl text-sm ${msg.sender === 'user' ? 'bg-[#8E2A2A] text-white' : 'bg-white border border-[#e5e0d8] text-[#2c2826]'}`}>
                                                    <Markdown>{msg.text}</Markdown>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                        <div className="pl-8 mt-2">
                                          {replyingToNoteId === note.id ? (
                                            <div className="flex flex-col gap-2 mt-2">
                                              <textarea
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                placeholder="写下你的回复..."
                                                className="w-full p-3 rounded-xl border border-[#e5e0d8] bg-white focus:outline-none focus:ring-2 focus:ring-[#8E2A2A] text-sm font-serif resize-none"
                                                rows={2}
                                                autoFocus
                                              />
                                              <div className="flex justify-end gap-2">
                                                <button 
                                                  onClick={() => {
                                                    setReplyingToNoteId(null);
                                                    setReplyText('');
                                                  }}
                                                  className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg font-serif"
                                                >
                                                  取消
                                                </button>
                                                <button 
                                                  onClick={() => handleInlineReply(note.id, note.text, note.chatHistory)}
                                                  disabled={isReplying || !replyText.trim()}
                                                  className="px-3 py-1.5 text-xs bg-[#8E2A2A] text-white rounded-lg font-serif disabled:opacity-50 flex items-center gap-1"
                                                >
                                                  {isReplying ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                                  发送
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setReplyingToNoteId(note.id);
                                              }}
                                              className="text-xs text-[#8E2A2A] hover:text-[#6b1f1f] font-serif flex items-center gap-1"
                                            >
                                              <MessageCircle size={12} /> 回复
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </React.Fragment>
                          );
                          newParts.push(after);
                        }
                      } else {
                        newParts.push(part);
                      }
                    });
                    renderedParts = newParts;
                  });
                }

                return (
                  <div key={idx} data-paragraph-idx={idx} className="reading-paragraph relative group" style={{ marginBottom: `${paragraphSpacing}px` }}>
                    <div className="relative z-10 leading-relaxed">
                      {renderedParts.map((part, i) => <React.Fragment key={i}>{part}</React.Fragment>)}
                    </div>
                  </div>
                );
              })
            ) : (
              <p>暂无内容</p>
            )}
          </div>

          <div className="mt-24 flex justify-center pb-16">
            <div className="w-16 h-px bg-gray-300/50"></div>
          </div>
        </div>
      </div>

      {/* Note Input Overlay */}
      <AnimatePresence>
        {showNoteInput && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif font-bold text-[#8E2A2A]">写下此刻的想法</h3>
                <button onClick={() => setShowNoteInput(false)} className="text-gray-400"><X size={20} /></button>
              </div>
              <div className="bg-[#f4ecd8]/30 p-3 rounded-xl mb-4 border-l-4 border-[#8E2A2A]">
                <p className="text-xs italic text-gray-500 line-clamp-2">"{activeQuote || selectedText}"</p>
              </div>
              <textarea 
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                autoFocus
                className="w-full h-32 p-4 rounded-2xl border border-[#e5e0d8] focus:outline-none focus:ring-2 focus:ring-[#8E2A2A] font-serif text-sm mb-4"
                placeholder="这一刻，你想到了什么..."
              />
              <button 
                onClick={handleAddManualNote}
                className="w-full py-3 bg-[#8E2A2A] text-white rounded-full font-serif font-bold flex items-center justify-center gap-2 shadow-lg"
              >
                <PenTool size={18} /> 留下墨迹
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TA's Handwritten Note Overlay */}
      <AnimatePresence>
        {showTaNote && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20, rotate: -2 }}
              animate={{ scale: 1, y: 0, rotate: -1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="handwritten-note w-full max-w-sm p-8 relative"
            >
              <button 
                onClick={closeTaNote}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
              
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-full bg-[#8E2A2A]/10 flex items-center justify-center text-[#8E2A2A]">
                  <Heart size={16} fill="currentColor" />
                </div>
                <span className="text-sm font-serif font-bold text-[#8E2A2A]">TA 的便签</span>
              </div>

              <div className="font-hand text-xl text-[#2c2826] leading-relaxed mb-8">
                {book.taNote || "亲爱的，这本书我读过，觉得你会喜欢。"}
              </div>

              <div className="flex justify-end">
                <button 
                  onClick={closeTaNote}
                  className="px-6 py-2 bg-[#8E2A2A] text-white rounded-full text-sm font-serif hover:bg-[#6b1f1f] transition-colors shadow-md"
                >
                  开始共读
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button for Selection */}
      <AnimatePresence>
        {selectionPos && !isChatOpen && !showSettings && !showNoteInput && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed z-40 flex items-center gap-2 bg-white rounded-full shadow-2xl p-1 border border-[#e5e0d8] transform -translate-x-1/2"
            style={{ 
              left: `${Math.max(80, Math.min(window.innerWidth - 80, selectionPos.x))}px`, 
              top: `${Math.max(60, selectionPos.y)}px` 
            }}
          >
            <button 
              onClick={handleShareSelection}
              className="flex items-center gap-2 bg-[#8E2A2A] text-white px-4 py-2 rounded-full hover:bg-[#6b1f1f] transition-colors"
            >
              <MessageCircle size={16} />
              <span className="text-xs font-serif">分享给 TA</span>
            </button>
            <button 
              onClick={() => {
                setActiveQuote(selectedText);
                setShowNoteInput(true);
              }}
              className="flex items-center gap-2 bg-white text-[#8E2A2A] px-4 py-2 rounded-full hover:bg-gray-50 transition-colors"
            >
              <PenTool size={16} />
              <span className="text-xs font-serif">写批注</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Chat Trigger (when closed) */}
      {!isChatOpen && !showSettings && (
        <button 
          onClick={() => setIsChatOpen(true)}
          className="absolute bottom-6 right-6 w-12 h-12 bg-white rounded-full shadow-xl border border-[#e5e0d8] flex items-center justify-center text-[#8E2A2A] hover:scale-105 transition-transform z-30"
        >
          <Heart size={24} fill="currentColor" />
        </button>
      )}

      {/* Table of Contents Drawer */}
      <AnimatePresence>
        {showTOC && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110]"
              onClick={() => setShowTOC(false)}
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed top-0 left-0 bottom-0 w-[80%] max-w-[300px] z-[120] flex flex-col shadow-2xl ${theme === 'dark' ? 'bg-[#1a1a1a] text-white' : theme === 'sepia' ? 'bg-[#f4ecd8] text-[#5b4636]' : 'bg-[#fdfbf7] text-[#2c2826]'}`}
            >
              <div className={`p-6 flex items-center justify-between border-b ${theme === 'dark' ? 'border-gray-800' : 'border-[#e5e0d8]'}`}>
                <h3 className="font-serif font-bold text-lg">目录</h3>
                <button onClick={() => setShowTOC(false)} className="text-gray-400"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {chapters.length > 0 ? (
                  <div className="space-y-1">
                    {chapters.map((chapter, i) => (
                      <button 
                        key={i}
                        onClick={() => jumpToChapter(chapter.index)}
                        className={`w-full text-left p-3 rounded-xl transition-colors flex items-center gap-3 font-bold ${
                          theme === 'dark'
                            ? 'text-gray-100 hover:bg-white/5'
                            : theme === 'sepia'
                              ? 'text-[#5b4636] hover:bg-[#8E2A2A]/5'
                              : 'text-[#2c2826] hover:bg-[#8E2A2A]/5'
                        }`}
                      >
                        <span className={`text-xs font-mono w-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-400'}`}>
                          {(i + 1).toString().padStart(2, '0')}
                        </span>
                        <span className="truncate">{chapter.title}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm italic">
                    暂无目录信息
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Settings Bottom Sheet */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40"
              onClick={() => setShowSettings(false)}
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute bottom-0 left-0 right-0 bg-[#fdfbf7] rounded-t-3xl z-50 flex flex-col shadow-2xl p-6 border-t border-[#e5e0d8]"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-serif font-medium text-[#2c2826]">阅读设置</h3>
                <button onClick={() => setShowSettings(false)} className="p-2 text-gray-400 hover:bg-gray-200 rounded-full">
                  <X size={20} />
                </button>
              </div>

              {/* Font Size */}
              <div className="mb-8">
                <p className="text-sm text-gray-500 mb-3 font-medium">字号大小</p>
                <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-[#e5e0d8] shadow-sm">
                  <button 
                    onClick={() => setFontSize(prev => Math.max(14, prev - 2))}
                    className="w-12 h-12 flex items-center justify-center text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    <Type size={16} />
                  </button>
                  <div className="flex-1 text-center text-lg font-serif text-[#2c2826]">{fontSize}</div>
                  <button 
                    onClick={() => setFontSize(prev => Math.min(28, prev + 2))}
                    className="w-12 h-12 flex items-center justify-center text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    <Type size={24} />
                  </button>
                </div>
              </div>

              {/* Theme */}
              <div className="mb-8">
                <p className="text-sm text-gray-500 mb-3 font-medium">阅读背景</p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setTheme('light')}
                    className={`flex-1 py-4 rounded-2xl flex flex-col items-center gap-2 border-2 transition-all ${theme === 'light' ? 'border-[#8E2A2A] bg-rose-50/30' : 'border-[#e5e0d8] bg-white'}`}
                  >
                    <Sun size={20} className={theme === 'light' ? 'text-[#8E2A2A]' : 'text-gray-400'} />
                    <span className={`text-xs font-medium ${theme === 'light' ? 'text-[#8E2A2A]' : 'text-gray-500'}`}>白天</span>
                  </button>
                  <button 
                    onClick={() => setTheme('sepia')}
                    className={`flex-1 py-4 rounded-2xl flex flex-col items-center gap-2 border-2 transition-all ${theme === 'sepia' ? 'border-[#8E2A2A] bg-[#f4ecd8]' : 'border-[#e5e0d8] bg-[#f4ecd8]/50'}`}
                  >
                    <Coffee size={20} className={theme === 'sepia' ? 'text-[#8E2A2A]' : 'text-[#5b4636]'} />
                    <span className={`text-xs font-medium ${theme === 'sepia' ? 'text-[#8E2A2A]' : 'text-[#5b4636]'}`}>护眼</span>
                  </button>
                  <button 
                    onClick={() => setTheme('dark')}
                    className={`flex-1 py-4 rounded-2xl flex flex-col items-center gap-2 border-2 transition-all ${theme === 'dark' ? 'border-[#8E2A2A] bg-[#1a1a1a]' : 'border-[#e5e0d8] bg-[#1a1a1a]/80'}`}
                  >
                    <Moon size={20} className={theme === 'dark' ? 'text-[#8E2A2A]' : 'text-gray-400'} />
                    <span className={`text-xs font-medium ${theme === 'dark' ? 'text-[#8E2A2A]' : 'text-gray-400'}`}>夜间</span>
                  </button>
                </div>
              </div>

              {/* Spacing & AI Frequency */}
              <div className="space-y-6 overflow-y-auto max-h-[40vh] pb-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-gray-500 font-medium">行高</p>
                    <span className="text-xs font-serif text-[#8E2A2A]">{lineHeight.toFixed(1)}</span>
                  </div>
                  <input 
                    type="range" min="1.2" max="3.0" step="0.1" 
                    value={lineHeight} 
                    onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                    className="w-full accent-[#8E2A2A]"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-gray-500 font-medium">段落间距</p>
                    <span className="text-xs font-serif text-[#8E2A2A]">{paragraphSpacing}px</span>
                  </div>
                  <input 
                    type="range" min="8" max="64" step="4" 
                    value={paragraphSpacing} 
                    onChange={(e) => setParagraphSpacing(parseInt(e.target.value))}
                    className="w-full accent-[#8E2A2A]"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-gray-500 font-medium">AI 批注频率</p>
                    <span className="text-xs font-serif text-[#8E2A2A]">{Math.round(aiFrequency * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={aiFrequency} 
                    onChange={(e) => setAiFrequency(parseFloat(e.target.value))}
                    className="w-full accent-[#8E2A2A]"
                  />
                  <p className="text-[10px] text-gray-400 mt-1 font-serif">调高频率，TA 会更频繁地在书页间留下墨迹</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Sheet Chat */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40"
              onClick={() => setIsChatOpen(false)}
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: isChatMinimized ? 'calc(100% - 60px)' : 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`absolute bottom-0 left-0 right-0 ${isChatMinimized ? 'h-[60px]' : 'h-[70vh]'} bg-[#fdfbf7] rounded-t-3xl z-50 flex flex-col shadow-2xl overflow-hidden border-t border-[#e5e0d8]`}
            >
              <div 
                className="w-full flex justify-center pt-4 pb-2 bg-white/50 cursor-pointer"
                onClick={() => setIsChatMinimized(!isChatMinimized)}
              >
                <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatArea 
                  messages={messages} 
                  setMessages={setMessages} 
                  onClose={() => setIsChatOpen(false)} 
                  isMinimized={isChatMinimized}
                  onToggleMinimize={() => setIsChatMinimized(!isChatMinimized)}
                  onImportBook={onImportBook}
                  companionName={companionName}
                  companionAvatar={companionAvatar}
                  getContextForAi={() => {
                    const idx = getCurrentParagraphIdx();
                    const before = paragraphs.slice(Math.max(0, idx - 2), idx).join('\n\n');
                    const core = paragraphs[idx] || '';
                    const after = paragraphs.slice(idx + 1, Math.min(paragraphs.length, idx + 3)).join('\n\n');
                    const clip = (s: string, maxLen: number) => (s.length > maxLen ? s.slice(-maxLen) : s);
                    const clipHead = (s: string, maxLen: number) => (s.length > maxLen ? s.slice(0, maxLen) : s);
                    return [
                      `【前文】${clip(before, 260)}`,
                      `【核心】${core}`,
                      `【后文】${clipHead(after, 260)}`,
                    ].filter(Boolean).join('\n\n');
                  }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
