import React, { useState, useEffect, useRef } from 'react';
import { Message, Book } from '../types';
import { MessageCircleHeart, ChevronLeft, Settings, Heart, X, Type, Moon, Sun, Coffee, Bookmark, PenTool, MessageCircle, List } from 'lucide-react';
import { sendMessage } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import ChatArea from './ChatArea';
import { Annotation } from '../types';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

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
  const [noteText, setNoteText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showBookmarkToast, setShowBookmarkToast] = useState(false);
  const [showTaNote, setShowTaNote] = useState(book.isTaRecommendation && !book.hasSeenNote);
  const [expandedParagraph, setExpandedParagraph] = useState<string | null>(null);
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
    if (scrollRef.current && book.lastReadPosition) {
      scrollRef.current.scrollTop = book.lastReadPosition;
    }
  }, [book.id]);

  // Auto-save on unmount
  useEffect(() => {
    const handleScroll = () => {
      if (scrollRef.current) {
        const currentPos = scrollRef.current.scrollTop;
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
        const currentPos = scrollEl.scrollTop;
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
  const chapters = React.useMemo(() => {
    const extractedChapters: { title: string, index: number }[] = [];
    paragraphs.forEach((p, idx) => {
      const text = p.trim();
      const isChapter = text.length < 50 && (
        /^第[零一二三四五六七八九十百千万\d]+[章回节卷集部篇]/.test(text) ||
        /^Chapter\s*\d+/i.test(text) ||
        (text.length > 0 && text.length < 20 && !text.includes('。') && !text.includes('，') && !text.includes('”') && !text.includes('？'))
      );
      if (isChapter) {
        extractedChapters.push({ title: text, index: idx });
      }
    });
    if (extractedChapters.length === 0 && paragraphs.length > 0) {
      for (let i = 0; i < paragraphs.length; i += 30) {
        extractedChapters.push({ title: `片段 ${Math.floor(i/30) + 1}`, index: i });
      }
    }
    return extractedChapters;
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

  const handleSaveBookmark = () => {
    if (!scrollRef.current) return;
    const currentPos = scrollRef.current.scrollTop;
    const { scrollHeight, clientHeight } = scrollRef.current;
    const progress = scrollHeight > clientHeight 
      ? Math.round((currentPos / (scrollHeight - clientHeight)) * 100) 
      : 100;

    onUpdateBook({
      ...book,
      lastReadPosition: currentPos,
      progress: Math.min(100, progress)
    });
    setShowBookmarkToast(true);
    setTimeout(() => setShowBookmarkToast(false), 2000);
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

    const newAnnotation: Annotation = {
      id: Math.random().toString(36).substr(2, 9),
      bookId: book.id,
      text: quoteToUse,
      comment: noteText,
      sender: 'user',
      timestamp: Date.now(),
      paragraphIdx: 0 // Simplified
    };

    const updatedBook = {
      ...book,
      annotations: [...(book.annotations || []), newAnnotation]
    };

    onUpdateBook(updatedBook);
    
    // Trigger AI response to the user's note
    const triggerAiReply = async () => {
      try {
        const prompt = `我在读《${book.title}》时，看到这句话：“${quoteToUse}”。我写下了这段批注：“${noteText}”。请你作为一个恋人，针对我的批注或者这段话，给我回一条简短、深情且有共鸣的留言（50字以内）。`;
        const response = await sendMessage(prompt);
        
        const aiAnnotation: Annotation = {
          id: Math.random().toString(36).substr(2, 9),
          bookId: book.id,
          text: quoteToUse,
          comment: response,
          sender: 'ai',
          timestamp: Date.now(),
          paragraphIdx: 0
        };

        onUpdateBook({
          ...updatedBook,
          annotations: [...updatedBook.annotations, aiAnnotation]
        });
      } catch (error) {
        console.error('AI reply to note failed:', error);
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

    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: `我看到了这句话：“${quote}”`, timestamp: Date.now() };
    setMessages([userMsg]);

    try {
      const res = await sendMessage(`我看到了这句话：“${quote}”。请你作为一个恋人，针对这句话给我回一条简短、深情的留言。`);
      const aiMsg: Message = { id: (Date.now() + 1).toString(), sender: 'ai', text: res, timestamp: Date.now() };
      setMessages(prev => [...prev, aiMsg]);
      
      const newJournalId = Date.now().toString();
      setActiveJournalId(newJournalId);
      onSaveJournal({
        id: newJournalId,
        quote: quote,
        aiResponse: res,
        date: Date.now(),
        bookTitle: book.title,
        chatHistory: [userMsg, aiMsg]
      });
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
          <button onClick={onBack} className="p-2 text-gray-500 hover:bg-gray-200/50 rounded-full transition-colors">
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
              <Bookmark size={20} fill={book.lastReadPosition ? "currentColor" : "none"} />
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-500 hover:bg-gray-200/50 rounded-full transition-colors"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
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
            已保存书签
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
            {book.lastReadPosition !== undefined && book.lastReadPosition > 0 && (
              <div 
                className="absolute left-[-60px] right-[-60px] border-t border-dashed border-[#8E2A2A]/30 flex justify-end"
                style={{ top: `${book.lastReadPosition}px` }}
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
                const chatNotes = journalEntries.filter(entry => 
                  entry.bookTitle === book.title && (paragraph.includes(entry.quote) || entry.quote.includes(paragraph))
                );

                // Find manual annotations
                const manualNotes = (book.annotations || []).filter(ann => 
                  paragraph.includes(ann.text) || ann.text.includes(paragraph)
                );

                const allNotes = [
                  ...chatNotes.map(n => ({ id: n.id, text: n.quote, comment: n.aiResponse, sender: 'ai' as const, chatHistory: n.chatHistory })),
                  ...manualNotes.map(n => ({ id: n.id, text: n.text, comment: n.comment, sender: n.sender, chatHistory: undefined }))
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
                        const split = part.split(matchText);
                        split.forEach((s, i) => {
                          newParts.push(s);
                          if (i < split.length - 1) {
                            newParts.push(
                              <React.Fragment key={`${note.id}-${i}`}>
                                <span 
                                  className="note-highlight relative cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const selection = window.getSelection()?.toString();
                                    if (!selection) {
                                      setExpandedParagraph(expandedParagraph === note.id ? null : note.id);
                                    }
                                  }}
                                >
                                  {matchText}
                                </span>
                                {/* Inline Expandable Note */}
                                <AnimatePresence>
                                  {expandedParagraph === note.id && (
                                    <motion.div 
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      className="block w-full overflow-hidden my-3"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="p-4 bg-[#f4ecd8]/60 rounded-2xl border border-[#e5e0d8] shadow-inner">
                                        <div className="flex flex-col gap-3">
                                          <div className="flex items-center gap-2">
                                            {note.sender === 'user' ? (
                                              <div className="w-6 h-6 rounded-full bg-[#8E2A2A]/10 flex items-center justify-center text-[#8E2A2A]">
                                                <PenTool size={12} />
                                              </div>
                                            ) : (
                                              <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[#8E2A2A] shadow-sm">
                                                <Heart size={12} fill="currentColor" />
                                              </div>
                                            )}
                                            <span className="text-xs font-serif font-bold text-gray-500">
                                              {note.sender === 'user' ? '我的批注' : 'TA 的留言'}
                                            </span>
                                          </div>
                                          <div className={`pl-8 ${note.sender === 'user' ? 'font-hand text-2xl text-[#8E2A2A] tracking-wide transform -rotate-1' : 'font-serif text-sm text-[#2c2826]'} leading-relaxed`}>
                                            {note.chatHistory && note.chatHistory.length > 0 ? (
                                              <div className="space-y-3">
                                                {note.chatHistory.map((msg, i) => (
                                                  <div key={i} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                                                    <span className="text-[10px] text-gray-400 mb-1">{msg.sender === 'user' ? '我' : 'TA'}</span>
                                                    <div className={`px-3 py-2 rounded-xl text-sm ${msg.sender === 'user' ? 'bg-[#8E2A2A] text-white' : 'bg-white border border-[#e5e0d8] text-[#2c2826]'}`}>
                                                      <Markdown>{msg.text}</Markdown>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : note.sender === 'ai' ? (
                                              <div 
                                                className="prose prose-sm prose-p:my-1"
                                                dangerouslySetInnerHTML={{ __html: note.comment }}
                                              />
                                            ) : (
                                              note.comment
                                            )}
                                          </div>
                                          {note.sender === 'ai' && (
                                            <div className="pl-8 mt-2">
                                              <button 
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  onShare(`关于你的留言：“${note.comment.substring(0, 20)}...”`);
                                                  setIsChatOpen(true);
                                                }}
                                                className="text-xs text-[#8E2A2A] hover:text-[#6b1f1f] font-serif flex items-center gap-1"
                                              >
                                                <MessageCircle size={12} /> 回复 TA
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </React.Fragment>
                            );
                          }
                        });
                      } else {
                        newParts.push(part);
                      }
                    });
                    renderedParts = newParts;
                  });
                }

                return (
                  <div key={idx} className="reading-paragraph relative group" style={{ marginBottom: `${paragraphSpacing}px` }}>
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
              <div className="p-6 border-b border-[#e5e0d8] flex items-center justify-between">
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
                        className={`w-full text-left p-3 rounded-xl transition-colors hover:bg-[#8E2A2A]/5 flex items-center gap-3 font-bold text-[#8E2A2A]`}
                      >
                        <span className="text-xs text-gray-400 font-mono w-6">{(i + 1).toString().padStart(2, '0')}</span>
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
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
