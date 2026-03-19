"use client";

import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
}

type CodeProps = ComponentPropsWithoutRef<"code"> & {
  children?: React.ReactNode;
};

const markdownComponents = {
  p: ({ children }: ComponentPropsWithoutRef<"p">) => (
    <p className="my-3 leading-7 first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }: ComponentPropsWithoutRef<"ul">) => (
    <ul className="my-3 list-disc space-y-2 pl-5 first:mt-0 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }: ComponentPropsWithoutRef<"ol">) => (
    <ol className="my-3 list-decimal space-y-2 pl-5 first:mt-0 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }: ComponentPropsWithoutRef<"li">) => <li>{children}</li>,
  blockquote: ({ children }: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote className="my-4 border-l-2 border-stone-300 pl-4 text-stone-600 first:mt-0 last:mb-0">
      {children}
    </blockquote>
  ),
  h1: ({ children }: ComponentPropsWithoutRef<"h1">) => (
    <h1 className="mt-6 text-2xl font-semibold tracking-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="mt-5 text-xl font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="mt-4 text-lg font-semibold first:mt-0">{children}</h3>
  ),
  a: ({ children, href }: ComponentPropsWithoutRef<"a">) => (
    <a
      className="text-stone-900 underline decoration-stone-300 underline-offset-4 transition hover:decoration-stone-800"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ),
  table: ({ children }: ComponentPropsWithoutRef<"table">) => (
    <div className="my-4 overflow-x-auto first:mt-0 last:mb-0">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: ComponentPropsWithoutRef<"thead">) => (
    <thead className="border-b border-stone-200 bg-stone-50/80">{children}</thead>
  ),
  th: ({ children }: ComponentPropsWithoutRef<"th">) => (
    <th className="px-3 py-2 text-left font-medium text-stone-700">{children}</th>
  ),
  td: ({ children }: ComponentPropsWithoutRef<"td">) => (
    <td className="border-b border-stone-100 px-3 py-2 align-top">{children}</td>
  ),
  hr: () => <hr className="my-5 border-stone-200" />,
  pre: ({ children }: ComponentPropsWithoutRef<"pre">) => (
    <pre className="my-4 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-950 px-4 py-3 text-sm text-stone-100 first:mt-0 last:mb-0">
      {children}
    </pre>
  ),
  code: ({ children, className, ...props }: CodeProps) => {
    const text = String(children ?? "");
    const isBlock = text.includes("\n");

    if (!isBlock) {
      return (
        <code
          className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[0.92em] text-stone-900"
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
} as const;

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="text-[15px] leading-7 text-stone-800">
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}
