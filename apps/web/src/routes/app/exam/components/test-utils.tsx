import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MotionProvider } from '@/providers/MotionProvider';

/** Exam components need motion preferences; history rows link to attempts, so a router too. */
export function renderExam(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <MotionProvider>{children}</MotionProvider>
      </MemoryRouter>
    ),
  });
}
