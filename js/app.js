/*
  app.js — the "brain" that runs the app.

  What it does:
   1. Keeps a list of screens ("routes"): dashboard, library, notes, …
      Each screen's file (library.js, notes.js, …) adds itself to this list
      with App.register('library', someFunction).
   2. Watches the web address. When the part after "#" changes
      (e.g. "#/library"), it draws the matching screen inside <main>.
   3. Handles the light/dark switch.
   4. Offers small helper tools every screen uses (App.esc, App.toast, …).
*/

const App = {
  routes: {},

  // Each screen calls this once to add itself, e.g.
  //   App.register('library', async function (main, param) { ... });
  register: function (name, renderFunction) {
    this.routes[name] = renderFunction;
  },

  /* ---------------- Helper tools ---------------- */

  // SAFETY: turn characters like < > & " into harmless text.
  // We ALWAYS pass her typed text through this before showing it on the
  // page, so that nothing she types (or imports) can act as code.
  esc: function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // Make a unique id for each new record, e.g. "lq3k9x-4f2a1c"
  uid: function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  },

  // The current date & time in a standard format, e.g. "2026-09-30T10:15:00.000Z"
  now: function () {
    return new Date().toISOString();
  },

  // Show a date nicely, e.g. "30 Sep 2026"
  formatDate: function (iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  },

  // Show a small message at the bottom of the screen for a few seconds
  toast: function (message) {
    const box = document.getElementById('toast');
    box.textContent = message;
    box.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () { box.hidden = true; }, 2500);
  },

  // "Debounce": wait until she stops typing for a moment before searching,
  // so we don't re-draw the list on every single key press.
  debounce: function (fn, wait) {
    let timer;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, wait || 200);
    };
  },

  // Open a pop-up window. Returns the <dialog> element so the caller can
  // fill it in. It removes itself from the page when closed.
  dialog: function (html) {
    const box = document.createElement('dialog');
    box.innerHTML = html || '';
    document.body.appendChild(box);
    box.addEventListener('close', function () { box.remove(); });
    box.showModal();
    return box;
  },

  // Copy text to the clipboard (used by "Copy" buttons)
  copy: async function (text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // Older fallback: put the text in a hidden box, select it, and copy
      const box = document.createElement('textarea');
      box.value = text;
      document.body.appendChild(box);
      box.select();
      document.execCommand('copy');
      box.remove();
    }
    App.toast('Copied ✓');
  },

  // Save some text as a file in her Downloads folder
  // e.g. App.download('matrix.csv', 'a,b,c', 'text/csv')
  download: function (filename, text, mimeType) {
    const blob = new Blob([text], { type: (mimeType || 'text/plain') + ';charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  },

  // Today's date as 2026-09-30, for file names
  today: function () {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  // Only allow real web links (http/https). This blocks tricks like
  // "javascript:" links hidden in imported data.
  safeUrl: function (url) {
    return /^https?:\/\//i.test(String(url || '').trim()) ? String(url).trim() : '';
  },

  // Go to another screen, e.g. App.go('library') or App.go('source', id)
  go: function (route, param) {
    location.hash = '#/' + route + (param ? '/' + encodeURIComponent(param) : '');
  },

  /* ---------------- Screen switching ("routing") ---------------- */

  // Read the address, e.g. "#/source/abc123" → route "source", param "abc123"
  render: async function () {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const route = parts[0] || 'dashboard';
    const param = parts[1] ? decodeURIComponent(parts[1]) : null;
    // An optional second part, e.g. "#/source/<bookId>/<noteId>" to jump to one note
    const param2 = parts[2] ? decodeURIComponent(parts[2]) : null;
    const main = document.getElementById('main');

    // Highlight the current menu item. Some screens belong to a menu item
    // with a different name (a single source's page belongs to "Library").
    const menuFor = { source: 'library', edit: 'library' };
    const activeMenu = menuFor[route] || route;
    document.querySelectorAll('.mainnav a').forEach(function (link) {
      if (link.dataset.route === activeMenu) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    const screen = App.routes[route];
    if (!screen) {
      // An address that doesn't match any screen
      main.innerHTML =
        '<div class="container"><h1>Page not found</h1>' +
        '<p><a href="#/dashboard">Go to the home page</a></p></div>';
      return;
    }

    window.scrollTo(0, 0); // start each new screen at the top
    try {
      await screen(main, param, param2);
    } catch (error) {
      console.error(error);
      main.innerHTML =
        '<div class="container"><h1>Something went wrong</h1>' +
        '<p>' + App.esc(error.message) + '</p></div>';
    }
    // Move keyboard focus to the new content (helps screen-reader users)
    main.focus({ preventScroll: true });
  },

  /* ---------------- Light / dark mode ---------------- */

  // Her choice is remembered in the browser ("localStorage").
  // If she never chooses, the app follows the computer's own setting.
  setupThemeToggle: function () {
    document.getElementById('theme-toggle').addEventListener('click', function () {
      const root = document.documentElement;
      const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const currentlyDark = root.dataset.theme ? root.dataset.theme === 'dark' : systemIsDark;
      const next = currentlyDark ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked: fine */ }
    });
  },

  /* ---------------- Starting up ---------------- */

  start: async function () {
    App.setupThemeToggle();

    // On a real website (not a double-clicked file), register the
    // service worker so the app also opens without internet. See sw.js.
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('Offline mode unavailable:', e); });
    }

    // Ask the browser to treat her data as important, so it isn't
    // cleared automatically when the computer runs low on space.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(function () {});
    }

    try {
      await DB.open();
      // Other files can add jobs to run once at start-up (e.g. adding the
      // starting books the very first time). See seed.js.
      for (const job of App.startupJobs) await job();
    } catch (error) {
      console.error(error);
      document.getElementById('main').innerHTML =
        '<div class="container"><h1>Could not open the database</h1>' +
        '<p>Your browser may be in private mode, or blocking site storage. ' +
        'Try a normal window in Chrome, Firefox or Safari.</p></div>';
      return;
    }

    // Re-draw whenever the address after "#" changes
    window.addEventListener('hashchange', App.render);
    App.render();
  },

  startupJobs: []
};

// Start the app once the page has finished loading
document.addEventListener('DOMContentLoaded', App.start);
