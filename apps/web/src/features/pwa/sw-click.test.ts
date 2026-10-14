import { describe, expect, it, vi, type Mock } from 'vitest';
import { handleNotificationClick, type ClickClients, type ClickWindow } from './sw-click';
import { SW_NOTIFICATION_CLICKED } from './sw-helpers';

const SCOPE = 'https://nam.github.io/Linguo/';
const TARGET = `${SCOPE}app/on-tap`;
const ID = '0b6f1d4e-1c1a-4a5e-9a51-6a2f2c6c8f11';

interface FakeWindow extends ClickWindow {
  focus: Mock<() => Promise<ClickWindow>>;
  postMessage: Mock<(message: unknown) => void>;
  navigate: Mock<(url: string) => Promise<ClickWindow>>;
}

function fakeWindow(url: string, focused = true, focusFails = false): FakeWindow {
  const w: FakeWindow = {
    url,
    focused,
    focus: vi.fn(async () => {
      if (focusFails) throw new Error('no activation');
      return w;
    }),
    // A WindowClient has navigate(); the handler must never call it.
    navigate: vi.fn(async () => w),
    postMessage: vi.fn<(message: unknown) => void>(),
  };
  return w;
}

function fakeClients(windows: FakeWindow[], opened: FakeWindow | null = null) {
  const openWindow = vi.fn<(url: string) => Promise<ClickWindow | null>>(async () => opened);
  const clients: ClickClients = { matchAll: async () => windows, openWindow };
  return Object.assign(clients, { openWindow });
}

const message = (navigated: boolean, url = TARGET) => ({ type: SW_NOTIFICATION_CLICKED, notification_id: ID, url, navigated });

describe('handleNotificationClick', () => {
  it('never navigates a focused lesson window; it only posts the target to the app', async () => {
    const lesson = fakeWindow(`${SCOPE}app/hoc-tap/bai/abc`);
    const clients = fakeClients([lesson]);
    await handleNotificationClick(clients, SCOPE, TARGET, ID);
    expect(lesson.navigate).not.toHaveBeenCalled();
    expect(clients.openWindow).not.toHaveBeenCalled();
    expect(lesson.focus).toHaveBeenCalled();
    expect(lesson.postMessage).toHaveBeenCalledWith(message(false));
  });

  it('does not navigate any existing window (no reload that could lose the click or unsaved work)', async () => {
    const page = fakeWindow(`${SCOPE}app/tien-do`);
    await handleNotificationClick(fakeClients([page]), SCOPE, TARGET, ID);
    expect(page.navigate).not.toHaveBeenCalled();
    expect(page.postMessage).toHaveBeenCalledWith(message(false));
  });

  it('reports navigated when the window already shows the target', async () => {
    const page = fakeWindow(TARGET);
    await handleNotificationClick(fakeClients([page]), SCOPE, TARGET, ID);
    expect(page.postMessage).toHaveBeenCalledWith(message(true));
  });

  it('still posts the message when focus() is refused', async () => {
    const page = fakeWindow(`${SCOPE}app`, true, true);
    await handleNotificationClick(fakeClients([page]), SCOPE, TARGET, ID);
    expect(page.postMessage).toHaveBeenCalledWith(message(false));
  });

  it('prefers the focused window of the app and ignores windows outside the scope', async () => {
    const other = fakeWindow('https://nam.github.io/Other/', true);
    const background = fakeWindow(`${SCOPE}app`, false);
    const focused = fakeWindow(`${SCOPE}app/phien-hoc`, true);
    await handleNotificationClick(fakeClients([other, background, focused]), SCOPE, TARGET, ID);
    expect(focused.postMessage).toHaveBeenCalledTimes(1);
    expect(background.postMessage).not.toHaveBeenCalled();
    expect(other.postMessage).not.toHaveBeenCalled();
  });

  it('opens a window at the target when the app is not open, then tells it so (navigated)', async () => {
    const opened = fakeWindow(TARGET);
    const clients = fakeClients([], opened);
    await handleNotificationClick(clients, SCOPE, TARGET, ID);
    expect(clients.openWindow).toHaveBeenCalledWith(TARGET);
    expect(opened.postMessage).toHaveBeenCalledWith(message(true));
  });

  it('survives openWindow failing or returning no client', async () => {
    const failing: ClickClients = { matchAll: async () => [], openWindow: async () => Promise.reject(new Error('blocked')) };
    await expect(handleNotificationClick(failing, SCOPE, TARGET, ID)).resolves.toBeUndefined();
    await expect(handleNotificationClick(fakeClients([], null), SCOPE, TARGET, ID)).resolves.toBeUndefined();
  });

  it('passes a missing notification id through as null', async () => {
    const page = fakeWindow(`${SCOPE}app`);
    await handleNotificationClick(fakeClients([page]), SCOPE, TARGET, null);
    expect(page.postMessage).toHaveBeenCalledWith({ ...message(false), notification_id: null });
  });
});
