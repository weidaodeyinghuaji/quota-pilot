export function createRefreshCoordinator(refresh) {
  let running = false;
  let pending = false;
  let disposed = false;
  let current = Promise.resolve();

  function trigger() {
    if (disposed) return current;
    if (running) {
      pending = true;
      return current;
    }

    running = true;
    current = (async () => {
      try {
        do {
          pending = false;
          try {
            await refresh();
          } catch {}
        } while (pending && !disposed);
      } finally {
        running = false;
      }
    })();
    return current;
  }

  return {
    trigger,
    dispose() {
      disposed = true;
      pending = false;
    }
  };
}
