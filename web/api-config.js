// AmnaYar frontend API routing with automatic fallback.
// The public site is hosted on amnayar.ir and the backend API is on Render.
(() => {
  const API_BASES = ['https://api.amnayar.ir', 'https://amnayar-api.onrender.com'];
  const nativeFetch = window.fetch.bind(window);
  window.AMNA_API_BASE = API_BASES[0];
  window.AMNA_API_BASES = API_BASES.slice();

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
          ? await nativeFetch(new Request(target, input), init)
          : await nativeFetch(target, init);
        lastResponse = response;
        // If the host responds normally, use it. If it is a 5xx gateway/server
        // error, try the next API host before giving up.
        if (response.status < 500) return response;
      } catch (err) {
        lastError = err;
      }
    }
    if (lastResponse) return lastResponse;
    throw lastError || new Error('api_unavailable');
  };
})();