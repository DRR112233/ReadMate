const stripTrailingSlash = (url: string): string => url.trim().replace(/\/+$/, '');

export const normalizeChatCompletionsUrl = (baseUrl: string): string => {
  const clean = stripTrailingSlash(baseUrl);
  if (clean.includes('googleapis.com') || clean.endsWith('/chat/completions')) {
    return clean;
  }
  return `${clean}/chat/completions`;
};

export const normalizeModelsUrl = (baseUrl: string): string => {
  const clean = stripTrailingSlash(baseUrl).replace(/\/chat\/completions$/, '');
  return `${clean}/models`;
};

