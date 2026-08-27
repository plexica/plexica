import { clearTimeout, setTimeout } from 'node:timers';

export const quietLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  namespace() {
    return this;
  },
  setLogLevel() {},
};

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function record(event, details = {}) {
  process.stdout.write(`${JSON.stringify({ event, at: new Date().toISOString(), ...details })}\n`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout(promise, description, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out waiting for ${description}`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function waitFor(readValue, description, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await readValue();
    if (value) return value;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${description}`);
}
