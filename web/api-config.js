// AmnaYar frontend API routing with automatic fallback.
// Prefer the custom API domain so users do not depend on Render's onrender.com hostname.
(() => {
  const API_BASES = ['https://api.amnayar.ir', 'https://amnayar-api.onrender.com', ''];
  const RENDER_API = 'https://amnayar-api.onrender.com';
  const CUSTOM_API = 'https://api.amnayar.ir';
  const nativeFetch = window.fetch.bind(window);
  window.AMNA_API_BASE = API_BASES[0];
  window.AMNA_API_BASES = API_BASES.slice();

  async function fetchWithTimeout(url, options={}, ms=7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try { return await nativeFetch(url, {...options, signal: controller.signal}); }
    finally { clearTimeout(timer); }
  }

  function normalizeApiUrl(url) {
    if (typeof url !== 'string') return url;
    if (url.startsWith(RENDER_API + '/api/')) return CUSTOM_API + url.slice(RENDER_API.length);
    return url;
  }

  window.fetch = async function(input, init) {
    let rawUrl = typeof input === 'string'
      ? input
      : (input && input.url ? input.url : '');

    if (typeof rawUrl !== 'string') return nativeFetch(input, init);

    // Redirect hard-coded Render API calls to the custom API domain.
    if (rawUrl.startsWith(RENDER_API + '/api/')) {
      const target = normalizeApiUrl(rawUrl);
      if (typeof input === 'string') return fetchWithTimeout(target, init || {}, 15000);
      return fetchWithTimeout(target, {
        method: input.method,
        headers: input.headers,
        body: input.method === 'GET' || input.method === 'HEAD' ? undefined : await input.clone().text(),
        credentials: init?.credentials || 'include',
        cache: init?.cache || 'no-store'
      }, 15000);
    }

    if (!rawUrl.startsWith('/api/')) return nativeFetch(input, init);

    let lastError = null;
    let lastResponse = null;
    for (const base of API_BASES) {
      const target = base + rawUrl;
      try {
        const response = typeof Request !== 'undefined' && input instanceof Request
          ? await fetchWithTimeout(target, {
              method: input.method,
              headers: input.headers,
              body: input.method === 'GET' || input.method === 'HEAD' ? undefined : await input.clone().text(),
              credentials: init?.credentials || 'include',
              cache: init?.cache || 'no-store'
            }, 7000)
          : await fetchWithTimeout(target, init || {}, 15000);
        lastResponse = response;
        if (response.status < 500 && response.status !== 404) return response;
      } catch (err) {
        lastError = err;
      }
    }
    if (lastResponse) return lastResponse;
    throw lastError || new Error('api_unavailable');
  };

  // The owner login page uses a native HTML form. Rewrite its action to the
  // custom domain before submission so the browser never has to call
  // amnayar-api.onrender.com directly.
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('form[action]').forEach(form => {
      const action = form.getAttribute('action') || '';
      if (action.startsWith(RENDER_API + '/api/')) {
        form.setAttribute('action', normalizeApiUrl(action));
      }
    });
  });
})();