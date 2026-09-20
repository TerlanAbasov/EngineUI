import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Calls `fetcher` now and then every `intervalMs` (0 = once) until unmounted, refetching at once when `deps`
 * change. A failed poll keeps the last good data and reports the error; the next poll clears it. A slow response
 * from before a dependency change never overwrites a newer one.
 */
export function usePolling(fetcher, intervalMs, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    setState((s) => ({ ...s, loading: true }));
    const run = async () => {
      try {
        const data = await fetcherRef.current();
        if (!cancelled) setState({ data, error: null, loading: false });
      } catch (e) {
        if (!cancelled) setState((s) => ({ data: s.data, error: e.message, loading: false }));
      }
      if (!cancelled && intervalMs > 0) timer = setTimeout(run, intervalMs);
    };
    run();
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
