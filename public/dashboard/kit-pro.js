/* Real additions to Kit Studio: keyboard shortcuts that drive the existing buttons,
   a clipboard copy for the generated command, a live fill count, an unsaved-work guard,
   and a shortcuts sheet. It reads the page; it does not invent any item data. */
(function () {
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function toast(message) {
    var old = document.querySelector('.kp-toast');
    if (old) old.remove();
    var node = el('div', 'kp-toast', message);
    document.body.appendChild(node);
    setTimeout(function () { node.remove(); }, 2600);
  }
  function grid() { return document.querySelector('#mainGrid'); }
  var baseline = null;
  function slots() {
    var g = grid();
    if (!g) return [];
    return Array.prototype.slice.call(g.querySelectorAll('[data-slot], .slot, .kb-slot'));
  }
  function snapshot() {
    return slots().map(function (slot) { return slot.innerHTML; });
  }
  /* A slot counts as filled when it either holds an item element or no longer looks the way
     it did on an empty board. That adapts to the page instead of guessing its class names. */
  function filledCount() {
    var all = slots();
    if (!all.length) return null;
    if (!baseline || baseline.length !== all.length) baseline = snapshot();
    var filled = 0;
    all.forEach(function (slot, i) {
      var hasItem = slot.querySelector('img, canvas, [data-item], .item, .filled, .has-item');
      var changed = baseline[i] != null && slot.innerHTML !== baseline[i];
      if (hasItem || changed) filled += 1;
    });
    return { filled: filled, total: all.length };
  }
  function fillLine() {
    var g = grid();
    if (!g || !g.parentNode) return;
    var info = filledCount();
    var line = document.querySelector('.kp-fill');
    if (!line) { line = el('p', 'kp-fill'); g.parentNode.insertBefore(line, g); }
    if (!info || !info.total) { line.textContent = ''; return; }
    line.textContent = info.filled + ' of ' + info.total + ' slots filled' + (info.filled ? '.' : ' \u2014 nothing added yet.');
  }
  function copyButton() {
    var out = document.querySelector('#cmdOutput');
    if (!out || !out.parentNode || document.querySelector('.kp-copy')) return;
    var button = el('button', 'kp-copy', 'Copy command');
    button.type = 'button';
    button.addEventListener('click', function () {
      var text = (out.value != null ? out.value : out.textContent) || '';
      if (!text.trim()) { toast('There is no command to copy yet.'); return; }
      navigator.clipboard.writeText(text).then(function () { toast('Command copied.'); })
        .catch(function () { toast('Copying was blocked by the browser.'); });
    });
    out.parentNode.insertBefore(button, out.nextSibling);
  }
  function sheet() {
    if (document.querySelector('.kp-sheet')) return;
    var wrap = el('div', 'kp-sheet');
    var card = el('div', 'kp-sheet-card');
    card.appendChild(el('h3', null, 'Keyboard shortcuts'));
    var dl = document.createElement('dl');
    [['/', 'jump to item search'], ['Ctrl or Cmd + S', 'save the kit'], ['Ctrl or Cmd + Enter', 'copy the command'], ['?', 'show or hide this sheet'], ['Esc', 'close this sheet']].forEach(function (pair) {
      var dt = document.createElement('dt');
      dt.textContent = pair[0];
      var dd = document.createElement('dd');
      dd.textContent = pair[1];
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    card.appendChild(dl);
    wrap.appendChild(card);
    wrap.addEventListener('click', function (event) { if (event.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
  }
  function dirtyGuard() {
    var g = grid();
    if (!g || !window.MutationObserver) return;
    var dirty = false;
    new MutationObserver(function () { dirty = true; fillLine(); }).observe(g, { childList: true, subtree: true, attributes: true });
    window.addEventListener('beforeunload', function (event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
      return '';
    });
  }
  function keys() {
    document.addEventListener('keydown', function (event) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        var save = document.querySelector('#btnSave');
        if (save) { save.click(); toast('Saving\u2026'); }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        var copy = document.querySelector('.kp-copy');
        if (copy) copy.click();
        return;
      }
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        var search = document.querySelector('#itemSearch');
        if (search) { event.preventDefault(); search.focus(); }
        return;
      }
      if (event.key === '?' && !typing) { event.preventDefault(); sheet(); return; }
      if (event.key === 'Escape') {
        var open = document.querySelector('.kp-sheet');
        if (open) open.remove();
      }
    });
  }
  function start() { fillLine(); copyButton(); dirtyGuard(); keys(); setInterval(fillLine, 1200); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
