import React from 'react';
import styles from './CoWriteReveal.module.css';

interface CoWriteRevealProps {
  open: boolean;
  word: string;
  userDefinition: string;
  aiWhisper: string;
  companionName: string;
  onSave: () => void;
}

export default function CoWriteReveal({ open, word, userDefinition, aiWhisper, companionName, onSave }: CoWriteRevealProps) {
  if (!open) return null;
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.word}>✦ {word}</div>
        <div className={styles.block}>
          <div className={styles.label}>{companionName || '你的恋人'}的悄悄话</div>
          <div className={styles.text}>{aiWhisper}</div>
        </div>
        <div className={styles.block}>
          <div className={styles.label}>你的释义</div>
          <div className={styles.text}>{userDefinition}</div>
        </div>
        <div className={styles.actions}>
          <button onClick={onSave}>收进词典</button>
        </div>
      </div>
    </div>
  );
}

