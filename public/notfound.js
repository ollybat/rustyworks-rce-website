/* ==========================================================================
   Not-found page
   --------------------------------------------------------------------------
   Two small courtesies: fill in the year like every other page, and name the
   path that missed so a mistyped link is obvious. The path is written with
   textContent, never injected as markup.
   ========================================================================== */
(function () {
  "use strict";

  function init() {
    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());

    var hint = document.getElementById("notFoundHint");
    var path = window.location.pathname;
    if (!hint || !path || path === "/") return;

    var shown = path.length > 80 ? path.slice(0, 77) + "..." : path;
    hint.textContent = "Nothing is served at " + shown + ". The link may be old, or the page may have moved.";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
