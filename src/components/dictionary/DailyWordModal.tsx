import React from 'react';
import styles from './DailyWordModal.module.css';

interface DailyWordModalProps {
  open: boolean;
  word: string;
  hitCount: number;
  companionName: string;
  onClose: () => void;
  onStart: () => void;
}

export default function DailyWordModal({ open, word, hitCount, companionName, onClose, onStart }: DailyWordModalProps) {
  if (!open) return null;
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>今日共写一词</div>
        <div className={styles.desc}>今天读到很多次「{word}」（{hitCount} 次），要不要和{companionName || '你的恋人'}一起写进词典？</div>
        <div className={styles.word}>✦ {word}</div>
        <div className={styles.actions}>
          <button className={styles.btn} onClick={onClose}>稍后</button>
          <button className={styles.btn} onClick={onStart}>一起写</button>
        </div>
      </div>
    </div>
  );
}

