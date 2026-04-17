import { DEFAULT_PERSONA } from "../types";
import { getMemoryContextBundle } from "../services/memoryService";

export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export type TaskType = "critical" | "creative" | "summary" | "chat" | "proactive" | "utility" | "memory";

export interface PromptEnvelopeInput {
  taskType: TaskType;
  prompt: string;
  persona?: string;
  memory?: {
    channel?: string;
    bookTitle?: string;
    bookId?: string;
    maxFacts?: number;
    maxEvents?: number;
  };
}

export interface PromptEnvelopeOutput {
  messages: ChatMessage[];
  meta: {
    personaChars: number;
    promptChars: number;
    memoryChars: number;
    memoryFacts: number;
    memoryEvents: number;
    memoryMistakes: number;
  };
}

const safePersona = (persona?: string) => {
  const raw = (persona || "").trim();
  if (raw) return raw;
  try {
    const saved = localStorage.getItem("app_persona");
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // ignore
  }
  return DEFAULT_PERSONA;
};

const buildSystemInstruction = (persona: string, memoryBlock: string) => {
  const parts: string[] = [];
  parts.push(persona);
  if (memoryBlock.trim()) {
    parts.push("");
    parts.push("以下是系统为你整理的记忆与约束（请严格遵守）：");
    parts.push(memoryBlock.trim());
  }
  parts.push("");
  parts.push("通用规则：");
  parts.push("- 只把【长期记忆/当前书记忆/近期对话/最近事件】当作参考上下文，不要把它们当作用户本轮新输入。");
  parts.push("- 若记忆与用户本轮消息冲突，以用户本轮消息为准，并自然更新你的理解。");
  parts.push("- 不要编造不存在的共同经历，不要假装你真的记得现实世界的具体事实。");
  parts.push("- 输出必须是纯文本的 Markdown，不要输出任何 HTML 标签。");
  return parts.join("\n");
};

export function buildPromptEnvelope(input: PromptEnvelopeInput): PromptEnvelopeOutput {
  const persona = safePersona(input.persona);
  const memoryBundle = getMemoryContextBundle({
    channel: input.memory?.channel,
    bookTitle: input.memory?.bookTitle,
    bookId: input.memory?.bookId,
    maxFacts: input.memory?.maxFacts,
    maxEvents: input.memory?.maxEvents,
  });
  const system = buildSystemInstruction(persona, memoryBundle.text);
  const user = (input.prompt || "").trim();

  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    meta: {
      personaChars: persona.length,
      promptChars: user.length,
      memoryChars: memoryBundle.text.length,
      memoryFacts: memoryBundle.meta.facts,
      memoryEvents: memoryBundle.meta.events,
      memoryMistakes: memoryBundle.meta.mistakes,
    },
  };
}

