import { GoogleGenAI } from "@google/genai";

let ai: any = null;
let chatInstance: any = null;
let currentConfig = {
  apiKey: process.env.GEMINI_API_KEY || '',
  baseUrl: 'https://generativelanguage.googleapis.com'
};

export const updateApiConfig = (config: { apiKey: string, baseUrl: string }) => {
  currentConfig = config;
  // Re-initialize if using Google SDK
  if (config.baseUrl.includes('googleapis.com')) {
    ai = new GoogleGenAI({ apiKey: config.apiKey });
  }
};

export const initChat = (storyContext: string, persona: string) => {
  if (currentConfig.baseUrl.includes('googleapis.com')) {
    if (!ai) ai = new GoogleGenAI({ apiKey: currentConfig.apiKey });
    chatInstance = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: `${persona}\n\n当前你们正在阅读的内容片段（作为背景信息）：\n${storyContext}`,
      }
    });
  } else {
    // For third-party APIs, we'll use a simple message history array
    chatInstance = {
      history: [{ role: 'system', content: `${persona}\n\n背景：\n${storyContext}` }],
      sendMessage: async (msg: any) => {
        const response = await fetch(`${currentConfig.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentConfig.apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo', // Default fallback
            messages: [...chatInstance.history, { role: 'user', content: msg.message }]
          })
        });
        const data = await response.json();
        const text = data.choices[0].message.content;
        chatInstance.history.push({ role: 'user', content: msg.message });
        chatInstance.history.push({ role: 'assistant', content: text });
        return { text };
      }
    };
  }
};

export const sendMessage = async (message: string) => {
  if (!chatInstance) {
    throw new Error("Chat not initialized");
  }
  const response = await chatInstance.sendMessage({ message });
  return response.text;
};
