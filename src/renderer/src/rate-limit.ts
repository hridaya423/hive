export function throttleTrailing<Args extends unknown[]>(
  run: (...args: Args) => void,
  intervalMs: number,
): (...args: Args) => void {
  let lastRunAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest: Args | undefined;

  function flush(): void {
    timer = undefined;
    const args = latest;
    latest = undefined;
    if (!args) return;
    lastRunAt = Date.now();
    run(...args);
  }

  return (...args) => {
    const wait = lastRunAt + intervalMs - Date.now();
    if (timer === undefined && wait <= 0) {
      lastRunAt = Date.now();
      run(...args);
      return;
    }
    latest = args;
    timer ??= setTimeout(flush, Math.max(wait, 0));
  };
}

export function shareInFlight<Result>(read: () => Promise<Result>): (key: string) => Promise<Result> {
  let running: Promise<Result> | undefined;
  let runningKey = "";
  let queued: Promise<Result> | undefined;
  let latestKey = "";

  function launch(): Promise<Result> {
    runningKey = latestKey;
    const current: Promise<Result> = read().finally(() => {
      if (running === current) running = undefined;
    });
    running = current;
    return current;
  }

  return (key) => {
    latestKey = key;
    if (!running) return launch();
    if (!queued && key === runningKey) return running;
    queued ??= running
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        queued = undefined;
        return launch();
      });
    return queued;
  };
}
