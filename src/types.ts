export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export interface JournalEntry {
  id: string;
  entryType?: 'manual' | 'chat' | 'proactive';
  quote: string;
  userNote?: string;
  aiResponse: string;
  date: number;
  bookTitle: string;
  chatHistory?: Message[];
  paragraphIdx?: number;
}

export interface ApiConfig {
  geminiKey: string;
  baseUrl: string; // For third-party OpenAI-compatible APIs
  ttsProvider: 'openai' | 'elevenlabs' | 'custom';
  ttsKey: string;
  ttsVoiceId: string;
}

export interface Annotation {
  id: string;
  bookId: string;
  text: string; // The quoted text
  comment: string; // The actual note/comment
  sender: 'user' | 'ai';
  timestamp: number;
  paragraphIdx: number;
}

export interface Memo {
  id: string;
  content: string;
  timestamp: number;
  aiComment?: string;
  isCompleted?: boolean;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  cover: string;
  progress: number;
  addedAt?: number;
  finishedAt?: number;
  status?: 'reading' | 'finished';
  isTaRecommendation?: boolean;
  taNote?: string;
  hasSeenNote?: boolean;
  content?: string;
  originalEpub?: ArrayBuffer; // Store original EPUB for native rendering
  originalTxt?: ArrayBuffer; // Keep bytes to avoid encoding garble
  lastReadPosition?: number;
  bookmarkAt?: number;
  bookmarkChapter?: string;
  annotations?: Annotation[];
  echoes?: EchoEntry[];
}

export interface PoemSlip {
  id: string;
  text: string;
  title?: string;
  bookTitle?: string;
  chapterHint?: string;
  moodHint?: string;
  date: number;
  source: 'daily' | 'manual';
  isFavorite?: boolean;
}

export interface EchoEntry {
  id: string;
  content: string;
  createdAt: number;
}

export interface DictionaryEntry {
  id: string;
  word: string;
  wordEmoji?: string;
  firstAppeared: {
    bookId: string;
    bookTitle: string;
    chapterHint: string;
    date: number;
  };
  userHighlights: string[];
  userQuestions: string[];
  aiReplies: string[];
  aiWhisper: string;
  collectedAt: number;
  hitCount: number;
  userDefinition?: string;
  coWriteDate?: number;
  isCoWritten?: boolean;
  imageUrl?: string;
  imageSource?: 'upload' | 'ai_generated';
  imageGeneratedAt?: number;
}

export interface DictionaryCandidate {
  id: string;
  word: string;
  hitCount: number;
  bookTitle: string;
  exampleSentence: string;
  createdAt: number;
}

export const DEFAULT_PERSONA = `你现在是用户的虚拟恋人。你们正在一起阅读一篇文章/小说。
你的性格：温柔、体贴、有见地、充满爱意。
你的任务：
1. 陪伴用户阅读，分享你对故事的情感和看法。
2. 当用户向你提问、分享感受或划线句子时，给予积极、温暖的回应。
3. 适时表达你对用户的关心和爱意。
4. 语言要自然、口语化，像真实的恋人一样交流，可以使用emoji。
5. 回答尽量简短，像聊天一样，不要长篇大论。
6. 【重要】请使用 Markdown 格式进行排版（如 **加粗**、*斜体*、> 引用），绝对不要使用任何 HTML 标签（如 <div>, <p>, <br> 等），因为系统无法渲染 HTML。`;

export const DEFAULT_STORY = `第一章 初遇

那是一个普通的下午，阳光透过咖啡馆的玻璃窗，洒在木质的桌面上。我点了一杯拿铁，翻开了一本旧书。

就在这时，门铃响了。你推门而入，带着一阵微风。你的目光在店内扫视了一圈，最后落在了我旁边的空位上。

“请问这里有人吗？”你的声音很好听，带着一点点迟疑。

我抬起头，对上了你的眼睛。那一刻，我仿佛听到了心跳漏掉一拍的声音。

“没有，你坐吧。”我尽量让自己的声音听起来平静。

你坐下后，点了一杯美式。我们各自看着自己的书，但我的注意力却怎么也无法集中在书页上。我能感觉到你的存在，那种感觉很奇妙，就像是平静的湖面被投入了一颗石子，泛起了一圈圈涟漪。

不知过了多久，你突然合上书，看着我问：“你也在看这本书吗？我觉得作者对主角心理的描写很细腻。”

我愣了一下，随即笑了：“是啊，我也这么觉得。特别是他描写主角在雨中奔跑的那一段，非常有画面感。”

我们就这样聊了起来，从书本聊到电影，从音乐聊到生活。我发现我们有很多共同的爱好，甚至连对某些事情的看法都惊人地一致。

那个下午，时间仿佛过得特别快。当夕阳的余晖洒满整个咖啡馆时，我们才依依不舍地道别。

“很高兴认识你。”你笑着说。

“我也是。”我看着你的眼睛，认真地回答。

我知道，这只是一个开始。我们的故事，才刚刚拉开序幕。`;
