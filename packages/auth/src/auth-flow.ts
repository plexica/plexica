export interface AuthFlowCoordinator {
  runLogin: (operation: () => Promise<void>) => Promise<void>;
  runCallback: (code: string, state: string, operation: () => Promise<void>) => Promise<void>;
  reset: () => void;
}

export const AUTH_CALLBACK_REPLAY_TTL_MS = 10 * 60 * 1_000;

export function createAuthFlowCoordinator(): AuthFlowCoordinator {
  let loginFlight: Promise<void> | null = null;
  let callbackFlight: { code: string; state: string; promise: Promise<void> } | null = null;
  const settledCallbackStates = new Map<string, number>();
  let generation = 0;

  function cleanupSettledStates(): void {
    const cutoff = Date.now() - AUTH_CALLBACK_REPLAY_TTL_MS;
    for (const [state, settledAt] of settledCallbackStates) {
      if (settledAt < cutoff) settledCallbackStates.delete(state);
    }
  }

  return {
    runLogin(operation) {
      if (loginFlight !== null) return loginFlight;

      callbackFlight = null;
      const promise = Promise.resolve().then(operation);
      loginFlight = promise;
      void promise.finally(() => {
        if (loginFlight === promise) loginFlight = null;
      });
      return promise;
    },

    runCallback(code, state, operation) {
      cleanupSettledStates();
      if (callbackFlight !== null) {
        if (callbackFlight.code === code && callbackFlight.state === state) {
          return callbackFlight.promise;
        }
        return Promise.reject(new Error('Another authentication callback is already in progress'));
      }
      if (settledCallbackStates.has(state)) {
        return Promise.reject(new Error('Authentication callback has already been handled'));
      }

      const promise = Promise.resolve().then(operation);
      const callbackGeneration = generation;
      callbackFlight = { code, state, promise };
      void promise
        .finally(() => {
          if (callbackGeneration === generation) settledCallbackStates.set(state, Date.now());
          if (callbackFlight?.promise === promise) callbackFlight = null;
        })
        .catch(() => undefined);
      return promise;
    },

    reset() {
      generation += 1;
      loginFlight = null;
      callbackFlight = null;
      settledCallbackStates.clear();
    },
  };
}
