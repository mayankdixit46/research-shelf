/*
  matrix.js — the LITERATURE REVIEW MATRIX.   Address: #/matrix

  A table: one ROW per source, and COLUMNS she chooses
  (e.g. "Main argument", "Time period", "Method", "Relevance to my research").
  She types straight into the cells; everything saves automatically.

  How it's stored:
    settings → key 'matrixColumns', value [{ id, name }, …]   (the columns)
    matrix   → one record per source: { sourceId, cells: { columnId: 'text' } }

  "Export CSV" saves the table as a .csv file that opens in Excel,
  Google Sheets, LibreOffice or Numbers.
*/

const Matrix = {
  DEFAULT_COLUMNS: ['Main argument', 'Time period', 'Method', 'Relevance to my research'],

  filters: { q: '', theme: '', status: '' },
  // On phones a table is awkward, so we start with "cards" there
  view: window.innerWidth < 760 ? 'cards' : 'table',

  getColumns: async function () {
    let columns = await DB.getSetting('matrixColumns', null);
    if (!columns) {
      columns = Matrix.DEFAULT_COLUMNS.map(function (name) { return { id: App.uid(), name: name }; });
      await DB.setSetting('matrixColumns', columns);
    }
    return columns;
  },

  /* ---- CSV (comma-separated values) ----
     Every value is wrapped in "quotes", and quotes inside are doubled,
     so commas and line breaks in her text don't break the table. */
  csvValue: function (value) {
    let text = String(value == null ? '' : value);
    // Safety: a cell starting with = + or @ could be run as a formula by
    // Excel, so we put an apostrophe in front (Excel hides it).
    if (/^[=+@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  },
  toCsv: function (rows) {
    // ﻿ at the start tells Excel the file is UTF-8, so accents like ī show correctly
    return '﻿' + rows.map(function (r) { return r.map(Matrix.csvValue).join(','); }).join('\r\n');
  }
};

App.register('matrix', async function (main) {
  const esc = App.esc;
  const [sources, records, themes] = await Promise.all([DB.getAll('sources'), DB.getAll('matrix'), Library.getThemes()]);
  let columns = await Matrix.getColumns();
  const f = Matrix.filters;

  // Cells for each source, kept in memory while she types
  const cellsFor = {};
  records.forEach(function (r) { cellsFor[r.sourceId] = r; });
  function record(sourceId) {
    if (!cellsFor[sourceId]) cellsFor[sourceId] = { sourceId: sourceId, cells: {}, updatedAt: App.now() };
    return cellsFor[sourceId];
  }

  const firstSurname = function (s) { return (s.authors[0] ? Library.surname(s.authors[0]) : '~').toLowerCase(); };
  sources.sort(function (a, b) { return firstSurname(a).localeCompare(firstSurname(b)) || a.title.localeCompare(b.title); });

  function visibleSources() {
    const words = Notes.plain(f.q).split(/\s+/).filter(Boolean);
    return sources.filter(function (s) {
      if (f.theme && !s.themes.includes(f.theme)) return false;
      if (f.status && s.status !== f.status) return false;
      const text = Notes.plain(s.title + ' ' + s.authors.map(Library.displayName).join(' '));
      return words.every(function (w) { return text.includes(w); });
    });
  }

  function option(value, label, selected) {
    return '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  main.innerHTML = `
    <div class="container wide">
      <div class="page-header">
        <h1>Literature review matrix</h1>
        <div class="row">
          <button type="button" class="btn" id="add-column">+ Add column</button>
          <button type="button" class="btn btn-primary" id="export-csv">⬇ Export CSV</button>
        </div>
      </div>
      <p class="muted">Compare your sources side by side. Type in any cell — it saves by itself.
        <span id="save-state" class="save-state" aria-live="polite"></span></p>

      <div class="filters matrix-filters" role="search">
        <div class="filter-search">
          <label class="sr-only" for="m-q">Filter sources</label>
          <input type="search" id="m-q" placeholder="Filter by title or author…" value="${esc(f.q)}">
        </div>
        <div>
          <label class="sr-only" for="m-theme">Theme</label>
          <select id="m-theme">${option('', 'All themes', f.theme)}${themes.map(function (t) { return option(t, t, f.theme); }).join('')}</select>
        </div>
        <div>
          <label class="sr-only" for="m-status">Status</label>
          <select id="m-status">${option('', 'Any status', f.status)}${Object.entries(Library.STATUSES).map(function (p) { return option(p[0], p[1], f.status); }).join('')}</select>
        </div>
        <div class="view-toggle mini-tabs" role="tablist" aria-label="View">
          <button type="button" role="tab" data-view="table" aria-selected="${Matrix.view === 'table'}">Table</button>
          <button type="button" role="tab" data-view="cards" aria-selected="${Matrix.view === 'cards'}">Cards</button>
        </div>
      </div>

      <p class="small muted" id="m-count"></p>
      <div id="matrix-area"></div>
    </div>`;

  const area = main.querySelector('#matrix-area');
  const saveState = main.querySelector('#save-state');

  /* ---- Saving while she types ----
     We wait until she pauses for half a second, then save that row. */
  const saveTimers = {};
  function scheduleSave(sourceId) {
    saveState.textContent = 'Saving…';
    clearTimeout(saveTimers[sourceId]);
    saveTimers[sourceId] = setTimeout(async function () {
      const r = record(sourceId);
      r.updatedAt = App.now();
      await DB.put('matrix', r);
      saveState.textContent = 'All changes saved ✓';
    }, 500);
  }

  // Grow a text box to fit its text
  function autoSize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 2 + 'px';
  }

  function cellBox(sourceId, column, label) {
    const value = record(sourceId).cells[column.id] || '';
    return '<textarea class="cell" rows="2" data-source="' + esc(sourceId) + '" data-col="' + esc(column.id) + '"' +
      ' aria-label="' + esc(label) + '">' + esc(value) + '</textarea>';
  }

  function sourceLabel(s) {
    return '<a class="source-title" href="#/source/' + encodeURIComponent(s.id) + '">' + esc(s.title) + '</a>' +
      '<div class="source-meta">' + esc(Library.authorsText(s.authors) || 'Author not set') + (s.year ? ' · ' + esc(s.year) : '') + '</div>';
  }

  /* ---- Draw the table (or cards) ---- */
  function draw() {
    const list = visibleSources();
    main.querySelector('#m-count').textContent = 'Showing ' + list.length + ' of ' + sources.length + ' sources · ' + columns.length + ' columns';

    if (!columns.length) {
      area.innerHTML = '<div class="empty">No columns yet. Click “+ Add column”, e.g. “Main argument”.</div>';
      return;
    }
    if (!list.length) {
      area.innerHTML = '<div class="empty">No sources match these filters.</div>';
      return;
    }

    if (Matrix.view === 'table') {
      area.innerHTML = `
        <div class="table-wrap matrix-wrap">
          <table class="matrix">
            <thead>
              <tr>
                <th class="sticky-col" scope="col">Source</th>
                ${columns.map(function (c, i) {
                  return `
                    <th scope="col">
                      <div class="col-head">
                        <span>${esc(c.name)}</span>
                        <span class="col-tools">
                          <button type="button" data-col-move="-1" data-col-id="${esc(c.id)}" ${i === 0 ? 'disabled' : ''} title="Move left" aria-label="Move ${esc(c.name)} left">←</button>
                          <button type="button" data-col-move="1" data-col-id="${esc(c.id)}" ${i === columns.length - 1 ? 'disabled' : ''} title="Move right" aria-label="Move ${esc(c.name)} right">→</button>
                          <button type="button" data-col-rename="${esc(c.id)}" title="Rename" aria-label="Rename ${esc(c.name)}">✎</button>
                          <button type="button" data-col-delete="${esc(c.id)}" title="Delete column" aria-label="Delete ${esc(c.name)}">×</button>
                        </span>
                      </div>
                    </th>`;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${list.map(function (s) {
                return '<tr><th class="sticky-col" scope="row">' + sourceLabel(s) + '</th>' +
                  columns.map(function (c) { return '<td>' + cellBox(s.id, c, c.name + ' — ' + s.title) + '</td>'; }).join('') + '</tr>';
              }).join('')}
            </tbody>
          </table>
        </div>`;
    } else {
      // Cards: one card per source, each column is a labelled box
      area.innerHTML = '<div class="card-list">' + list.map(function (s) {
        return '<article class="card matrix-card">' + sourceLabel(s) +
          columns.map(function (c) {
            const id = 'mc-' + s.id + '-' + c.id;
            return '<div class="field"><label for="' + esc(id) + '">' + esc(c.name) + '</label>' +
              cellBox(s.id, c, c.name + ' — ' + s.title).replace('<textarea ', '<textarea id="' + esc(id) + '" ') + '</div>';
          }).join('') + '</article>';
      }).join('') + '</div>';
    }
    area.querySelectorAll('textarea.cell').forEach(autoSize);
  }

  // Typing in any cell
  area.addEventListener('input', function (e) {
    const box = e.target;
    if (!box.classList.contains('cell')) return;
    record(box.dataset.source).cells[box.dataset.col] = box.value;
    autoSize(box);
    scheduleSave(box.dataset.source);
  });

  // Leaving a cell saves it straight away (no waiting)
  area.addEventListener('focusout', async function (e) {
    const box = e.target;
    if (!box.classList.contains('cell') || !saveTimers[box.dataset.source]) return;
    clearTimeout(saveTimers[box.dataset.source]);
    delete saveTimers[box.dataset.source];
    await DB.put('matrix', record(box.dataset.source));
    saveState.textContent = 'All changes saved ✓';
  });

  /* ---- Column buttons: move, rename, delete ---- */
  async function saveColumns() {
    await DB.setSetting('matrixColumns', columns);
    draw();
  }

  area.addEventListener('click', async function (e) {
    const b = e.target.closest('button');
    if (!b) return;

    if (b.dataset.colMove) {
      const i = columns.findIndex(function (c) { return c.id === b.dataset.colId; });
      const j = i + Number(b.dataset.colMove);
      if (j < 0 || j >= columns.length) return;
      const moved = columns.splice(i, 1)[0];
      columns.splice(j, 0, moved);
      await saveColumns();
    }

    if (b.dataset.colRename) {
      const column = columns.find(function (c) { return c.id === b.dataset.colRename; });
      const name = (prompt('Rename the column “' + column.name + '” to:', column.name) || '').trim();
      if (!name || name === column.name) return;
      column.name = name;
      await saveColumns();
    }

    if (b.dataset.colDelete) {
      const column = columns.find(function (c) { return c.id === b.dataset.colDelete; });
      const filled = Object.values(cellsFor).filter(function (r) { return (r.cells[column.id] || '').trim(); }).length;
      const ok = confirm('Delete the column “' + column.name + '”?' +
        (filled ? '\n\n' + filled + ' cell(s) in this column have text, which will be deleted. This cannot be undone.' : ''));
      if (!ok) return;
      columns = columns.filter(function (c) { return c.id !== column.id; });
      for (const r of Object.values(cellsFor)) {
        if (!(column.id in r.cells)) continue;
        delete r.cells[column.id];
        await DB.put('matrix', r);
      }
      await saveColumns();
    }
  });

  main.querySelector('#add-column').addEventListener('click', async function () {
    const name = (prompt('Name of the new column (e.g. “Sources used”, “Key concepts”, “Gaps”):') || '').trim();
    if (!name) return;
    columns.push({ id: App.uid(), name: name });
    await saveColumns();
    App.toast('Column added ✓');
  });

  /* ---- Export the rows currently shown as a CSV file ---- */
  main.querySelector('#export-csv').addEventListener('click', function () {
    const header = ['Authors', 'Title', 'Year', 'Type', 'Published in / Publisher', 'Themes', 'Status']
      .concat(columns.map(function (c) { return c.name; }));
    const rows = visibleSources().map(function (s) {
      const cells = record(s.id).cells;
      return [
        Library.authorsText(s.authors), s.title, s.year, Library.TYPES[s.type],
        s.type === 'article' ? s.journal : (s.containerTitle || s.publisher),
        s.themes.join('; '), Library.STATUSES[s.status]
      ].concat(columns.map(function (c) { return cells[c.id] || ''; }));
    });
    App.download('literature-matrix-' + App.today() + '.csv', Matrix.toCsv([header].concat(rows)), 'text/csv');
    App.toast('CSV saved to your Downloads ✓');
  });

  /* ---- Filters and view switch ---- */
  const controls = { q: '#m-q', theme: '#m-theme', status: '#m-status' };
  Object.keys(controls).forEach(function (key) {
    const el = main.querySelector(controls[key]);
    const update = function () { f[key] = el.value; draw(); };
    el.addEventListener(key === 'q' ? 'input' : 'change', key === 'q' ? App.debounce(update, 150) : update);
  });
  main.querySelector('.view-toggle').addEventListener('click', function (e) {
    const view = e.target.dataset.view;
    if (!view) return;
    Matrix.view = view;
    main.querySelectorAll('.view-toggle button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.view === view)); });
    draw();
  });

  draw();
});
