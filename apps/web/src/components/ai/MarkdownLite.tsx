import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Spec 5 §5. A tiny Markdown subset for AI answers, built only from React elements and text nodes: paragraphs,
// headings (shown bold), **bold**, *italic*, `code`, "- " / "1. " lists. Anything else, HTML included, stays
// literal text. No links, no images, no raw HTML.

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'h'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const last = () => blocks[blocks.length - 1];
  let breakBefore = true;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      breakBefore = true;
      continue;
    }
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const prev = last();
    if (heading) {
      blocks.push({ kind: 'h', text: heading[1] ?? '' });
      breakBefore = true;
      continue;
    }
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      const item = (bullet ?? numbered)?.[1] ?? '';
      if (prev && prev.kind === kind) prev.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (prev && prev.kind === 'p' && !breakBefore) {
      prev.lines.push(line.trim());
    } else if (prev && (prev.kind === 'ul' || prev.kind === 'ol') && !breakBefore && /^\s+/.test(raw)) {
      // Indented continuation of the previous list item.
      prev.items[prev.items.length - 1] += ` ${line.trim()}`;
    } else {
      blocks.push({ kind: 'p', lines: [line.trim()] });
    }
    breakBefore = false;
  }
  return blocks;
}

/** Inline markup → React nodes. Unmatched markers stay literal. */
function renderInline(text: string, allowStrong = true, allowEm = true): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buffer = '';
  let i = 0;
  const flush = () => {
    if (buffer) nodes.push(buffer);
    buffer = '';
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        nodes.push(<code key={nodes.length}>{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    } else if (ch === '*' && text[i + 1] === '*' && allowStrong) {
      const end = text.indexOf('**', i + 2);
      if (end > i + 2 && text[i + 2] !== ' ') {
        flush();
        nodes.push(<strong key={nodes.length}>{renderInline(text.slice(i + 2, end), false, allowEm)}</strong>);
        i = end + 2;
        continue;
      }
    } else if (ch === '*' && allowEm && text[i + 1] !== ' ' && text[i + 1] !== '*') {
      const end = findSingleStar(text, i + 1);
      if (end > i + 1) {
        flush();
        nodes.push(<em key={nodes.length}>{renderInline(text.slice(i + 1, end), allowStrong, false)}</em>);
        i = end + 1;
        continue;
      }
    }
    buffer += ch;
    i += 1;
  }
  flush();
  return nodes;
}

/** Index of the closing single `*` (not part of `**`), or -1. */
function findSingleStar(text: string, from: number): number {
  for (let j = from; j < text.length; j += 1) {
    if (text[j] !== '*') continue;
    if (text[j + 1] === '*') {
      j += 1;
      continue;
    }
    if (text[j - 1] === ' ') continue;
    return j;
  }
  return -1;
}

export interface MarkdownLiteProps {
  text: string;
  className?: string;
}

export function MarkdownLite({ text, className }: MarkdownLiteProps) {
  const blocks = parseBlocks(text);
  return (
    <div className={cn('space-y-2 [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 dark:[&_code]:bg-white/10', className)}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'h':
            return (
              <p key={index}>
                <strong>{renderInline(block.text, false)}</strong>
              </p>
            );
          case 'ul':
          case 'ol': {
            const List = block.kind;
            return (
              <List key={index} className={cn('space-y-1 pl-5', block.kind === 'ul' ? 'list-disc' : 'list-decimal')}>
                {block.items.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </List>
            );
          }
          case 'p':
            return (
              <p key={index}>
                {block.lines.map((line, i) => (
                  <Fragment key={i}>
                    {i > 0 && <br />}
                    {renderInline(line)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
