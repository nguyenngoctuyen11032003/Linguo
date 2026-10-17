// Test-only: happy-dom has no Cache API, so these in-memory fakes stand in for `caches`. Not imported by app code.
import { vi } from 'vitest';

class FakeCache {
  readonly store = new Map<string, Response>();
  putError: unknown = null;

  private key(request: RequestInfo | URL): string {
    return typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
  }
  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.store.get(this.key(request))?.clone();
  }
  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    if (this.putError) throw this.putError;
    this.store.set(this.key(request), response.clone());
  }
  async delete(request: RequestInfo | URL): Promise<boolean> {
    return this.store.delete(this.key(request));
  }
  async keys(): Promise<Request[]> {
    return [...this.store.keys()].map((url) => new Request(url));
  }
}

export function installCacheStub() {
  const caches = new Map<string, FakeCache>();
  const storage = {
    open: async (name: string) => {
      let cache = caches.get(name);
      if (!cache) {
        cache = new FakeCache();
        caches.set(name, cache);
      }
      return cache;
    },
    has: async (name: string) => caches.has(name),
    delete: async (name: string) => caches.delete(name),
    keys: async () => [...caches.keys()],
    match: async (request: RequestInfo | URL, options?: { cacheName?: string }) => {
      for (const [name, cache] of caches) {
        if (options?.cacheName && options.cacheName !== name) continue;
        const hit = await cache.match(request);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  vi.stubGlobal('caches', storage);
  return {
    caches,
    names: () => [...caches.keys()],
    failPutWith(error: unknown) {
      for (const c of caches.values()) c.putError = error;
      const open = storage.open;
      storage.open = async (name: string) => {
        const cache = await open(name);
        cache.putError = error;
        return cache;
      };
    },
    restore() {
      vi.unstubAllGlobals();
    },
  };
}
