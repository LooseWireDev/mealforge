import { marked } from 'marked';

/**
 * Render recipe-step markdown to HTML. Content comes from the household's own
 * MCP pushes (not third parties), so marked's output is used directly.
 */
export function stepsToHtml(stepsMarkdown: string): string {
  return marked.parse(stepsMarkdown, { async: false });
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
