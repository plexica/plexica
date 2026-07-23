const NOOP = (): void => undefined;

let clearQueryCache = NOOP;

export function registerAuthQueryCacheClear(handler: () => void): () => void {
  clearQueryCache = handler;
  return () => {
    if (clearQueryCache === handler) clearQueryCache = NOOP;
  };
}

export function clearAuthQueryCache(): void {
  clearQueryCache();
}
