/**
 * عارض مصغّر لمجموعة مقيدة من الماركداون التي ينتجها المحركان
 * (المحلي والخادم): عناوين، قوائم، اقتباسات، عريض، مائل.
 */

import type { ReactNode } from "react";

function parseInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyBase}-b${i}`}>{token.slice(2, -2)}</strong>,
      );
    } else {
      nodes.push(<em key={`${keyBase}-i${i}`}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function renderAnswerMarkdown(md: string): ReactNode {
  const lines = md.split("\n");
  const blocks: ReactNode[] = [];
  let key = 0;

  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  const flushList = () => {
    if (!listType) return;
    const items = listItems.map((it, i) => (
      <li key={i}>{parseInline(it, `li-${key}-${i}`)}</li>
    ));
    if (listType === "ul") blocks.push(<ul key={key}>{items}</ul>);
    else blocks.push(<ol key={key}>{items}</ol>);
    key += 1;
    listType = null;
    listItems = [];
  };

  let para: string[] = [];
  const flushPara = () => {
    if (!para.length) return;
    blocks.push(<p key={key}>{parseInline(para.join(" "), `p-${key}`)}</p>);
    key += 1;
    para = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      flushPara();
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      flushPara();
      blocks.push(
        <h3 key={key} className="answer-h2">
          {parseInline(trimmed.slice(3), `h2-${key}`)}
        </h3>,
      );
      key += 1;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      flushList();
      flushPara();
      blocks.push(
        <h4 key={key} className="answer-h3">
          {parseInline(trimmed.slice(4), `h3-${key}`)}
        </h4>,
      );
      key += 1;
      continue;
    }
    if (trimmed.startsWith("> ")) {
      flushList();
      flushPara();
      blocks.push(
        <blockquote key={key} className="answer-quote">
          {parseInline(trimmed.slice(2), `q-${key}`)}
        </blockquote>,
      );
      key += 1;
      continue;
    }
    const ulMatch = trimmed.match(/^-\s+(.*)$/);
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ulMatch) {
      flushPara();
      if (!listType) {
        flushList();
        listType = "ul";
      }
      listItems.push(ulMatch[1]);
      continue;
    }
    if (olMatch) {
      flushPara();
      if (!listType) {
        flushList();
        listType = "ol";
      }
      listItems.push(olMatch[1]);
      continue;
    }
    if (listType) flushList();
    para.push(trimmed);
  }
  flushList();
  flushPara();

  return <>{blocks}</>;
}
