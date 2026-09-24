// AmnaYar frontend API routing with automatic fallback.
// Prefer the custom API domain so users do not depend on Render's onrender.com hostname.
(() => {
  const API_BASES = ['', 'https://api.amnayar.ir', 'https://amnayar-api.onrender.com'];
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

    // Privacy-conscious first-party analytics. We store only a short-lived
    // session id in sessionStorage; the server hashes IP + user-agent.
    try {
      const path = location.pathname || '/';
      if (!path.startsWith('/admin-panel') && !path.startsWith('/owner')) {
        let sid = sessionStorage.getItem('amna_analytics_session');
        if (!sid) {
          sid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
          sessionStorage.setItem('amna_analytics_session', sid);
        }
        const send = (event_type, meta={}) => {
          const payload = JSON.stringify({event_type,path,session_id:sid,meta});
          nativeFetch(CUSTOM_API + '/api/analytics/event', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:payload,
            keepalive:true,
            mode:'cors'
          }).catch(()=>{});
        };
        send('page_view', {referrer: document.referrer || ''});
        if (path.includes('/tools')) {
          document.addEventListener('click', ev => {
            const button = ev.target.closest?.('button');
            const panel = ev.target.closest?.('.tool-panel');
            if (!button || !panel || !panel.id) return;
            const label = String(button.textContent || '').trim();
            send('tool_use', {tool:panel.id,name:label});
          }, {passive:true});
        }
      }
    } catch {}
  });
})();