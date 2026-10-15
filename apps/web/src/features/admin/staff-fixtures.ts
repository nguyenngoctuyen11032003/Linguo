import type { AdminFoundUser, AdminStaffMember } from '@linguo/shared';
import { ADMIN_USER_ID } from './admin-fixtures';

// Fixtures for the staff page (/quan-tri/nhan-su). They satisfy the shared zod contract. The first member is the
// signed-in admin of the unit tests (ADMIN_USER_ID).

export const STAFF_REVIEWER_ID = '50000000-0000-4000-8000-000000000001';
export const STAFF_EDITOR_ID = '50000000-0000-4000-8000-000000000002';
export const LEARNER_ID = '50000000-0000-4000-8000-000000000003';

export function staffMemberFixture(overrides: Partial<AdminStaffMember> = {}): AdminStaffMember {
  return {
    user_id: ADMIN_USER_ID,
    email: 'staff@example.com',
    display_name: 'Quản Trị',
    role: 'admin',
    granted_by: null,
    granted_by_email: null,
    granted_at: '2026-10-01T08:00:00Z',
    ...overrides,
  };
}

export function staffListFixture(): AdminStaffMember[] {
  return [
    staffMemberFixture(),
    staffMemberFixture({
      user_id: STAFF_REVIEWER_ID,
      email: 'lan@example.com',
      display_name: 'Lan Phạm',
      role: 'reviewer',
      granted_by: ADMIN_USER_ID,
      granted_by_email: 'staff@example.com',
      granted_at: '2026-10-05T08:00:00Z',
    }),
    staffMemberFixture({
      user_id: STAFF_EDITOR_ID,
      email: 'huy@example.com',
      display_name: null,
      role: 'editor',
      granted_by: ADMIN_USER_ID,
      granted_by_email: 'staff@example.com',
      granted_at: '2026-10-06T08:00:00Z',
    }),
  ];
}

export function foundUserFixture(overrides: Partial<AdminFoundUser> = {}): AdminFoundUser {
  return { user_id: LEARNER_ID, email: 'mai@example.com', display_name: 'Mai Trần', role: null, ...overrides };
}
