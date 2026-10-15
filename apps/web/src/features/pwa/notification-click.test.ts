import { SW_NOTIFICATION_CLICKED } from './sw-helpers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onNotificationClicked, resetNotificationClickListener, startNotificationClickListener } from './notification-click';

const ID = '3f2b8c1e-5a4d-4e6f-9a7b-0c1d2e3f4a5b';

class FakeContainer extends EventTarget {
  startMessages = vi.fn();
  send(data: unknown) {
    this.dispatchEvent(Object.assign(new Event('message'), { data }));
  }
}
const click = (over: Record<string, unknown> = {}) => ({
  type: SW_NOTIFICATION_CLICKED, notification_id: ID, url: 'https://h/Linguo/app/on-tap', navigated: false, ...over,
});
const asContainer = (c: FakeContainer) => c as unknown as ServiceWorkerContainer;

afterEach(() => resetNotificationClickListener());

describe('notification click relay', () => {
  it('delivers a click to a subscriber', () => {
    const c = new FakeContainer();
    const cb = vi.fn();
    onNotificationClicked(cb, asContainer(c));
    c.send(click());
    expect(cb).toHaveBeenCalledWith({ notificationId: ID, url: 'https://h/Linguo/app/on-tap', navigated: false });
  });

  it('opens the message queue and is idempotent for the same container', () => {
    const c = new FakeContainer();
    startNotificationClickListener(asContainer(c));
    startNotificationClickListener(asContainer(c));
    expect(c.startMessages).toHaveBeenCalledTimes(1);
    const cb = vi.fn();
    onNotificationClicked(cb, asContainer(c));
    c.send(click());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('buffers clicks that arrive before anyone subscribes, keeping only the latest five', () => {
    const c = new FakeContainer();
    startNotificationClickListener(asContainer(c));
    for (let i = 0; i < 8; i++) c.send(click({ url: `https://h/Linguo/app/${i}` }));
    const cb = vi.fn();
    onNotificationClicked(cb, asContainer(c));
    expect(cb.mock.calls.map(([x]) => x.url.split('/').pop())).toEqual(['3', '4', '5', '6', '7']);
    // The buffer is drained: a second subscriber sees nothing old.
    const cb2 = vi.fn();
    onNotificationClicked(cb2, asContainer(c));
    expect(cb2).not.toHaveBeenCalled();
  });

  it('accepts a null notification id and rejects malformed messages', () => {
    const c = new FakeContainer();
    const cb = vi.fn();
    onNotificationClicked(cb, asContainer(c));
    c.send(click({ notification_id: null }));
    c.send(click({ notification_id: 'not-a-uuid' }));
    c.send(click({ url: 5 }));
    c.send(click({ navigated: 'yes' }));
    c.send({ type: 'other' });
    c.send(null);
    c.send('text');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0].notificationId).toBeNull();
  });

  it('unsubscribe stops delivery', () => {
    const c = new FakeContainer();
    const cb = vi.fn();
    const off = onNotificationClicked(cb, asContainer(c));
    off();
    c.send(click());
    expect(cb).not.toHaveBeenCalled();
  });

  it('switching container detaches from the previous one', () => {
    const a = new FakeContainer();
    const b = new FakeContainer();
    const cb = vi.fn();
    onNotificationClicked(cb, asContainer(a));
    startNotificationClickListener(asContainer(b));
    a.send(click());
    b.send(click());
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
