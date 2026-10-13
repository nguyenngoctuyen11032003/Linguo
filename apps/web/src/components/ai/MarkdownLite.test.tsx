import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownLite } from './MarkdownLite';

function html(text: string): HTMLElement {
  return render(<MarkdownLite text={text} />).container.firstElementChild as HTMLElement;
}

describe('MarkdownLite', () => {
  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    const root = html('First line\nsecond line\n\nNext paragraph');
    const paragraphs = root.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.querySelectorAll('br')).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe('First linesecond line');
    expect(paragraphs[1]?.textContent).toBe('Next paragraph');
  });

  it('renders bold, italic and code', () => {
    const root = html('Use **past tense** with *yesterday*: `I went`.');
    expect(root.querySelector('strong')?.textContent).toBe('past tense');
    expect(root.querySelector('em')?.textContent).toBe('yesterday');
    expect(root.querySelector('code')?.textContent).toBe('I went');
    expect(root.textContent).toBe('Use past tense with yesterday: I went.');
  });

  it('nests italic inside bold and keeps markup inside code literal', () => {
    const root = html('**very *important* rule** and `**not bold**`');
    expect(root.querySelector('strong em')?.textContent).toBe('important');
    expect(root.querySelector('code')?.textContent).toBe('**not bold**');
  });

  it('keeps unmatched markers as text', () => {
    const root = html('2 * 3 = 6, a ** b, `open');
    expect(root.querySelector('strong, em, code')).toBeNull();
    expect(root.textContent).toBe('2 * 3 = 6, a ** b, `open');
  });

  it('renders bullet and numbered lists', () => {
    const root = html('Lưu ý:\n- một\n- **hai**\n\n1. first\n2. second');
    expect(root.querySelector('p')?.textContent).toBe('Lưu ý:');
    const bullets = root.querySelectorAll('ul > li');
    expect([...bullets].map((li) => li.textContent)).toEqual(['một', 'hai']);
    expect(bullets[1]?.querySelector('strong')).not.toBeNull();
    expect([...root.querySelectorAll('ol > li')].map((li) => li.textContent)).toEqual(['first', 'second']);
  });

  it('shows headings as bold paragraphs', () => {
    const root = html('## Ghi nhớ\nNội dung');
    expect(root.querySelector('h1, h2, h3')).toBeNull();
    expect(root.querySelector('p > strong')?.textContent).toBe('Ghi nhớ');
  });

  it('renders HTML as literal text', () => {
    const payload = '<script>alert(1)</script> <img src=x onerror="alert(2)"> <b>bold</b>';
    const root = html(`${payload}\n- <iframe src="https://evil.example"></iframe>`);
    expect(root.querySelector('script, img, b, iframe')).toBeNull();
    expect(root.querySelector('p')?.textContent).toBe(payload);
    expect(root.querySelector('li')?.textContent).toBe('<iframe src="https://evil.example"></iframe>');
    expect(root.innerHTML).toContain('&lt;script&gt;');
  });

  it('does not create links', () => {
    const root = html('[click](javascript:alert(1)) https://example.com <a href="https://x.y">x</a>');
    expect(root.querySelector('a')).toBeNull();
    expect(root.textContent).toContain('[click](javascript:alert(1))');
  });

  it('renders nothing for empty text', () => {
    expect(html('  \n\n ').childElementCount).toBe(0);
  });

  it('applies className', () => {
    expect(html('x').tagName).toBe('DIV');
    const { container } = render(<MarkdownLite text="x" className="text-sm" />);
    expect(container.firstElementChild).toHaveClass('text-sm');
  });
});
