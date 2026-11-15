/* ==========================================================================
   Small shared behaviour for the secondary pages
   --------------------------------------------------------------------------
   Fills in the footer year and nothing else - these pages are static. One file
   so every page that needs it uses the same few lines.
   ========================================================================== */
(function () {
  "use strict";

  /* The privacy page belongs at the end of every page, and this script already runs on
     all of them, so the link is added here rather than edited into ten files. It is
     skipped on the privacy page itself, and never added twice. */
  function addPrivacyLink() {
    var foot = document.querySelector("footer");
    if (!foot || foot.querySelector('a[href$="privacy.html"]')) return;
    var holder = foot.querySelector(".foot-bottom") || foot.querySelector(".wrap") || foot;
    var line = document.createElement("p");
    line.className = "foot-fine foot-privacy";
    var link = document.createElement("a");
    link.href = "/privacy.html";
    link.textContent = "Privacy and what we store";
    line.appendChild(link);
    holder.appendChild(line);
  }

  function addManifestLink() {
    if (document.querySelector('link[rel="manifest"]')) return;
    var link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest.webmanifest";
    document.head.appendChild(link);
  }

  /* The studio pages run their own top bar instead of the site header, and the Colour
     Studio has no link home at all, so this adds one when a page is missing any way
     back. It stays out of the way on pages that already link to the site. */
  function addStudioHomeLink() {
    if (location.pathname.indexOf("/dashboard/") !== 0) return;
    if (document.querySelector('a[href="../index.html"], a[href="/index.html"], a[href="index.html"]')) return;
    var foot = document.querySelector("footer") || document.body;
    var line = document.createElement("p");
    line.className = "foot-fine foot-studio-home";
    var link = document.createElement("a");
    link.href = "/index.html";
    link.textContent = "Back to the Spinback RCE website";
    line.appendChild(link);
    foot.appendChild(line);
  }

  function init() {
    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());
    addPrivacyLink();
    addManifestLink();
    addStudioHomeLink();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
