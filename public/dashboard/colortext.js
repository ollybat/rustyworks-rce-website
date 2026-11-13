/* Colour Studio: real gradient building, real copies, and the nearest of the sixteen ANSI
   colours worked out for each stop. Saved palettes live in this browser only. */
(function () {
  var KEY = "spinback-colour-palettes-v1";
  var FENCE = "```";
  var PRESETS = [
    ["Ember", ["#FF9A00", "#FF4900", "#F21F6B"]], ["Ice", ["#00AAFF", "#7FE3FF", "#E6F7FF"]],
    ["Toxic", ["#8AFF00", "#00D26A", "#00FFC2"]], ["Desert", ["#F5D08A", "#D9A05B", "#8C6239"]],
    ["Night", ["#5500FF", "#8A00FF", "#C800CC"]], ["Rust", ["#CE422B", "#8A2B1C", "#FF7200"]],
    ["Mint", ["#00D26A", "#6CC24A", "#B6F09C"]], ["Sunset", ["#FFB347", "#FF6F61", "#9B1B54"]]
  ];
  /* Discord's ansi code blocks understand eight text colours, 30 to 37, drawn from this
     palette. The bright 90-97 codes are not supported there and show as plain text, so they
     are not offered. */
  var ANSI = [["30", "#4f545c"], ["31", "#dc322f"], ["32", "#859900"], ["33", "#b58900"], ["34", "#268bd2"], ["35", "#d33682"], ["36", "#2aa198"], ["37", "#ffffff"]];
  function el(id) { return document.getElementById(id); }
  function rgb(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function nearestAnsi(want) {
    var best = ANSI[7], bestD = Infinity;
    ANSI.forEach(function (pair) {
      var c = rgb(pair[1]);
      var d = Math.pow(c[0] - want[0], 2) + Math.pow(c[1] - want[1], 2) + Math.pow(c[2] - want[2], 2);
      if (d < bestD) { bestD = d; best = pair; }
    });
    return best;
  }
  /* The gradient's colour at t (0 to 1), straight-line between neighbouring stops. */
  function colourAt(t) {
    if (stops.length < 2) return rgb(stops[0]);
    var scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    var i = Math.min(stops.length - 2, Math.floor(scaled));
    var a = rgb(stops[i]), b = rgb(stops[i + 1]), f = scaled - i;
    return [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * f); });
  }
  /* Every letter gets the Discord colour closest to its place on the gradient. A new escape
     code is written only when the colour changes, which keeps the block short. Returns the
     block's text and the runs, so the preview shows exactly what Discord will. */
  function ansiRuns(text) {
    var chars = Array.from(text);
    var visible = chars.filter(function (c) { return c.trim(); }).length;
    var runs = [], seen = 0;
    chars.forEach(function (ch) {
      var pair = null;
      if (ch.trim()) {
        pair = nearestAnsi(colourAt(visible > 1 ? seen / (visible - 1) : 0));
        seen += 1;
      }
      var last = runs[runs.length - 1];
      /* Spaces join the run they sit in, so they never cost an extra code. */
      if (last && (!pair || (last.pair && last.pair[0] === pair[0]))) { last.text += ch; return; }
      runs.push({ pair: pair, text: ch });
    });
    return runs;
  }
  var stops = ["#FF9A00", "#FF4900", "#F21F6B"];

  function renderStops() {
    var host = el("ctStops");
    host.textContent = "";
    stops.forEach(function (colour, i) {
      var row = document.createElement("div");
      row.className = "ct-stop";
      var pick = document.createElement("input");
      pick.type = "color";
      pick.value = colour;
      pick.setAttribute("aria-label", "Colour stop " + (i + 1));
      var type = document.createElement("input");
      type.type = "text";
      type.value = colour;
      type.setAttribute("aria-label", "Colour stop " + (i + 1) + " hex value");
      var drop = document.createElement("button");
      drop.className = "ct-x";
      drop.type = "button";
      drop.textContent = "Remove";
      drop.disabled = stops.length <= 2;
      pick.addEventListener("input", function () { stops[i] = pick.value.toUpperCase(); render(); });
      type.addEventListener("change", function () {
        var v = type.value.trim();
        if (/^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/.test(v)) { stops[i] = (v.charAt(0) === "#" ? v : "#" + v).toUpperCase(); render(); }
        else type.value = stops[i];
      });
      drop.addEventListener("click", function () { if (stops.length > 2) { stops.splice(i, 1); render(); } });
      row.appendChild(pick);
      row.appendChild(type);
      row.appendChild(drop);
      host.appendChild(row);
    });
  }

  function render() {
    renderStops();
    var grad = "linear-gradient(90deg, " + stops.join(", ") + ")";
    var text = (el("ctText").value || "SPINBACK RCE").toUpperCase();
    var preview = el("ctPreview");
    preview.textContent = text;
    preview.style.backgroundImage = grad;
    preview.style.webkitBackgroundClip = "text";
    preview.style.backgroundClip = "text";
    preview.style.color = "transparent";
    var ESC = String.fromCharCode(27), runs = ansiRuns(text), body = "", current = null;
    var shown = el("ctAnsiPreview");
    if (shown) shown.textContent = "";
    runs.forEach(function (run) {
      if (run.pair && run.pair[0] !== current) { body += ESC + "[0;" + run.pair[0] + "m"; current = run.pair[0]; }
      body += run.text;
      if (shown) {
        var span = document.createElement("span");
        span.textContent = run.text;
        if (run.pair) span.style.color = run.pair[1];
        shown.appendChild(span);
      }
    });
    if (current) body += ESC + "[0m";
    el("ctAnsi").value = FENCE + "ansi" + String.fromCharCode(10) + body + String.fromCharCode(10) + FENCE;
    /* The middle stop as the accent, in both shapes people paste it in: a hex literal for
       discord.js and the plain decimal integer the Discord API and webhooks take. */
    var mid = stops[Math.floor(stops.length / 2)].replace("#", "").toUpperCase();
    el("ctEmbed").value = "discord.js: .setColor(0x" + mid + ")" + String.fromCharCode(10) + "API / webhook JSON: \"color\": " + parseInt(mid, 16);
    el("ctCss").value = "background-image: " + grad + ";" + String.fromCharCode(10) + "-webkit-background-clip: text;" + String.fromCharCode(10) + "background-clip: text;" + String.fromCharCode(10) + "color: transparent;";
  }

  function copy(fromId, noteId) {
    var note = el(noteId);
    var text = el(fromId).value;
    if (!navigator.clipboard || !navigator.clipboard.writeText) { note.textContent = "This browser has no clipboard access."; return; }
    navigator.clipboard.writeText(text).then(function () {
      note.textContent = "Copied.";
      setTimeout(function () { note.textContent = ""; }, 2500);
    }).catch(function () { note.textContent = "Copying was blocked by the browser."; });
  }

  function loadAll() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } }
  function renderSaved() {
    var list = el("ctSavedList");
    list.textContent = "";
    var saved = loadAll();
    if (!saved.length) {
      var none = document.createElement("li");
      none.textContent = "Nothing saved in this browser yet.";
      list.appendChild(none);
      return;
    }
    saved.forEach(function (entry, i) {
      var li = document.createElement("li");
      var left = document.createElement("span");
      var swatch = document.createElement("span");
      swatch.className = "ct-swatch";
      swatch.style.backgroundImage = "linear-gradient(90deg, " + entry.stops.join(", ") + ")";
      left.appendChild(swatch);
      left.appendChild(document.createTextNode(" " + entry.name));
      var right = document.createElement("span");
      var use = document.createElement("button");
      use.className = "ct-btn ghost";
      use.type = "button";
      use.textContent = "Load";
      use.addEventListener("click", function () { stops = entry.stops.slice(); render(); el("ctMsg").textContent = "Loaded " + entry.name + "."; });
      var del = document.createElement("button");
      del.className = "ct-btn ghost";
      del.type = "button";
      del.textContent = "Delete";
      del.addEventListener("click", function () {
        var all = loadAll();
        all.splice(i, 1);
        try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { return; }
        renderSaved();
      });
      right.appendChild(use);
      right.appendChild(del);
      li.appendChild(left);
      li.appendChild(right);
      list.appendChild(li);
    });
  }

  function start() {
    if (!el("ctStops")) return;
    PRESETS.forEach(function (pair) {
      var b = document.createElement("button");
      b.className = "ct-preset";
      b.type = "button";
      b.textContent = pair[0];
      b.style.backgroundImage = "linear-gradient(90deg, " + pair[1].join(", ") + ")";
      b.style.color = "#0e0b08";
      b.addEventListener("click", function () { stops = pair[1].slice(); render(); el("ctMsg").textContent = "Preset applied: " + pair[0] + "."; });
      el("ctPresets").appendChild(b);
    });
    el("ctAdd").addEventListener("click", function () {
      if (stops.length >= 8) { el("ctMsg").textContent = "Eight stops is the limit."; return; }
      stops.push(stops[stops.length - 1]); render();
    });
    el("ctReset").addEventListener("click", function () { stops = ["#FF9A00", "#FF4900", "#F21F6B"]; render(); el("ctMsg").textContent = "Reset."; });
    el("ctText").addEventListener("input", render);
    el("ctCopyAnsi").addEventListener("click", function () { copy("ctAnsi", "ctCopyMsg"); });
    el("ctCopyEmbed").addEventListener("click", function () { copy("ctEmbed", "ctCopyMsg"); });
    el("ctCopyCss").addEventListener("click", function () { copy("ctCss", "ctCopyMsg"); });
    el("ctSave").addEventListener("click", function () {
      var name = (el("ctName").value || "").trim().slice(0, 40) || ("Palette " + (loadAll().length + 1));
      var all = loadAll();
      all.push({ name: name, stops: stops.slice() });
      try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { el("ctSaveMsg").textContent = "This browser refused to store it."; return; }
      el("ctName").value = "";
      el("ctSaveMsg").textContent = "Saved " + name + " in this browser.";
      renderSaved();
    });
    render();
    renderSaved();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
