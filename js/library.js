/*
  library.js — everything about SOURCES (books, articles, chapters, theses).

  It creates three screens:
    #/library        → the list of all sources, with search and filters
    #/source/<id>    → one source's page (status, details, "Find this book")
    #/edit/<id>      → the add/edit form  (#/edit/new for a new source)

  It also defines the `Library` object: small shared tools that other
  files use too (e.g. showing author names nicely, status labels).
*/

const Library = {
  // The four reading statuses. Left: what we store. Right: what she sees.
  STATUSES: { toread: 'To read', reading: 'Reading', finished: 'Finished', revisit: 'Revisit' },
  TYPES: { book: 'Book', article: 'Journal article', chapter: 'Book chapter', thesis: 'Thesis' },
  FOUND: { '': '—', library: 'Library', pdf: 'PDF', borrowed: 'Borrowed', online: 'Online', other: 'Other' },

  // The filters she last used in the Library, remembered while the app is open
  filters: { q: '', theme: '', author: '', status: '', type: '', copy: '', sort: 'author' },

  // Other files (notes.js, citations.js…) add extra sections to a source's
  // page by putting a function in this list. Each function gets the
  // container element and the source.
  sourceSections: [],

  // A new source with every field present but empty
  blankSource: function () {
    return {
      id: App.uid(),
      type: 'book',
      authors: [],        // e.g. ['Roy, Kumkum']
      editors: [],        // for book chapters
      title: '',
      containerTitle: '', // for chapters: the title of the whole book
      journal: '', volume: '', issue: '',
      year: '', edition: '', publisher: '', place: '', pages: '',
      isbn: '', doi: '', url: '',
      foundAt: '', foundNote: '',
      status: 'toread', progress: '',
      themes: [],
      createdAt: App.now(),
      updatedAt: App.now()
    };
  },

  getThemes: function () {
    return DB.getSetting('themes', DEFAULT_THEMES);
  },
  // Add new theme names to the saved list (ignoring ones that already exist)
  addThemes: async function (names) {
    const themes = await Library.getThemes();
    names.forEach(function (n) { if (n && !themes.includes(n)) themes.push(n); });
    await DB.setSetting('themes', themes);
  },

  /* ---- Names ----
     Stored as "Surname, Given names". Shown as "Given names Surname". */
  displayName: function (name) {
    const i = name.indexOf(',');
    if (i < 0) return name.trim();
    return (name.slice(i + 1).trim() + ' ' + name.slice(0, i).trim()).trim();
  },
  surname: function (name) {
    const i = name.indexOf(',');
    return (i < 0 ? name : name.slice(0, i)).trim();
  },
  // ['Roy, Kumkum', 'Singh, Snigdha'] → "Kumkum Roy & Snigdha Singh"
  authorsText: function (list) {
    const names = (list || []).map(Library.displayName);
    if (names.length <= 2) return names.join(' & ');
    return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
  },

  /* ---- Small pieces of HTML used in several places ---- */
  statusChip: function (status) {
    return '<span class="chip status status-' + App.esc(status) + '">' +
      App.esc(Library.STATUSES[status] || status) + '</span>';
  },
  // Theme chips are buttons: clicking one filters the Library by that theme
  themeChips: function (themes) {
    return '<div class="chips">' + (themes || []).map(function (t) {
      return '<button type="button" class="chip chip-theme" data-theme-filter="' + App.esc(t) + '">' + App.esc(t) + '</button>';
    }).join('') + '</div>';
  },
  // One line of key facts: "Book · 1995 · Oxford University Press"
  metaLine: function (s) {
    return [Library.TYPES[s.type], s.year, s.type === 'article' ? s.journal : s.publisher]
      .filter(Boolean).map(App.esc).join(' · ');
  },

  // Links that search other websites for this source
  findLinks: function (s) {
    const e = encodeURIComponent;
    const author = s.authors && s.authors[0] ? Library.surname(s.authors[0]) : '';
    const q = (s.title + ' ' + author).trim();
    return [
      ['WorldCat', 'https://search.worldcat.org/search?q=' + e(q), 'libraries worldwide that hold it'],
      ['Google Books', 'https://www.google.com/search?tbm=bks&q=' + e(q), 'previews and editions'],
      ['Open Library', 'https://openlibrary.org/search?q=' + e(q), 'free borrowing, where available'],
      ['Internet Archive', 'https://archive.org/search?query=' + e(q), 'digitised copies'],
      ['Shodhganga', 'https://shodhganga.inflibnet.ac.in/simple-search?query=' + e(s.title), 'Indian PhD theses on similar topics']
    ];
  }
};

// When she clicks a theme chip anywhere, show the Library filtered by it
document.addEventListener('click', function (event) {
  const chip = event.target.closest('[data-theme-filter]');
  if (!chip) return;
  Library.filters = { q: '', theme: chip.dataset.themeFilter, author: '', status: '', type: '', copy: '', sort: Library.filters.sort };
  if (location.hash === '#/library') App.render(); else App.go('library');
});

/* =====================================================================
   SCREEN 1: the Library list
   ===================================================================== */
App.register('library', async function (main) {
  const sources = await DB.getAll('sources');
  const themes = await Library.getThemes();
  const fileCounts = await DB.fileCounts(); // how many attached files each source has
  const f = Library.filters;
  const esc = App.esc;

  // Every author name that appears in any source, sorted A–Z by surname
  const authors = Array.from(new Set(sources.flatMap(function (s) { return s.authors; })))
    .sort(function (a, b) { return Library.surname(a).localeCompare(Library.surname(b)); });

  // Build <option> tags for a drop-down list
  function options(pairs, selected) {
    return pairs.map(function (p) {
      return '<option value="' + esc(p[0]) + '"' + (p[0] === selected ? ' selected' : '') + '>' + esc(p[1]) + '</option>';
    }).join('');
  }

  main.innerHTML = `
    <div class="container">
      <div class="page-header">
        <h1>Library</h1>
        <a class="btn btn-primary" href="#/edit/new">+ Add source</a>
      </div>

      <div class="filters" role="search">
        <div class="filter-search">
          <label class="sr-only" for="f-q">Search the library</label>
          <input type="search" id="f-q" placeholder="Search title, author, journal, year…" value="${esc(f.q)}">
        </div>
        <div>
          <label class="sr-only" for="f-theme">Theme</label>
          <select id="f-theme">${options([['', 'All themes']].concat(themes.map(function (t) { return [t, t]; })), f.theme)}</select>
        </div>
        <div>
          <label class="sr-only" for="f-author">Author</label>
          <select id="f-author">${options([['', 'All authors']].concat(authors.map(function (a) { return [a, Library.displayName(a)]; })), f.author)}</select>
        </div>
        <div>
          <label class="sr-only" for="f-status">Reading status</label>
          <select id="f-status">${options([['', 'Any status']].concat(Object.entries(Library.STATUSES)), f.status)}</select>
        </div>
        <div>
          <label class="sr-only" for="f-type">Type</label>
          <select id="f-type">${options([['', 'All types']].concat(Object.entries(Library.TYPES)), f.type)}</select>
        </div>
      </div>

      <div class="row list-bar">
        <span id="count" class="muted small"></span>
        <span class="spacer"></span>
        <label class="sr-only" for="f-copy">My copy</label>
        <select id="f-copy" class="select-small">
          ${options([['', 'Any: with or without my copy'], ['yes', '📎 With my copy attached'], ['no', 'Without my copy']], f.copy)}
        </select>
        <button type="button" class="btn-link small" id="clear-filters">Clear filters</button>
        <label class="sr-only" for="f-sort">Sort by</label>
        <select id="f-sort" class="select-small">
          ${options([['author', 'Sort: Author A–Z'], ['title', 'Sort: Title A–Z'], ['recent', 'Sort: Recently added'], ['year', 'Sort: Year']], f.sort)}
        </select>
      </div>

      <div id="results" class="card-grid"></div>

      <p class="small muted restore-line">
        Missing one of the 10 starting books?
        <button type="button" class="btn-link" id="restore-seeds">Restore starting books</button>
      </p>
    </div>`;

  const results = main.querySelector('#results');
  const count = main.querySelector('#count');

  // Decide which sources match the current filters, then draw them
  function draw() {
    const q = f.q.trim().toLowerCase();
    let list = sources.filter(function (s) {
      if (f.theme && !s.themes.includes(f.theme)) return false;
      if (f.author && !s.authors.includes(f.author)) return false;
      if (f.status && s.status !== f.status) return false;
      if (f.type && s.type !== f.type) return false;
      if (f.copy === 'yes' && !fileCounts[s.id]) return false;
      if (f.copy === 'no' && fileCounts[s.id]) return false;
      if (q) {
        // Put all the searchable text together and look for the words
        const text = [s.title, s.containerTitle, s.journal, s.publisher, s.year, s.progress,
          s.authors.map(Library.displayName).join(' '), s.themes.join(' ')].join(' ').toLowerCase();
        // Every word she typed must appear somewhere
        if (!q.split(/\s+/).every(function (word) { return text.includes(word); })) return false;
      }
      return true;
    });

    const firstSurname = function (s) { return (s.authors[0] ? Library.surname(s.authors[0]) : '~').toLowerCase(); };
    const sorters = {
      author: function (a, b) { return firstSurname(a).localeCompare(firstSurname(b)) || a.title.localeCompare(b.title); },
      title: function (a, b) { return a.title.localeCompare(b.title); },
      recent: function (a, b) { return b.createdAt.localeCompare(a.createdAt); },
      year: function (a, b) { return (a.year || '9999').localeCompare(b.year || '9999'); }
    };
    list.sort(sorters[f.sort] || sorters.author);

    count.textContent = 'Showing ' + list.length + ' of ' + sources.length + ' sources';

    if (!list.length) {
      results.innerHTML = '<div class="empty" style="grid-column:1/-1">' +
        (sources.length ? 'No sources match these filters.' : 'Your library is empty. Click “+ Add source” to begin.') + '</div>';
      return;
    }

    results.innerHTML = list.map(function (s) {
      return `
        <article class="card source-card">
          <div class="card-top">
            <a class="source-title" href="#/source/${encodeURIComponent(s.id)}">${esc(s.title || '(untitled)')}</a>
            ${Library.statusChip(s.status)}
          </div>
          <div class="source-meta">
            ${esc(Library.authorsText(s.authors) || 'Author not set')}<br>${Library.metaLine(s)}
          </div>
          ${s.progress ? '<p class="small progress-note">📍 ' + esc(s.progress) + '</p>' : ''}
          ${fileCounts[s.id] ? '<p class="small has-copy">📎 My copy attached' + (fileCounts[s.id] > 1 ? ' (' + fileCounts[s.id] + ' files)' : '') + '</p>' : ''}
          ${Library.themeChips(s.themes)}
        </article>`;
    }).join('');
  }

  // When a filter changes: remember it and re-draw
  const inputs = { q: '#f-q', theme: '#f-theme', author: '#f-author', status: '#f-status', type: '#f-type', copy: '#f-copy', sort: '#f-sort' };
  Object.keys(inputs).forEach(function (key) {
    const el = main.querySelector(inputs[key]);
    const update = function () { f[key] = el.value; draw(); };
    el.addEventListener(key === 'q' ? 'input' : 'change', key === 'q' ? App.debounce(update, 150) : update);
  });
  main.querySelector('#restore-seeds').addEventListener('click', async function () {
    const added = await restoreStartingBooks(); // defined in seed.js
    App.toast(added ? 'Added back ' + added + ' starting book(s) ✓' : 'All 10 starting books are already here');
    if (added) App.render();
  });
  main.querySelector('#clear-filters').addEventListener('click', function () {
    Library.filters = { q: '', theme: '', author: '', status: '', type: '', copy: '', sort: f.sort };
    App.render();
  });

  draw();
});

/* =====================================================================
   SCREEN 2: one source's page
   ===================================================================== */
App.register('source', async function (main, id, focusNoteId) {
  const source = await DB.get('sources', id);
  const esc = App.esc;
  if (!source) {
    main.innerHTML = '<div class="container"><h1>Source not found</h1><p><a href="#/library">← Back to the Library</a></p></div>';
    return;
  }

  // The details list: only show fields that have been filled in
  const labels = [
    ['containerTitle', 'In (book)'], ['editors', 'Editors'], ['journal', 'Journal'],
    ['volume', 'Volume'], ['issue', 'Issue'], ['year', 'Year'], ['edition', 'Edition'],
    ['publisher', source.type === 'thesis' ? 'University' : 'Publisher'], ['place', 'Place'],
    ['pages', 'Pages'], ['isbn', 'ISBN'], ['doi', 'DOI'], ['url', 'Web link'], ['foundAt', 'Where I found it']
  ];
  const rows = labels.map(function (pair) {
    const key = pair[0];
    let value = source[key];
    if (Array.isArray(value)) value = Library.authorsText(value);
    if (!value) return '';
    let shown = esc(value);
    if (key === 'url' && App.safeUrl(value)) {
      shown = '<a href="' + esc(App.safeUrl(value)) + '" target="_blank" rel="noopener noreferrer">' + esc(value) + ' ↗</a>';
    }
    if (key === 'doi') {
      const doi = value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
      shown = '<a href="https://doi.org/' + esc(doi) + '" target="_blank" rel="noopener noreferrer">' + esc(doi) + ' ↗</a>';
    }
    if (key === 'foundAt') shown = esc(Library.FOUND[value] || value) + (source.foundNote ? ' — ' + esc(source.foundNote) : '');
    return '<dt>' + esc(pair[1]) + '</dt><dd>' + shown + '</dd>';
  }).join('');

  // Remind her which important details are still blank
  const important = source.type === 'article' ? ['year', 'volume', 'pages'] : ['year', 'publisher'];
  const missing = important.filter(function (k) { return !source[k]; });

  main.innerHTML = `
    <div class="container">
      <p class="small"><a href="#/library">← Library</a></p>
      <p class="eyebrow">${esc(Library.TYPES[source.type] || source.type)}</p>
      <h1>${esc(source.title || '(untitled)')}</h1>
      <p class="lead">${esc(Library.authorsText(source.authors) || 'Author not set')}</p>

      <div class="row" style="margin-bottom:1.25rem">
        <a class="btn" href="#/edit/${encodeURIComponent(source.id)}">✎ Edit details</a>
        <button type="button" class="btn" id="lookup">🔎 Look up details</button>
        <button type="button" class="btn btn-danger" id="delete">Delete</button>
      </div>

      <div class="two-col">
        <section class="card">
          <h2 class="card-heading">Reading</h2>
          <div class="field">
            <label for="status">Status</label>
            <select id="status">
              ${Object.entries(Library.STATUSES).map(function (p) {
                return '<option value="' + p[0] + '"' + (p[0] === source.status ? ' selected' : '') + '>' + p[1] + '</option>';
              }).join('')}
            </select>
          </div>
          <div class="field" style="margin-bottom:0">
            <label for="progress">Progress note <span class="hint">e.g. “up to chapter 4”</span></label>
            <input type="text" id="progress" value="${esc(source.progress)}" placeholder="Where am I up to?">
          </div>
        </section>

        <section class="card">
          <h2 class="card-heading">Details</h2>
          ${rows ? '<dl class="details">' + rows + '</dl>' : ''}
          ${missing.length ? '<p class="small muted">Not filled in yet: ' + missing.join(', ') +
            '. Use <strong>Edit details</strong> or <strong>Look up details</strong>.</p>' : ''}
        </section>
      </div>

      <section>
        <h2>Themes</h2>
        ${source.themes.length ? Library.themeChips(source.themes) : '<p class="muted">No themes yet. Use “Edit details” to add some.</p>'}
      </section>

      <section>
        <h2>Find this ${source.type === 'article' ? 'article' : 'book'}</h2>
        <p class="small muted">These open other websites and search for the title and author. Nothing else is sent.</p>
        <ul class="find-links">
          ${Library.findLinks(source).map(function (l) {
            return '<li><a href="' + esc(l[1]) + '" target="_blank" rel="noopener noreferrer">' + esc(l[0]) + ' ↗</a> <span class="muted small">' + esc(l[2]) + '</span></li>';
          }).join('')}
        </ul>
      </section>

      <div id="extra-sections"></div>
    </div>`;

  // Save the status as soon as she changes it
  main.querySelector('#status').addEventListener('change', async function (e) {
    source.status = e.target.value;
    source.updatedAt = App.now();
    await DB.put('sources', source);
    App.toast('Status saved ✓');
  });
  // Save the progress note when she leaves the box (or presses Enter)
  main.querySelector('#progress').addEventListener('change', async function (e) {
    source.progress = e.target.value.trim();
    source.updatedAt = App.now();
    await DB.put('sources', source);
    App.toast('Progress saved ✓');
  });

  main.querySelector('#lookup').addEventListener('click', function () {
    Library.lookUp(source, App.render);
  });

  main.querySelector('#delete').addEventListener('click', async function () {
    const ok = confirm('Delete “' + source.title + '”?\n\nAll notes and attached files for this source will be deleted too. This cannot be undone.');
    if (!ok) return;
    const notes = await DB.notesForSource(source.id);
    for (const note of notes) await DB.remove('notes', note.id);
    const files = await DB.filesForSource(source.id);
    for (const file of files) await DB.remove('files', file.id);
    await DB.remove('matrix', source.id);
    await DB.remove('sources', source.id);
    App.toast('Deleted');
    App.go('library');
  });

  // Let other stages add their own sections (notes, citations…)
  const extra = main.querySelector('#extra-sections');
  for (const addSection of Library.sourceSections) await addSection(extra, source, focusNoteId);
});

/* =====================================================================
   SCREEN 3: add / edit form
   ===================================================================== */
App.register('edit', async function (main, id) {
  const esc = App.esc;
  const isNew = id === 'new';
  const source = isNew ? Library.blankSource() : await DB.get('sources', id);
  if (!source) {
    main.innerHTML = '<div class="container"><h1>Source not found</h1></div>';
    return;
  }
  const savedThemes = await Library.getThemes();
  // Include any theme on this source that isn't in the saved list
  const allThemes = Array.from(new Set(savedThemes.concat(source.themes)));

  // Helper that writes the HTML for one text box.
  // `types` = which source types show this box (blank = all types).
  function field(name, label, opts) {
    opts = opts || {};
    return `
      <div class="field${opts.full ? ' full' : ''}"${opts.types ? ' data-types="' + opts.types + '"' : ''}>
        <label for="f-${name}">${label}${opts.hint ? ' <span class="hint">' + opts.hint + '</span>' : ''}</label>
        <input type="${opts.inputType || 'text'}" id="f-${name}" name="${name}" value="${esc(source[name])}"
          ${opts.placeholder ? 'placeholder="' + esc(opts.placeholder) + '"' : ''}>
      </div>`;
  }
  function select(name, label, choices) {
    return `
      <div class="field">
        <label for="f-${name}">${label}</label>
        <select id="f-${name}" name="${name}">
          ${Object.entries(choices).map(function (p) {
            return '<option value="' + esc(p[0]) + '"' + (p[0] === source[name] ? ' selected' : '') + '>' + esc(p[1]) + '</option>';
          }).join('')}
        </select>
      </div>`;
  }

  main.innerHTML = `
    <div class="container narrow">
      <p class="small"><a href="${isNew ? '#/library' : '#/source/' + encodeURIComponent(source.id)}">← Cancel</a></p>
      <h1>${isNew ? 'Add a source' : 'Edit details'}</h1>
      <p class="muted">Only the title is required. Leave anything you don't know blank.</p>

      <form id="source-form" novalidate>
        <fieldset>
          <legend>What is it?</legend>
          <div class="form-grid">
            ${select('type', 'Type', Library.TYPES)}
            ${select('foundAt', 'Where I found it', Library.FOUND)}
            <div class="field full">
              <label for="f-title">Title <span class="hint">(required)</span></label>
              <input type="text" id="f-title" name="title" value="${esc(source.title)}" required>
              <p class="form-error" id="title-error" hidden>Please enter a title.</p>
            </div>
            <div class="field full">
              <label for="f-authors">Authors <span class="hint">one per line, written “Surname, Given names”, e.g. Roy, Kumkum</span></label>
              <textarea id="f-authors" name="authors" rows="3" style="min-height:4.5rem">${esc(source.authors.join('\n'))}</textarea>
            </div>
            ${field('foundNote', 'Where exactly?', { full: true, hint: 'optional', placeholder: 'e.g. JNU library, shelf 305.4 — or PDF in my Downloads folder' })}
          </div>
        </fieldset>

        <fieldset>
          <legend>Publication details</legend>
          <div class="form-grid">
            ${field('containerTitle', 'Book title', { full: true, types: 'chapter', hint: 'the book this chapter appears in' })}
            <div class="field full" data-types="chapter">
              <label for="f-editors">Editors of the book <span class="hint">one per line, “Surname, Given names”</span></label>
              <textarea id="f-editors" name="editors" rows="2" style="min-height:3.5rem">${esc(source.editors.join('\n'))}</textarea>
            </div>
            ${field('journal', 'Journal', { full: true, types: 'article' })}
            ${field('volume', 'Volume', { types: 'article' })}
            ${field('issue', 'Issue', { types: 'article' })}
            ${field('year', 'Year', { placeholder: 'e.g. 2005' })}
            ${field('edition', 'Edition', { types: 'book chapter', placeholder: 'e.g. 2nd' })}
            ${field('publisher', 'Publisher / University', { placeholder: 'For theses: the university' })}
            ${field('place', 'Place of publication', { hint: 'optional', placeholder: 'e.g. New Delhi' })}
            ${field('pages', 'Pages', { hint: 'page range for articles & chapters', placeholder: 'e.g. 45–67' })}
            ${field('isbn', 'ISBN', { types: 'book chapter' })}
            ${field('doi', 'DOI', { hint: 'if it has one', placeholder: 'e.g. 10.1000/xyz123' })}
            ${field('url', 'Web link', { inputType: 'url', placeholder: 'https://…' })}
          </div>
        </fieldset>

        <fieldset>
          <legend>Reading</legend>
          <div class="form-grid">
            ${select('status', 'Status', Library.STATUSES)}
            ${field('progress', 'Progress note', { placeholder: 'e.g. up to chapter 4' })}
          </div>
        </fieldset>

        <fieldset>
          <legend>Themes</legend>
          <div class="checks">
            ${allThemes.map(function (t, i) {
              return '<label><input type="checkbox" name="themes" value="' + esc(t) + '"' +
                (source.themes.includes(t) ? ' checked' : '') + '> ' + esc(t) + '</label>';
            }).join('')}
          </div>
          <div class="field" style="margin:1rem 0 0">
            <label for="f-newThemes">Add new themes <span class="hint">separate with commas</span></label>
            <input type="text" id="f-newThemes" name="newThemes" placeholder="e.g. Dowry, Property rights">
          </div>
        </fieldset>

        <div class="row">
          <button type="submit" class="btn btn-primary">Save</button>
          <a class="btn" href="${isNew ? '#/library' : '#/source/' + encodeURIComponent(source.id)}">Cancel</a>
        </div>
      </form>
    </div>`;

  const form = main.querySelector('#source-form');

  // Show only the boxes that make sense for the chosen type
  function showFieldsForType() {
    const type = form.elements.type.value;
    form.querySelectorAll('[data-types]').forEach(function (el) {
      el.hidden = !el.dataset.types.split(' ').includes(type);
    });
  }
  form.elements.type.addEventListener('change', showFieldsForType);
  showFieldsForType();

  form.addEventListener('submit', async function (event) {
    event.preventDefault(); // stop the browser from reloading the page
    const data = new FormData(form);
    const text = function (name) { return String(data.get(name) || '').trim(); };
    const lines = function (name) { return text(name).split('\n').map(function (l) { return l.trim(); }).filter(Boolean); };

    if (!text('title')) {
      main.querySelector('#title-error').hidden = false;
      form.elements.title.focus();
      return;
    }

    const newThemes = text('newThemes').split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    const themes = Array.from(new Set(data.getAll('themes').concat(newThemes)));

    Object.assign(source, {
      type: text('type'), title: text('title'), authors: lines('authors'), editors: lines('editors'),
      containerTitle: text('containerTitle'), journal: text('journal'), volume: text('volume'),
      issue: text('issue'), year: text('year'), edition: text('edition'), publisher: text('publisher'),
      place: text('place'), pages: text('pages'), isbn: text('isbn'), doi: text('doi'), url: text('url'),
      foundAt: text('foundAt'), foundNote: text('foundNote'), status: text('status'),
      progress: text('progress'), themes: themes, updatedAt: App.now()
    });

    if (newThemes.length) await Library.addThemes(newThemes);
    await DB.put('sources', source);
    App.toast('Saved ✓');
    App.go('source', source.id);
  });

  form.elements.title.focus();
});

/* =====================================================================
   "Look up details" — search Open Library, let her confirm each detail
   ===================================================================== */

// Ask Open Library's free search service. Tries a few ways, from most
// specific (title + author) to least (just the main title).
Library.searchOpenLibrary = async function (source) {
  const fields = 'key,title,subtitle,author_name,first_publish_year,publisher,publish_place,isbn,edition_count';
  const surname = source.authors[0] ? Library.surname(source.authors[0]) : '';
  const mainTitle = source.title.split(':')[0].trim(); // title without subtitle

  const attempts = [];
  if (surname) attempts.push({ title: source.title, author: surname });
  attempts.push({ title: source.title });
  if (mainTitle !== source.title) attempts.push({ title: mainTitle, author: surname });

  for (const attempt of attempts) {
    const params = new URLSearchParams(attempt);
    params.set('fields', fields);
    params.set('limit', '5');
    const response = await fetch('https://openlibrary.org/search.json?' + params.toString());
    if (!response.ok) throw new Error('Open Library replied with error ' + response.status);
    const json = await response.json();
    if (json.docs && json.docs.length) return json.docs;
  }
  return [];
};

Library.lookUp = async function (source, afterSave) {
  const esc = App.esc;
  const closeButton = '<form method="dialog" class="dialog-actions"><button class="btn">Close</button></form>';
  const box = App.dialog('<h2>Look up details</h2><p class="muted">Searching Open Library for “' + esc(source.title) + '”…</p>');

  let docs;
  try {
    docs = await Library.searchOpenLibrary(source);
  } catch (error) {
    box.innerHTML = '<h2>Look up details</h2><p>Could not reach Open Library. Are you connected to the internet?</p>' +
      '<p class="small muted">' + esc(error.message) + '</p>' + closeButton;
    return;
  }

  if (!docs.length) {
    box.innerHTML = '<h2>No matches found</h2><p>Open Library didn\'t find this title.' +
      (source.type === 'article' ? ' It mostly lists books, so journal articles are usually not there — try the journal\'s website instead.' : '') +
      '</p><p>You can still fill in the details yourself with “Edit details”.</p>' + closeButton;
    return;
  }

  // Step 1: show the possible matches
  function showMatches() {
    box.innerHTML = `
      <h2>Possible matches</h2>
      <p class="small muted">Pick the one that matches your book. You'll then choose exactly which details to keep — nothing is saved until you confirm.</p>
      <div class="card-list">
        ${docs.map(function (d, i) {
          const link = /^\/works\/\w+$/.test(d.key || '') ? 'https://openlibrary.org' + d.key : '';
          return `
            <div class="card">
              <strong>${esc(d.title)}${d.subtitle ? ': ' + esc(d.subtitle) : ''}</strong>
              <div class="source-meta">
                ${esc((d.author_name || []).join(', ') || 'Unknown author')}
                ${d.first_publish_year ? ' · first published ' + esc(d.first_publish_year) : ''}
                ${d.edition_count ? ' · ' + esc(d.edition_count) + ' edition(s)' : ''}
              </div>
              <div class="row">
                <button type="button" class="btn btn-small btn-primary" data-pick="${i}">Review details</button>
                ${link ? '<a class="small" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">View on Open Library ↗</a>' : ''}
              </div>
            </div>`;
        }).join('')}
      </div>
      <form method="dialog" class="dialog-actions"><button class="btn">None of these — close</button></form>`;
  }

  // Step 2: for the chosen match, show each detail next to what she has now
  function showReview(doc) {
    const unique = function (list, max) { return Array.from(new Set(list || [])).slice(0, max || 8); };
    // Prefer modern 13-digit ISBNs
    const isbns = unique((doc.isbn || []).filter(function (x) { return x.length === 13; }).concat(doc.isbn || []), 8);
    const candidates = [
      { key: 'year', label: 'Year', values: doc.first_publish_year ? [String(doc.first_publish_year)] : [],
        note: 'The FIRST publication year. Your copy may be a later edition.' },
      { key: 'publisher', label: 'Publisher', values: unique(doc.publisher),
        note: 'Different editions may have different publishers.' },
      { key: 'place', label: 'Place', values: unique(doc.publish_place) },
      { key: 'isbn', label: 'ISBN', values: isbns, note: 'Each edition has its own ISBN — check the back of your copy.' }
    ].filter(function (c) { return c.values.length; });

    if (!candidates.length) {
      box.innerHTML = '<h2>No extra details</h2><p>Open Library has no year, publisher or ISBN for this match.</p>' +
        '<div class="dialog-actions"><button type="button" class="btn" data-back>← Back to matches</button></div>';
      return;
    }

    box.innerHTML = `
      <h2>Choose what to keep</h2>
      <p class="small muted">Tick only the details you have checked against your own copy. Unticked rows are ignored.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Use?</th><th>Detail</th><th>You have now</th><th>Open Library found</th></tr></thead>
          <tbody>
            ${candidates.map(function (c) {
              const found = c.values.length > 1
                ? '<select id="val-' + c.key + '" aria-label="' + c.label + ' options">' +
                    c.values.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('') + '</select>'
                : '<span id="val-' + c.key + '" data-value="' + esc(c.values[0]) + '">' + esc(c.values[0]) + '</span>';
              return `
                <tr>
                  <td><input type="checkbox" id="use-${c.key}" data-use="${c.key}"></td>
                  <td><label for="use-${c.key}">${c.label}</label>${c.note ? '<div class="hint">' + c.note + '</div>' : ''}</td>
                  <td>${source[c.key] ? esc(source[c.key]) : '<span class="muted">blank</span>'}</td>
                  <td>${found}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn" data-back>← Back to matches</button>
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="button" class="btn btn-primary" data-save>Save ticked details</button>
      </div>`;
  }

  // One click-listener handles all the buttons inside the pop-up
  box.addEventListener('click', async function (event) {
    const t = event.target;
    if (t.dataset.pick !== undefined) showReview(docs[Number(t.dataset.pick)]);
    if (t.hasAttribute('data-back')) showMatches();
    if (t.hasAttribute('data-cancel')) box.close();
    if (t.hasAttribute('data-save')) {
      const ticked = Array.from(box.querySelectorAll('[data-use]:checked'));
      if (!ticked.length) { App.toast('Nothing ticked — tick the details you want to keep'); return; }
      ticked.forEach(function (checkbox) {
        const key = checkbox.dataset.use;
        const el = box.querySelector('#val-' + key);
        source[key] = el.tagName === 'SELECT' ? el.value : el.dataset.value;
      });
      source.updatedAt = App.now();
      await DB.put('sources', source);
      box.close();
      App.toast('Details saved ✓');
      if (afterSave) afterSave();
    }
  });

  showMatches();
};
