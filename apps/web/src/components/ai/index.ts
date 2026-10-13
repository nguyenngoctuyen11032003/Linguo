// placeholder: replaced by Task E7
// Minimal stand-in so Task E8's integration compiles and runs before the real AI components are merged.
import type { AiRequestInput } from '@linguo/shared';

export interface AiExplainSheetProps {
  open: boolean;
  onClose: () => void;
  request: AiRequestInput;
  fallback?: { title: string; body: string };
}

export function AiExplainSheet(_props: AiExplainSheetProps): null {
  return null;
}
