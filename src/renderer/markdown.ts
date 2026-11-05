// Protect fenced, indented and inline code before normalizing TeX delimiters.
export function normalizeMath(text: string): string {
  return text.replace(/(^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\2[^\n]*(?:\n|$)|(?![\s\S])))|(^ {4}[^\n]*(?:\n|$))|(`+)[\s\S]*?\4|\\\[([\s\S]*?)\\\]|\\\(([^\n]*?)\\\)/gm,
    (match, fence, _marker, indent, inline, display, math) =>
      fence || indent || inline ? match : display !== undefined ? `$$${display}$$` : `$${math}$`);
}
export interface MarkdownBlock { source: string; complete: boolean }
export function splitBlocks(text: string): MarkdownBlock[] {
  // References can change earlier blocks; keep such documents in one context.
  if (/^ {0,3}\[[^\]]+\]:/m.test(text)) return [{ source: text, complete: false }];
  const blocks: MarkdownBlock[] = [];
  let start = 0;
  let fence = "";
  let math = false;
  let container = false;
  let offset = 0;
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      const token = marker[1]!;
      if (!fence) fence = token;
      else if (token[0] === fence[0] && token.length >= fence.length && /^ {0,3}(?:`+|~+)\s*$/.test(line)) fence = "";
    }
    if (!fence) {
      const delimiters = line.match(/\$\$|\\\[|\\\]/g) ?? [];
      for (const delimiter of delimiters) {
        if (delimiter === "\\[") math = true;
        else if (delimiter === "\\]") math = false;
        else math = !math;
      }
    }
    if (/^(?: {0,3}(?:[-+*]|\d+[.)])\s|>| {4}|\t)/.test(line)) container = true;
    offset += line.length;
    if (!fence && !math && !container && /^\s*\n$/.test(line)) {
      blocks.push({ source: text.slice(start, offset), complete: true });
      start = offset;
    }
  }
  if (start < text.length) blocks.push({ source: text.slice(start), complete: false });
  return blocks;
}
export function codeText(value: string): string {
  // Markdown renderers append one structural newline, independent of source newlines.
  return value.replace(/\n$/, "");
}
