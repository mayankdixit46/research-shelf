/*
  themes.js — the THEMES BOARD.   Address: #/themes  or  #/themes/<theme name>

  Pick a theme and see, on one page:
    • every SOURCE tagged with that theme (themes are set in a source's Edit form)
    • every NOTE with a tag of the same name (e.g. a note tagged "Law & Policy")
    • optionally, every note from those sources
  This gathers material for one section of the literature review.

  At the bottom, "Manage themes" lets her add, rename or delete themes.
*/

const Themes = {
  // Her viewing choices, remembered while the app is open
  view: { group: 'source', includeAll: false },

  // Is this note tag the same as the theme name? (ignores capitals/accents)
  sameName: function (a, b) {
    return Notes.plain(a).trim() === Notes.plain(b).trim();
  },

  // Saved themes plus any theme used on a source but missing from the list
  allThemes: async function (sources) {
    const saved = await Library.getThemes();
    const used = sources.flatMap(function (s) { return s.themes; });
    return Array.from(new Set(saved.concat(used)));
  }
};

App.register('themes', async function (main, selected) {
  const esc = App.esc;
  const [sources, notes] = await Promise.all([DB.getAll('sources'), DB.getAll('notes')]);
  const themes = await Themes.allThemes(sources);
  const sourceById = {};
  sources.forEach(function (s) { sourceById[s.id] = s; });

  if (!selected || !themes.includes(selected)) selected = themes[0] || null;

  // Which sources and notes belong to a theme
  function sourcesFor(theme) {
    return sources.filter(function (s) { return s.themes.includes(theme); })
      .sort(function (a, b) { return a.title.localeCompare(b.title); });
  }
  function notesFor(theme, includeAllFromSources) {
    const ids = new Set(sourcesFor(theme).map(function (s) { return s.id; }));
    return notes.filter(function (n) {
      const tagged = n.tags.some(function (t) { return Themes.sameName(t, theme); });
      return tagged || (includeAllFromSources && ids.has(n.sourceId));
    });
  }

  // The row of theme buttons at the top, each with its counts
  const picker = themes.map(function (t) {
    return '<a class="chip theme-pick' + (t === selected ? ' chip-on' : '') + '" href="#/themes/' + encodeURIComponent(t) + '">' +
      esc(t) + ' <span class="count">' + sourcesFor(t).length + ' · ' + notesFor(t, false).length + '</span></a>';
  }).join('');

  let board = '<div class="empty">No themes yet. Add one below.</div>';
  if (selected) {
    const themeSources = sourcesFor(selected);
    board = `
      <div class="page-header section-header">
        <h2>${esc(selected)}</h2>
        <button type="button" class="btn" id="copy-outline" title="Copy everything on this board as plain text, to paste into Word or Google Docs">📋 Copy as outline</button>
      </div>

      <h3>Sources <span class="muted">(${themeSources.length})</span></h3>
      ${themeSources.length ? '<div class="card-grid compact-grid">' + themeSources.map(function (s) {
        return `
          <div class="card compact-card">
            <div class="card-top">
              <a class="source-title" href="#/source/${encodeURIComponent(s.id)}">${esc(s.title)}</a>
              ${Library.statusChip(s.status)}
            </div>
            <div class="source-meta">${esc(Library.authorsText(s.authors))}${s.year ? ' · ' + esc(s.year) : ''}</div>
          </div>`;
      }).join('') + '</div>'
        : '<p class="muted">No sources have this theme yet. Open a source, click “Edit details” and tick this theme.</p>'}

      <div class="row notes-bar">
        <h3>Notes <span class="muted" id="note-count"></span></h3>
        <span class="spacer"></span>
        <label class="inline-check"><input type="checkbox" id="include-all"${Themes.view.includeAll ? ' checked' : ''}> Also show all notes from these sources</label>
        <label class="sr-only" for="group-by">Group notes by</label>
        <select id="group-by" class="select-small">
          <option value="source"${Themes.view.group === 'source' ? ' selected' : ''}>Group by source</option>
          <option value="type"${Themes.view.group === 'type' ? ' selected' : ''}>Group by note type</option>
        </select>
      </div>
      <p class="small muted" style="margin-top:0">Notes appear here when they have the tag “${esc(selected)}”.</p>
      <div id="theme-notes"></div>`;
  }

  main.innerHTML = `
    <div class="container">
      <div class="page-header"><h1>Themes</h1></div>
      <p class="muted">Pick a theme to gather its sources and notes in one place — a first step toward your literature review.
        <span class="small">(Numbers show sources · notes.)</span></p>
      <nav class="chips theme-picker" aria-label="Themes">${picker}</nav>

      <section class="theme-board">${board}</section>

      <details class="manage-themes card">
        <summary><strong>Manage themes</strong> <span class="muted small">add, rename or delete</span></summary>
        <ul class="manage-list">
          ${themes.map(function (t) {
            return `
              <li>
                <span>${esc(t)}</span>
                <span class="spacer"></span>
                <button type="button" class="btn btn-small" data-rename="${esc(t)}">Rename</button>
                <button type="button" class="btn btn-small btn-danger" data-delete-theme="${esc(t)}">Delete</button>
              </li>`;
          }).join('')}
        </ul>
        <form id="add-theme" class="row">
          <label class="sr-only" for="new-theme">New theme name</label>
          <input type="text" id="new-theme" placeholder="New theme, e.g. Property rights" style="flex:1;min-width:12rem">
          <button type="submit" class="btn btn-primary">Add theme</button>
        </form>
      </details>
    </div>`;

  /* ---- Draw the notes for the chosen theme ---- */
  function drawNotes() {
    const box = main.querySelector('#theme-notes');
    if (!box) return;
    const list = notesFor(selected, Themes.view.includeAll);
    main.querySelector('#note-count').textContent = '(' + list.length + ')';
    if (!list.length) {
      box.innerHTML = '<div class="empty">No notes for this theme yet. When writing a note, add the tag “' + esc(selected) + '”.</div>';
      return;
    }
    // Put notes into groups, either by source or by note type
    const groups = {};
    list.forEach(function (n) {
      const key = Themes.view.group === 'type' ? n.type : n.sourceId;
      (groups[key] = groups[key] || []).push(n);
    });
    let keys = Object.keys(groups);
    if (Themes.view.group === 'type') {
      keys = Object.keys(Notes.TYPES).filter(function (t) { return groups[t]; });
    } else {
      keys.sort(function (a, b) { return ((sourceById[a] || {}).title || '').localeCompare((sourceById[b] || {}).title || ''); });
    }
    box.innerHTML = keys.map(function (key) {
      const heading = Themes.view.group === 'type' ? Notes.TYPES[key] : ((sourceById[key] || {}).title || '(source deleted)');
      return '<h4 class="group-heading">' + esc(heading) + ' <span class="muted">(' + groups[key].length + ')</span></h4>' +
        '<div class="card-list">' + groups[key].sort(Notes.sortByPage).map(function (n) {
          return Notes.card(n, { source: sourceById[n.sourceId] || { id: n.sourceId, title: '(source deleted)', authors: [] }, readOnly: true });
        }).join('') + '</div>';
    }).join('');
  }

  /* ---- Plain-text outline to paste into a document ---- */
  function outline() {
    const lines = ['THEME: ' + selected, '', 'SOURCES'];
    sourcesFor(selected).forEach(function (s) {
      lines.push('- ' + (Library.authorsText(s.authors) || 'Unknown author') + (s.year ? ' (' + s.year + ')' : '') + '. ' + s.title + '.');
    });
    lines.push('', 'NOTES');
    const list = notesFor(selected, Themes.view.includeAll).sort(function (a, b) {
      return ((sourceById[a.sourceId] || {}).title || '').localeCompare((sourceById[b.sourceId] || {}).title || '') || Notes.sortByPage(a, b);
    });
    list.forEach(function (n) {
      const s = sourceById[n.sourceId] || { title: '?', authors: [] };
      const who = s.authors[0] ? Library.surname(s.authors[0]) : s.title;
      lines.push('- [' + Notes.TYPES[n.type] + '] ' + Notes.snippet(n.body, 100000) +
        ' (' + who + (s.year ? ' ' + s.year : '') + (n.page ? ', p. ' + n.page : '') + ')');
    });
    return lines.join('\n');
  }

  if (selected) {
    main.querySelector('#include-all').addEventListener('change', function (e) { Themes.view.includeAll = e.target.checked; drawNotes(); });
    main.querySelector('#group-by').addEventListener('change', function (e) { Themes.view.group = e.target.value; drawNotes(); });
    main.querySelector('#copy-outline').addEventListener('click', function () { App.copy(outline()); });
    drawNotes();
  }

  /* ---- Managing themes ---- */
  main.querySelector('#add-theme').addEventListener('submit', async function (e) {
    e.preventDefault();
    const name = main.querySelector('#new-theme').value.trim();
    if (!name) return;
    if (themes.includes(name)) { App.toast('That theme already exists'); return; }
    await Library.addThemes([name]);
    App.toast('Theme added ✓');
    App.go('themes', name);
  });

  main.querySelector('.manage-list').addEventListener('click', async function (e) {
    const renameButton = e.target.closest('[data-rename]');
    const deleteButton = e.target.closest('[data-delete-theme]');

    if (renameButton) {
      const oldName = renameButton.dataset.rename;
      const newName = (prompt('Rename the theme “' + oldName + '” to:', oldName) || '').trim();
      if (!newName || newName === oldName) return;
      if (themes.includes(newName)) { App.toast('A theme with that name already exists'); return; }
      // Change the name in the theme list, on every source, and on note tags
      await DB.setSetting('themes', themes.map(function (t) { return t === oldName ? newName : t; }));
      for (const s of sources) {
        if (!s.themes.includes(oldName)) continue;
        s.themes = s.themes.map(function (t) { return t === oldName ? newName : t; });
        await DB.put('sources', s);
      }
      for (const n of notes) {
        if (!n.tags.some(function (t) { return Themes.sameName(t, oldName); })) continue;
        n.tags = n.tags.map(function (t) { return Themes.sameName(t, oldName) ? newName : t; });
        await DB.put('notes', n);
      }
      App.toast('Renamed ✓');
      App.go('themes', newName);
    }

    if (deleteButton) {
      const name = deleteButton.dataset.deleteTheme;
      const count = sourcesFor(name).length;
      const ok = confirm('Delete the theme “' + name + '”?\n\nIt will be removed from ' + count + ' source(s). ' +
        'The sources themselves are NOT deleted, and note tags are left as they are.');
      if (!ok) return;
      await DB.setSetting('themes', themes.filter(function (t) { return t !== name; }));
      for (const s of sources) {
        if (!s.themes.includes(name)) continue;
        s.themes = s.themes.filter(function (t) { return t !== name; });
        await DB.put('sources', s);
      }
      App.toast('Theme deleted');
      if (location.hash === '#/themes') App.render(); else App.go('themes');
    }
  });
});
