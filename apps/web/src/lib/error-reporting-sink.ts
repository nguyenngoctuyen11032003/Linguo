import { clientErrorPropsSchema } from '@linguo/shared';
import { flushAnalytics, track } from '@/features/analytics/client';
import type { ErrorReportingSink } from './error-reporting';

// The analytics side of error reporting, loaded with the other app services (app/app-services.ts) so the analytics
// queue and the zod contracts stay out of the entry chunk. See connectErrorReporting().
export const errorReportingSink: ErrorReportingSink = {
  validProps: (props) => clientErrorPropsSchema.safeParse(props).success,
  track: (props, route) => track('client_error', props, { route }),
  flush: () => void flushAnalytics(),
};
