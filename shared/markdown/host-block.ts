interface CodeBlockNode {
  content: string;
  sourceInfo?: string;
}

export function codeBlockLanguage({ sourceInfo = "" }: CodeBlockNode): string | undefined {
  return sourceInfo.trim().split(/\s+/)[0] || undefined;
}

/** Rebuild one parsed block without its surrounding list or blockquote markers. */
export function codeBlockMarkdown({ content, sourceInfo = "" }: CodeBlockNode): string {
  // CommonMark forbids backticks in a backtick fence's info string.
  const marker = sourceInfo.includes("`") ? "~" : "`";
  const runs = marker === "`" ? /`+/g : /~+/g;
  let length = 3;
  for (const run of content.matchAll(runs)) length = Math.max(length, run[0].length + 1);
  const fence = marker.repeat(length);
  const body = content && !content.endsWith("\n") ? `${content}\n` : content;
  return `${fence}${sourceInfo}\n${body}${fence}`;
}

/** Unpromoted extension fences must keep their source-only fallback. */
export function hostCodeBlockMarkdown(node: CodeBlockNode, enhanced: boolean): string | undefined {
  const language = codeBlockLanguage(node)?.toLowerCase();
  if (enhanced || language === "math" || language === "mermaid") return undefined;
  return codeBlockMarkdown(node);
}
