/**
 * Routes where the learner is in the middle of something (lesson, exam attempt, diagnostic, session). The
 * update toast says to reload after finishing there; nothing ever reloads automatically anywhere.
 * Matches the app path with or without the BASE_URL prefix (e.g. '/Linguo/app/hoc-tap/bai/x').
 */
const BUSY = /(?:^|\/)app\/(?:hoc-tap\/bai\/[^/]+|luyen-thi\/lam-bai\/[^/]+|kiem-tra\/[^/]+|phien-hoc)\/?$/;

export function isBusyRoute(pathname: string): boolean {
  return BUSY.test(pathname);
}
