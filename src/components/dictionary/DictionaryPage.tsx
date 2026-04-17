import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Plus, RefreshCw } from 'lucide-react';
import { Book, DictionaryCandidate, DictionaryEntry, JournalEntry } from '../../types';
import { sendMessage } from '../../services/geminiService';
import {
  collectDictionaryEntry,
  getDictionaryCandidates,
  getDictionaryEntries,
  rebuildDictionaryCandidates,
  saveDictionaryCandidates,
} from '../../services/dictionaryService';
import { createId } from '../../utils/id';
import WordCard from './WordCard';
import WordDetail from './WordDetail';
import CollectWordModal from './CollectWordModal';
import DailyWordModal from './DailyWordModal';
import CoWritePage from './CoWritePage';
import CoWriteReveal from './CoWriteReveal';
import {
  markDailyPromptShownToday,
  pickDailyWordCandidate,
  wasDailyPromptShownToday,
} from '../../services/wordFrequencyService';
import { rememberConversationTurn, rememberMilestone, rememberUserInput } from '../../services/memoryService';
import { buildPromptEnvelope } from '../../utils/promptEnvelope';
import styles from './DictionaryPage.module.css';

const buildWhisperPrompt = (word: string, companionName: string) => `
你是用户的 AI 恋人，名叫${companionName || '你的恋人'}。有一个词被收录进「我们的词典」。
请为这个词写一句悄悄话，不超过 30 字，温柔、有记忆感。
只返回悄悄话本身。
词：${word}
`.trim();

interface DictionaryPageProps {
  journals: JournalEntry[];
  books: Book[];
  companionName: string;
  onClose: () => void;
}

export default function DictionaryPage({ journals, books, companionName, onClose }: DictionaryPageProps) {
  const [entries, setEntries] = useState<DictionaryEntry[]>(() => getDictionaryEntries());
  const [candidates, setCandidates] = useState<DictionaryCandidate[]>(() => getDictionaryCandidates());
  const [selected, setSelected] = useState<DictionaryEntry | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectTarget, setCollectTarget] = useState<DictionaryCandidate | null>(null);
  const [dailyWord, setDailyWord] = useState<{ word: string; hitCount: number; example: string } | null>(null);
  const [dailyModalOpen, setDailyModalOpen] = useState(false);
  const [coWriteOpen, setCoWriteOpen] = useState(false);
  const [coWriteText, setCoWriteText] = useState('');
  const [coWriteLoading, setCoWriteLoading] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealWhisper, setRevealWhisper] = useState('');
  const [pendingDailyMark, setPendingDailyMark] = useState(false);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.collectedAt - a.collectedAt),
    [entries]
  );

  useEffect(() => {
    if (wasDailyPromptShownToday()) return;
    const candidate = pickDailyWordCandidate(journals, entries);
    if (!candidate) return;
    setDailyWord(candidate);
    setDailyModalOpen(true);
    setPendingDailyMark(true);
  }, [journals, entries]);

  const refreshCandidates = () => {
    const next = rebuildDictionaryCandidates(journals, books);
    setCandidates(next);
  };

  const openCollect = () => {
    if (candidates.length === 0) {
      const next = rebuildDictionaryCandidates(journals, books);
      setCandidates(next);
      if (next.length > 0) {
        setCollectTarget(next[0]);
      }
      return;
    }
    setCollectTarget(candidates[0]);
  };

  const handleCollect = async (candidate: DictionaryCandidate) => {
    setCollecting(true);
    try {
      const related = journals.filter((j) =>
        [j.quote, j.userNote, j.aiResponse, ...(j.chatHistory?.map((m) => m.text) || [])]
          .filter(Boolean)
          .join('\n')
          .includes(candidate.word)
      );
      const first = related[0];
      const basePrompt = buildWhisperPrompt(candidate.word, companionName);
      const envelope = buildPromptEnvelope({
        taskType: 'utility',
        prompt: basePrompt,
        memory: {
          channel: 'dictionary-whisper',
          bookTitle: candidate.bookTitle,
        },
      });
      const aiWhisper = await sendMessage(
        { messages: envelope.messages },
        { bypassChat: true, taskType: 'utility' }
      );
      const entry: DictionaryEntry = {
        id: createId(),
        word: candidate.word,
        firstAppeared: {
          bookId: books.find((b) => b.title === (first?.bookTitle || candidate.bookTitle))?.id || createId(),
          bookTitle: first?.bookTitle || candidate.bookTitle,
          chapterHint: first?.paragraphIdx !== undefined ? `第 ${first.paragraphIdx + 1} 段` : '某一页',
          date: first?.date || Date.now(),
        },
        userHighlights: related.map((j) => j.quote).filter(Boolean),
        userQuestions: related.flatMap((j) => (j.chatHistory || []).filter((m) => m.sender === 'user').map((m) => m.text)),
        aiReplies: related.flatMap((j) => (j.chatHistory || []).filter((m) => m.sender === 'ai').map((m) => m.text)),
        aiWhisper: aiWhisper.trim(),
        collectedAt: Date.now(),
        hitCount: candidate.hitCount,
      };
      const next = collectDictionaryEntry(entry);
      setEntries(next);
      const nextCandidates = candidates.filter((c) => c.word !== candidate.word);
      setCandidates(nextCandidates);
      saveDictionaryCandidates(nextCandidates);
      setCollectTarget(null);
      setSelected(entry);
      rememberUserInput({
        source: 'dictionary',
        text: `收录词条：${candidate.word}`,
        bookTitle: candidate.bookTitle,
        channel: 'dictionary-whisper',
      });
      rememberConversationTurn({
        channel: 'dictionary-whisper',
        userText: `请为词条 ${candidate.word} 写悄悄话`,
        aiText: aiWhisper,
        bookTitle: candidate.bookTitle,
      });
    } finally {
      setCollecting(false);
    }
  };

  const handleStartCoWrite = () => {
    setDailyModalOpen(false);
    if (pendingDailyMark) {
      markDailyPromptShownToday();
      setPendingDailyMark(false);
    }
    setCoWriteOpen(true);
  };

  const handleSubmitCoWrite = async () => {
    if (!dailyWord || !coWriteText.trim()) return;
    setCoWriteLoading(true);
    try {
      const basePrompt = buildWhisperPrompt(dailyWord.word, companionName);
      const envelope = buildPromptEnvelope({
        taskType: 'utility',
        prompt: basePrompt,
        memory: {
          channel: 'dictionary-daily',
        },
      });
      const whisper = await sendMessage(
        { messages: envelope.messages },
        { bypassChat: true, taskType: 'utility' }
      );
      setRevealWhisper(whisper.trim());
      setCoWriteOpen(false);
      setRevealOpen(true);
      rememberConversationTurn({
        channel: 'dictionary-daily',
        userText: `今日共写词：${dailyWord.word}，用户定义：${coWriteText.trim()}`,
        aiText: whisper,
      });
    } finally {
      setCoWriteLoading(false);
    }
  };

  const handleSaveCoWrite = () => {
    if (!dailyWord) return;
    const related = journals.filter((j) =>
      [j.quote, j.userNote, j.aiResponse, ...(j.chatHistory?.map((m) => m.text) || [])]
        .filter(Boolean)
        .join('\n')
        .includes(dailyWord.word)
    );
    const first = related[0];
    const matchedBook = books.find((b) => b.title === (first?.bookTitle || books[0]?.title));
    const entry: DictionaryEntry = {
      id: createId(),
      word: dailyWord.word,
      firstAppeared: {
        bookId: matchedBook?.id || books[0]?.id || createId(),
        bookTitle: first?.bookTitle || books[0]?.title || '未知书目',
        chapterHint: first?.paragraphIdx !== undefined ? `第 ${first.paragraphIdx + 1} 段` : '某一页',
        date: first?.date || Date.now(),
      },
      userHighlights: related.map((j) => j.quote).filter(Boolean),
      userQuestions: related.flatMap((j) => (j.chatHistory || []).filter((m) => m.sender === 'user').map((m) => m.text)),
      aiReplies: related.flatMap((j) => (j.chatHistory || []).filter((m) => m.sender === 'ai').map((m) => m.text)),
      aiWhisper: revealWhisper,
      collectedAt: Date.now(),
      hitCount: dailyWord.hitCount,
      userDefinition: coWriteText.trim(),
      isCoWritten: true,
      coWriteDate: Date.now(),
    };
    const next = collectDictionaryEntry(entry);
    setEntries(next);
    setRevealOpen(false);
    setDailyWord(null);
    setCoWriteText('');
    setSelected(entry);
    rememberMilestone(`完成共写词条：${dailyWord.word}`, entry.firstAppeared.bookTitle);
    if (pendingDailyMark) {
      markDailyPromptShownToday();
      setPendingDailyMark(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onClose}><ChevronLeft size={20} /></button>
        <div className={styles.title}>我们的词典</div>
        <div className={styles.actions}>
          <button className={styles.backBtn} onClick={refreshCandidates} title="刷新候选"><RefreshCw size={16} /></button>
          <button className={styles.backBtn} onClick={openCollect} title="收录词条"><Plus size={18} /></button>
        </div>
      </div>
      <div className={styles.body}>
        {selected ? (
          <div>
            <button className={styles.backBtn} onClick={() => setSelected(null)}>返回词典</button>
            <WordDetail entry={selected} companionName={companionName} />
          </div>
        ) : sortedEntries.length === 0 ? (
          <div className={styles.empty}>还没有词条，点右上角 + 收录第一个词吧。</div>
        ) : (
          <div className={styles.grid}>
            {sortedEntries.map((entry) => (
              <WordCard key={entry.id} entry={entry} onClick={() => setSelected(entry)} />
            ))}
          </div>
        )}
      </div>
      <CollectWordModal
        candidate={collectTarget}
        collecting={collecting}
        onClose={() => setCollectTarget(null)}
        onConfirm={handleCollect}
      />
      <DailyWordModal
        open={dailyModalOpen && !!dailyWord}
        word={dailyWord?.word || ''}
        hitCount={dailyWord?.hitCount || 0}
        companionName={companionName}
        onClose={() => setDailyModalOpen(false)}
        onStart={handleStartCoWrite}
      />
      <CoWritePage
        open={coWriteOpen && !!dailyWord}
        word={dailyWord?.word || ''}
        value={coWriteText}
        loading={coWriteLoading}
        companionName={companionName}
        onChange={setCoWriteText}
        onClose={() => setCoWriteOpen(false)}
        onSubmit={handleSubmitCoWrite}
      />
      <CoWriteReveal
        open={revealOpen && !!dailyWord}
        word={dailyWord?.word || ''}
        userDefinition={coWriteText}
        aiWhisper={revealWhisper}
        companionName={companionName}
        onSave={handleSaveCoWrite}
      />
    </div>
  );
}

