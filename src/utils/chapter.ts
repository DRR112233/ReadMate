// Chapter title detection & TXT splitting utilities.
// Centralize the regex so import + TOC use the same logic.

export const CHAPTER_TITLE_RE: RegExp = new RegExp(
  String.raw`^[ \t]{0,4}(?:` +
    // Special chapter names
    String.raw`序章|楔子|终章|后记|尾声|番外|` +
    // "正文" but not "正文完结"
    String.raw`正文(?!完结)|` +
    // "第X章/节/卷/集/部/篇" with careful negative lookaheads to avoid false positives
    String.raw`第\s{0,4}[\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\s{0,4}(?:` +
      String.raw`章|` +
      String.raw`节(?!课)|` +
      String.raw`卷|` +
      String.raw`集(?!合|和)|` +
      String.raw`部(?!分|赛|游)|` +
      String.raw`篇(?!章|张)` +
    String.raw`)` +
  String.raw`).{0,30}$`,
  'u'
);

export function normalizeLine(raw: string) {
  return raw.replace(/\r\n?/g, '\n').trim().replace(/\s+/g, ' ');
}

export function isChapterTitleLine(line: string) {
  const text = normalizeLine(line);
  if (!text) return false;
  // Guard: avoid matching normal sentences that happen to start with chapter words but contain common punctuation mid-line.
  if (text.length > 100) return false;
  return CHAPTER_TITLE_RE.test(text);
}

export interface SplitChapter {
  title: string; // empty for preface chunk without explicit title
  lines: string[];
}

/**
 * Split a TXT-like novel into chapters by scanning lines.
 * Keeps original lines (trimmed minimally) and normalizes chapter titles to standalone lines.
 */
export function splitTxtIntoChapters(rawText: string): SplitChapter[] {
  const text = rawText.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');

  const chapters: SplitChapter[] = [];
  let current: SplitChapter = { title: '', lines: [] };

  const pushCurrentIfNotEmpty = () => {
    const hasContent = current.title.trim() || current.lines.some((l) => l.trim());
    if (hasContent) chapters.push(current);
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\u00a0/g, ''); // remove NBSP noise
    const trimmed = line.trimEnd();
    const candidate = trimmed.trim();

    if (candidate && isChapterTitleLine(candidate)) {
      pushCurrentIfNotEmpty();
      current = { title: normalizeLine(candidate), lines: [] };
      continue;
    }

    current.lines.push(trimmed);
  }

  pushCurrentIfNotEmpty();

  return chapters.length ? chapters : [{ title: '', lines }];
}

/**
 * Rebuild chapters into a single string suitable for ReadMate rendering.
 * Ensures each chapter title occupies a single line separated by blank lines.
 */
export function chaptersToContent(chapters: SplitChapter[]) {
  const parts: string[] = [];
  for (const ch of chapters) {
    if (ch.title) {
      parts.push(ch.title);
      parts.push(''); // blank line
    }
    const body = ch.lines
      .join('\n')
      // clean excessive blank lines
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (body) {
      parts.push(body);
      parts.push('');
    }
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

