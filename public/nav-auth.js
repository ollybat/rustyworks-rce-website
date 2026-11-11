/* Navigation / session helper.
   This build ships without accounts, so RWAuth.ready always resolves to an
   anonymous visitor and sign-in-only links keep pointing at the login page. */
(function () {
  window.RWAuth = {
    ready: Promise.resolve({ authenticated: false, user: null }),
    current: function () { return null; },
    isAuthenticated: function () { return false; }
  };
})();
