import { z } from 'zod';
import { DISPLAY_NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, THEMES } from './constants';

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: 'Vui lòng nhập email.' })
  .email({ message: 'Email không hợp lệ.' });

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, { message: `Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.` })
  .max(PASSWORD_MAX, { message: `Mật khẩu tối đa ${PASSWORD_MAX} ký tự.` });

export const displayNameSchema = z
  .string()
  .trim()
  .max(DISPLAY_NAME_MAX, { message: `Tên hiển thị tối đa ${DISPLAY_NAME_MAX} ký tự.` });

export const timezoneSchema = z
  .string()
  .min(1, { message: 'Vui lòng chọn múi giờ.' })
  .max(64)
  .refine(isValidTimeZone, { message: 'Múi giờ không hợp lệ.' });

export const themeSchema = z.enum(THEMES);

export const signUpSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Vui lòng nhập mật khẩu.' }),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Mật khẩu nhập lại không khớp.', path: ['confirm'] });

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema,
  timezone: timezoneSchema,
});

export const preferencesUpdateSchema = z.object({
  theme: themeSchema,
  reduceMotion: z.boolean(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PreferencesUpdateInput = z.infer<typeof preferencesUpdateSchema>;

/** First message per top-level field, e.g. `{ email: 'Email không hợp lệ.' }`. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_form');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
