/**
 * Minimal markdown renderer for the legal docs (legal/*.md's content is
 * pasted into each page as a string constant and rendered here) — styled
 * with the app's design tokens per CLAUDE.md rather than the hand-rolled
 * gray-* classes the old /privacy page used. Deliberately tiny: supports
 * only the handful of markdown constructs these Indian-law legal
 * documents actually use (##/### headers, **bold**, "> " blockquotes,
 * "- " bullet lists, blank-line-separated paragraphs) — not a general
 * markdown engine, since pulling one in as a dependency for four static
 * legal pages isn't worth it.
 */
import type { ReactNode } from "react";

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="text-ink font-semibold">{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function LegalDoc({ title, updatedLabel, markdown }: { title: string; updatedLabel: string; markdown: string }) {
  const lines = markdown.trim().split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let paraBuffer: string[] = [];
  let quoteBuffer: string[] = [];

  function flushQuote() {
    if (quoteBuffer.length) {
      blocks.push(
        <blockquote key={blocks.length} className="border-l-2 border-accent bg-accent-soft rounded-r-control px-4 py-3 text-xs text-ink-2 my-4">
          {renderInline(quoteBuffer.join(" "))}
        </blockquote>
      );
      quoteBuffer = [];
    }
  }
  function flushList() {
    if (listBuffer.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc pl-5 space-y-1.5 text-ink-2 text-sm leading-relaxed">
          {listBuffer.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ul>
      );
      listBuffer = [];
    }
  }
  function flushPara() {
    if (paraBuffer.length) {
      blocks.push(
        <p key={blocks.length} className="text-ink-2 text-sm leading-relaxed mb-3">
          {renderInline(paraBuffer.join(" "))}
        </p>
      );
      paraBuffer = [];
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); flushPara(); flushQuote(); continue; }
    if (line.startsWith("## ")) {
      flushList(); flushPara(); flushQuote();
      blocks.push(<h2 key={blocks.length} className="h-section mt-8 mb-3">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      flushList(); flushPara(); flushQuote();
      blocks.push(<h3 key={blocks.length} className="text-sm font-semibold text-ink mt-5 mb-2">{line.slice(4)}</h3>);
    } else if (line.startsWith("> ")) {
      flushList(); flushPara();
      quoteBuffer.push(line.slice(2));
    } else if (line.startsWith("- ")) {
      flushPara(); flushQuote();
      listBuffer.push(line.slice(2));
    } else if (line === "---") {
      flushList(); flushPara(); flushQuote();
    } else if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
      flushList(); flushPara(); flushQuote();
      blocks.push(<p key={blocks.length} className="text-xs text-ink-3 italic mt-6">{line.slice(1, -1)}</p>);
    } else if (line.startsWith("#")) {
      // top-level title already rendered separately
      continue;
    } else {
      flushList(); flushQuote();
      paraBuffer.push(line);
    }
  }
  flushList();
  flushPara();
  flushQuote();

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="eyebrow">Legal</div>
        <h1 className="h-page mt-1">{title}</h1>
        <p className="text-ink-3 text-sm mt-2 mb-10">{updatedLabel}</p>
        {blocks}
      </div>
    </div>
  );
}
