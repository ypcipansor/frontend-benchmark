/* Minimal, contract-compliant Todo app used by the regression tests.
   It mirrors the benchmark behaviour (100 items, every 3rd completed, prepend
   on add, toggle-all, filters) but adds a tiny log endpoint so tests can prove
   which row the parity script actually acted on. */
(function () {
  'use strict';

  var FLAGS = window.FIXTURE_FLAGS || {};

  function generate(count) {
    var prefix = FLAGS.itemLabelPrefix || 'Todo item ';
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      text: prefix + (i + 1),
      completed: (i + 1) % 3 === 0,
    }));
  }

  var todos = generate(window.FIXTURE_COUNT ?? 100);
  var currentFilter = 'all';
  var nextId = (window.FIXTURE_COUNT ?? 100) + 1;
  var events = [];

  function log(kind, payload) {
    events.push(Object.assign({ kind: kind }, payload));
    if (window.__fixtureLog) window.__fixtureLog.push({ kind: kind, payload: payload });
    // Report to the fixture server so tests can assert which row was acted on.
    // sendBeacon is used because it survives page teardown without surfacing as
    // an aborted request: a fire-and-forget fetch can be cancelled when the
    // capture closes the page, and the shared error policy rightly treats an
    // aborted request as an error.
    try {
      var body = JSON.stringify({ kind: kind, payload: payload });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/__events', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/__events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true,
        });
      }
    } catch (e) { /* reporting is best-effort */ }
  }

  function filtered() {
    if (currentFilter === 'active') return todos.filter(function (t) { return !t.completed; });
    if (currentFilter === 'completed') return todos.filter(function (t) { return t.completed; });
    return todos;
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function render() {
    var remaining = todos.filter(function (t) { return !t.completed; }).length;
    document.getElementById('remaining-count').textContent = String(remaining);
    var container = document.getElementById('todo-list-container');
    var list = filtered();
    if (list.length === 0) {
      container.innerHTML =
        '<div class="empty-state"><div class="empty-state-icon">📝</div>' +
        '<div class="empty-state-text">No todos to display</div></div>';
      return;
    }
    container.innerHTML =
      '<ul class="todo-list">' +
      list.map(function (todo) {
        return (
          '<li class="todo-item ' + (todo.completed ? 'completed' : '') + '">' +
          '<input type="checkbox" class="todo-checkbox" ' + (todo.completed ? 'checked' : '') +
          ' data-id="' + todo.id + '" aria-label="Toggle ' + escapeHtml(todo.text) + '" />' +
          '<span class="todo-text">' + escapeHtml(todo.text) + '</span>' +
          '<button class="btn btn-delete" data-id="' + todo.id + '" ' +
          'aria-label="Delete ' + escapeHtml(todo.text) + '">Delete</button>' +
          '</li>'
        );
      }).join('') +
      '</ul>';
  }

  function addTodo() {
    var input = document.querySelector('.todo-input');
    var text = input.value.trim();
    if (text === '') return;
    var item = { id: nextId++, text: text, completed: false };
    if (FLAGS.insertMiddle) {
      // Hostile placement: the new todo is neither first nor last, so any test
      // that selects it by position (.first()/.last()) picks the wrong row.
      todos.splice(Math.floor(todos.length / 2), 0, item);
    } else {
      // Prepend, exactly like the benchmark implementations.
      todos.unshift(item);
    }
    log('add', { text: text });
    input.value = '';
    render();
  }

  var T = (window.FIXTURE_TOTAL || 100);
  var COMPLETED = Math.floor(T / 3);

  document.addEventListener('DOMContentLoaded', function () {
    if (FLAGS.hideToggleAll) {
      var control = document.querySelector('.todo-toggle-all');
      if (control) control.remove();
    }
    render();

    document.querySelector('.btn-primary').addEventListener('click', addTodo);
    document.querySelector('.todo-input').addEventListener('keypress', function (e) {
      if (e.key === 'Enter') addTodo();
    });

    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentFilter = btn.dataset.filter;
        document.querySelectorAll('.filter-btn').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        render();
      });
    });

      var toggleAllEl = document.querySelector('.todo-toggle-all');
      if (toggleAllEl) toggleAllEl.addEventListener('click', function () {
        if (FLAGS.toggleAllBroken) {
          log('toggleAll', { noop: true });
          return; // deliberately wrong: leaves the list untouched
        }
        var allCompleted = todos.length > 0 && todos.every(function (t) { return t.completed; });
        todos = todos.map(function (t) { return Object.assign({}, t, { completed: !allCompleted }); });
        log('toggleAll', { nowAllCompleted: !allCompleted });
        render();
      });

    document.getElementById('todo-list-container').addEventListener('change', function (e) {
      var cb = e.target.closest('.todo-checkbox');
      if (!cb) return;
      var id = Number(cb.dataset.id);
      var todo = todos.find(function (t) { return t.id === id; });
      if (todo) {
        todo.completed = !todo.completed;
        log('toggle', { id: id, text: todo.text });
        render();
      }
    });

    document.getElementById('todo-list-container').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-delete');
      if (!btn) return;
      var id = Number(btn.dataset.id);
      var todo = todos.find(function (t) { return t.id === id; });
      log('delete', { id: id, text: todo ? todo.text : null });
      todos = todos.filter(function (t) { return t.id !== id; });
      render();
    });
  });

  // Exposed for the fixture server so tests can read what actually happened.
  window.__fixture = {
    events: events,
    snapshot: function () {
      return {
        count: todos.length,
        checked: todos.filter(function (t) { return t.completed; }).length,
        remaining: todos.filter(function (t) { return !t.completed; }).length,
      };
    },
  };

  // Keep an easy handle for the assertion message in tests.
  window.__fixtureConstants = { TOTAL: T, COMPLETED: COMPLETED };
})();
