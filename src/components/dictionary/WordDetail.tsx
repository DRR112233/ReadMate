import React from 'react';
import { DictionaryEntry } from '../../types';
import styles from './WordDetail.module.css';

interface WordDetailProps {
  entry: DictionaryEntry;
  companionName: string;
}

export default function WordDetail({ entry, companionName }: WordDetailProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.word}>{entry.wordEmoji ? `${entry.wordEmoji} ` : ''}{entry.word}</div>
      <div className={styles.sub}>
        首次出现：{entry.firstAppeared.bookTitle} · {new Date(entry.firstAppeared.date).toLocaleDateString()}
      </div>

      <div className={styles.block}>
        <div className={styles.label}>{companionName || '你的恋人'}的悄悄话</div>
        <div className={styles.content}>{entry.aiWhisper}</div>
      </div>

      {!!entry.userDefinition && (
        <div className={styles.block}>
          <div className={styles.label}>你的释义</div>
          <div className={styles.content}>{entry.userDefinition}</div>
        </div>
      )}

      {entry.userHighlights.length > 0 && (
        <div className={styles.block}>
          <div className={styles.label}>你划过的句子</div>
          <div className={styles.list}>
            {entry.userHighlights.slice(0, 5).map((item, idx) => (
              <div key={idx} className={styles.item}>{item}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

