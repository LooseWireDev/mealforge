import { describe, expect, it } from 'vitest';
import { splitSteps, stepsToHtml } from './steps';

describe('stepsToHtml', () => {
  it('renders a numbered markdown list as an ordered list', () => {
    const html = stepsToHtml('1. Sear the chops\n2. Rest and slice');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>Sear the chops</li>');
  });

  it('neutralizes raw HTML in pushed markdown', () => {
    const html = stepsToHtml('1. Sear <img src=x onerror="alert(1)"> the chops');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('neutralizes script tags in pushed markdown', () => {
    const html = stepsToHtml('1. Step <script>alert(1)</script> here');
    expect(html).not.toContain('<script>');
  });

  it('keeps ampersands readable after escaping', () => {
    const html = stepsToHtml('1. Salt & pepper the chops');
    expect(html).toContain('Salt &amp; pepper');
  });
});

describe('splitSteps', () => {
  it('splits numbered lines into steps', () => {
    expect(splitSteps('1. One\n2. Two')).toEqual(['One', 'Two']);
  });

  it('folds unnumbered continuation lines into the previous step', () => {
    expect(splitSteps('1. One\nmore detail\n2. Two')).toEqual(['One\nmore detail', 'Two']);
  });

  it('falls back to paragraphs when nothing is numbered', () => {
    expect(splitSteps('First paragraph.\n\nSecond paragraph.')).toEqual([
      'First paragraph.',
      'Second paragraph.',
    ]);
  });
});
