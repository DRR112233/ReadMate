import React from 'react';
import { DictionaryEntry } from '../../types';
import styles from './WordCard.module.css';

interface WordCardProps {
  entry: DictionaryEntry;
  onClick: () => void;
}

export default function WordCard({ entry, onClick }: WordCardProps) {
  return (
    <button className={styles.card} onClick={onClick}>
      <div className={styles.word}>
        {entry.wordEmoji ? `${entry.wordEmoji} ` : ''}
        {entry.word}
      </div>
      <div className={styles.meta}>提及 {entry.hitCount} 次 · 收录于 {new Date(entry.collectedAt).toLocaleDateString()}</div>
      <div className={styles.whisper}>{entry.aiWhisper.slice(0, 38)}{entry.aiWhisper.length > 38 ? '…' : ''}</div>
    </button>
  );
}

