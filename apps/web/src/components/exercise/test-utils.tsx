import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MotionProvider } from '@/providers/MotionProvider';

/** Exercise components only need the motion preferences provider. */
export function renderExercise(ui: ReactElement) {
  return render(ui, { wrapper: ({ children }) => <MotionProvider>{children}</MotionProvider> });
}
