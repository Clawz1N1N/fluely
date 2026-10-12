import React from "react";
import { Streamdown, defaultRemarkPlugins, defaultRehypePlugins } from "streamdown";
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { openUrl } from "@tauri-apps/plugin-opener";

interface MarkdownRendererProps {
  children: string;
  isStreaming?: boolean;
}

// Preserve Streamdown's GFM/CJK plugins while enabling the usual inline syntax.
const REMARK_PLUGINS = [
  ...Object.entries(defaultRemarkPlugins).filter(([name]) => name !== 'math').map(([, plugin]) => plugin),
  [remarkMath, { singleDollarTextMath: true }] as [typeof remarkMath, { singleDollarTextMath: boolean }],
];
// Sanitize model HTML before generating trusted KaTeX markup. KaTeX 0.18
// output is otherwise stripped by Streamdown 1.x's old post-render sanitizer.
const REHYPE_PLUGINS = [defaultRehypePlugins.raw,
  [rehypeSanitize,{...defaultSchema,attributes:{...defaultSchema.attributes,
    code:[...(defaultSchema.attributes?.code??[]),['className',/^language-./,'math-inline','math-display']],
  }}] as const,
  defaultRehypePlugins.katex,defaultRehypePlugins.harden];

/** Translate model LaTeX delimiters only in prose, preserving Markdown code. */
export function normalizeMathDelimiters(markdown: string): string {
  // Fences may use either backticks or tildes; inline spans may use any backtick run.
  let fence: { character: string; length: number } | null = null;
  let inlineTicks = 0;
  return markdown.split(/(\r?\n)/).map(line => {
    if (/^\r?\n$/.test(line)) return line;
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return line;
    }
    if (!inlineTicks && marker) {
      fence = { character: marker[1][0], length: marker[1].length };
      return line;
    }
    let output = '';
    for (let i = 0; i < line.length;) {
      if (line[i] === '`') {
        let end = i + 1;
        while (line[end] === '`') end++;
        const count = end - i;
        if (!inlineTicks) inlineTicks = count;
        else if (inlineTicks === count) inlineTicks = 0;
        output += line.slice(i, end);
        i = end;
      } else if (!inlineTicks && line[i] === '\\') {
        const next = line[i + 1];
        if (next === '(' || next === ')') { output += '$'; i += 2; }
        else if (next === '[') { output += '\n$$\n'; i += 2; }
        else if (next === ']') { output += '\n$$\n'; i += 2; }
        else { output += line.slice(i, i + 2); i += 2; }
      } else { output += line[i++]; }
    }
    return output;
  }).join('');
}

export function Markdown({
  children,
  isStreaming = false,
}: MarkdownRendererProps) {
  return (
    <Streamdown
      isAnimating={isStreaming}
      shikiTheme={["github-light", "github-dark"]}
      components={COMPONENTS as any}
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS as any}
      controls={{
        table: true,
        code: true,
        mermaid: {
          download: true,
          copy: true,
          fullscreen: false,
          panZoom: false,
        },
      }}
    >
      {normalizeMathDelimiters(children)}
    </Streamdown>
  );
}

const COMPONENTS = {
  a: ({ children, href, ...props }: any) => {
    const handleClick = async (e: React.MouseEvent) => {
      e.preventDefault();
      if (href) {
        try {
          await openUrl(href);
        } catch (error) {
          console.error("Failed to open URL:", error);
        }
      }
    };

    return (
      <a
        href={href}
        className="text-gray-600 underline underline-offset-2 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100 cursor-pointer"
        onClick={handleClick}
        {...props}
      >
        {children}
      </a>
    );
  },
};
