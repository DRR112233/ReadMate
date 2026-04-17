import React, { useState, useRef, useEffect } from 'react';
import { Message, Book } from '../types';
import { Send, Heart, Loader2, X, Sparkles, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { sendMessage } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

interface ChatAreaProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onClose?: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  onImportBook?: (book: Book) => void;
  companionName?: string;
  companionAvatar?: string;
  getContextForAi?: () => string;
}

export default function ChatArea({ 
  messages, 
  setMessages, 
  onClose, 
  isMinimized, 
  onToggleMinimize, 
  onImportBook,
  companionName = '你的恋人',
  companionAvatar = '',
  getContextForAi
}: ChatAreaProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleImportSuggestedBook = (text: string) => {
    if (!onImportBook) return;
    // Pattern: [BOOK:Title|Author|Content]
    const match = text.match(/\[BOOK:(.*?)\|(.*?)\|(.*?)\]/);
    if (match) {
      const [_, title, author, content] = match;
      const newBook: Book = {
        id: `ai-${Date.now()}`,
        title,
        author,
        cover: `https://picsum.photos/seed/${title}/300/400`,
        progress: 0,
        content,
        isTaRecommendation: true,
        taNote: '这是我为你准备的礼物。'
      };
      onImportBook(newBook);
      alert(`已将《${title}》加入你的书架！`);
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
  };

  const handleGenerate = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      // Use the last few messages as context if needed, but for now just trigger
      const lastUserMsg = [...messages].reverse().find(m => m.sender === 'user');
      const userText = lastUserMsg?.text || "请继续和我聊天吧";
      const ctx = (getContextForAi?.() || '').trim();
      const prompt = ctx
        ? `用户正在阅读中与你聊天。\n\n【阅读上下文（截取）】\n${ctx}\n\n【用户消息】\n${userText}\n\n请你像恋人一样，简短、深情、贴合上下文地回复（50字以内）。`
        : userText;
      const responseText = await sendMessage(prompt);
      
      if (responseText) {
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: responseText,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, aiMsg]);
      }
    } catch (error) {
      console.error("Failed to generate response:", error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: "抱歉亲爱的，我刚才走神了，能再说一遍吗？",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-t sm:border-t-0 sm:border-l border-rose-100 shadow-lg">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e0d8] bg-[#fdfbf7]">
        <div className="flex items-center gap-2">
          {companionAvatar ? (
            <img src={companionAvatar} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#8E2A2A]/10 flex items-center justify-center text-[#8E2A2A]">
              <Heart size={16} fill="currentColor" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-serif font-medium text-[#2c2826]">{companionName}</h3>
            <p className="text-xs text-gray-500">{isMinimized ? '点击展开对话' : '正在陪你阅读...'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onToggleMinimize && (
            <button onClick={onToggleMinimize} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
              {isMinimized ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#fdfbf7]/50">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-[#8E2A2A] text-white rounded-br-sm'
                    : 'bg-white border border-[#e5e0d8] text-[#2c2826] rounded-bl-sm shadow-sm'
                }`}
              >
                {msg.sender === 'ai' ? (
                  <div className="flex flex-col gap-3">
                    <div 
                      className="prose prose-sm prose-p:my-1 prose-a:text-[#8E2A2A] max-w-none font-serif"
                      dangerouslySetInnerHTML={{ __html: msg.text.replace(/\[BOOK:.*?\]/g, '') }} 
                    />
                    {msg.text.includes('[BOOK:') && (
                      <button 
                        onClick={() => handleImportSuggestedBook(msg.text)}
                        className="flex items-center gap-2 px-3 py-2 bg-[#f4ecd8] text-[#8E2A2A] rounded-xl text-xs font-serif font-bold hover:bg-[#e5d8b8] transition-colors w-fit"
                      >
                        <Plus size={14} />
                        加入我的书架
                      </button>
                    )}
                  </div>
                ) : (
                  msg.text
                )}
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-white border border-[#e5e0d8] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <Loader2 size={16} className="animate-spin text-[#8E2A2A]" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-[#e5e0d8] flex flex-col gap-2">
        <div className="flex items-center gap-2 bg-[#fdfbf7] rounded-full px-4 py-2 border border-[#e5e0d8] focus-within:border-[#8E2A2A] focus-within:ring-1 focus-within:ring-[#8E2A2A] transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="和TA分享你的感受..."
            className="flex-1 bg-transparent border-none focus:outline-none text-sm text-[#2c2826] placeholder-gray-400 font-serif"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="text-[#8E2A2A] disabled:text-gray-300 transition-colors p-1"
            title="发送消息"
          >
            <Send size={18} />
          </button>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className="w-full py-2 bg-[#8E2A2A] text-white rounded-full text-xs font-serif font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-[#6b1f1f] transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          让 TA 回复我
        </button>
      </div>
    </div>
  );
}
