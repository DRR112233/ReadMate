import React, { useState, useRef } from 'react';
import { Book } from '../types';
import { Heart, Search, Plus, X, Link as LinkIcon, Loader2, BookOpen, Trash2, CheckCircle2, Circle, PenTool } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import ePub from 'epubjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface BookshelfProps {
  books: Book[];
  onOpenBook: (book: Book) => void;
  onImportBook: (book: Book) => void;
  onDeleteBook: (id: string) => void;
  onUpdateBook: (book: Book) => void;
}

export default function Bookshelf({ books, onOpenBook, onImportBook, onDeleteBook, onUpdateBook }: BookshelfProps) {
  const [activeTab, setActiveTab] = useState<'my' | 'ta'>('my');
  const [isSearching, setIsSearching] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [showPasteImport, setShowPasteImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<string | null>(null);
  const [ripplePos, setRipplePos] = useState<{x: number, y: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const myBooks = books.filter(b => !b.isTaRecommendation);
  const taBooks = books.filter(b => b.isTaRecommendation);

  const [myFilter, setMyFilter] = useState<'all' | 'unread' | 'read'>('all');

  let displayBooks = activeTab === 'my' ? myBooks : taBooks;
  
  if (activeTab === 'my') {
    if (myFilter === 'unread') displayBooks = displayBooks.filter(b => b.status !== 'finished' && b.progress < 100);
    if (myFilter === 'read') displayBooks = displayBooks.filter(b => b.status === 'finished' || b.progress === 100);
  }

  if (searchQuery.trim()) {
    displayBooks = displayBooks.filter(b => 
      b.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      b.author.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  const handleToggleStatus = (e: React.MouseEvent, book: Book) => {
    e.stopPropagation();
    const newStatus = book.status === 'finished' ? 'reading' : 'finished';
    onUpdateBook({ ...book, status: newStatus, progress: newStatus === 'finished' ? 100 : book.progress });
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setBookToDelete(id);
  };

  const confirmDelete = () => {
    if (bookToDelete) {
      onDeleteBook(bookToDelete);
      setBookToDelete(null);
    }
  };

  const handleImportClassic = (title: string, author: string, content: string) => {
    const newBook: Book = {
      id: Date.now().toString(),
      title,
      author,
      cover: `https://picsum.photos/seed/${title}/300/400`,
      progress: 0,
      content
    };
    onImportBook(newBook);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      let content = '';
      let title = file.name.replace(/\.[^/.]+$/, "");
      let author = '未知作者';
      let cover = `https://picsum.photos/seed/${Date.now()}/300/400`;

      if (file.name.endsWith('.txt')) {
        content = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.onerror = reject;
          reader.readAsText(file);
        });
      } else if (file.name.endsWith('.pdf')) {
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as ArrayBuffer);
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });
        const typedarray = new Uint8Array(arrayBuffer);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          let lastY, text = '';
          for (let item of textContent.items as any[]) {
            if (lastY == item.transform[5] || !lastY) {
              text += item.str;
            } else {
              text += '\n' + item.str;
            }
            lastY = item.transform[5];
          }
          content += text + '\n\n';
        }
      } else if (file.name.endsWith('.epub')) {
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as ArrayBuffer);
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });
        const book = ePub(arrayBuffer);
        await book.ready;
        
        try {
          const metadata = await book.loaded.metadata;
          if (metadata.title) title = metadata.title;
          if (metadata.creator) author = metadata.creator;
          const coverUrl = await book.coverUrl();
          if (coverUrl) cover = coverUrl;
        } catch (e) {
          console.warn("Failed to load epub metadata", e);
        }

        const spine = await book.loaded.spine;
        for (const item of (spine as any).spineItems) {
          try {
            const doc = await item.load(book.load.bind(book));
            const elements = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, div');
            let chapterText = '';
            if (elements.length > 0) {
              elements.forEach((el: any) => {
                const text = el.textContent?.trim();
                if (text && el.children.length === 0) { // Only grab text from leaf nodes or elements with text
                  chapterText += text + '\n\n';
                } else if (text && el.tagName.toLowerCase() === 'p') {
                  chapterText += text + '\n\n';
                }
              });
            } else {
              chapterText = doc.textContent || '';
            }
            content += chapterText + '\n\n';
          } catch (err) {
            console.warn("Failed to load epub item", err);
          }
        }
      } else {
        alert('不支持的文件格式。请上传 TXT, PDF, 或 EPUB 文件。');
        setIsImporting(false);
        return;
      }

      const newBook: Book = {
        id: Date.now().toString(),
        title: title,
        author: author,
        cover: cover,
        progress: 0,
        content: content.trim() || '无法提取文件内容。'
      };
      onImportBook(newBook);
    } catch (error) {
      console.error("Error parsing file:", error);
      alert('解析文件失败，请检查文件是否损坏。');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUrlImport = async () => {
    if (!importUrl.trim()) return;
    setIsImporting(true);
    try {
      const response = await fetch('/api/fetch-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: importUrl }),
      });
      
      if (!response.ok) throw new Error('Fetch failed');
      
      const data = await response.json();
      
      const newBook: Book = {
        id: Date.now().toString(),
        title: data.title,
        author: data.author,
        cover: `https://picsum.photos/seed/${Date.now()}/300/400?blur=2`,
        progress: 0,
        content: data.content || '无法提取网页内容，请尝试其他链接。'
      };
      
      onImportBook(newBook);
      setShowUrlImport(false);
      setImportUrl('');
    } catch (e) {
      alert('导入失败，请检查链接是否有效。');
    } finally {
      setIsImporting(false);
    }
  };

  const handleBookClick = (e: React.MouseEvent, book: Book) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRipplePos({
      x: e.clientX,
      y: e.clientY
    });
    
    setTimeout(() => {
      onOpenBook(book);
      setRipplePos(null);
    }, 600);
  };

  return (
    <div className="h-full w-full bg-paper flex flex-col relative overflow-hidden">
      {/* Ink Ripple Overlay */}
      <AnimatePresence>
        {ripplePos && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 pointer-events-none overflow-hidden"
          >
            <div 
              className="absolute bg-[#fdfbf7] rounded-full animate-ink-ripple"
              style={{
                left: ripplePos.x,
                top: ripplePos.y,
                width: '150vmax',
                height: '150vmax',
                transformOrigin: 'center center',
                marginLeft: '-75vmax',
                marginTop: '-75vmax'
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-6 pt-14 pb-6 flex items-center justify-between min-h-[100px]">
        <AnimatePresence mode="wait">
          {!isSearching ? (
            <motion.div 
              key="title"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex items-center justify-between w-full"
            >
              <h1 className="text-3xl font-serif font-black text-[#2c2826] tracking-wider">书架</h1>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`p-2 rounded-full transition-colors ${isEditMode ? 'text-[#8E2A2A] bg-rose-50' : 'text-gray-500 hover:bg-gray-200/50'}`}
                  title={isEditMode ? "完成编辑" : "编辑书架"}
                >
                  <PenTool size={22} />
                </button>
                <button 
                  onClick={() => setIsSearching(true)}
                  className="p-2 text-gray-500 hover:bg-gray-200/50 rounded-full transition-colors"
                >
                  <Search size={22} />
                </button>
                <button 
                  onClick={() => setShowUrlImport(true)}
                  className="p-2 text-gray-500 hover:bg-gray-200/50 rounded-full transition-colors"
                  title="从链接导入"
                >
                  <LinkIcon size={22} />
                </button>
                <button 
                  onClick={() => setShowPasteImport(true)}
                  className="p-2 text-gray-500 hover:bg-gray-200/50 rounded-full transition-colors"
                  title="粘贴文本导入"
                >
                  <BookOpen size={22} />
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-[#8E2A2A] hover:bg-rose-50 rounded-full transition-colors"
                  title="导入本地TXT"
                >
                  <Plus size={26} />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="search"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex items-center w-full gap-2"
            >
              <div className="flex-1 flex items-center bg-white border border-[#e5e0d8] shadow-sm rounded-full px-4 py-2.5">
                <Search size={18} className="text-gray-400 mr-2" />
                <input 
                  autoFocus
                  type="text"
                  placeholder="搜索书名或作者..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none focus:outline-none text-sm text-[#2c2826] font-serif"
                />
              </div>
              <button 
                onClick={() => {
                  setIsSearching(false);
                  setSearchQuery('');
                }}
                className="p-2 text-gray-500 hover:bg-gray-200/50 rounded-full transition-colors"
              >
                <X size={22} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Hidden File Input */}
      <input 
        type="file" 
        accept=".txt,.pdf,.epub" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
      />

      {/* URL Import Modal */}
      <AnimatePresence>
        {showUrlImport && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40"
              onClick={() => !isImporting && setShowUrlImport(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="absolute top-1/2 left-4 right-4 -translate-y-1/2 bg-[#fdfbf7] rounded-3xl p-6 shadow-2xl z-50 border border-[#e5e0d8]"
            >
              <h3 className="text-xl font-serif font-bold text-[#2c2826] mb-4">从链接导入</h3>
              <p className="text-sm text-gray-500 font-serif mb-4">粘贴文章或网页链接，我们将尝试为您提取正文内容。</p>
              <input 
                type="url" 
                placeholder="https://..."
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                className="w-full bg-white border border-[#e5e0d8] rounded-xl px-4 py-3 text-sm text-[#2c2826] mb-6 focus:outline-none focus:border-[#8E2A2A] transition-colors"
              />
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setShowUrlImport(false)}
                  disabled={isImporting}
                  className="px-5 py-2.5 rounded-full text-gray-500 font-serif text-sm hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button 
                  onClick={handleUrlImport}
                  disabled={!importUrl.trim() || isImporting}
                  className="px-5 py-2.5 rounded-full bg-[#8E2A2A] text-white font-serif text-sm hover:bg-[#6b1f1f] transition-colors disabled:opacity-50 flex items-center gap-2 shadow-md"
                >
                  {isImporting ? (
                    <><Loader2 size={16} className="animate-spin" /> 提取中...</>
                  ) : (
                    '开始导入'
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Paste Import Modal */}
      <AnimatePresence>
        {showPasteImport && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40"
              onClick={() => setShowPasteImport(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="absolute top-1/2 left-4 right-4 -translate-y-1/2 bg-[#fdfbf7] rounded-3xl p-6 shadow-2xl z-50 border border-[#e5e0d8] flex flex-col max-h-[80vh]"
            >
              <h3 className="text-xl font-serif font-bold text-[#2c2826] mb-4">粘贴文本导入</h3>
              <input 
                type="text" 
                placeholder="书名..."
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                className="w-full bg-white border border-[#e5e0d8] rounded-xl px-4 py-2 text-sm text-[#2c2826] mb-4 focus:outline-none focus:border-[#8E2A2A]"
              />
              <textarea 
                placeholder="在此粘贴正文内容..."
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                className="w-full flex-1 bg-white border border-[#e5e0d8] rounded-xl px-4 py-3 text-sm text-[#2c2826] mb-6 focus:outline-none focus:border-[#8E2A2A] min-h-[200px] font-serif"
              />
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setShowPasteImport(false)}
                  className="px-5 py-2.5 rounded-full text-gray-500 font-serif text-sm hover:bg-gray-100 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    if (!pasteTitle || !pasteContent) return;
                    handleImportClassic(pasteTitle, '未知作者', pasteContent);
                    setShowPasteImport(false);
                    setPasteTitle('');
                    setPasteContent('');
                  }}
                  disabled={!pasteTitle.trim() || !pasteContent.trim()}
                  className="px-5 py-2.5 rounded-full bg-[#8E2A2A] text-white font-serif text-sm hover:bg-[#6b1f1f] transition-colors disabled:opacity-50 shadow-md"
                >
                  完成导入
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <div className="px-8 flex flex-col border-b border-[#e5e0d8]/60">
        <div className="flex gap-8">
          <button 
            className={`pb-4 text-base font-serif font-medium transition-colors relative ${activeTab === 'my' ? 'text-[#8E2A2A]' : 'text-gray-400 hover:text-gray-600'}`}
            onClick={() => setActiveTab('my')}
          >
            我的书架
            {activeTab === 'my' && (
              <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8E2A2A] rounded-t-full" />
            )}
          </button>
          <button 
            className={`pb-4 text-base font-serif font-medium transition-colors relative flex items-center gap-1 ${activeTab === 'ta' ? 'text-[#8E2A2A]' : 'text-gray-400 hover:text-gray-600'}`}
            onClick={() => setActiveTab('ta')}
          >
            TA的推荐
            <span className="w-2 h-2 rounded-full bg-[#8E2A2A] absolute top-0 -right-3" />
            {activeTab === 'ta' && (
              <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8E2A2A] rounded-t-full" />
            )}
          </button>
        </div>
        
        {activeTab === 'my' && (
          <div className="flex gap-4 py-3">
            <button 
              onClick={() => setMyFilter('all')}
              className={`text-[10px] px-3 py-1 rounded-full border transition-all ${myFilter === 'all' ? 'bg-[#8E2A2A] text-white border-[#8E2A2A]' : 'bg-white text-gray-400 border-gray-200'}`}
            >
              全部
            </button>
            <button 
              onClick={() => setMyFilter('unread')}
              className={`text-[10px] px-3 py-1 rounded-full border transition-all ${myFilter === 'unread' ? 'bg-[#8E2A2A] text-white border-[#8E2A2A]' : 'bg-white text-gray-400 border-gray-200'}`}
            >
              未读
            </button>
            <button 
              onClick={() => setMyFilter('read')}
              className={`text-[10px] px-3 py-1 rounded-full border transition-all ${myFilter === 'read' ? 'bg-[#8E2A2A] text-white border-[#8E2A2A]' : 'bg-white text-gray-400 border-gray-200'}`}
            >
              已读
            </button>
          </div>
        )}
      </div>

      {/* Book Grid */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-24 scroll-smooth">
        {displayBooks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <BookOpen size={48} className="mb-4 opacity-20" />
            <p className="text-base font-serif">书架空空如也</p>
            <p className="text-xs font-serif mt-2 opacity-60">点击右上角导入你的第一本书吧</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-10">
            {displayBooks.map((book) => (
              <div 
                key={book.id}
                className="flex flex-col gap-3 cursor-pointer group relative"
                onClick={(e) => !isEditMode && handleBookClick(e, book)}
              >
                <div className={`relative aspect-[2/3] book-cover bg-gray-200 transition-all duration-300 transform ${!isEditMode && 'group-hover:shadow-2xl group-hover:-translate-y-1'}`}>
                  <div className="book-spine"></div>
                  <img src={book.cover} alt={book.title} className="absolute inset-0 w-full h-full object-cover rounded-[2px_8px_8px_2px]" referrerPolicy="no-referrer" />
                  
                  {/* Breathing golden light for progress */}
                  {book.progress > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/30 overflow-hidden rounded-br-lg">
                      <div 
                        className="h-full bg-gradient-to-r from-[#D4AF37]/80 via-[#F3E5AB] to-[#D4AF37]/80" 
                        style={{ width: `${book.progress}%` }} 
                      />
                    </div>
                  )}
                  
                  {book.isTaRecommendation && (
                    <div className="absolute top-3 right-3 w-7 h-7 bg-[#fdfbf7]/95 backdrop-blur-md rounded-full flex items-center justify-center shadow-md text-[#8E2A2A]">
                      <Heart size={14} fill="currentColor" />
                    </div>
                  )}

                  {/* Edit Mode Overlays */}
                  <AnimatePresence>
                    {isEditMode && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-[2px_8px_8px_2px] flex flex-col items-center justify-center gap-4 z-20"
                      >
                        <button 
                          onClick={(e) => handleToggleStatus(e, book)}
                          className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-[#8E2A2A] shadow-lg hover:scale-110 transition-transform"
                          title={book.status === 'finished' ? "设为未读" : "设为已读"}
                        >
                          {book.status === 'finished' ? <CheckCircle2 size={20} fill="currentColor" className="text-green-500" /> : <Circle size={20} />}
                        </button>
                        <button 
                          onClick={(e) => handleDelete(e, book.id)}
                          className="w-10 h-10 bg-[#8E2A2A] rounded-full flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform"
                          title="删除"
                        >
                          <Trash2 size={20} />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="px-1">
                  <h3 className="text-sm font-serif font-bold text-[#2c2826] line-clamp-2 leading-snug">{book.title}</h3>
                  <p className="text-xs font-serif text-gray-500 mt-1 line-clamp-1">{book.author}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Removed Classic Recommendations Section */}

        {activeTab === 'ta' && taBooks.length > 0 && !searchQuery && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-12 p-6 bg-gradient-to-br from-[#f4ecd8]/80 to-[#fdfbf7] rounded-3xl border border-[#e5e0d8] relative overflow-hidden shadow-sm"
          >
            <Heart className="absolute -right-6 -bottom-6 text-[#8E2A2A]/5" size={120} fill="currentColor" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-[#8E2A2A]/10 flex items-center justify-center text-[#8E2A2A]">
                  <Heart size={14} fill="currentColor" />
                </div>
                <span className="text-sm font-serif font-bold text-[#8E2A2A] tracking-wider">恋人留言</span>
              </div>
              <div 
                className="text-base text-[#2c2826] italic font-serif leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: taBooks[0].taNote || '' }}
              />
            </div>
          </motion.div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {bookToDelete && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50"
              onClick={() => setBookToDelete(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 shadow-2xl z-50 w-[85%] max-w-sm border border-[#e5e0d8]"
            >
              <h3 className="text-lg font-serif font-bold text-[#2c2826] mb-2">确认删除</h3>
              <p className="text-sm text-gray-500 mb-6">确定要从书架移除这本书吗？此操作不可恢复。</p>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setBookToDelete(null)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={confirmDelete}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-[#8E2A2A] text-white hover:bg-[#6b1f1f] transition-colors shadow-sm"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
