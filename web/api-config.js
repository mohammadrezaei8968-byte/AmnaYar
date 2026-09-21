// AmnaYar frontend API routing with automatic fallback.
// The public site is hosted on amnayar.ir and the backend API is on Render.
(() => {
  const API_BASES = ['https://amnayar-api.onrender.com', 'https://api.amnayar.ir', ''];
  const nativeFetch = window.fetch.bind(window);
  window.AMNA_API_BASE = API_BASES[0];
  window.AMNA_API_BASES = API_BASES.slice();

  async function fetchWithTimeout(url, options={}, ms=7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try { return await nativeFetch(url, {...options, signal: controller.signal}); }
    finally { clearTimeout(timer); }
  }

  window.fetch = async function(input, init) {
    const rawUrl = typeof input === 'string'
      ? input
      : (input && input.url ? input.url : '');

    if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/api/')) {
      return nativeFetch(input, init);
    }

    let lastError = null;
    let lastResponse = null;
    for (const base of API_BASES) {
      const target = base + rawUrl;
      try {
        const response = typeof Request !== 'undefined' && input instanceof Request
          ? await fetchWithTimeout(target, {method: input.method, headers: input.headers, body: input.method === 'GET' || input.method === 'HEAD' ? undefined : await input.clone().text(), credentials: init?.credentials || 'include', cache: init?.cache || 'no-store'}, 7000)
          : await fetchWithTimeout(target, init || {}, 15000);
        lastResponse = response;
        if (response.status < 500) return response;
      } catch (err) {
        lastError = err;
      }
    }
    if (lastResponse) return lastResponse;
    throw lastError || new Error('api_unavailable');
  };
})();