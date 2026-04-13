import React, { useState, useEffect } from 'react';
import ReadingArea from './components/ReadingArea';
import Bookshelf from './components/Bookshelf';
import Companion from './components/Companion';
import { Message, Book, JournalEntry, DEFAULT_STORY, DEFAULT_PERSONA } from './types';
import { initChat, sendMessage } from './services/geminiService';
import { Library, BookOpen, Heart } from 'lucide-react';

type Tab = 'bookshelf' | 'reading' | 'companion';

export default function App() {
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
    return saved ? JSON.parse(saved) : [];
  });

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

  useEffect(() => {
    let interval: any;
    if (activeTab === 'reading') {
      interval = setInterval(() => {
        setReadingTime(prev => {
          const newTime = prev + 1;
          localStorage.setItem('app_readingTime', newTime.toString());
          return newTime;
        });
      }, 60000); // Add 1 minute every 60 seconds
    }
    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('app_books', JSON.stringify(books));
  }, [books]);

  useEffect(() => {
    localStorage.setItem('app_journals', JSON.stringify(journalEntries));
  }, [journalEntries]);

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
              onSaveJournal={(entry) => setJournalEntries(prev => [entry, ...prev])}
              companionName={companionName}
              companionAvatar={companionAvatar}
              onShare={(text) => {
                // Logic to open chat and send message
                const userMsg: Message = {
                  id: Date.now().toString(),
                  sender: 'user',
                  text: text,
                  timestamp: Date.now(),
                };
                setMessages(prev => [...prev, userMsg]);
                // Trigger AI response
                sendMessage(text).then(res => {
                  const aiMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    sender: 'ai',
                    text: res,
                    timestamp: Date.now(),
                  };
                  setMessages(prev => [...prev, aiMsg]);
                }).catch(err => console.error(err));
              }}
            />
          )}
          {activeTab === 'companion' && (
            <Companion 
              persona={persona} 
              setPersona={setPersona} 
              journalEntries={journalEntries} 
              onUpdateJournal={(entry) => setJournalEntries(prev => prev.map(e => e.id === entry.id ? entry : e))}
              onDeleteJournal={(id) => setJournalEntries(prev => prev.filter(e => e.id !== id))}
              onAddTaBook={handleAddTaBook}
              companionName={companionName}
              setCompanionName={setCompanionName}
              companionAvatar={companionAvatar}
              setCompanionAvatar={setCompanionAvatar}
              startDate={startDate}
              readingTime={readingTime}
              books={books}
            />
          )}
        </main>

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

