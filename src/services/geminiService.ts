import { GoogleGenAI } from "@google/genai";
import { normalizeChatCompletionsUrl, normalizeModelsUrl } from "../utils/apiUrl";

let ai: any = null;
let chatInstance: any = null;
type TaskType = 'critical' | 'creative' | 'summary' | 'chat' | 'proactive' | 'utility' | 'memory';
type TaskRoutingConfig = Record<TaskType, 'primary' | 'auxiliary'>;
type Role = 'system' | 'user' | 'assistant';
export interface ChatMessage {
  role: Role;
  content: string;
}
const defaultTaskRouting: TaskRoutingConfig = {
  critical: 'primary',
  creative: 'primary',
  summary: 'primary',
  chat: 'auxiliary',
  proactive: 'auxiliary',
  utility: 'auxiliary',
  memory: 'auxiliary',
};
let currentConfig = {
  apiKey: process.env.GEMINI_API_KEY || '',
  baseUrl: 'https://generativelanguage.googleapis.com',
  model: 'gemini-1.5-flash',
  auxiliaryModel: '',
  enableAuxiliaryRouting: false,
  taskRouting: defaultTaskRouting as TaskRoutingConfig,
};

try {
  const savedConfig = localStorage.getItem('app_apiConfig');
  if (savedConfig) {
    const parsed = JSON.parse(savedConfig);
    currentConfig = {
      ...currentConfig,
      ...parsed,
      taskRouting: {
        ...defaultTaskRouting,
        ...(parsed?.taskRouting || {}),
      },
    };
  }
} catch (e) {
  console.error("Failed to load API config", e);
}

export const updateApiConfig = (config: {
  apiKey: string;
  baseUrl: string;
  model?: string;
  auxiliaryModel?: string;
  enableAuxiliaryRouting?: boolean;
  taskRouting?: Partial<TaskRoutingConfig>;
}) => {
  currentConfig = {
    ...currentConfig,
    ...config,
    taskRouting: {
      ...defaultTaskRouting,
      ...currentConfig.taskRouting,
      ...(config.taskRouting || {}),
    },
  };
  try {
    localStorage.setItem('app_apiConfig', JSON.stringify(currentConfig));
  } catch (e) {
    console.error("Failed to save API config", e);
  }
  
  // Clear chat instance to force re-initialization with new config
  chatInstance = null;
  
  // Re-initialize if using Google SDK
  if (currentConfig.baseUrl.includes('googleapis.com')) {
    ai = new GoogleGenAI({ apiKey: currentConfig.apiKey });
  }
};

export const initChat = (storyContext: string, persona: string) => {
  const systemPrompt = `${persona}\n\n当前你们正在阅读的内容片段（作为背景信息）：\n${storyContext}`;

  if (currentConfig.baseUrl.includes('googleapis.com')) {
    if (!ai) ai = new GoogleGenAI({ apiKey: currentConfig.apiKey });
    chatInstance = ai.chats.create({
      model: currentConfig.model || "gemini-1.5-flash",
      config: {
        systemInstruction: systemPrompt,
      }
    });
  } else {
    // For third-party APIs, we'll use a simple message history array
    chatInstance = {
      history: [{ role: 'system', content: systemPrompt }],
      sendMessage: async (message: string) => {
        const chatUrl = normalizeChatCompletionsUrl(currentConfig.baseUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      try {
        const response = await fetch(chatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentConfig.apiKey}`
          },
          body: JSON.stringify({
            model: currentConfig.model || 'gpt-3.5-turbo',
            messages: [...chatInstance.history, { role: 'user', content: message }]
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `API Error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices[0].message.content;
        chatInstance.history.push({ role: 'user', content: message });
        chatInstance.history.push({ role: 'assistant', content: text });
        return { text };
      } catch (err: any) {
        if (err.name === 'AbortError') {
          throw new Error('请求超时，请检查网络或 API 地址。');
        }
        throw err;
      }
      }
    };
  }
};

export const fetchModels = async () => {
  if (currentConfig.baseUrl.includes('googleapis.com')) {
    // Google Gemini models are usually fixed or fetched via a different API
    return ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'];
  }

  const modelsUrl = normalizeModelsUrl(currentConfig.baseUrl);
  
  try {
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${currentConfig.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`无法获取模型: ${response.status}`);
    }

    const data = await response.json();
    // OpenAI format: { data: [ { id: '...' }, ... ] }
    if (data && Array.isArray(data.data)) {
      return data.data.map((m: any) => m.id);
    }
    return [];
  } catch (error) {
    console.error('Fetch models failed:', error);
    throw error;
  }
};

interface SendMessageOptions {
  timeoutMs?: number;
  bypassChat?: boolean;
  taskType?: TaskType;
  forceAuxiliaryModel?: boolean;
}

const shouldUseAuxiliaryModel = (options: SendMessageOptions = {}) => {
  if (options.forceAuxiliaryModel) return true;
  if (!currentConfig.enableAuxiliaryRouting || !currentConfig.auxiliaryModel) return false;
  const taskType = options.taskType || 'chat';
  const route = currentConfig.taskRouting?.[taskType] || defaultTaskRouting[taskType];
  return route === 'auxiliary';
};

const pickModel = (options: SendMessageOptions = {}) =>
  shouldUseAuxiliaryModel(options)
    ? currentConfig.auxiliaryModel
    : (currentConfig.model || 'gpt-3.5-turbo');

const AI_CALL_LOG_KEY = "app_aiCallLogs_v1";
type AiCallLog = {
  id: string;
  at: number;
  taskType: TaskType;
  baseUrl: string;
  usedModel: string;
  routedTo: 'primary' | 'auxiliary';
  bypassChat: boolean;
  timeoutMs: number;
  promptChars: number;
  messageCount: number;
};

const appendAiCallLog = (entry: Omit<AiCallLog, "id" | "at">) => {
  try {
    const prev = JSON.parse(localStorage.getItem(AI_CALL_LOG_KEY) || "[]");
    const next: AiCallLog[] = Array.isArray(prev) ? prev : [];
    next.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      at: Date.now(),
      ...entry,
    });
    localStorage.setItem(AI_CALL_LOG_KEY, JSON.stringify(next.slice(0, 400)));
  } catch {
    // ignore
  }
};

export const getAiCallLogs = (): AiCallLog[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(AI_CALL_LOG_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

export const clearAiCallLogs = () => {
  try {
    localStorage.setItem(AI_CALL_LOG_KEY, "[]");
  } catch {
    // ignore
  }
};

const normalizeMessagesToSystemAndUser = (messages: ChatMessage[]) => {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n").trim();
  const user = messages
    .filter((m) => m.role !== "system")
    .map((m) => (m.role === "assistant" ? `（助手先前说）${m.content}` : m.content))
    .join("\n\n")
    .trim();
  return { system, user };
};

export const sendMessage = async (
  input: string | { messages: ChatMessage[] },
  options: SendMessageOptions = {}
) => {
  const timeoutMs = options.timeoutMs ?? 60000;
  const bypassChat = options.bypassChat ?? false;
  const routeToAuxiliary = shouldUseAuxiliaryModel(options);
  const useOneOffCall = bypassChat || routeToAuxiliary;
  const taskType = options.taskType || 'chat';
  const messagesMode = typeof input !== "string";
  const targetModel = pickModel({ ...options, taskType }) || "gemini-1.5-flash";
  const promptChars =
    typeof input === "string"
      ? input.length
      : input.messages.reduce((sum, m) => sum + (m.content || "").length, 0);

  appendAiCallLog({
    taskType,
    baseUrl: currentConfig.baseUrl,
    usedModel: targetModel,
    routedTo: routeToAuxiliary ? "auxiliary" : "primary",
    bypassChat: Boolean(bypassChat),
    timeoutMs,
    promptChars,
    messageCount: typeof input === "string" ? 1 : input.messages.length,
  });

  // If chat isn't initialized, we do a one-off call
  // If messages 模式，强制 one-off，保证 system 不丢
  if (!chatInstance || useOneOffCall || messagesMode) {
    if (currentConfig.baseUrl.includes('googleapis.com')) {
      if (!ai) ai = new GoogleGenAI({ apiKey: currentConfig.apiKey });
      const { system, user } =
        typeof input === "string" ? { system: "", user: input } : normalizeMessagesToSystemAndUser(input.messages);
      const result = await ai.models.generateContent({
        model: targetModel,
        contents: user,
        // @google/genai: chats.create 支持 systemInstruction，这里尝试同样的 config（非严格类型）
        ...(system ? { config: { systemInstruction: system } } : {}),
      });
      // In @google/genai, the response text is in result.text
      return result.text;
    } else {
      const chatUrl = normalizeChatCompletionsUrl(currentConfig.baseUrl);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const messages =
          typeof input === "string"
            ? [{ role: 'user', content: input }]
            : input.messages.map((m) => ({ role: m.role, content: m.content }));
        const response = await fetch(chatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentConfig.apiKey}`
          },
          body: JSON.stringify({
            model: targetModel,
            messages
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `API Error: ${response.status}`);
        }
        const data = await response.json();
        return data.choices[0].message.content;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          throw new Error('请求超时，请检查网络或 API 地址。');
        }
        throw err;
      }
    }
  }
  
  try {
    const result = await chatInstance.sendMessage(
      currentConfig.baseUrl.includes('googleapis.com')
        ? { message: typeof input === "string" ? input : normalizeMessagesToSystemAndUser(input.messages).user }
        : (typeof input === "string" ? input : normalizeMessagesToSystemAndUser(input.messages).user)
    );
    return result.text;
  } catch (error) {
    console.error("SendMessage failed:", error);
    throw error;
  }
};
