/* Commands reference.
   The whole page is drawn from data/commands.json, so the cards, the statistics and the
   permission matrix can never disagree with each other. Nothing about a command is invented
   here: if a field is missing from the data, the page says "not stated" rather than filling
   the gap with a guess. */
(function () {
  'use strict';

  var DATA = null;
  var state = { group: 'all', term: '', open: {} };

  function $(id) { return document.getElementById(id); }
  function mk(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function clear(node) { if (node) while (node.firstChild) node.removeChild(node.firstChild); }
  function lower(value) { return String(value === undefined || value === null ? '' : value).toLowerCase(); }

  function toast(message) {
    var box = $('cmdToasts');
    if (!box) return;
    var node = mk('div', 'cmd-toast', message);
    box.appendChild(node);
    window.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 3600);
  }

  function copy(text, note) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(note || 'Copied.'); },
        function () { toast('This browser refused clipboard access.'); });
      return;
    }
    toast('This browser has no clipboard access.');
  }

  /* an example that uses placeholders and real choice names, never made-up values */
  function exampleFor(command, sub) {
    var parts = ['/' + command.name];
    if (sub) parts.push(sub.name);
    (sub && sub.options ? sub.options : []).forEach(function (option) {
      var value;
      if (option.choices && option.choices.length) value = option.choices[0];
      else if (option.type === 'user') value = '<@user>';
      else if (option.type === 'channel') value = '<#channel>';
      else value = '<' + option.name + '>';
      parts.push(option.name + ': ' + value);
    });
    return parts.join(' ');
  }
  function optionTypeLabel(type) {
    var labels = { text: 'text', user: 'Discord user', channel: 'channel', choice: 'pick one', number: 'number' };
    return labels[type] || type || 'text';
  }
  function typeLabelFor(command) { return command.needsSetup ? 'needs setup done' : 'works before setup'; }

  function matchesTerm(command, sub, term) {
    if (!term) return true;
    var haystack = [command.name, command.summary, command.who, command.panel, command.why].join(' ');
    if (sub) {
      haystack += ' ' + sub.name + ' ' + sub.summary + ' ' + (sub.notes || []).join(' ');
      (sub.options || []).forEach(function (option) {
        haystack += ' ' + option.name + ' ' + option.description + ' ' + (option.choices || []).join(' ');
      });
    }
    return lower(haystack).indexOf(term) > -1;
  }
  function subMatches(command, sub, term) {
    if (!term) return true;
    if (matchesTerm(command, null, term)) return true;
    return matchesTerm(command, sub, term);
  }

  /* ------------------------------------------------------------------ render */
  function renderStats() {
    var commands = DATA.commands;
    var subs = 0, options = 0, staff = 0, setup = 0;
    commands.forEach(function (command) {
      subs += command.subcommands.length;
      if (command.needsSetup) setup += 1;
      if (lower(command.who).indexOf('anyone') === -1) staff += 1;
      command.subcommands.forEach(function (sub) { options += (sub.options || []).length; });
    });
    if ($('statCommands')) $('statCommands').textContent = String(commands.length);
    if ($('statSubs')) $('statSubs').textContent = String(subs);
    /* No command takes a typed option any more: every one opens a panel, a picker or a box.
       That is worth saying plainly rather than printing a zero. */
    var optionsStat = $('statOptions') ? $('statOptions').parentNode : null;
    if (optionsStat && options === 0) optionsStat.innerHTML = '<strong>none</strong> nothing to type';
    else if ($('statOptions')) $('statOptions').textContent = String(options);
    if ($('statStaff')) $('statStaff').textContent = String(staff);
    if ($('statSetup')) $('statSetup').textContent = String(setup);
  }

  function renderChips() {
    var box = $('cmdChips');
    if (!box) return;
    clear(box);
    DATA.groups.forEach(function (group) {
      var count = group.key === 'all'
        ? DATA.commands.length
        : DATA.commands.filter(function (c) { return c.group === group.key; }).length;
      var button = mk('button', 'cmd-chip' + (state.group === group.key ? ' is-active' : ''));
      button.type = 'button';
      button.setAttribute('aria-pressed', state.group === group.key ? 'true' : 'false');
      button.appendChild(mk('span', null, group.label));
      button.appendChild(mk('em', null, String(count)));
      button.addEventListener('click', function () {
        state.group = group.key;
        renderChips();
        renderList();
      });
      box.appendChild(button);
    });
  }

  function renderList() {
    var box = $('cmdList');
    if (!box) return;
    var term = state.term;
    clear(box);
    var shownCommands = 0, shownSubs = 0, totalSubs = 0;
    DATA.commands.forEach(function (command) {
      var inGroup = state.group === 'all' || command.group === state.group;
      if (!inGroup) return;
      var commandMatches = matchesTerm(command, null, term);
      var subs = command.subcommands.filter(function (sub) { return subMatches(command, sub, term); });
      if (term && !commandMatches && !subs.length) return;
      shownCommands += 1;
      totalSubs += command.subcommands.length;
      shownSubs += commandMatches && term ? command.subcommands.length : subs.length;

      var card = mk('article', 'cmd-card');
      card.id = 'cmd-' + command.name;

      var head = mk('header', 'cmd-card__head');
      var titleRow = mk('div', 'cmd-card__title');
      var heading = mk('h2', null, '/' + command.name);
      var anchor = mk('a', 'cmd-anchor', '#');
      anchor.href = '#' + command.name;
      anchor.setAttribute('aria-label', 'Link to /' + command.name);
      titleRow.appendChild(heading);
      titleRow.appendChild(anchor);
      head.appendChild(titleRow);
      card.appendChild(head);
      card.appendChild(mk('p', 'cmd-card__summary', command.summary || 'No description stated.'));

      var badges = mk('div', 'cmd-badges');
      badges.appendChild(mk('span', 'cmd-badge' + (lower(command.who).indexOf('anyone') > -1 ? ' is-open' : ' is-staff'), command.who || 'not stated'));
      badges.appendChild(mk('span', 'cmd-badge' + (command.needsSetup ? ' is-warn' : ' is-open'), typeLabelFor(command)));
      badges.appendChild(mk('span', 'cmd-badge' + (command.readOnly ? ' is-open' : ''), command.readOnly ? 'read-only' : 'changes settings'));
      badges.appendChild(mk('span', 'cmd-badge', command.subcommands.length + ' subcommand' + (command.subcommands.length === 1 ? '' : 's')));
      card.appendChild(badges);

      var facts = mk('dl', 'cmd-facts');
      facts.appendChild(mk('dt', null, 'Needs first'));
      facts.appendChild(mk('dd', null, command.why || 'not stated'));
      facts.appendChild(mk('dt', null, 'What it opens'));
      facts.appendChild(mk('dd', null, command.panel || 'not stated'));
      card.appendChild(facts);

      var example = mk('div', 'cmd-example');
      var codeLine = mk('code', null, exampleFor(command, null));
      example.appendChild(codeLine);
      var copyBtn = mk('button', 'cmd-btn is-small', 'Copy');
      copyBtn.type = 'button';
      copyBtn.addEventListener('click', function () { copy(exampleFor(command, null), 'Copied ' + exampleFor(command, null)); });
      example.appendChild(copyBtn);
      card.appendChild(example);

      if (!command.subcommands.length) {
        card.appendChild(mk('p', 'cmd-note', 'No subcommands: run it on its own, exactly as shown above.'));
      } else {
        var list = mk('div', 'cmd-subs');
        var visibleSubs = commandMatches && term ? command.subcommands : subs;
        visibleSubs.forEach(function (sub) {
          var row = document.createElement('details');
          row.className = 'cmd-sub';
          row.id = 'sub-' + command.name + '-' + sub.name;
          if (state.open[row.id] || (term && !commandMatches)) row.open = true;
          var summaryLine = mk('summary', 'cmd-sub__summary');
          summaryLine.appendChild(mk('code', 'cmd-sub__usage', '/' + command.name + ' ' + sub.name));
          summaryLine.appendChild(mk('span', 'cmd-sub__one', sub.summary || 'No description stated.'));
          row.appendChild(summaryLine);
          row.addEventListener('toggle', function () { state.open[row.id] = row.open; });

          var body = mk('div', 'cmd-sub__body');
          var exam = mk('div', 'cmd-example');
          exam.appendChild(mk('code', null, exampleFor(command, sub)));
          var subCopy = mk('button', 'cmd-btn is-small', 'Copy');
          subCopy.type = 'button';
          subCopy.addEventListener('click', function () { copy(exampleFor(command, sub), 'Copied ' + exampleFor(command, sub)); });
          exam.appendChild(subCopy);
          body.appendChild(exam);

          if (sub.options && sub.options.length) {
            var table = mk('table', 'cmd-options');
            var thead = mk('thead');
            var hrow = mk('tr');
            ['Option', 'Type', 'Required', 'What it does'].forEach(function (label) { hrow.appendChild(mk('th', null, label)); });
            thead.appendChild(hrow);
            table.appendChild(thead);
            var tbody = mk('tbody');
            sub.options.forEach(function (option) {
              var trow = mk('tr');
              trow.appendChild(mk('td', null, option.name));
              trow.appendChild(mk('td', null, optionTypeLabel(option.type)));
              trow.appendChild(mk('td', null, option.required ? 'yes' : 'optional'));
              var cell = mk('td');
              cell.appendChild(mk('span', null, option.description || 'not stated'));
              if (option.choices && option.choices.length) {
                cell.appendChild(mk('span', 'cmd-choices', 'Choices: ' + option.choices.join(', ')));
              }
              trow.appendChild(cell);
              tbody.appendChild(trow);
            });
            table.appendChild(tbody);
            body.appendChild(table);
          } else {
            body.appendChild(mk('p', 'cmd-note', 'Takes no options.'));
          }
          (sub.notes || []).forEach(function (note) {
            body.appendChild(mk('p', 'cmd-note', note));
          });
          if (sub.link) {
            var linkLine = mk('p', 'cmd-note');
            var a = mk('a', null, 'Open it on this site');
            a.href = sub.link;
            linkLine.appendChild(a);
            body.appendChild(linkLine);
          }
          row.appendChild(body);
          list.appendChild(row);
        });
        card.appendChild(list);
      }
      box.appendChild(card);
    });

    if (!shownCommands) {
      var empty = mk('div', 'cmd-empty');
      empty.appendChild(mk('p', null, 'Nothing matches "' + state.term + '" in this filter.'));
      var reset = mk('button', 'cmd-btn', 'Clear the search');
      reset.type = 'button';
      reset.addEventListener('click', function () {
        state.term = '';
        state.group = 'all';
        if ($('cmdSearch')) $('cmdSearch').value = '';
        renderChips();
        renderList();
      });
      empty.appendChild(reset);
      box.appendChild(empty);
    }

    if ($('cmdCount')) {
      $('cmdCount').textContent = (state.term || state.group !== 'all')
        ? 'showing ' + shownCommands + ' of ' + DATA.commands.length + ' commands'
        : DATA.commands.length + ' commands';
    }
    renderTable();
  }

  function renderTable() {
    var table = $('permTable');
    if (!table) return;
    var body = table.querySelector('tbody');
    if (!body) return;
    clear(body);
    DATA.commands.forEach(function (command) {
      var row = mk('tr');
      if (state.group !== 'all' && command.group !== state.group) row.className = 'is-dim';
      var nameCell = mk('td');
      var link = mk('a', null, '/' + command.name);
      link.href = '#cmd-' + command.name;
      nameCell.appendChild(link);
      row.appendChild(nameCell);
      row.appendChild(mk('td', null, command.who || 'not stated'));
      var setupCell = mk('td');
      setupCell.appendChild(mk('span', 'cmd-badge' + (command.needsSetup ? ' is-warn' : ' is-open'), command.needsSetup ? 'yes' : 'no'));
      row.appendChild(setupCell);
      var roCell = mk('td');
      roCell.appendChild(mk('span', 'cmd-badge' + (command.readOnly ? ' is-open' : ''), command.readOnly ? 'yes' : 'no'));
      row.appendChild(roCell);
      row.appendChild(mk('td', null, command.panel || 'not stated'));
      body.appendChild(row);
    });
  }

  /* ------------------------------------------------------------- navigation */
  function openHash() {
    var hash = decodeURIComponent((window.location.hash || '').replace(/^#/, ''));
    if (!hash) return;
    var target = document.getElementById(hash) || document.getElementById('cmd-' + hash);
    if (!target) return;
    if (target.tagName === 'DETAILS') target.open = true;
    if (target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.classList.add('cmd-flash');
    window.setTimeout(function () { target.classList.remove('cmd-flash'); }, 1600);
  }

  function plainText() {
    var lines = ['Spinback RCE commands', ''];
    DATA.commands.forEach(function (command) {
      lines.push('/' + command.name + ' - ' + command.summary);
      lines.push('  who: ' + command.who + ' | ' + (command.needsSetup ? 'needs setup done' : 'works before setup'));
      lines.push('  example: ' + exampleFor(command, null));
      command.subcommands.forEach(function (sub) {
        lines.push('  /' + command.name + ' ' + sub.name + ' - ' + sub.summary);
        (sub.options || []).forEach(function (option) {
          lines.push('     option ' + option.name + ' (' + optionTypeLabel(option.type) + ', ' + (option.required ? 'required' : 'optional') + '): ' + option.description
            + (option.choices && option.choices.length ? ' [' + option.choices.join(' | ') + ']' : ''));
        });
      });
      lines.push('');
    });
    return lines.join('\n');
  }

  function wire() {
    var search = $('cmdSearch');
    if (search) {
      search.addEventListener('input', function () {
        state.term = lower(search.value.trim());
        renderList();
      });
      search.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          search.value = '';
          state.term = '';
          renderList();
        }
      });
    }
    window.addEventListener('keydown', function (event) {
      var typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        if (search) search.focus();
      }
    });
    if ($('copyAll')) $('copyAll').addEventListener('click', function () { copy(plainText(), 'Copied the whole command list.'); });
    if ($('downloadJson')) $('downloadJson').addEventListener('click', function () {
      try {
        var blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'spinback-commands.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        toast('Saved spinback-commands.json.');
      } catch (error) {
        toast('This browser refused the download. The same file is at data/commands.json.');
      }
    });
    window.addEventListener('hashchange', openHash);
  }

  /* --------------------------------------------------------------- goals */
  function renderGoals() {
    var box = $('cmdGoals');
    if (!box) return;
    var goals = (DATA && DATA.goals) || [];
    if (!goals.length) {
      var section = box.parentNode;
      if (section && section.parentNode) section.parentNode.removeChild(section);
      return;
    }
    clear(box);
    goals.forEach(function (goal) {
      var card = mk('a', 'cmd-goal');
      card.href = goal.href || '#cmd-' + (goal.command || '');
      card.appendChild(mk('span', 'cmd-goal__want', goal.want || 'not stated'));
      card.appendChild(mk('code', 'cmd-goal__cmd', goal.label || ''));
      card.appendChild(mk('span', 'cmd-goal__note', goal.note || ''));
      card.addEventListener('click', function () { window.setTimeout(openHash, 0); });
      box.appendChild(card);
    });
  }

  function fail(message) {
    var box = $('cmdList');
    if (!box) return;
    clear(box);
    var node = mk('div', 'cmd-empty');
    node.appendChild(mk('p', null, message));
    var link = mk('a', 'cmd-btn', 'Open the raw list');
    link.href = 'data/commands.json';
    node.appendChild(link);
    box.appendChild(node);
    if ($('cmdCount')) $('cmdCount').textContent = 'unavailable';
  }

  function init() {
    wire();
    fetch('data/commands.json', { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || !Array.isArray(data.commands)) throw new Error('the data file has no command list');
      DATA = data;
      renderStats();
      renderChips();
      renderGoals();
      renderList();
      openHash();
    }).catch(function (error) {
      fail('The command list could not be read (' + (error && error.message ? error.message : error) + '). Everything below still describes how Spinback works.');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
