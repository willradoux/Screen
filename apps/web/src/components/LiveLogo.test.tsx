import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LEFT_EYE, LiveLogo, eyePath } from './LiveLogo';

describe('bonequinho do topo (LiveLogo)', () => {
  it('normal: dois olhos "| |"; a piscadinha dobra o olho direito em "<" (o |< do logo)', () => {
    expect(eyePath(0)).toBe('M202.0 90.0 L202.0 119.0 L202.0 148.0');
    expect(eyePath(1)).toBe('M208.0 97.0 L175.0 123.0 L208.0 149.0');
    expect(LEFT_EYE).toBe('M100 90 L100 148');
  });

  it('é decorativo e começa com os olhos abertos, nas cores do tema', () => {
    const { container } = render(<LiveLogo />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    const eyes = svg.querySelectorAll('mask path');
    expect(eyes).toHaveLength(2);
    expect(eyes[1]).toHaveAttribute('d', eyePath(0));
    expect(svg.querySelector('stop')?.getAttribute('style')).toContain('--logo-1');
  });
});
