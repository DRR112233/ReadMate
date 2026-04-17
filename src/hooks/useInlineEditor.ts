import { useState } from 'react';

export function useInlineEditor() {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [text, setText] = useState('');

  const start = (key: string, initialText: string) => {
    setActiveKey(key);
    setText(initialText);
  };

  const cancel = () => {
    setActiveKey(null);
    setText('');
  };

  return {
    activeKey,
    text,
    setText,
    start,
    cancel,
    clear: () => setActiveKey(null),
  };
}

