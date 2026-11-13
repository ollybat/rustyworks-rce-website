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
  var ANSI = [["30", "#4f545c"], ["31", "#dc4c4c"], ["32", "#3ba55d"], ["33", "#faa81a"], ["34", "#3b88c3"], ["35", "#c14fd6"], ["36", "#2ec4b6"], ["37", "#dcddde"], ["90", "#72767d"], ["91", "#ff7a7a"], ["92", "#57f287"], ["93", "#fee75c"], ["94", "#5dadec"], ["95", "#eb459e"], ["96", "#5ff0e6"], ["97", "#ffffff"]];
  function el(id) { return document.getElementById(id); }
  function rgb(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function nearestAnsi(hex) {
    var want = rgb(hex), best = ANSI[7], bestD = Infinity;
    ANSI.forEach(function (pair) {
      var c = rgb(pair[1]);
      var d = Math.pow(c[0] - want[0], 2) + Math.pow(c[1] - want[1], 2) + Math.pow(c[2] - want[2], 2);
      if (d < bestD) { bestD = d; best = pair; }
    });
    return best[0];
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
    el("ctAnsi").value = FENCE + "ansi" + String.fromCharCode(10) + text + String.fromCharCode(10) + stops.map(function (c) {
      return String.fromCharCode(27) + "[0;" + nearestAnsi(c) + "m" + c + String.fromCharCode(27) + "[0m";
    }).join(" ") + String.fromCharCode(10) + FENCE;
    var mid = stops[Math.floor(stops.length / 2)];
    el("ctEmbed").value = "color: 0x" + mid.replace("#", "").toUpperCase();
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
