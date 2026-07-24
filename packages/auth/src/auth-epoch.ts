export interface AuthEpoch {
  capture: () => number;
  invalidate: () => void;
  isCurrent: (epoch: number) => boolean;
}

export function createAuthEpoch(): AuthEpoch {
  let current = 0;

  return {
    capture: () => current,
    invalidate: () => {
      current += 1;
    },
    isCurrent: (epoch) => epoch === current,
  };
}
