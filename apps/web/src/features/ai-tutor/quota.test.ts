import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_QUOTA_DEFAULT_LIMIT, notifyAiRun, remainingOf, subscribeAiRuns } from './quota';

type Q = Parameters<typeof remainingOf>[0];
const q = (used: number, limit: number): Q => ({ used, limit }) as Q;

afterEach(() => vi.restoreAllMocks());

describe('remainingOf', () => {
  it.each([
    [0, 20, 20], [5, 20, 15], [20, 20, 0], [25, 20, 0], [0, 0, 0],
  ])('used %i of %i leaves %i', (used, limit, left) => {
    expect(remainingOf(q(used, limit))).toBe(left);
  });

  it('has a sane display default', () => {
    expect(AI_QUOTA_DEFAULT_LIMIT).toBeGreaterThan(0);
  });
});

describe('ai run subscriptions', () => {
  it('notifies every subscriber, with null when the answer carried no quota', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeAiRuns(a);
    const offB = subscribeAiRuns(b);
    notifyAiRun(q(1, 20));
    notifyAiRun(null);
    expect(a.mock.calls).toEqual([[q(1, 20)], [null]]);
    expect(b).toHaveBeenCalledTimes(2);
    offA();
    offB();
  });

  it('unsubscribe stops delivery and is idempotent', () => {
    const a = vi.fn();
    const off = subscribeAiRuns(a);
    off();
    off();
    notifyAiRun(null);
    expect(a).not.toHaveBeenCalled();
  });

  it('a listener that unsubscribes itself does not skip the next one', () => {
    const second = vi.fn();
    const offFirst = subscribeAiRuns(() => offFirst());
    const offSecond = subscribeAiRuns(second);
    notifyAiRun(null);
    expect(second).toHaveBeenCalledTimes(1);
    offSecond();
  });

  it('a listener added during notification waits for the next run', () => {
    const late = vi.fn();
    let offLate = () => {};
    const off = subscribeAiRuns(() => {
      offLate = subscribeAiRuns(late);
    });
    notifyAiRun(null);
    expect(late).not.toHaveBeenCalled();
    off();
    offLate();
  });
});
