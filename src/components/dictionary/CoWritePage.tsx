import React from 'react';
import styles from './CoWritePage.module.css';

interface CoWritePageProps {
  open: boolean;
  word: string;
  value: string;
  loading?: boolean;
  companionName: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function CoWritePage({ open, word, value, loading = false, companionName, onChange, onClose, onSubmit }: CoWritePageProps) {
  if (!open) return null;
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.word}>✦ {word}</div>
        <textarea
          className={styles.textarea}
          placeholder={`写下你眼中的「${word}」...`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className={styles.actions}>
          <button onClick={onClose}>取消</button>
          <button onClick={onSubmit} disabled={!value.trim() || loading}>
            {loading ? '揭晓中…' : `写好了，看看${companionName || '你的恋人'}怎么说`}
          </button>
        </div>
      </div>
    </div>
  );
}

