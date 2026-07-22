export interface AuthFlowCoordinator {
  runLogin: (operation: () => Promise<void>) => Promise<void>;
  runCallback: (code: string, state: string, operation: () => Promise<void>) => Promise<void>;
  reset: () => void;
}

export function createAuthFlowCoordinator(): AuthFlowCoordinator {
  let loginFlight: Promise<void> | null = null;
  let callbackFlight: { state: string; promise: Promise<void> } | null = null;

  return {
    runLogin(operation) {
      if (loginFlight !== null) return loginFlight;

      callbackFlight = null;
      const promise = Promise.resolve().then(operation);
      loginFlight = promise;
      void promise.catch(() => {
        if (loginFlight === promise) loginFlight = null;
      });
      return promise;
    },

    runCallback(_code, state, operation) {
      if (callbackFlight !== null) {
        if (callbackFlight.state === state) return callbackFlight.promise;
        return Promise.reject(new Error('Another authentication callback is already in progress'));
      }

      const promise = Promise.resolve().then(operation);
      callbackFlight = { state, promise };
      return promise;
    },

    reset() {
      loginFlight = null;
      callbackFlight = null;
    },
  };
}
