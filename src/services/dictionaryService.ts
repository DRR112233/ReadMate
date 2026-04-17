import { Book, DictionaryCandidate, DictionaryEntry, JournalEntry } from '../types';
import { createId } from '../utils/id';

const ENTRIES_KEY = 'app_dictionaryEntries';
const CANDIDATES_KEY = 'app_dictionaryCandidates';

const STOP_WORDS = new Set([
  '我们', '他们', '你们', '自己', '如果', '但是', '因为', '所以', '然后', '这个', '那个', '什么',
  '真的', '就是', '还是', '已经', '一个', '一种', '一些', '没有', '不是', '可以', '时候', '觉得',
]);

const normalizeWord = (word: string) => word.trim();

const extractWords = (text: string): string[] => {
  const matches = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  return matches
    .map(normalizeWord)
    .filter((w) => !STOP_WORDS.has(w) && w.length >= 2 && w.length <= 4);
};

export const getDictionaryEntries = (): DictionaryEntry[] => {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveDictionaryEntries = (entries: DictionaryEntry[]) => {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
};

export const getDictionaryCandidates = (): DictionaryCandidate[] => {
  try {
    const raw = localStorage.getItem(CANDIDATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveDictionaryCandidates = (candidates: DictionaryCandidate[]) => {
  localStorage.setItem(CANDIDATES_KEY, JSON.stringify(candidates));
};

export const rebuildDictionaryCandidates = (
  journals: JournalEntry[],
  books: Book[],
  limit = 24
): DictionaryCandidate[] => {
  const wordMap = new Map<string, { count: number; sentence: string; bookTitle: string }>();
  journals.forEach((entry) => {
    const pool = [entry.quote, entry.userNote, entry.aiResponse, ...(entry.chatHistory?.map((m) => m.text) || [])]
      .filter(Boolean)
      .join('\n');
    const words = extractWords(pool);
    words.forEach((word) => {
      const prev = wordMap.get(word);
      if (prev) {
        prev.count += 1;
      } else {
        wordMap.set(word, {
          count: 1,
          sentence: entry.quote || entry.userNote || entry.aiResponse || '',
          bookTitle: entry.bookTitle,
        });
      }
    });
  });

  const existingWords = new Set(getDictionaryEntries().map((e) => e.word));
  const candidates: DictionaryCandidate[] = [...wordMap.entries()]
    .filter(([word, meta]) => meta.count >= 2 && !existingWords.has(word))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([word, meta]) => ({
      id: createId(),
      word,
      hitCount: meta.count,
      bookTitle: meta.bookTitle || books[0]?.title || '未知书目',
      exampleSentence: (meta.sentence || '').slice(0, 70),
      createdAt: Date.now(),
    }));

  saveDictionaryCandidates(candidates);
  return candidates;
};

export const collectDictionaryEntry = (entry: DictionaryEntry) => {
  const entries = getDictionaryEntries();
  const existing = entries.find((e) => e.word === entry.word);
  const next = existing
    ? entries.map((e) => (e.word === entry.word ? { ...e, ...entry, hitCount: Math.max(e.hitCount, entry.hitCount) } : e))
    : [entry, ...entries];
  saveDictionaryEntries(next);
  const nextCandidates = getDictionaryCandidates().filter((c) => c.word !== entry.word);
  saveDictionaryCandidates(nextCandidates);
  return next;
};

