import { createId } from "../utils/id";

const MEMORY_KEY = "app_memory_store_v1";
const MAX_FACTS = 120;
const MAX_EVENTS = 240;
const MAX_CONVERSATION_TURNS = 12;
const INTERACTION_EVENT_COOLDOWN_MS = 10 * 60 * 1000;
const FACT_DECAY_DAY_MS = 1000 * 60 * 60 * 24;
const FACT_STALE_DAYS = 14;

type MemorySource =
  | "chat"
  | "manual_note"
  | "share_quote"
  | "memo"
  | "dictionary"
  | "milestone"
  | "system";

type MemoryEventType =
  | "emotion"
  | "reading"
  | "milestone"
  | "preference"
  | "interaction";

export interface MemoryFact {
  id: string;
  text: string;
  confidence: number;
  score: number;
  tags: string[];
  scope?: "global" | "book" | "channel";
  evidence?: Array<{
    source: MemorySource;
    quote: string;
    createdAt: number;
    bookTitle?: string;
    channel?: string;
  }>;
  conflictWith?: string[];
  channels?: string[];
  bookTitles?: string[];
  preferenceKey?: string;
  preferencePolarity?: "positive" | "negative" | "neutral";
  positiveFeedbackCount?: number;
  negativeFeedbackCount?: number;
  source: MemorySource;
  firstSeenAt: number;
  lastSeenAt: number;
  hitCount: number;
  pinned?: boolean;
}

export interface MemoryEvent {
  id: string;
  text: string;
  type: MemoryEventType;
  bookTitle?: string;
  tags: string[];
  source: MemorySource;
  createdAt: number;
}

export interface MemoryMistake {
  id: string;
  key: string;
  text: string;
  kind?: MemoryMistakeKind;
  preferenceKey?: string;
  channel?: string;
  bookTitle?: string;
  createdAt: number;
  hitCount: number;
  lastHitAt: number;
}

export type MemoryMistakeKind =
  | "inference"
  | "exaggeration"
  | "time_mismatch"
  | "boundary"
  | "tone"
  | "identity"
  | "other"
  | "unknown";

interface ConversationTurn {
  userText: string;
  aiText: string;
  createdAt: number;
}

interface ConversationMemory {
  channel: string;
  summary: string;
  turns: ConversationTurn[];
  updatedAt: number;
}

interface BookMemory {
  bookId?: string;
  bookTitle: string;
  summary: string;
  highlights: string[];
  emotions: string[];
  updatedAt: number;
}

interface MemoryStore {
  facts: MemoryFact[];
  events: MemoryEvent[];
  conversations: Record<string, ConversationMemory>;
  books: Record<string, BookMemory>;
  mistakes: MemoryMistake[];
  updatedAt: number;
}

interface RememberUserInputOptions {
  source: MemorySource;
  text: string;
  bookTitle?: string;
  channel?: string;
}

interface RememberConversationOptions {
  channel: string;
  userText: string;
  aiText: string;
  bookTitle?: string;
  bookId?: string;
}

interface MemoryContextOptions {
  channel?: string;
  bookTitle?: string;
  bookId?: string;
  maxFacts?: number;
  maxEvents?: number;
}

interface MemoryContextBundle {
  text: string;
  meta: {
    facts: number;
    events: number;
    mistakes: number;
    hasBookMemory: boolean;
    hasConversation: boolean;
  };
}

const defaultStore = (): MemoryStore => ({
  facts: [],
  events: [],
  conversations: {},
  books: {},
  mistakes: [],
  updatedAt: Date.now(),
});

const normalizeText = (text: string) =>
  (text || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

const toKey = (text: string) => normalizeText(text).toLowerCase();

const normalizeForSimilarity = (text: string) =>
  normalizeText(text)
    .toLowerCase()
    .replace(/[，。！？、,.!?;；:："“”"'`~（）()【】\[\]<>《》]/g, "")
    .replace(/\s+/g, "");

const toTrigrams = (text: string) => {
  const s = normalizeForSimilarity(text);
  if (!s) return new Set<string>();
  if (s.length <= 3) return new Set([s]);
  const set = new Set<string>();
  for (let i = 0; i <= s.length - 3; i += 1) {
    set.add(s.slice(i, i + 3));
  }
  return set;
};

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union <= 0 ? 0 : inter / union;
};

const isMistakeLike = (factText: string, mistakes: MemoryMistake[]) => {
  const key = toKey(factText);
  if (mistakes.some((m) => m.key === key)) return true;
  const a = toTrigrams(factText);
  for (const m of mistakes) {
    const sim = jaccard(a, toTrigrams(m.text));
    if (sim >= 0.58) return true;
  }
  return false;
};

const inferMistakeKind = (text: string): MemoryMistakeKind => {
  const t = normalizeText(text);
  if (/(你(一定|肯定)|我知道你|我记得你|我们以前|你曾经|之前你说过)/.test(t)) return "inference";
  if (/(永远|一直|从不|每次|一定会|绝对)/.test(t)) return "exaggeration";
  if (/(昨天|今天|明天|刚刚|上周|去年|以前|当时)/.test(t)) return "time_mismatch";
  if (/(现实|线下|手机号|地址|见面|转账|隐私|敏感|越界)/.test(t)) return "boundary";
  if (/(骂|蠢|废物|滚|恶心)/.test(t)) return "tone";
  if (/(请叫我|我的名字是|我是.*(男|女)|我来自|我的身份)/.test(t)) return "identity";
  return "unknown";
};

const mistakeKindLabel: Record<MemoryMistakeKind, string> = {
  inference: "推断/脑补",
  exaggeration: "夸张绝对化",
  time_mismatch: "时间错配",
  boundary: "越界/隐私",
  tone: "语气伤人",
  identity: "身份称呼错",
  other: "其他",
  unknown: "未标注",
};

const mistakeAvoidStrategy: Record<MemoryMistakeKind, string> = {
  inference: "避免基于记忆做过度推断；不确定就用疑问句或给出多个可能性。",
  exaggeration: "避免使用“永远/一直/绝对/从不”等绝对化措辞；用更温和的概率表述。",
  time_mismatch: "避免捏造具体时间点；需要时间信息时先向用户确认。",
  boundary: "避免询问/输出现实隐私与越界建议；保持在阅读陪伴与情绪支持范围内。",
  tone: "避免攻击性词汇与指责；保持温柔、尊重的恋人语气。",
  identity: "不要自作主张更改用户称呼/身份；只使用用户明确给出的称呼与自我描述。",
  other: "避免重复该类错误；不确定时先澄清再继续。",
  unknown: "这条曾被用户判错；回答时先自检，必要时向用户澄清确认。",
};

const safeReadStore = (): MemoryStore => {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw);
    return {
      ...defaultStore(),
      ...parsed,
      facts: Array.isArray(parsed?.facts) ? parsed.facts : [],
      events: Array.isArray(parsed?.events) ? parsed.events : [],
      conversations: parsed?.conversations && typeof parsed.conversations === "object" ? parsed.conversations : {},
      books: parsed?.books && typeof parsed.books === "object" ? parsed.books : {},
      mistakes: Array.isArray(parsed?.mistakes) ? parsed.mistakes : [],
    };
  } catch {
    return defaultStore();
  }
};

const safeSaveStore = (store: MemoryStore) => {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({ ...store, updatedAt: Date.now() }));
  } catch (error) {
    console.error("save memory failed", error);
  }
};

const sentenceSplit = (text: string) =>
  normalizeText(text)
    .split(/[。！？!?;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);

const preferencePatterns: RegExp[] = [
  /我喜欢([^，。！？!?\n]{1,24})/,
  /我更喜欢([^，。！？!?\n]{1,24})/,
  /我不喜欢([^，。！？!?\n]{1,24})/,
  /我讨厌([^，。！？!?\n]{1,24})/,
  /我希望([^，。！？!?\n]{1,28})/,
  /请叫我([^，。！？!?\n]{1,12})/,
  /我想要([^，。！？!?\n]{1,28})/,
];

const emotionPatterns: RegExp[] = [
  /我(今天|现在|最近)?(很|有点|特别)?(开心|难过|焦虑|紧张|疲惫|委屈|孤独|幸福|平静)/,
  /这段让我(心疼|破防|治愈|感动|共鸣)/,
  /我(被|感觉)(触动|安慰|鼓励|刺痛)到了/,
];

const tagByText = (text: string): string[] => {
  const tags: string[] = [];
  if (/(喜欢|不喜欢|讨厌|希望|想要|请叫我)/.test(text)) tags.push("preference");
  if (/(开心|难过|焦虑|紧张|疲惫|治愈|感动|心疼|孤独)/.test(text)) tags.push("emotion");
  if (/(书|章节|读到|划线|批注|诗签|词典)/.test(text)) tags.push("reading");
  return tags;
};

const collectFactsFromText = (text: string) => {
  const facts: Array<{ text: string; confidence: number; tags: string[] }> = [];
  const norm = normalizeText(text);
  preferencePatterns.forEach((pattern) => {
    const match = norm.match(pattern);
    if (match) {
      const cleaned = normalizeText(match[0]);
      if (cleaned.length >= 4 && cleaned.length <= 36) {
        facts.push({ text: cleaned, confidence: 0.78, tags: [...tagByText(cleaned), "preference"] });
      }
    }
  });
  sentenceSplit(norm).forEach((sentence) => {
    if (emotionPatterns.some((pattern) => pattern.test(sentence))) {
      facts.push({ text: sentence, confidence: 0.7, tags: [...tagByText(sentence), "emotion"] });
    }
  });
  return facts;
};

const MEMORY_WRITER_LLM_FLAG = "app_memoryWriter_llm";
const LLM_WRITE_COOLDOWN_MS = 30000;
const llmWriteLastAtByChannel: Record<string, number> = {};

const shouldUseLlmWriter = (channel?: string) => {
  try {
    if (localStorage.getItem(MEMORY_WRITER_LLM_FLAG) !== "1") return false;
  } catch {
    return false;
  }
  const key = (channel || "default").trim().toLowerCase();
  const now = Date.now();
  const last = llmWriteLastAtByChannel[key] || 0;
  if (now - last < LLM_WRITE_COOLDOWN_MS) return false;
  llmWriteLastAtByChannel[key] = now;
  return true;
};

const safeJsonParse = (raw: string) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const inferPreferencePolarity = (text: string): "positive" | "negative" | "neutral" => {
  if (/(不喜欢|讨厌)/.test(text)) return "negative";
  if (/(喜欢|更喜欢|希望|想要)/.test(text)) return "positive";
  return "neutral";
};

const inferPreferenceKey = (text: string): string | undefined => {
  const normalized = normalizeText(text);
  const stripped = normalized
    .replace(/^我(更)?喜欢/, "")
    .replace(/^我不喜欢/, "")
    .replace(/^我讨厌/, "")
    .replace(/^我希望/, "")
    .replace(/^我想要/, "")
    .replace(/^请叫我/, "")
    .replace(/[。！？，,\s]/g, "");
  if (!stripped || stripped.length < 2) return undefined;
  return stripped.slice(0, 20).toLowerCase();
};

const decayScore = (fact: MemoryFact) => {
  if (fact.pinned) return fact.score;
  const staleDays = Math.floor((Date.now() - fact.lastSeenAt) / FACT_DECAY_DAY_MS);
  if (staleDays <= FACT_STALE_DAYS) return fact.score;
  const decay = Math.min(24, staleDays - FACT_STALE_DAYS);
  const negPenalty = Math.min(40, (fact.negativeFeedbackCount || 0) * 12);
  const posBoost = Math.min(18, (fact.positiveFeedbackCount || 0) * 4);
  return Math.max(2, fact.score - decay - negPenalty + posBoost);
};

const upsertFact = (
  store: MemoryStore,
  fact: { text: string; confidence: number; tags: string[]; evidence?: MemoryFact["evidence"] },
  source: MemorySource,
  options: { channel?: string; bookTitle?: string } = {}
) => {
  const key = toKey(fact.text);
  const existed = store.facts.find((f) => toKey(f.text) === key);
  const preferenceKey = inferPreferenceKey(fact.text);
  const preferencePolarity = inferPreferencePolarity(fact.text);
  const normalizedChannel = options.channel?.trim().toLowerCase();
  const normalizedBookTitle = options.bookTitle?.trim();
  const scope: MemoryFact["scope"] = normalizedBookTitle ? "book" : (normalizedChannel ? "channel" : "global");
  let conflictWith: string[] = [];
  if (existed) {
    existed.hitCount += 1;
    existed.lastSeenAt = Date.now();
    existed.confidence = Math.max(existed.confidence, fact.confidence);
    existed.score = Math.min(100, existed.score + 3);
    existed.tags = [...new Set([...existed.tags, ...fact.tags])];
    if (normalizedChannel) existed.channels = [...new Set([...(existed.channels || []), normalizedChannel])];
    if (normalizedBookTitle) existed.bookTitles = [...new Set([...(existed.bookTitles || []), normalizedBookTitle])];
    if (preferenceKey) existed.preferenceKey = preferenceKey;
    existed.preferencePolarity = preferencePolarity;
    existed.positiveFeedbackCount = existed.positiveFeedbackCount || 0;
    existed.negativeFeedbackCount = existed.negativeFeedbackCount || 0;
    existed.scope = existed.scope || scope;
    if (fact.evidence && fact.evidence.length > 0) {
      const prev = existed.evidence || [];
      const next = [...fact.evidence, ...prev].filter((ev, idx, arr) => {
        const k = `${toKey(ev.quote)}|${ev.source}|${toKey(ev.channel || "")}|${toKey(ev.bookTitle || "")}`;
        return arr.findIndex((x) => `${toKey(x.quote)}|${x.source}|${toKey(x.channel || "")}|${toKey(x.bookTitle || "")}` === k) === idx;
      });
      existed.evidence = next.slice(0, 6);
    }
    return;
  }
  // 冲突偏好消解：同 preferenceKey 只保留最近且更强的一条
  if (preferenceKey) {
    const removedIds: string[] = [];
    store.facts = store.facts.filter((existingFact) => {
      if (!existingFact.preferenceKey) return true;
      if (existingFact.preferenceKey !== preferenceKey) return true;
      if (existingFact.pinned) return true;
      removedIds.push(existingFact.id);
      return false;
    });
    conflictWith = removedIds;
  }
  store.facts.unshift({
    id: createId(),
    text: fact.text,
    confidence: fact.confidence,
    score: Math.round(fact.confidence * 72),
    tags: [...new Set(fact.tags)],
    scope,
    evidence: (fact.evidence || []).slice(0, 6),
    conflictWith,
    channels: normalizedChannel ? [normalizedChannel] : [],
    bookTitles: normalizedBookTitle ? [normalizedBookTitle] : [],
    preferenceKey,
    preferencePolarity,
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    source,
    firstSeenAt: Date.now(),
    lastSeenAt: Date.now(),
    hitCount: 1,
    pinned: false,
  });
  if (store.facts.length > MAX_FACTS) {
    store.facts = store.facts
      .sort((a, b) => Number(b.pinned) * 1000 + b.score + b.hitCount - (Number(a.pinned) * 1000 + a.score + a.hitCount))
      .slice(0, MAX_FACTS);
  }
};

const pushEvent = (
  store: MemoryStore,
  event: { text: string; type: MemoryEventType; bookTitle?: string; tags?: string[]; source: MemorySource }
) => {
  const text = normalizeText(event.text);
  if (!text) return;
  store.events.unshift({
    id: createId(),
    text,
    type: event.type,
    bookTitle: event.bookTitle,
    tags: event.tags || tagByText(text),
    source: event.source,
    createdAt: Date.now(),
  });
  if (store.events.length > MAX_EVENTS) {
    store.events = store.events.slice(0, MAX_EVENTS);
  }
};

const pickRecentConversationSummary = (turns: ConversationTurn[]) => {
  const recent = turns.slice(-3);
  if (recent.length === 0) return "";
  return recent
    .map((turn) => `用户:${normalizeText(turn.userText).slice(0, 34)} | TA:${normalizeText(turn.aiText).slice(0, 34)}`)
    .join("；");
};

const rememberBookSnippet = (store: MemoryStore, bookTitle: string, snippet: string) => {
  const key = bookTitle.trim().toLowerCase();
  if (!key) return;
  const target = store.books[key] || {
    bookTitle,
    summary: "",
    highlights: [],
    emotions: [],
    updatedAt: Date.now(),
  };
  const normalized = normalizeText(snippet).slice(0, 80);
  if (normalized && !target.highlights.includes(normalized)) {
    target.highlights = [normalized, ...target.highlights].slice(0, 8);
  }
  if (/(开心|难过|焦虑|平静|治愈|共鸣|感动|心疼|温暖)/.test(snippet)) {
    const mood = (snippet.match(/开心|难过|焦虑|平静|治愈|共鸣|感动|心疼|温暖/g) || []).join("、");
    if (mood && !target.emotions.includes(mood)) {
      target.emotions = [mood, ...target.emotions].slice(0, 6);
    }
  }
  target.summary = `最近常提：${target.highlights.slice(0, 3).join(" / ")}`.slice(0, 120);
  target.updatedAt = Date.now();
  store.books[key] = target;
};

export const rememberUserInput = (options: RememberUserInputOptions) => {
  const text = normalizeText(options.text);
  if (!text || text.length < 4) return;
  const store = safeReadStore();
  const now = Date.now();
  collectFactsFromText(text).forEach((fact) =>
    upsertFact(
      store,
      {
        ...fact,
        evidence: [
          {
            source: options.source,
            quote: text.slice(0, 120),
            createdAt: now,
            bookTitle: options.bookTitle,
            channel: options.channel,
          },
        ],
      },
      options.source,
      { channel: options.channel, bookTitle: options.bookTitle }
    )
  );
  if (emotionPatterns.some((pattern) => pattern.test(text))) {
    pushEvent(store, {
      text: `用户表达了明显情绪：${text.slice(0, 60)}`,
      type: "emotion",
      bookTitle: options.bookTitle,
      source: options.source,
    });
  }
  if (options.bookTitle) {
    rememberBookSnippet(store, options.bookTitle, text);
  }
  safeSaveStore(store);

  // 可选：LLM 二次结构化写入（默认关闭，开启后走辅助模型、限频）
  if (!shouldUseLlmWriter(options.channel)) return;
  void (async () => {
    try {
      const { sendMessage } = await import("./geminiService");
      const system = `你是一个“记忆写入器”。你的任务是从用户一句话中抽取可以长期记住的事实。\\n\\n` +
        `要求：\\n` +
        `- 只输出 JSON，不要输出任何额外文字。\\n` +
        `- 不要编造。只抽取用户明确表达的信息。\\n` +
        `- facts 最多 3 条，每条 text 4~36 字。\\n` +
        `- confidence 0~1，越明确越高。\\n` +
        `- tags 只用：preference/emotion/reading/identity/other。\\n\\n` +
        `输出 JSON 格式：{ \"facts\": [{\"text\": string, \"confidence\": number, \"tags\": string[] }] }`;
      const user = `用户原文：${text}`;
      const raw = await sendMessage(
        { messages: [{ role: "system", content: system }, { role: "user", content: user }] },
        { taskType: "memory", bypassChat: true, forceAuxiliaryModel: true, timeoutMs: 15000 }
      );
      const parsed = safeJsonParse(String(raw || "").trim());
      const facts = Array.isArray(parsed?.facts) ? parsed.facts : [];
      if (facts.length === 0) return;
      const store2 = safeReadStore();
      facts.slice(0, 3).forEach((f: any) => {
        const t = normalizeText(String(f?.text || ""));
        const c = Number(f?.confidence);
        const tags = Array.isArray(f?.tags) ? f.tags.map((x: any) => String(x)) : [];
        if (!t || t.length < 4 || t.length > 36) return;
        if (!Number.isFinite(c) || c <= 0) return;
        upsertFact(
          store2,
          {
            text: t,
            confidence: Math.max(0.2, Math.min(0.98, c)),
            tags: [...new Set([...tags, ...tagByText(t)])],
            evidence: [
              {
                source: options.source,
                quote: text.slice(0, 120),
                createdAt: Date.now(),
                bookTitle: options.bookTitle,
                channel: options.channel,
              },
            ],
          },
          "system",
          { channel: options.channel, bookTitle: options.bookTitle }
        );
      });
      safeSaveStore(store2);
    } catch {
      // ignore LLM writer failures
    }
  })();
};

export const rememberConversationTurn = (options: RememberConversationOptions) => {
  const store = safeReadStore();
  const channelKey = (options.channel || "default").trim().toLowerCase();
  if (!channelKey) return;
  const conversation = store.conversations[channelKey] || {
    channel: channelKey,
    summary: "",
    turns: [],
    updatedAt: Date.now(),
  };
  conversation.turns.push({
    userText: normalizeText(options.userText).slice(0, 220),
    aiText: normalizeText(options.aiText).slice(0, 220),
    createdAt: Date.now(),
  });
  conversation.turns = conversation.turns.slice(-MAX_CONVERSATION_TURNS);
  conversation.summary = pickRecentConversationSummary(conversation.turns);
  conversation.updatedAt = Date.now();
  store.conversations[channelKey] = conversation;

  if (options.bookTitle) {
    rememberBookSnippet(store, options.bookTitle, `${options.userText}\n${options.aiText}`);
  }
  const now = Date.now();
  const recentInteraction = store.events.find(
    (event) =>
      event.type === "interaction" &&
      event.tags?.includes(`channel:${channelKey}`) &&
      now - event.createdAt < INTERACTION_EVENT_COOLDOWN_MS
  );
  if (!recentInteraction) {
    pushEvent(store, {
      text: `在「${options.channel}」发生一次互动`,
      type: "interaction",
      bookTitle: options.bookTitle,
      source: "chat",
      tags: ["interaction", `channel:${channelKey}`],
    });
  }
  safeSaveStore(store);
};

export const rememberMilestone = (text: string, bookTitle?: string) => {
  const store = safeReadStore();
  pushEvent(store, {
    text,
    type: "milestone",
    bookTitle,
    source: "milestone",
    tags: ["milestone"],
  });
  safeSaveStore(store);
};

export const getMemoryContext = (options: MemoryContextOptions = {}) => {
  return getMemoryContextBundle(options).text;
};

export const getMemoryContextBundle = (options: MemoryContextOptions = {}): MemoryContextBundle => {
  const store = safeReadStore();
  const maxFacts = options.maxFacts ?? 5;
  const maxEvents = options.maxEvents ?? 4;
  const channel = (options.channel || "").trim().toLowerCase();
  const bookKey = (options.bookTitle || "").trim().toLowerCase();
  const bookTitleRaw = (options.bookTitle || "").trim();

  const mistakes = store.mistakes || [];
  const activeFacts = store.facts
    .filter((f) => f.confidence >= 0.65)
    .map((f) => ({ ...f, score: decayScore(f) }))
    .filter((f) => f.score >= 6 && !isMistakeLike(f.text, mistakes));
  const scopedBookFacts = activeFacts.filter((f) => (f.bookTitles || []).some((title) => title.trim().toLowerCase() === bookKey));
  const scopedChannelFacts = activeFacts.filter((f) => (f.channels || []).includes(channel));
  const globalPinnedFacts = activeFacts.filter((f) => f.pinned);
  const factPool = [
    ...scopedBookFacts,
    ...scopedChannelFacts,
    ...globalPinnedFacts,
    ...activeFacts,
  ];
  const dedupFacts = new Map<string, MemoryFact>();
  factPool.forEach((f) => {
    const k = toKey(f.text);
    if (!dedupFacts.has(k)) dedupFacts.set(k, f);
  });
  const facts = [...dedupFacts.values()]
    .sort((a, b) => Number(b.pinned) * 1000 + b.score + b.hitCount - (Number(a.pinned) * 1000 + a.score + a.hitCount))
    .slice(0, maxFacts);

  const events = store.events
    .filter((event) => {
      if (!bookKey) return true;
      return !event.bookTitle || event.bookTitle.trim().toLowerCase() === bookKey;
    })
    .slice(0, maxEvents);

  const conversationSummary = channel ? store.conversations[channel]?.summary || "" : "";
  const bookMemory = bookKey ? store.books[bookKey] : undefined;

  const lines: string[] = [];
  const scopedMistakes = mistakes
    .filter((m) => {
      if (!bookKey && !channel) return true;
      const bookMatch = bookKey && m.bookTitle && m.bookTitle.trim().toLowerCase() === bookKey;
      const channelMatch = channel && m.channel && m.channel.trim().toLowerCase() === channel;
      return Boolean(bookMatch || channelMatch);
    })
    .slice(0, 3);
  const globalMistakes = mistakes.slice(0, 2);
  const mergedMistakesMap = new Map<string, string>();
  [...scopedMistakes, ...globalMistakes].forEach((m) => {
    if (!mergedMistakesMap.has(m.key)) mergedMistakesMap.set(m.key, m.text);
  });
  const mergedMistakes = [...mergedMistakesMap.values()].slice(0, 4);
  if (mergedMistakes.length > 0) {
    lines.push("【避免踩雷】");
    const byText = new Map<string, MemoryMistake>();
    [...scopedMistakes, ...globalMistakes].forEach((m) => {
      if (!byText.has(m.text)) byText.set(m.text, m);
    });
    mergedMistakes.forEach((text) => {
      const kind = byText.get(text)?.kind || "unknown";
      const label = mistakeKindLabel[kind] || "未标注";
      lines.push(`- 不要再说/记成：${text}（类型：${label}）`);
    });
    const kinds = [...new Set(mergedMistakes.map((t) => byText.get(t)?.kind || "unknown"))].slice(0, 3);
    if (kinds.length > 0) {
      lines.push("【避免策略】");
      kinds.forEach((k) => {
        lines.push(`- ${mistakeKindLabel[k] || "未标注"}：${mistakeAvoidStrategy[k] || mistakeAvoidStrategy.unknown}`);
      });
    }
  }
  if (facts.length > 0) {
    lines.push("【长期记忆】");
    facts.forEach((fact) => {
      const lowConfidence = fact.confidence < 0.74;
      const feedbackHint =
        (fact.negativeFeedbackCount || 0) > 0 ? ` · 纠错${fact.negativeFeedbackCount || 0}次` : "";
      const scopeHint = fact.scope ? ` · ${fact.scope}` : "";
      const confHint = lowConfidence ? `（置信度${fact.confidence.toFixed(2)}${feedbackHint}${scopeHint}）` : "";
      lines.push(`- ${fact.text}${confHint}`);
    });
  }
  if (bookMemory) {
    lines.push("【当前书记忆】");
    if (bookMemory.summary) lines.push(`- ${bookMemory.summary}`);
    if (bookMemory.emotions.length > 0) lines.push(`- 常见情绪：${bookMemory.emotions.slice(0, 3).join("、")}`);
  } else if (bookTitleRaw) {
    lines.push("【当前书】");
    lines.push(`- 当前书名：${bookTitleRaw}`);
  }
  if (conversationSummary) {
    lines.push("【近期对话】");
    lines.push(`- ${conversationSummary}`);
  }
  if (events.length > 0) {
    lines.push("【最近事件】");
    events.forEach((event) => lines.push(`- ${event.text}`));
  }
  return {
    text: lines.join("\n"),
    meta: {
      facts: facts.length,
      events: events.length,
      mistakes: mergedMistakes.length,
      hasBookMemory: Boolean(bookMemory || bookTitleRaw),
      hasConversation: Boolean(conversationSummary),
    },
  };
};

export const injectMemoryIntoPrompt = (prompt: string, options: MemoryContextOptions = {}) => {
  const memory = getMemoryContext(options);
  if (!memory) return prompt;
  return `${memory}\n\n请保持与上述记忆一致，不要编造不存在的共同经历。\n\n${prompt}`;
};

export const getMemoryStats = () => {
  const store = safeReadStore();
  return {
    facts: store.facts.length,
    events: store.events.length,
    conversations: Object.keys(store.conversations).length,
    books: Object.keys(store.books).length,
    updatedAt: store.updatedAt,
  };
};

export const getMemorySnapshot = () => {
  const store = safeReadStore();
  return {
    facts: [...store.facts].sort((a, b) => Number(b.pinned) * 1000 + b.score + b.hitCount - (Number(a.pinned) * 1000 + a.score + a.hitCount)),
    events: [...store.events].sort((a, b) => b.createdAt - a.createdAt),
    mistakes: [...(store.mistakes || [])].sort((a, b) => b.lastHitAt - a.lastHitAt),
  };
};

export const togglePinMemoryFact = (id: string) => {
  const store = safeReadStore();
  const target = store.facts.find((fact) => fact.id === id);
  if (!target) return false;
  target.pinned = !target.pinned;
  target.score = Math.min(100, target.score + (target.pinned ? 8 : 0));
  safeSaveStore(store);
  return true;
};

export const submitMemoryFactFeedback = (id: string, feedback: "correct" | "wrong") => {
  const store = safeReadStore();
  const target = store.facts.find((fact) => fact.id === id);
  if (!target) return false;
  target.positiveFeedbackCount = target.positiveFeedbackCount || 0;
  target.negativeFeedbackCount = target.negativeFeedbackCount || 0;
  if (feedback === "correct") {
    target.positiveFeedbackCount += 1;
    target.confidence = Math.min(1, Number((target.confidence + 0.06).toFixed(3)));
    target.score = Math.min(100, target.score + 8);
  } else {
    target.negativeFeedbackCount += 1;
    target.confidence = Math.max(0.2, Number((target.confidence - 0.12).toFixed(3)));
    if (target.pinned) {
      // 置顶记忆被标记错误时自动取消置顶，避免持续污染召回
      target.pinned = false;
    }
    target.score = Math.max(2, target.score - 16);
    // 写入“踩雷清单”，用于后续显式提醒模型避免重复该误记忆/表述
    const mistakeKey = toKey(target.text);
    const existed = (store.mistakes || []).find((m) => m.key === mistakeKey);
    if (existed) {
      existed.hitCount += 1;
      existed.lastHitAt = Date.now();
    } else {
      const channelHint = target.channels?.[target.channels.length - 1];
      const bookHint = target.bookTitles?.[target.bookTitles.length - 1];
      const kind = inferMistakeKind(target.text);
      store.mistakes = [
        {
          id: createId(),
          key: mistakeKey,
          text: target.text,
          kind,
          preferenceKey: target.preferenceKey,
          channel: channelHint,
          bookTitle: bookHint,
          createdAt: Date.now(),
          hitCount: 1,
          lastHitAt: Date.now(),
        },
        ...(store.mistakes || []),
      ].slice(0, 120);
    }
  }
  target.lastSeenAt = Date.now();
  safeSaveStore(store);
  return true;
};

export const deleteMemoryFact = (id: string) => {
  const store = safeReadStore();
  const next = store.facts.filter((fact) => fact.id !== id);
  if (next.length === store.facts.length) return false;
  store.facts = next;
  safeSaveStore(store);
  return true;
};

export const deleteMemoryEvent = (id: string) => {
  const store = safeReadStore();
  const next = store.events.filter((event) => event.id !== id);
  if (next.length === store.events.length) return false;
  store.events = next;
  safeSaveStore(store);
  return true;
};

export const clearAllMemory = () => {
  safeSaveStore(defaultStore());
};

export const deleteMemoryMistake = (id: string) => {
  const store = safeReadStore();
  const next = (store.mistakes || []).filter((m) => m.id !== id);
  if (next.length === (store.mistakes || []).length) return false;
  store.mistakes = next;
  safeSaveStore(store);
  return true;
};

export const updateMemoryMistakeKind = (id: string, kind: MemoryMistakeKind) => {
  const store = safeReadStore();
  const target = (store.mistakes || []).find((m) => m.id === id);
  if (!target) return false;
  target.kind = kind;
  safeSaveStore(store);
  return true;
};

export const getMistakeKindLabel = (kind?: MemoryMistakeKind) => mistakeKindLabel[kind || "unknown"] || "未标注";
