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
    <p className="chat-text-wrap my-3 leading-6 first:mt-0 last:mb-0 sm:leading-7">
      {children}
    </p>
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
  li: ({ children }: ComponentPropsWithoutRef<"li">) => (
    <li className="chat-text-wrap">{children}</li>
  ),
  blockquote: ({ children }: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote className="chat-text-wrap my-4 rounded-[20px] bg-stone-100 px-4 py-3 text-stone-600 first:mt-0 last:mb-0">
      {children}
    </blockquote>
  ),
  h1: ({ children }: ComponentPropsWithoutRef<"h1">) => (
    <h1 className="chat-text-wrap mt-6 text-xl font-semibold tracking-tight first:mt-0 sm:text-2xl">
      {children}
    </h1>
  ),
  h2: ({ children }: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="chat-text-wrap mt-5 text-lg font-semibold tracking-tight first:mt-0 sm:text-xl">
      {children}
    </h2>
  ),
  h3: ({ children }: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="chat-text-wrap mt-4 text-base font-semibold first:mt-0 sm:text-lg">
      {children}
    </h3>
  ),
  a: ({ children, href }: ComponentPropsWithoutRef<"a">) => (
    <a
      className="chat-text-wrap break-words text-stone-900 underline decoration-stone-300 underline-offset-4 transition hover:decoration-stone-800"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ),
  table: ({ children }: ComponentPropsWithoutRef<"table">) => (
    <div className="my-4 w-full max-w-full overflow-x-auto rounded-[20px] bg-stone-100/80 p-2 first:mt-0 last:mb-0">
      <table className="min-w-max text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: ComponentPropsWithoutRef<"thead">) => (
    <thead className="bg-stone-200/70">{children}</thead>
  ),
  th: ({ children }: ComponentPropsWithoutRef<"th">) => (
    <th className="px-3 py-2 text-left font-medium text-stone-700">{children}</th>
  ),
  td: ({ children }: ComponentPropsWithoutRef<"td">) => (
    <td className="bg-white/55 px-3 py-2 align-top">{children}</td>
  ),
  hr: () => <hr className="my-5 h-px border-0 bg-stone-200" />,
  pre: ({ children }: ComponentPropsWithoutRef<"pre">) => (
    <pre className="my-4 max-w-full overflow-x-auto rounded-[20px] bg-zinc-800 px-3 py-3 text-zinc-100 first:mt-0 last:mb-0 sm:px-4 sm:text-sm">
      {children}
    </pre>
  ),
  code: ({ children, className, ...props }: CodeProps) => {
    const text = String(children ?? "");
    const isBlock = text.includes("\n");

    if (!isBlock) {
      return (
        <code
          className="chat-text-wrap rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[0.92em] text-stone-900"
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
    <div className="chat-text-wrap min-w-0 text-sm leading-6 text-stone-800 sm:text-[15px] sm:leading-7">
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}
