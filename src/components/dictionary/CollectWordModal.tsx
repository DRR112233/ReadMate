import React from 'react';
import { DictionaryCandidate } from '../../types';
import styles from './CollectWordModal.module.css';

interface CollectWordModalProps {
  candidate: DictionaryCandidate | null;
  collecting?: boolean;
  onClose: () => void;
  onConfirm: (candidate: DictionaryCandidate) => void;
}

export default function CollectWordModal({ candidate, collecting = false, onClose, onConfirm }: CollectWordModalProps) {
  if (!candidate) return null;
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>收录进我们的词典？</div>
        <div className={styles.desc}>这个词在你们的阅读里出现了 {candidate.hitCount} 次。</div>
        <div className={styles.word}>{candidate.word}</div>
        <div className={styles.example}>{candidate.exampleSentence || '这页留下了你们的共同痕迹。'}</div>
        <div className={styles.actions}>
          <button className={styles.btn} onClick={onClose}>稍后</button>
          <button className={styles.btn} onClick={() => onConfirm(candidate)} disabled={collecting}>
            {collecting ? '收录中…' : '收录'}
          </button>
        </div>
      </div>
    </div>
  );
}

