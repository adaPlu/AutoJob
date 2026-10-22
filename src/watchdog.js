// Per-item inactivity watchdog. An item may exceed this total duration if
// it keeps completing meaningful milestones; a stalled item cannot block the run.
export class ItemTimedOutError extends Error {
  constructor(label, idleMs) {
    super(`${label} made no progress for ${Math.round(idleMs / 1000)} seconds`);
    this.name = 'ItemTimedOutError';
    this.code = 'ITEM_TIMEOUT';
    this.idleMs = idleMs;
  }
}

export function watchdogTimeoutMs(config = {}) {
  const configured = Number(config.itemInactivityTimeoutMs);
  // 5 minutes by default. A finite positive configured timeout is useful for tests.
  return Number.isFinite(configured) && configured > 0 ? configured : 300_000;
}

/** Run an item and yield on timeout. `signal` and `onTimeout` let browser
 * operations be interrupted before the next item begins. `progress` resets
 * the inactivity deadline only on actual milestones, never on mere polling.
 */
export async function settleWithin(promise, timeoutMs=5000) {
  let timer;
  try {
    return await Promise.race([Promise.resolve(promise),new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);})]);
  } finally {clearTimeout(timer);}
}

export async function runWithWatchdog({label, timeoutMs = 300_000, task, onTimeout = async () => {}, logger = console}) {
  if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) throw new RangeError('timeoutMs must be positive');
  const controller = new AbortController();
  let timer, settled = false, timeoutStarted = false;
  let lastProgress = Date.now();
  const timeoutSignal = new Promise((resolve) => {
    const fire = () => {
      if (settled || timeoutStarted) return;
      const elapsed = Date.now() - lastProgress;
      if (elapsed < timeoutMs) { timer = setTimeout(fire, Math.max(1, timeoutMs - elapsed)); return; }
      timeoutStarted = true;
      controller.abort(new ItemTimedOutError(label, timeoutMs));
      logger.warn(`WATCHDOG: ${label} stalled for ${Math.ceil(timeoutMs / 60000)} minute(s); skip and continue.`);
      resolve({ timedOut: true, error: controller.signal.reason });
    };
    timer = setTimeout(fire, timeoutMs);
  });
  const progress = () => { if (!settled && !controller.signal.aborted) lastProgress = Date.now(); };
  const work = Promise.resolve().then(() => task({signal:controller.signal, progress})).then(value => ({timedOut:false, value}), error => ({timedOut:false, error}));
  try {
    const outcome = await Promise.race([work, timeoutSignal]);
    settled = true;
    if (outcome.timedOut) {
      // A hung page.close must not strand the entire run either.
      await settleWithin(Promise.resolve().then(() => onTimeout()), 5000).catch(error => logger.warn(`Watchdog cleanup: ${error?.message || error}`));
    }
    return outcome;
  } finally {
    settled = true;
    clearTimeout(timer);
  }
}
