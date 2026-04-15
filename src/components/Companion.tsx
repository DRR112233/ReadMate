import React, { useState, useEffect } from 'react';
import { Heart, Calendar, Clock, BookOpen, ChevronRight, ChevronLeft, Save, Quote, Settings, Gift, Loader2, X, PenTool } from 'lucide-react';
import { JournalEntry, Book, Memo } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { updateApiConfig, sendMessage, fetchModels } from '../services/geminiService';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

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
  onCreateBackup: () => any;
  onRestoreBackup: (payload: any) => void;
}

type View = 'main' | 'persona' | 'journal' | 'api-settings' | 'gifts' | 'profile' | 'memos';

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
  onCreateBackup,
  onRestoreBackup
}: CompanionProps) {
  const [view, setView] = useState<View>('main');
  const [tempPersona, setTempPersona] = useState(persona);
  const [tempName, setTempName] = useState(companionName);
  const [tempAvatar, setTempAvatar] = useState(companionAvatar);
  const [isGifting, setIsGifting] = useState(false);
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [editJournalText, setEditJournalText] = useState('');
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editingMemoContent, setEditingMemoContent] = useState('');
  const [journalToDelete, setJournalToDelete] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle'|'testing'|'success'|'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [memoAiFrequency, setMemoAiFrequency] = useState(() => {
    const saved = localStorage.getItem('app_memoAiFrequency');
    return saved ? parseFloat(saved) : 0.5;
  });

  useEffect(() => {
    localStorage.setItem('app_memoAiFrequency', memoAiFrequency.toString());
  }, [memoAiFrequency]);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  const daysTogether = Math.max(1, Math.ceil((Date.now() - startDate) / (1000 * 60 * 60 * 24)));
  const finishedBooks = books.filter(b => b.progress === 100 || b.status === 'finished').length;
  const readingHours = Math.floor(readingTime / 60);
  const readingMinutes = readingTime % 60;
  
  const handleUpdateBook = (book: Book) => {
    // This is a placeholder, App.tsx handles this
  };

  const startEditJournal = (entry: JournalEntry) => {
    setEditingJournalId(entry.id);
    setEditJournalText(entry.aiResponse);
  };

  const saveEditJournal = (entry: JournalEntry) => {
    onUpdateJournal({
      ...entry,
      aiResponse: editJournalText
    });
    setEditingJournalId(null);
  };

  const confirmDeleteJournal = () => {
    if (journalToDelete) {
      onDeleteJournal(journalToDelete);
      setJournalToDelete(null);
    }
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
      
      const response = await sendMessage(prompt);
      
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
        cover: `https://picsum.photos/seed/${Date.now()}/300/400`,
        progress: 0,
        isTaRecommendation: true,
        taNote,
        content
      };
      
      onAddTaBook(newBook);
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
        ttsProvider: parsed.ttsProvider || 'none',
        ttsKey: parsed.ttsKey || '',
        ttsVoiceId: parsed.ttsVoiceId || 'alloy'
      };
    }
    return {
      geminiKey: process.env.GEMINI_API_KEY || '',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-1.5-flash',
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

  const handleSavePreset = () => {
    const name = prompt("请输入预设名称：");
    if (name) {
      setApiPresets([...apiPresets, { name, baseUrl: apiConfig.baseUrl, model: apiConfig.model, apiKey: apiConfig.geminiKey }]);
    }
  };

  const handleLoadPreset = (preset: any) => {
    setApiConfig({
      ...apiConfig,
      baseUrl: preset.baseUrl,
      model: preset.model,
      geminiKey: preset.apiKey || apiConfig.geminiKey
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
      model: apiConfig.model
    });
    // Also save TTS config to localStorage
    localStorage.setItem('app_apiConfig', JSON.stringify({
      apiKey: apiConfig.geminiKey,
      baseUrl: apiConfig.baseUrl,
      model: apiConfig.model,
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
        model: apiConfig.model
      });
      const res = await sendMessage('你好，这是一条测试消息。请回复“连接成功”。');
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
        baseUrl: apiConfig.baseUrl
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
      const blob = new Blob([backupString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `readmate-backup-${date}.json`;
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
      const parsed = JSON.parse(text);
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
              <p className="text-sm text-gray-500 mt-1 font-serif">专属陪伴 · 懂你所想</p>
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
              {journalEntries.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Quote size={48} className="mb-4 opacity-20" />
                  <p className="text-sm font-serif">还没有记录哦</p>
                  <p className="text-xs mt-1 font-serif">在阅读时划线分享，TA的回应会记录在这里</p>
                </div>
              ) : (
                journalEntries.map(entry => (
                  <div key={entry.id} className="bg-white rounded-2xl p-5 shadow-sm border border-[#e5e0d8]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-serif font-medium text-[#8E2A2A] bg-[#f4ecd8] px-2 py-1 rounded-md">{entry.bookTitle}</span>
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
                    {entry.userNote && (
                      <div className="mb-4 pl-3">
                        <span className="text-[10px] text-gray-400 block mb-1">我的批注：</span>
                        <p className="text-sm font-hand text-2xl text-[#8E2A2A] transform -rotate-1">{entry.userNote}</p>
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
                      ) : entry.chatHistory && entry.chatHistory.length > 0 ? (
                        <div className="flex-1 space-y-3">
                          {entry.chatHistory.map((msg, i) => (
                            <div key={i} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                              <span className="text-[10px] text-gray-400 mb-1">{msg.sender === 'user' ? '我' : 'TA'}</span>
                              <div className={`px-3 py-2 rounded-xl text-sm ${msg.sender === 'user' ? 'bg-[#8E2A2A] text-white' : 'bg-gray-100 text-[#2c2826]'}`}>
                                {msg.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div 
                          className="text-sm text-[#2c2826] leading-relaxed font-serif prose prose-sm prose-p:my-1 prose-a:text-[#8E2A2A]"
                          dangerouslySetInnerHTML={{ __html: entry.aiResponse }}
                        />
                      )}
                    </div>
                  </div>
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
                  placeholder="写下你的随笔或待办..."
                  className="w-full p-2 text-sm font-serif focus:outline-none resize-none min-h-[80px]"
                />
                <div className="flex justify-end mt-2">
                  <button 
                    onClick={async () => {
                      if (!editJournalText.trim()) return;
                      const newMemo: Memo = {
                        id: Date.now().toString(),
                        content: editJournalText,
                        timestamp: Date.now(),
                      };
                      setMemos([newMemo, ...memos]);
                      setEditJournalText('');
                      // Ask AI to comment based on frequency
                      if (Math.random() < memoAiFrequency) {
                        try {
                          const aiRes = await sendMessage(`用户写了一条便签：“${newMemo.content}”。请给出一句简短、温馨的评论或鼓励。`);
                          setMemos(prev => prev.map(m => m.id === newMemo.id ? { ...m, aiComment: aiRes } : m));
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
                            setEditingMemoId(memo.id);
                            setEditingMemoContent(memo.content);
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
                    {editingMemoId === memo.id ? (
                      <div className="mt-2">
                        <textarea
                          value={editingMemoContent}
                          onChange={(e) => setEditingMemoContent(e.target.value)}
                          className="w-full p-2 text-sm font-serif border border-[#e5e0d8] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#8E2A2A] resize-none min-h-[60px]"
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button 
                            onClick={() => setEditingMemoId(null)}
                            className="px-3 py-1 text-xs font-serif text-gray-500 hover:bg-gray-100 rounded-md"
                          >
                            取消
                          </button>
                          <button 
                            onClick={() => {
                              setMemos(memos.map(m => m.id === memo.id ? { ...m, content: editingMemoContent } : m));
                              setEditingMemoId(null);
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
                    {memo.aiComment && !editingMemoId && (
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
      </AnimatePresence>
    </div>
  );
}
