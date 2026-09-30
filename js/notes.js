/*
  notes.js — her NOTES on each source.

  Each note looks like this in the database:
    {
      id, sourceId,          ← which source it belongs to
      type: 'quote',         ← Summary / Key argument / Quote / My thoughts / Question
      page: '45',            ← page number(s), free text so "45–47" or "xii" also work
      tags: ['dowry', 'property'],
      body: 'The text of the note, with **simple** formatting',
      createdAt, updatedAt
    }

  FORMATTING: she types simple symbols, and the app shows them formatted:
      **bold**     *italic*     ## Heading
      - bullet     1. numbered  > quotation
  The toolbar buttons type these symbols for her. We never store or show
  raw HTML, which keeps imported data from running any code.

  This file adds a "Notes" section to every source's page.
*/

const Notes = {
  TYPES: {
    summary: 'Summary',
    argument: 'Key argument',
    quote: 'Quote',
    thoughts: 'My thoughts',
    question: 'Question'
  },

  blankNote: function (sourceId) {
    return {
      id: App.uid(), sourceId: sourceId, type: 'summary', page: '', tags: [], body: '',
      createdAt: App.now(), updatedAt: App.now()
    };
  },

  // Sort notes by page number (notes without a page go last), then by date
  sortByPage: function (a, b) {
    const pa = parseInt(a.page, 10), pb = parseInt(b.page, 10);
    const ka = isNaN(pa) ? Infinity : pa, kb = isNaN(pb) ? Infinity : pb;
    if (ka !== kb) return ka - kb;
    return a.createdAt.localeCompare(b.createdAt);
  },

  // Every tag used in any note (for the suggestions list when typing tags)
  allTags: async function () {
    const notes = await DB.getAll('notes');
    return Array.from(new Set(notes.flatMap(function (n) { return n.tags; }))).sort();
  },

  /* ---------- Turning her typed text into formatted HTML ---------- */

  // Bold and italic inside a line
  inline: function (text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\s][^*]*?)\*/g, '<em>$1</em>');
  },

  // The whole note. STEP 1 is App.esc(): every < > & becomes harmless text.
  // Only then do we add our own few, safe tags (<p>, <ul>, <strong>…).
  renderText: function (text) {
    const lines = App.esc(text || '').split('\n');
    let html = '';
    let paragraph = []; // lines of the paragraph we are building
    let list = null;    // 'ul' or 'ol' while inside a list

    function endParagraph() {
      if (paragraph.length) html += '<p>' + paragraph.map(Notes.inline).join('<br>') + '</p>';
      paragraph = [];
    }
    function endList() {
      if (list) html += '</' + list + '>';
      list = null;
    }
    function listItem(kind, content) {
      endParagraph();
      if (list !== kind) { endList(); html += '<' + kind + '>'; list = kind; }
      html += '<li>' + Notes.inline(content) + '</li>';
    }

    lines.forEach(function (raw) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { endParagraph(); endList(); return; }                 // blank line
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {                              // ## Heading
        endParagraph(); endList();
        const tag = m[1].length === 3 ? 'h4' : 'h3';
        html += '<' + tag + '>' + Notes.inline(m[2]) + '</' + tag + '>';
        return;
      }
      if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { listItem('ul', m[1]); return; }  // - bullet
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { listItem('ol', m[1]); return; } // 1. numbered
      if ((m = line.match(/^&gt;\s?(.*)$/))) {                                   // > quote
        endParagraph(); endList();
        html += '<blockquote>' + Notes.inline(m[1]) + '</blockquote>';
        return;
      }
      endList();
      paragraph.push(line);
    });
    endParagraph();
    endList();
    return html;
  },

  // A short plain-text preview of a note: formatting symbols removed,
  // cut to `max` characters. Used in lists (themes, questions).
  snippet: function (body, max) {
    const text = String(body || '')
      .replace(/^\s*(#{1,3}|[-*•]|\d+[.)]|>)\s+/gm, '')
      .replace(/\*\*?/g, '')
      .replace(/\s+/g, ' ').trim();
    max = max || 160;
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  },

  /* ---------- Showing one note ---------- */

  typeChip: function (type) {
    return '<span class="chip note-type nt-' + App.esc(type) + '">' + App.esc(Notes.TYPES[type] || type) + '</span>';
  },

  // `source` is passed when we want to show which book the note is from
  // (e.g. in search results); `highlight` marks the searched words.
  card: function (note, options) {
    options = options || {};
    const esc = App.esc;
    let body = Notes.renderText(note.body);
    if (options.highlight) body = Notes.highlight(body, options.highlight);
    const src = options.source;
    return `
      <article class="card note-card nt-border-${esc(note.type)}" id="note-${esc(note.id)}">
        <div class="note-head">
          ${Notes.typeChip(note.type)}
          ${note.page ? '<span class="note-page">p. ' + esc(note.page) + '</span>' : ''}
          <span class="spacer"></span>
          ${options.readOnly ? '' : `
            <button type="button" class="btn btn-small" data-edit-note="${esc(note.id)}">Edit</button>
            <button type="button" class="btn btn-small btn-danger" data-delete-note="${esc(note.id)}" aria-label="Delete note">Delete</button>`}
        </div>
        ${src ? '<p class="note-source small"><a href="#/source/' + encodeURIComponent(src.id) + '/' + encodeURIComponent(note.id) + '">' +
          esc(src.title) + '</a>' + (src.authors.length ? ' — ' + esc(Library.authorsText(src.authors)) : '') + '</p>' : ''}
        <div class="note-body">${body || '<p class="muted">(empty note)</p>'}</div>
        <div class="note-foot">
          <div class="chips">${note.tags.map(function (t) { return '<span class="chip">#' + esc(t) + '</span>'; }).join('')}</div>
          <span class="muted small">${esc(App.formatDate(note.updatedAt))}</span>
        </div>
      </article>`;
  },

  // Wrap matches of the search words in <mark>, but only in the text,
  // never inside the HTML tags themselves.
  highlight: function (html, query) {
    const words = query.trim().split(/\s+/).filter(Boolean)
      .map(function (w) { return App.esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    if (!words.length) return html;
    const pattern = new RegExp('(' + words.join('|') + ')', 'gi');
    return html.split(/(<[^>]+>)/).map(function (part) {
      return part.startsWith('<') ? part : part.replace(pattern, '<mark>$1</mark>');
    }).join('');
  },

  /* ---------- The add / edit note pop-up ---------- */

  openEditor: async function (note, source, afterSave) {
    const esc = App.esc;
    const isNew = !note.body && !note.page && !note.tags.length;
    const tagSuggestions = Array.from(new Set((await Notes.allTags()).concat(await Library.getThemes())));

    const box = App.dialog(`
      <form id="note-form" novalidate>
        <h2>${isNew ? 'Add a note' : 'Edit note'}</h2>
        <p class="small muted" style="margin-top:-.5rem">${esc(source.title)}</p>

        <div class="form-grid">
          <div class="field">
            <label for="n-type">Type of note</label>
            <select id="n-type" name="type">
              ${Object.entries(Notes.TYPES).map(function (p) {
                return '<option value="' + p[0] + '"' + (p[0] === note.type ? ' selected' : '') + '>' + p[1] + '</option>';
              }).join('')}
            </select>
          </div>
          <div class="field">
            <label for="n-page">Page <span class="hint">e.g. 45 or 45–47</span></label>
            <input type="text" id="n-page" name="page" value="${esc(note.page)}" inputmode="text">
          </div>
          <div class="field full">
            <label for="n-tags">Tags <span class="hint">separate with commas, e.g. dowry, property rights</span></label>
            <input type="text" id="n-tags" name="tags" value="${esc(note.tags.join(', '))}" list="tag-suggestions" autocomplete="off">
            <datalist id="tag-suggestions">
              ${tagSuggestions.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('')}
            </datalist>
          </div>
        </div>

        <div class="field">
          <div class="editor-head">
            <label for="n-body">Note</label>
            <div class="mini-tabs" role="tablist">
              <button type="button" role="tab" aria-selected="true" data-mode="write">Write</button>
              <button type="button" role="tab" aria-selected="false" data-mode="preview">Preview</button>
            </div>
          </div>
          <div class="editor-toolbar" aria-label="Formatting">
            <button type="button" class="btn btn-small" data-format="bold" title="Bold (Ctrl/⌘ + B)"><strong>B</strong></button>
            <button type="button" class="btn btn-small" data-format="italic" title="Italic (Ctrl/⌘ + I)"><em>I</em></button>
            <button type="button" class="btn btn-small" data-format="heading" title="Heading">H</button>
            <button type="button" class="btn btn-small" data-format="bullet" title="Bullet list">• List</button>
            <button type="button" class="btn btn-small" data-format="numbered" title="Numbered list">1. List</button>
            <button type="button" class="btn btn-small" data-format="quote" title="Quotation">❝ Quote</button>
          </div>
          <textarea id="n-body" name="body" rows="10">${esc(note.body)}</textarea>
          <div class="note-body note-preview" hidden></div>
          <p class="hint">Tip: **bold**, *italic*, “## ” heading, “- ” bullet, “1. ” numbered, “> ” quotation.</p>
        </div>

        <div class="dialog-actions">
          <button type="button" class="btn" data-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">Save note</button>
        </div>
      </form>`);

    const form = box.querySelector('#note-form');
    const textarea = form.elements.body;
    const preview = box.querySelector('.note-preview');
    const originalText = textarea.value;

    // Ask before throwing away typed text (Cancel button or Esc key)
    function wantsToLeave() {
      return textarea.value === originalText || confirm('Discard the changes to this note?');
    }
    box.addEventListener('cancel', function (e) { if (!wantsToLeave()) e.preventDefault(); });
    box.querySelector('[data-cancel]').addEventListener('click', function () { if (wantsToLeave()) box.close(); });

    // Write / Preview tabs
    box.querySelector('.mini-tabs').addEventListener('click', function (e) {
      const mode = e.target.dataset.mode;
      if (!mode) return;
      box.querySelectorAll('.mini-tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.mode === mode)); });
      const showPreview = mode === 'preview';
      preview.innerHTML = Notes.renderText(textarea.value) || '<p class="muted">Nothing to preview yet.</p>';
      preview.hidden = !showPreview;
      textarea.hidden = showPreview;
      box.querySelector('.editor-toolbar').hidden = showPreview;
    });

    // Formatting buttons
    box.querySelector('.editor-toolbar').addEventListener('click', function (e) {
      const button = e.target.closest('[data-format]');
      if (button) Notes.applyFormat(textarea, button.dataset.format);
    });
    // Keyboard shortcuts: Ctrl+B / Cmd+B and Ctrl+I / Cmd+I
    textarea.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'b') { e.preventDefault(); Notes.applyFormat(textarea, 'bold'); }
      if (e.key === 'i') { e.preventDefault(); Notes.applyFormat(textarea, 'italic'); }
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      note.type = form.elements.type.value;
      note.page = form.elements.page.value.trim();
      note.tags = Array.from(new Set(form.elements.tags.value.split(',')
        .map(function (t) { return t.trim(); }).filter(Boolean)));
      note.body = textarea.value.trim();
      note.updatedAt = App.now();
      if (!note.body) { App.toast('The note is empty — write something first'); textarea.focus(); return; }
      await DB.put('notes', note);
      box.close();
      App.toast('Note saved ✓');
      if (afterSave) afterSave(note);
    });

    (isNew ? textarea : form.elements.type).focus();
  },

  // What the toolbar buttons do to the text box
  applyFormat: function (textarea, format) {
    const start = textarea.selectionStart, end = textarea.selectionEnd;
    const value = textarea.value;
    const selected = value.slice(start, end);

    // Bold / italic: put symbols around the selected words
    if (format === 'bold' || format === 'italic') {
      const mark = format === 'bold' ? '**' : '*';
      // Keep spaces around the selection OUTSIDE the symbols ("word " → "**word** ")
      const before = selected.match(/^\s*/)[0], after = selected.match(/\s*$/)[0];
      const trimmed = selected.trim();
      const inner = trimmed || (format === 'bold' ? 'bold text' : 'italic text');
      textarea.setRangeText(before + mark + inner + mark + (trimmed ? after : ''), start, end, 'end');
      if (!selected) { // select the placeholder so she can type over it
        textarea.selectionStart = start + mark.length;
        textarea.selectionEnd = start + mark.length + inner.length;
      }
    } else {
      // Line formats: add a symbol at the start of each selected line
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lines = value.slice(lineStart, end).split('\n');
      const prefixed = lines.map(function (line, i) {
        const clean = line.replace(/^(#{1,3}\s+|[-*•]\s+|\d+[.)]\s+|>\s?)/, '');
        if (format === 'heading') return '## ' + clean;
        if (format === 'bullet') return '- ' + clean;
        if (format === 'numbered') return (i + 1) + '. ' + clean;
        if (format === 'quote') return '> ' + clean;
        return line;
      }).join('\n');
      textarea.setRangeText(prefixed, lineStart, end, 'end');
    }
    textarea.focus();
  }
};

/* =====================================================================
   The "Notes" section on every source's page
   ===================================================================== */
Library.sourceSections.push(async function notesSection(container, source, focusNoteId) {
  const section = document.createElement('section');
  section.className = 'notes-section';
  container.appendChild(section);
  let typeFilter = ''; // '' = show all types

  async function draw() {
    const notes = (await DB.notesForSource(source.id)).sort(Notes.sortByPage);
    const shown = typeFilter ? notes.filter(function (n) { return n.type === typeFilter; }) : notes;

    // Little buttons to show only one type of note, with counts
    const counts = {};
    notes.forEach(function (n) { counts[n.type] = (counts[n.type] || 0) + 1; });
    const filterButtons = notes.length ? `
      <div class="chips type-filter" role="group" aria-label="Show note type">
        <button type="button" class="chip${typeFilter ? '' : ' chip-on'}" data-type-filter="">All (${notes.length})</button>
        ${Object.keys(Notes.TYPES).filter(function (t) { return counts[t]; }).map(function (t) {
          return '<button type="button" class="chip' + (typeFilter === t ? ' chip-on' : '') + '" data-type-filter="' + t + '">' +
            Notes.TYPES[t] + ' (' + counts[t] + ')</button>';
        }).join('')}
      </div>` : '';

    section.innerHTML = `
      <div class="page-header section-header">
        <h2>Notes <span class="muted">(${notes.length})</span></h2>
        <button type="button" class="btn btn-primary" data-add-note>+ Add note</button>
      </div>
      ${filterButtons}
      <div class="card-list">
        ${shown.length ? shown.map(function (n) { return Notes.card(n); }).join('')
          : '<div class="empty">No notes yet. Click “+ Add note” to write your first one.</div>'}
      </div>`;
  }

  section.addEventListener('click', async function (e) {
    const t = e.target.closest('button');
    if (!t) return;

    if (t.hasAttribute('data-add-note')) {
      Notes.openEditor(Notes.blankNote(source.id), source, draw);
    }
    if (t.dataset.typeFilter !== undefined) {
      typeFilter = t.dataset.typeFilter;
      draw();
    }
    if (t.dataset.editNote) {
      const note = await DB.get('notes', t.dataset.editNote);
      if (note) Notes.openEditor(note, source, draw);
    }
    if (t.dataset.deleteNote) {
      if (!confirm('Delete this note? This cannot be undone.')) return;
      await DB.remove('notes', t.dataset.deleteNote);
      App.toast('Note deleted');
      draw();
    }
  });

  await draw();

  // If we arrived from a search result (#/source/<id>/<noteId>),
  // scroll to that note and briefly highlight it.
  if (focusNoteId) {
    const el = section.querySelector('#note-' + CSS.escape(focusNoteId));
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.add('flash');
    }
  }
});

/* =====================================================================
   SCREEN: "Notes" in the menu — search across ALL notes from ALL sources
   Address: #/notes   (or #/notes/dowry to start with a search filled in)
   ===================================================================== */

// Make text easy to compare: lower-case, and remove accents so that
// "strīdhana" is found when she types "stridhana" (and the other way round).
Notes.plain = function (text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
};

// What she last searched for, remembered while the app is open
Notes.search = { q: '', type: '', tag: '', sourceId: '', sort: 'newest' };

App.register('notes', async function (main, startQuery) {
  const esc = App.esc;
  const s = Notes.search;
  if (startQuery !== null && startQuery !== undefined) s.q = startQuery;

  const [notes, sources] = await Promise.all([DB.getAll('notes'), DB.getAll('sources')]);
  // A quick way to find a source by its id
  const sourceById = {};
  sources.forEach(function (src) { sourceById[src.id] = src; });

  // Count how often each tag is used (for the tag list)
  const tagCounts = {};
  notes.forEach(function (n) { n.tags.forEach(function (t) { tagCounts[t] = (tagCounts[t] || 0) + 1; }); });
  const tags = Object.keys(tagCounts).sort(function (a, b) { return a.localeCompare(b); });

  // Only list sources that actually have notes
  const sourcesWithNotes = sources.filter(function (src) {
    return notes.some(function (n) { return n.sourceId === src.id; });
  }).sort(function (a, b) { return a.title.localeCompare(b.title); });

  function option(value, label, selected) {
    return '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  main.innerHTML = `
    <div class="container">
      <div class="page-header"><h1>Search notes</h1></div>

      <div class="filters notes-filters" role="search">
        <div class="filter-search">
          <label class="sr-only" for="s-q">Search all notes</label>
          <input type="search" id="s-q" placeholder="Search every note — e.g. dowry, property, Manusmriti…" value="${esc(s.q)}">
        </div>
        <div>
          <label class="sr-only" for="s-type">Note type</label>
          <select id="s-type">${option('', 'All note types', s.type)}${Object.entries(Notes.TYPES).map(function (p) { return option(p[0], p[1], s.type); }).join('')}</select>
        </div>
        <div>
          <label class="sr-only" for="s-tag">Tag</label>
          <select id="s-tag">${option('', 'All tags', s.tag)}${tags.map(function (t) { return option(t, '#' + t, s.tag); }).join('')}</select>
        </div>
        <div>
          <label class="sr-only" for="s-source">Source</label>
          <select id="s-source">${option('', 'All sources', s.sourceId)}${sourcesWithNotes.map(function (src) { return option(src.id, src.title, s.sourceId); }).join('')}</select>
        </div>
        <div>
          <label class="sr-only" for="s-sort">Sort</label>
          <select id="s-sort">
            ${option('newest', 'Newest first', s.sort)}${option('oldest', 'Oldest first', s.sort)}${option('source', 'By source & page', s.sort)}
          </select>
        </div>
      </div>

      ${tags.length ? `
        <details class="tag-cloud"${s.tag ? ' open' : ''}>
          <summary>All tags (${tags.length})</summary>
          <div class="chips">
            ${tags.map(function (t) {
              return '<button type="button" class="chip' + (s.tag === t ? ' chip-on' : '') + '" data-tag="' + esc(t) + '">#' + esc(t) + ' <span class="muted">' + tagCounts[t] + '</span></button>';
            }).join('')}
          </div>
        </details>` : ''}

      <div class="row list-bar">
        <span id="s-count" class="muted small"></span>
        <span class="spacer"></span>
        <button type="button" class="btn-link small" id="s-clear">Clear search</button>
      </div>
      <div id="s-results" class="card-list"></div>
    </div>`;

  const results = main.querySelector('#s-results');
  const count = main.querySelector('#s-count');

  function draw() {
    const words = Notes.plain(s.q).split(/\s+/).filter(Boolean);

    const found = notes.filter(function (n) {
      if (s.type && n.type !== s.type) return false;
      if (s.tag && !n.tags.includes(s.tag)) return false;
      if (s.sourceId && n.sourceId !== s.sourceId) return false;
      if (!words.length) return true;
      const src = sourceById[n.sourceId] || { title: '', authors: [] };
      // Search the note text, its tags and page, and the book's title & authors
      const haystack = Notes.plain([n.body, n.tags.join(' '), n.page, Notes.TYPES[n.type],
        src.title, src.authors.map(Library.displayName).join(' ')].join(' '));
      return words.every(function (w) { return haystack.includes(w); });
    });

    const sorters = {
      newest: function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); },
      oldest: function (a, b) { return a.createdAt.localeCompare(b.createdAt); },
      source: function (a, b) {
        const ta = (sourceById[a.sourceId] || {}).title || '', tb = (sourceById[b.sourceId] || {}).title || '';
        return ta.localeCompare(tb) || Notes.sortByPage(a, b);
      }
    };
    found.sort(sorters[s.sort] || sorters.newest);

    const sourceCount = new Set(found.map(function (n) { return n.sourceId; })).size;
    count.textContent = found.length + ' note' + (found.length === 1 ? '' : 's') +
      ' from ' + sourceCount + ' source' + (sourceCount === 1 ? '' : 's') +
      (found.length !== notes.length ? ' (of ' + notes.length + ' notes in total)' : '');

    if (!notes.length) {
      results.innerHTML = '<div class="empty">No notes yet. Open a source in the <a href="#/library">Library</a> and click “+ Add note”.</div>';
      return;
    }
    if (!found.length) {
      results.innerHTML = '<div class="empty">No notes match. Try fewer or different words.</div>';
      return;
    }
    results.innerHTML = found.map(function (n) {
      const src = sourceById[n.sourceId] || { id: n.sourceId, title: '(source deleted)', authors: [] };
      return Notes.card(n, { source: src, highlight: s.q, readOnly: true });
    }).join('');
  }

  // Wire up the search box and drop-downs
  const controls = { q: '#s-q', type: '#s-type', tag: '#s-tag', sourceId: '#s-source', sort: '#s-sort' };
  Object.keys(controls).forEach(function (key) {
    const el = main.querySelector(controls[key]);
    const update = function () { s[key] = el.value; draw(); };
    el.addEventListener(key === 'q' ? 'input' : 'change', key === 'q' ? App.debounce(update, 150) : update);
  });
  // Tag buttons: click to filter by that tag, click again to remove the filter
  main.firstElementChild.addEventListener('click', function (e) {
    const tagButton = e.target.closest('[data-tag]');
    if (!tagButton) return;
    s.tag = s.tag === tagButton.dataset.tag ? '' : tagButton.dataset.tag;
    App.render();
  });
  main.querySelector('#s-clear').addEventListener('click', function () {
    Notes.search = { q: '', type: '', tag: '', sourceId: '', sort: s.sort };
    if (location.hash === '#/notes') App.render(); else App.go('notes');
  });

  draw();
  // Put the cursor in the search box, ready to type
  const box = main.querySelector('#s-q');
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
});
