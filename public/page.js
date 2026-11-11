/* ==========================================================================
   Small shared behaviour for the secondary pages
   --------------------------------------------------------------------------
   Fills in the footer year and nothing else - these pages are static. One file
   so every page that needs it uses the same few lines.
   ========================================================================== */
(function () {
  "use strict";

  function init() {
    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
