import { GoogleGenAI } from "@google/genai";

let ai: any = null;
let chatInstance: any = null;
let currentConfig = {
  apiKey: process.env.GEMINI_API_KEY || '',
  baseUrl: 'https://generativelanguage.googleapis.com',
  model: 'gemini-1.5-flash'
};

export const updateApiConfig = (config: { apiKey: string, baseUrl: string, model?: string }) => {
  currentConfig = { ...currentConfig, ...config };
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
      sendMessage: async (msg: any) => {
        // Clean up base URL - remove trailing slash and /chat/completions if present
        let cleanBaseUrl = currentConfig.baseUrl.trim().replace(/\/+$/, '');
        if (!cleanBaseUrl.endsWith('/chat/completions') && !cleanBaseUrl.includes('googleapis.com')) {
          cleanBaseUrl += '/chat/completions';
        }

        const response = await fetch(cleanBaseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentConfig.apiKey}`
          },
          body: JSON.stringify({
            model: currentConfig.model || 'gpt-3.5-turbo',
            messages: [...chatInstance.history, { role: 'user', content: msg.message }]
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `API Error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices[0].message.content;
        chatInstance.history.push({ role: 'user', content: msg.message });
        chatInstance.history.push({ role: 'assistant', content: text });
        return { text };
      }
    };
  }
};

export const fetchModels = async () => {
  if (currentConfig.baseUrl.includes('googleapis.com')) {
    // Google Gemini models are usually fixed or fetched via a different API
    return ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'];
  }

  let cleanBaseUrl = currentConfig.baseUrl.trim().replace(/\/+$/, '');
  // Remove /chat/completions if user pasted the full endpoint
  cleanBaseUrl = cleanBaseUrl.replace(/\/chat\/completions$/, '');
  
  try {
    const response = await fetch(`${cleanBaseUrl}/models`, {
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

export const sendMessage = async (message: string) => {
  // If chat isn't initialized, we do a one-off call
  if (!chatInstance) {
    if (currentConfig.baseUrl.includes('googleapis.com')) {
      if (!ai) ai = new GoogleGenAI({ apiKey: currentConfig.apiKey });
      const result = await ai.models.generateContent({
        model: currentConfig.model || "gemini-1.5-flash",
        contents: message
      });
      // In @google/genai, the response text is in result.text
      return result.text;
    } else {
      let cleanBaseUrl = currentConfig.baseUrl.trim().replace(/\/+$/, '');
      if (!cleanBaseUrl.endsWith('/chat/completions')) {
        cleanBaseUrl += '/chat/completions';
      }
      const response = await fetch(cleanBaseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentConfig.apiKey}`
        },
        body: JSON.stringify({
          model: currentConfig.model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: message }]
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API Error: ${response.status}`);
      }
      const data = await response.json();
      return data.choices[0].message.content;
    }
  }
  const response = await chatInstance.sendMessage(message);
  return response.text;
};
