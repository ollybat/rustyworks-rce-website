/* Small client-side helper for talking to the bot API.
   Inert while window.RW_API is blank (see config.js). */
(function () {
  function base() {
    return (window.RW_API || '').replace(/\/+$/, '');
  }

  window.RWApi = {
    configured: function () { return !!base(); },
    url: function (path) {
      var p = String(path || '');
      if (!p.startsWith('/')) p = '/' + p;
      return base() + p;
    },
    /* GETs JSON from the API; rejects with the HTTP status on failure. */
    get: function (path, options) {
      if (!base()) return Promise.reject(new Error('RW_API is not configured'));
      var opts = Object.assign({ headers: { accept: 'application/json' } }, options || {});
      return fetch(window.RWApi.url(path), opts).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
    }
  };
})();
