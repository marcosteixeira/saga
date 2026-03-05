type SessionQueryResult = {
  data: { opening_situation: string | null } | null;
  error: unknown;
};

type SleepFn = (ms: number) => Promise<void>;

const sleep: SleepFn = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function fetchSessionOpeningReady(
  fetchSession: () => PromiseLike<SessionQueryResult>
): Promise<boolean> {
  try {
    const { data, error } = await fetchSession();

    if (error) return false;

    return Boolean(data?.opening_situation);
  } catch {
    return false;
  }
}

export async function waitForSessionOpeningReady(
  fetchSession: () => PromiseLike<SessionQueryResult>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    sleep?: SleepFn;
    shouldStop?: () => boolean;
  } = {}
): Promise<boolean> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 8);
  const delayMs = Math.max(0, options.delayMs ?? 1000);
  const doSleep = options.sleep ?? sleep;
  const shouldStop = options.shouldStop ?? (() => false);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (shouldStop()) return false;

    const ready = await fetchSessionOpeningReady(fetchSession);
    if (ready) return true;

    if (attempt < maxAttempts && !shouldStop()) {
      await doSleep(delayMs);
    }
  }

  return false;
}
