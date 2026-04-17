import { DictionaryEntry, JournalEntry } from '../types';

const DAILY_KEY = 'app_dailyCoWordPromptDate';
const STOP_WORDS = new Set([
  '我们', '他们', '你们', '自己', '如果', '但是', '因为', '所以', '然后', '这个', '那个', '什么',
  '真的', '就是', '还是', '已经', '一个', '一种', '一些', '没有', '不是', '可以', '时候', '觉得',
]);

const extractWords = (text: string) =>
  (text.match(/[\u4e00-\u9fa5]{2,4}/g) || []).filter((w) => !STOP_WORDS.has(w));

export const wasDailyPromptShownToday = () => {
  const today = new Date().toDateString();
  return localStorage.getItem(DAILY_KEY) === today;
};

export const markDailyPromptShownToday = () => {
  localStorage.setItem(DAILY_KEY, new Date().toDateString());
};

export const pickDailyWordCandidate = (
  journals: JournalEntry[],
  dictionaryEntries: DictionaryEntry[]
): { word: string; hitCount: number; example: string } | null => {
  const existing = new Set(dictionaryEntries.map((e) => e.word));
  const map = new Map<string, { count: number; example: string }>();
  const recent = journals.slice(0, 120);
  recent.forEach((j) => {
    const pool = [j.quote, j.userNote, ...(j.chatHistory?.map((m) => m.text) || [])]
      .filter(Boolean)
      .join('\n');
    extractWords(pool).forEach((w) => {
      if (existing.has(w)) return;
      const prev = map.get(w);
      if (prev) prev.count += 1;
      else map.set(w, { count: 1, example: j.quote || pool.slice(0, 60) });
    });
  });
  const top = [...map.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (!top || top[1].count < 2) return null;
  return { word: top[0], hitCount: top[1].count, example: top[1].example };
};

