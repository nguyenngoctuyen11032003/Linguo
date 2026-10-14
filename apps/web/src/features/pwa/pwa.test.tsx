import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallAppSection } from './InstallAppSection';
import { onNotificationClicked, resetNotificationClickListener } from './notification-click';
import { registerServiceWorker, swBasePath, swUpdateStore } from './register';
import { SW_MESSAGE_SKIP_WAITING, SW_NOTIFICATION_CLICKED } from './sw-helpers';
import { UpdateToast } from './UpdateToast';
import { captureInstallPrompt, isIos, resetInstallPromptForTests } from './useInstallPrompt';
import { stubMatchMedia } from '../../../tests/unit/match-media';

const ID = '0b6f1d4e-1c1a-4a5e-9a51-6a2f2c6c8f11';

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = 'installing';
  postMessage = vi.fn();
  setState(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update = vi.fn(() => Promise.resolve());
}

class FakeContainer extends EventTarget {
  controller: object | null = {};
  registration = new FakeRegistration();
  register = vi.fn<(url: string, opts?: RegistrationOptions) => Promise<FakeRegistration>>(() =>
    Promise.resolve(this.registration),
  );
  startMessages = vi.fn();
}

const asContainer = (c: FakeContainer) => c as unknown as ServiceWorkerContainer;
const asWorker = (w: FakeWorker) => w as unknown as ServiceWorker;

afterEach(() => {
  act(() => swUpdateStore.reset());
  resetNotificationClickListener();
  act(() => resetInstallPromptForTests());
});

describe('registerServiceWorker', () => {
  it('is a no-op when disabled (dev, tests) or unsupported', async () => {
    const c = new FakeContainer();
    expect(await registerServiceWorker({ container: asContainer(c) })).toBeNull(); // Vitest: MODE === 'test'
    expect(await registerServiceWorker({ enabled: false, container: asContainer(c) })).toBeNull();
    expect(c.register).not.toHaveBeenCalled();
  });

  it('registers sw.js under BASE_URL and surfaces an already waiting worker', async () => {
    const c = new FakeContainer();
    const waiting = new FakeWorker();
    waiting.state = 'installed';
    c.registration.waiting = waiting;
    await registerServiceWorker({ enabled: true, base: '/Linguo/', container: asContainer(c) });
    expect(c.register).toHaveBeenCalledWith('/Linguo/sw.js', { scope: '/Linguo/' });
    expect(swUpdateStore.getSnapshot().updateAvailable).toBe(true);
  });

  it('flags an update only when a new worker installs while a controller exists', async () => {
    const c = new FakeContainer();
    await registerServiceWorker({ enabled: true, base: '/', container: asContainer(c) });
    const next = new FakeWorker();
    c.registration.installing = next;
    c.registration.dispatchEvent(new Event('updatefound'));
    expect(swUpdateStore.getSnapshot().updateAvailable).toBe(false);
    next.setState('installed');
    expect(swUpdateStore.getSnapshot().updateAvailable).toBe(true);
  });

  it('treats the first install (no controller) as no update', async () => {
    const c = new FakeContainer();
    c.controller = null;
    await registerServiceWorker({ enabled: true, base: '/', container: asContainer(c) });
    const first = new FakeWorker();
    c.registration.installing = first;
    c.registration.dispatchEvent(new Event('updatefound'));
    first.setState('installed');
    expect(swUpdateStore.getSnapshot().updateAvailable).toBe(false);
  });

  it('resolves null when registration fails', async () => {
    const c = new FakeContainer();
    c.register.mockRejectedValueOnce(new Error('SecurityError'));
    expect(await registerServiceWorker({ enabled: true, base: '/', container: asContainer(c) })).toBeNull();
  });

  it('resolves null when a blocked registration resolves to nothing', async () => {
    const c = new FakeContainer();
    c.register.mockResolvedValueOnce(undefined as unknown as FakeRegistration);
    expect(await registerServiceWorker({ enabled: true, base: '/', container: asContainer(c) })).toBeNull();
  });

  it('normalises the base path', () => {
    expect(swBasePath('/')).toBe('/');
    expect(swBasePath('/Linguo')).toBe('/Linguo/');
    expect(swBasePath('./')).toBe('/');
    expect(swBasePath('https://cdn.example.com/app/')).toBe('/app/');
  });
});

describe('UpdateToast', () => {
  it('renders nothing visible until a new version waits', () => {
    render(<UpdateToast pathname="/app" />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('applies the update only when "Tải lại" is tapped', async () => {
    const user = userEvent.setup();
    const apply = vi.spyOn(swUpdateStore, 'applyUpdate').mockImplementation(() => undefined);
    render(<UpdateToast pathname="/app" />);
    act(() => swUpdateStore.setWaiting(asWorker(new FakeWorker())));
    expect(screen.getByText('Đã có phiên bản mới')).toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Tải lại' }));
    expect(apply).toHaveBeenCalledTimes(1);
    apply.mockRestore();
  });

  it('applyUpdate tells the waiting worker to activate, then reloads once on controllerchange', () => {
    const worker = new FakeWorker();
    const container = new FakeContainer();
    const reload = vi.fn();
    swUpdateStore.applyUpdate(asContainer(container), reload); // nothing waiting: no-op
    expect(reload).not.toHaveBeenCalled();
    act(() => swUpdateStore.setWaiting(asWorker(worker)));
    swUpdateStore.applyUpdate(asContainer(container), reload);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: SW_MESSAGE_SKIP_WAITING });
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads by itself during a lesson and keeps the button', () => {
    const worker = new FakeWorker();
    const container = new FakeContainer();
    const reload = vi.fn();
    render(<UpdateToast pathname="/Linguo/app/hoc-tap/bai/abc" />);
    act(() => swUpdateStore.setWaiting(asWorker(worker)));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(screen.getByText('Bạn có thể tải lại sau khi làm xong bài.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeInTheDocument();
  });

  it('"Để sau" hides the toast until the next version', async () => {
    const user = userEvent.setup();
    render(<UpdateToast pathname="/app" />);
    act(() => swUpdateStore.setWaiting(asWorker(new FakeWorker())));
    await user.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(screen.queryByText('Đã có phiên bản mới')).not.toBeInTheDocument();
    act(() => swUpdateStore.setWaiting(asWorker(new FakeWorker())));
    expect(screen.getByText('Đã có phiên bản mới')).toBeInTheDocument();
  });
});

describe('onNotificationClicked', () => {
  const message = (data: unknown) => new MessageEvent('message', { data });

  it('delivers valid click messages and ignores others', () => {
    const c = new FakeContainer();
    const cb = vi.fn();
    const off = onNotificationClicked(cb, asContainer(c));
    expect(c.startMessages).toHaveBeenCalled();
    c.dispatchEvent(message({ type: 'other' }));
    c.dispatchEvent(message({ type: SW_NOTIFICATION_CLICKED, notification_id: ID, url: 'http://localhost/app', navigated: true }));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ notificationId: ID, url: 'http://localhost/app', navigated: true });
    off();
    c.dispatchEvent(message({ type: SW_NOTIFICATION_CLICKED, notification_id: ID, url: 'http://localhost/app', navigated: true }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('buffers a click that arrives before the app subscribes', async () => {
    const c = new FakeContainer();
    await registerServiceWorker({ enabled: true, base: '/', container: asContainer(c) });
    c.dispatchEvent(message({ type: SW_NOTIFICATION_CLICKED, notification_id: null, url: 'http://localhost/app', navigated: false }));
    const cb = vi.fn();
    onNotificationClicked(cb, asContainer(c));
    expect(cb).toHaveBeenCalledWith({ notificationId: null, url: 'http://localhost/app', navigated: false });
  });
});

describe('InstallAppSection', () => {
  const fireInstallPrompt = (outcome: 'accepted' | 'dismissed') => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(() => Promise.resolve()),
      userChoice: Promise.resolve({ outcome }),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    return event;
  };

  it('offers the install button when the browser provides a prompt, without showing it automatically', async () => {
    const user = userEvent.setup();
    captureInstallPrompt();
    render(<InstallAppSection />);
    expect(screen.queryByRole('heading', { name: 'Cài ứng dụng' })).not.toBeInTheDocument();
    const event = fireInstallPrompt('accepted');
    expect(event.defaultPrevented).toBe(true);
    expect(event.prompt).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cài Linguo lên máy' }));
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: 'Cài ứng dụng' })).not.toBeInTheDocument();
  });

  it('shows the Share → Add to Home Screen steps on iOS', () => {
    const ua = vi
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
    try {
      render(<InstallAppSection />);
      expect(screen.getByRole('heading', { name: 'Cài ứng dụng' })).toBeInTheDocument();
      expect(screen.getByText('Chia sẻ')).toBeInTheDocument();
      expect(screen.getByText('Thêm vào màn hình chính')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cài Linguo lên máy' })).not.toBeInTheDocument();
    } finally {
      ua.mockRestore();
    }
  });

  it('is hidden when already installed (standalone)', () => {
    stubMatchMedia((q) => q === '(display-mode: standalone)');
    captureInstallPrompt();
    const { container } = render(<InstallAppSection />);
    fireInstallPrompt('accepted');
    expect(container).toBeEmptyDOMElement();
  });

  it('is hidden when the browser offers no install path', () => {
    const { container } = render(<InstallAppSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hides after the appinstalled event', () => {
    captureInstallPrompt();
    render(<InstallAppSection />);
    fireInstallPrompt('dismissed');
    expect(screen.getByRole('button', { name: 'Cài Linguo lên máy' })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.queryByRole('button', { name: 'Cài Linguo lên máy' })).not.toBeInTheDocument();
  });

  it('detects iPadOS that reports itself as a Mac', () => {
    expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isIos({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7)', platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false);
  });
});
