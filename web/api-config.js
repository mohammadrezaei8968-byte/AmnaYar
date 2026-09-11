// AmnaYar frontend API routing hotfix
// The public site is hosted on amnayar.ir while the backend API is on api.amnayar.ir.
(() => {
  const API_BASE = 'https://api.amnayar.ir';
  const nativeFetch = window.fetch.bind(window);
  window.AMNA_API_BASE = API_BASE;
  window.fetch = function(input, init) {
    const rawUrl = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    if (typeof rawUrl === 'string' && rawUrl.startsWith('/api/')) {
      const target = API_BASE + rawUrl;
      const opts = Object.assign({}, init || {}, { credentials: 'include' });
      if (typeof Request !== 'undefined' && input instanceof Request) {
        return nativeFetch(new Request(target, input), opts);
      }
      return nativeFetch(target, opts);
    }
    return nativeFetch(input, init);
  };
})();
