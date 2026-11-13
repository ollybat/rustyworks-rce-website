/* Commands reference: filtering, deep links and copy buttons. No dependencies. */
(function () {
  var bar = document.querySelector('.cmd-bar');
  if (!bar) return;
  var input = document.getElementById('cmdFilter');
  var chips = [].slice.call(bar.querySelectorAll('.cmd-chip'));
  var cards = [].slice.call(document.querySelectorAll('.cmd-card'));
  var count = document.getElementById('cmdCount');
  var empty = document.getElementById('cmdEmpty');
  var filter = '';
  var group = 'all';

  function textOf(card) { return (card.getAttribute('data-search') || card.textContent || '').toLowerCase(); }

  function apply() {
    var shown = 0;
    cards.forEach(function (card) {
      var okGroup = group === 'all' || (card.getAttribute('data-group') || '') === group;
      var okText = !filter || textOf(card).indexOf(filter) > -1;
      var visible = okGroup && okText;
      card.hidden = !visible;
      if (visible) shown += 1;
    });
    if (count) count.textContent = shown + (shown === 1 ? ' command' : ' commands') + ' shown';
    if (empty) empty.hidden = shown !== 0;
  }

  if (input) {
    input.addEventListener('input', function () {
      filter = input.value.trim().toLowerCase();
      apply();
    });
  }
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      group = chip.getAttribute('data-group') || 'all';
      chips.forEach(function (other) { other.setAttribute('aria-pressed', String(other === chip)); });
      apply();
    });
  });

  /* A link like /commands.html#kits opens that command and scrolls to it. */
  function fromHash() {
    var id = (location.hash || '').replace('#', '');
    if (!id) return;
    var card = document.getElementById(id);
    if (!card) return;
    card.hidden = false;
    var details = card.querySelector('details');
    if (details) details.open = true;
    card.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();

  /* Copy buttons copy the command exactly as it is typed in Discord. */
  document.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('.cmd-copy') : null;
    if (!button) return;
    var value = button.getAttribute('data-copy') || '';
    var label = button.getAttribute('data-label') || 'Copy';
    function done(ok) {
      button.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      window.setTimeout(function () { button.textContent = label; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () { done(true); }, function () { done(false); });
    } else {
      done(false);
    }
  });
})();

/* The nav toggle is shared markup; this page brings its own handler. */
(function () {
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (!toggle || !links) return;
  toggle.addEventListener('click', function () {
    var open = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
})();
