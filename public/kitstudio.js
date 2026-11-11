/* Kit Studio - builds the exact console commands your Rust Console Edition server wants.
  
   The command syntax comes from the official RCE community-server documentation
   (feature guide: Kit Management):
  
       kit add "Kit name" "item" amount condition Container
   
   with the five options being kit name, item, amount, condition (0-1) and container
   (Main, Belt or Wear). Everything here is client side: no account, no server, and the
   item catalogue is a plain JSON file the site serves at /data/items.json. */
(function () {
  "use strict";

  var CATALOGUE = "/data/items.json";
  var DOCS = "https://rust-console-edition.gitbook.io/community-servers/feature-guides/kit-management";
  var STORE_KEY = "rw-kitstudio-v1";
  var BELT_SLOTS = 6;
  var PAGE = 60;

  /* One small drawing per group, so every item shows something recognisable without
     reusing anything from the game. */
  var ICONS = {
    "Weapons": "M4 14h9l3-3h2v5h-2l-2 3H9l-1 2H5v-4l2-1h-3z",
    "Tools": "M6 18l7-7M14 5l5 5-3 1-3 3-1-6z",
    "Ammo": "M8 5h3v10H8zM14 7h3v8h-3zM7 17h11",
    "Resources": "M4 18h7v-6H4zM12 18h8v-4h-8zM6 12l3-7 3 7",
    "Components": "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21",
    "Building": "M4 9l4-3 4 3v10H4zM12 19h8V9l-4-3-4 3",
    "Doors & locks": "M6 4h10v16H6zM13 12h.01M10 12h.01M17 11v3",
    "Deployables": "M4 10l8-5 8 5v9H4zM9 19v-5h6v5",
    "Medical": "M12 6v12M6 12h12",
    "Food & water": "M12 4c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z",
    "Clothing & armour": "M12 4l6 2.5V13c0 4-4 6-6 7-2-1-6-3-6-7V6.5z",
    "Explosives": "M11 4h2v4h-2zM8 8h8v4a4 4 0 0 1-8 0zM10 20h4",
    "Electrical": "M13 3L6 14h5l-1 7 7-11h-5z",
    "Decor & fun": "M12 4l2.2 4.8 5.3.6-3.9 3.6 1 5.2L12 15.8 7.4 18.2l1-5.2L4.5 9.4l5.3-.6z",
    "Other": "M12 3l8 4.5v9L12 21l-8-4.5v-9z"
  };

  var PRESETS = {
    "Starter": [["wood", 1000, "Main"], ["stones", 500, "Main"], ["torch", 1, "Belt"], ["rock", 1, "Belt"], ["hammer", 1, "Belt"], ["building.planner", 1, "Belt"], ["bandage", 5, "Main"]],
    "Roofcamp": [["rifle.bolt", 1, "Belt"], ["ammo.rifle", 120, "Main"], ["largemedkit", 2, "Main"], ["sleepingbag", 1, "Main"], ["water", 10, "Main"], ["metal.facemask", 1, "Wear"], ["hoodie", 1, "Wear"]],
    "Medic": [["bandage", 25, "Main"], ["largemedkit", 3, "Main"], ["syringe.medical", 5, "Main"], ["pills.painkillers", 5, "Main"], ["water", 10, "Main"], ["roadsign.jacket", 1, "Wear"]],
    "Raider": [["explosive.timed", 4, "Belt"], ["ammo.rocket.basic", 4, "Main"], ["ammo.rifle", 120, "Main"], ["metal.facemask", 1, "Wear"], ["metal.plate.torso", 1, "Wear"], ["hoodie", 1, "Wear"], ["bandage", 10, "Main"]],
    "Farmer": [["hatchet", 1, "Belt"], ["pickaxe", 1, "Belt"], ["torch", 1, "Belt"], ["wood", 500, "Main"], ["corn", 10, "Main"], ["water", 10, "Main"]]
  };

  var state = { items: [], groups: [], group: "All", query: "", shown: PAGE, lines: [], name: "starter" };

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function icon(group) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (ICONS[group] || ICONS.Other) + '"/></svg>'; }
  function byShort(short) { for (var i = 0; i < state.items.length; i++) if (state.items[i].short === short) return state.items[i]; return null; }
  function shortOf(line) { return line.short || line.name; }
  function quote(s) { return '"' + String(s).replace(/"/g, "") + '"'; }

  function note(msg, bad) {
    var n = el("ksNote");
    if (!n) return;
    n.textContent = msg || "";
    n.style.color = bad ? "#ff9a9a" : "#ffcf7a";
    if (msg) window.clearTimeout(note._t), note._t = window.setTimeout(function () { n.textContent = ""; }, 6000);
  }

  function copyText(text, label) {
    function done(ok, how) {
      if (ok) note(label + " copied" + (how ? " (" + how + ")" : "") + ".");
      else note("Your browser blocked the clipboard - the text is selected, press Ctrl/Cmd + C.", true);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallback(text)); });
      return;
    }
    done(fallback(text));
  }
  function fallback(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy"); document.body.removeChild(ta); return ok;
    } catch (e) { return false; }
  }

  function search() {
    var q = state.query.trim().toLowerCase();
    return state.items.filter(function (it) {
      if (state.group !== "All" && it.group !== state.group) return false;
      if (!q) return true;
      return (it.name || "").toLowerCase().indexOf(q) > -1 || (it.short || "").toLowerCase().indexOf(q) > -1;
    });
  }

  function renderGroups() {
    var box = el("ksGroups");
    if (!box) return;
    var names = ["All"].concat(state.groups);
    box.innerHTML = names.map(function (g) {
      var n = g === "All" ? state.items.length : state.items.filter(function (i) { return i.group === g; }).length;
      return '<button type="button" class="ks-chip" data-group="' + esc(g) + '" aria-pressed="' + (state.group === g) + '">' + esc(g) + " (" + n + ")</button>";
    }).join("");
  }

  function renderResults() {
    var box = el("ksResults");
    if (!box) return;
    var rows = search();
    var slice = rows.slice(0, state.shown);
    box.innerHTML = slice.map(function (it) {
      var inKit = state.lines.some(function (l) { return shortOf(l) === it.short; });
      return '<button type="button" class="ks-card" data-short="' + esc(it.short) + '"' + (inKit ? " disabled" : "") + ">" +
        '<span class="ks-ico">' + icon(it.group) + "</span>" +
        "<span><b>" + esc(it.name) + "</b><small>" + esc(it.short) + (it.stack ? " &middot; stack " + it.stack : "") + (it.src === "core" ? " &middot; ours" : "") + "</small></span>" +
        "</button>";
    }).join("");
    el("ksCount").textContent = rows.length + (rows.length === 1 ? " item" : " items");
    var more = el("ksMore");
    more.hidden = rows.length <= state.shown;
    if (!rows.length) box.innerHTML = '<p class="ks-empty">Nothing matches that. Try fewer letters, or <button type="button" class="ks-link" data-manual="1">add it by name</button>.</p>';
  }
  function commandsText() {
    var name = (state.name || "kit").trim() || "kit";
    return state.lines.map(function (l) {
      return "kit add " + quote(name) + " " + quote(l.short || l.name) + " " + (l.amount || 1) + " " + (l.condition == null ? 1 : l.condition) + " " + (l.container || "Main");
    }).join("\n");
  }

  function warnings() {
    var out = [];
    var belt = state.lines.filter(function (l) { return (l.container || "Main") === "Belt"; });
    if (belt.length > BELT_SLOTS) out.push(belt.length + " items on the belt, but a hotbar only holds " + BELT_SLOTS + " - the rest will not be reachable.");
    state.lines.forEach(function (l) {
      var it = byShort(l.short);
      if (it && it.stack && l.amount > it.stack) out.push(it.name + " stacks to " + it.stack + ", so an amount of " + l.amount + " will be trimmed by the server.");
    });
    return out;
  }

  function renderKit() {
    var list = el("ksLines");
    var empty = el("ksEmpty");
    list.innerHTML = state.lines.map(function (l, i) {
      var it = byShort(l.short);
      var stackBad = it && it.stack && l.amount > it.stack;
      return '<li class="ks-line">' +
        '<span><b>' + esc(l.name) + "</b>" + (l.src === "core" ? ' <span class="ks-flag">ours</span>' : "") + (stackBad ? ' <span class="ks-flag stack">over stack</span>' : "") +
        '<span class="ks-sub">' + esc(l.short || "") + (it && it.stack ? " &middot; stack " + it.stack : "") + "</span></span>" +
        '<span class="ks-row">' +
        '<input type="number" min="1" step="1" value="' + (l.amount || 1) + '" data-i="' + i + '" data-f="amount" aria-label="Amount for ' + esc(l.name) + '">' +
        '<input type="number" min="0" max="1" step="0.1" value="' + (l.condition == null ? 1 : l.condition) + '" data-i="' + i + '" data-f="condition" aria-label="Condition for ' + esc(l.name) + '">' +
        '<select data-i="' + i + '" data-f="container" aria-label="Container for ' + esc(l.name) + '">' +
        ["Main", "Belt", "Wear"].map(function (c) { return '<option' + ((l.container || "Main") === c ? " selected" : "") + ">" + c + "</option>"; }).join("") +
        "</select>" +
        '<button type="button" class="ks-x" data-remove="' + i + '" aria-label="Remove ' + esc(l.name) + '">&times;</button>' +
        "</span></li>";
    }).join("");
    empty.hidden = state.lines.length > 0;
    el("ksLinesCount").textContent = state.lines.length + (state.lines.length === 1 ? " line" : " lines");
    var text = commandsText();
    el("ksCommands").textContent = text || "# Add items on the left and the commands appear here.";
    var warn = warnings();
    var warnNote = el("ksWarn");
    warnNote.hidden = !warn.length;
    warnNote.textContent = warn.join(" ");
    var coreCount = state.lines.filter(function (l) { return l.src === "core"; }).length;
    el("ksProvenance").textContent = coreCount ? coreCount + " of these names came from our own additions - check them on your server before you ship the kit." : "";
    save();
  }

  function addItem(short, amount, container) {
    var it = byShort(short);
    if (!it) { note("That item is not in the catalogue - use Add by name.", true); return; }
    state.lines.push({ name: it.name, short: it.short, amount: amount || 1, condition: 1, container: container || "Main", src: it.src });
    renderResults(); renderKit();
    note("Added " + it.name + " to the kit.");
  }

  function applyPreset(key) {
    var rows = PRESETS[key];
    if (!rows) return;
    var missing = [], lines = [];
    rows.forEach(function (r) {
      var it = byShort(r[0]);
      if (!it) { missing.push(r[0]); return; }
      lines.push({ name: it.name, short: it.short, amount: r[1], condition: 1, container: r[2], src: it.src });
    });
    state.lines = lines;
    if (key.toLowerCase() === "starter" || !state.name || state.name === "starter") state.name = key.toLowerCase();
    el("ksKitName").value = state.name;
    renderResults(); renderKit();
    note("Loaded the " + key + " starting point" + (missing.length ? " (" + missing.length + " item(s) were not in the catalogue and were skipped)" : "") + ".");
  }

  function manualAdd() {
    var name = window.prompt("Item name as it should appear in the command (for example rifle.ak or Assault Rifle):");
    if (!name) return;
    state.lines.push({ name: name.trim(), short: name.trim(), amount: 1, condition: 1, container: "Main", src: "manual" });
    renderResults(); renderKit();
    note("Added " + name.trim() + " by hand - no stack size is known for it.");
  }

  function save() {
    try {
      var s = { name: state.name, lines: state.lines };
      if (state.lines.length) localStorage.setItem(STORE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORE_KEY);
    } catch (e) {}
  }
  function restore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && s.lines && s.lines.length) { state.lines = s.lines; state.name = s.name || "starter"; el("ksKitName").value = state.name; note("Restored the kit you were working on."); }
    } catch (e) {}
  }

  function download() {
    var name = (state.name || "kit").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    var head = "# " + (state.name || "kit") + " - Rust Console Edition kit commands\n# Generated by Spinback RCE Kit Studio\n# Syntax: " + DOCS + "\n\n";
    var blob = new Blob([head + commandsText() + "\n"], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "kit-" + name + ".txt";
    document.body.appendChild(a); a.click(); a.remove();
    note("Saved kit-" + name + ".txt");
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify({ name: state.name, lines: state.lines }, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "kit-" + (state.name || "kit").replace(/[^a-z0-9-]/gi, "-").toLowerCase() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    note("Saved the kit as JSON.");
  }

  function importJson(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var s = JSON.parse(String(fr.result));
        if (!s || !s.lines) throw new Error("no lines");
        state.lines = s.lines.map(function (l) { return { name: l.name, short: l.short || l.name, amount: l.amount || 1, condition: l.condition == null ? 1 : l.condition, container: l.container || "Main", src: l.src || "manual" }; });
        state.name = s.name || state.name;
        el("ksKitName").value = state.name;
        renderResults(); renderKit();
        note("Loaded " + state.lines.length + " line(s) from that file.");
      } catch (e) { note("That file is not a kit export.", true); }
    };
    fr.readAsText(file);
  }

  function wire() {
    el("ksSearch").addEventListener("input", function () { state.query = this.value; state.shown = PAGE; renderResults(); });
    el("ksGroups").addEventListener("click", function (e) {
      var b = e.target.closest("[data-group]");
      if (!b) return;
      state.group = b.getAttribute("data-group"); state.shown = PAGE; renderGroups(); renderResults();
    });
    el("ksResults").addEventListener("click", function (e) {
      if (e.target.closest("[data-manual]")) { manualAdd(); return; }
      var card = e.target.closest("[data-short]");
      if (!card) return;
      addItem(card.getAttribute("data-short"), 1, "Main");
    });
    el("ksMore").addEventListener("click", function () { state.shown += PAGE; renderResults(); });
    el("ksAddManual").addEventListener("click", manualAdd);
    el("ksLines").addEventListener("change", function (e) {
      var i = parseInt(e.target.getAttribute("data-i"), 10);
      var f = e.target.getAttribute("data-f");
      if (isNaN(i) || !f || !state.lines[i]) return;
      var v = e.target.value;
      if (f === "amount") state.lines[i].amount = Math.max(1, parseInt(v, 10) || 1);
      else if (f === "condition") state.lines[i].condition = Math.min(1, Math.max(0, parseFloat(v) || 0));
      else state.lines[i].container = v;
      renderKit();
    });
    el("ksLines").addEventListener("click", function (e) {
      var b = e.target.closest("[data-remove]");
      if (!b) return;
      state.lines.splice(parseInt(b.getAttribute("data-remove"), 10), 1);
      renderResults(); renderKit();
    });
    el("ksKitName").addEventListener("input", function () { state.name = this.value; renderKit(); });
    el("ksPresets").addEventListener("click", function (e) { var b = e.target.closest("[data-preset]"); if (b) applyPreset(b.getAttribute("data-preset")); });
    el("ksCopy").addEventListener("click", function () { if (!state.lines.length) { note("Add an item first.", true); return; } copyText(commandsText(), state.lines.length + " command line(s)"); });
    el("ksCopyInfo").addEventListener("click", function () {
      var t = "kit info " + quote(state.name || "kit") + "\nkit list";
      copyText(t, "kit info and kit list");
    });
    el("ksDownload").addEventListener("click", download);
    el("ksExport").addEventListener("click", exportJson);
    el("ksImport").addEventListener("change", function () { if (this.files && this.files[0]) importJson(this.files[0]); this.value = ""; });
    el("ksClear").addEventListener("click", function () { state.lines = []; renderResults(); renderKit(); note("Kit cleared."); });
    document.addEventListener("keydown", function (e) {
      var typing = /^(INPUT|SELECT|TEXTAREA)$/.test((e.target.tagName || "").toUpperCase());
      if (e.key === "/" && !typing) { e.preventDefault(); el("ksSearch").focus(); }
      else if (e.key === "Escape" && typing) { e.target.blur(); }
      else if ((e.key === "c" || e.key === "C") && !typing && !e.metaKey && !e.ctrlKey) { if (state.lines.length) copyText(commandsText(), state.lines.length + " command line(s)"); }
    });
  }

  function init() {
    el("ksPresets").innerHTML = '<span>Start from:</span>' + Object.keys(PRESETS).map(function (k) { return '<button type="button" class="ks-preset" data-preset="' + esc(k) + '">' + esc(k) + "</button>"; }).join("");
    wire();
    fetch(CATALOGUE, { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (data) {
      state.items = (data.items || []).slice();
      state.groups = data.groups || [];
      renderGroups(); renderResults(); renderKit(); restore(); renderKit();
    }).catch(function () {
      el("ksResults").innerHTML = '<p class="ks-empty">The item catalogue could not be loaded. Check your connection, then reload - you can still add items by name.</p>';
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();