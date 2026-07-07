import { marked } from 'marked';

/**
 * Render recipe-step markdown to HTML. The markdown arrives over the
 * unauthenticated MCP endpoint, so raw HTML is escaped before parsing:
 * markdown formatting still works, embedded tags render as visible text.
 */
export function stepsToHtml(stepsMarkdown: string): string {
  const escaped = stepsMarkdown
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return marked.parse(escaped, { async: false });
}

/**
 * Split step markdown into individual steps for cook mode. Recognizes
 * numbered lines ("1. Sear the chops"); anything before the first number is
 * ignored, and unnumbered text is folded into the previous step. Falls back
 * to paragraphs when there's no numbered list at all.
 */
export function splitSteps(stepsMarkdown: string): string[] {
  const lines = stepsMarkdown.split('\n');
  const steps: string[] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    const match = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (match) {
      if (current) steps.push(current.join('\n').trim());
      current = [match[1] ?? ''];
    } else if (current && line.trim().length > 0) {
      current.push(line);
    }
  }
  if (current) steps.push(current.join('\n').trim());

  if (steps.length > 0) return steps;
  return stepsMarkdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
