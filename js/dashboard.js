/*
  dashboard.js — the HOME page.   Address: #/dashboard (the page the app opens on)

  Shows at a glance:
    • a few totals (sources, notes, finished, questions)
    • what she is currently reading, with progress notes
    • her most recent notes
    • how many sources are in each reading status and each theme
    • a gentle reminder if she hasn't made a backup recently
*/

App.register('dashboard', async function (main) {
  const esc = App.esc;
  const [sources, notes, questions, themes] = await Promise.all([
    DB.getAll('sources'), DB.getAll('notes'), DB.getAll('questions'), Library.getThemes()
  ]);
  const sourceById = {};
  sources.forEach(function (s) { sourceById[s.id] = s; });

  const reading = sources.filter(function (s) { return s.status === 'reading'; })
    .sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
  const recentNotes = notes.slice().sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); }).slice(0, 5);
  const finished = sources.filter(function (s) { return s.status === 'finished'; }).length;

  // One horizontal bar per row: label, bar, number. `link` makes the label clickable.
  function bars(rows) {
    const max = Math.max(1, Math.max.apply(null, rows.map(function (r) { return r.count; })));
    return rows.map(function (r) {
      const width = r.count ? Math.max(3, Math.round(r.count / max * 100)) : 0;
      const tip = r.label + ': ' + r.count + ' source' + (r.count === 1 ? '' : 's');
      return `
        <a class="bar-row" href="${r.link}" title="${esc(tip)}">
          <span class="bar-label">${esc(r.label)}</span>
          <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${width}%"></span></span>
          <span class="bar-value">${r.count}</span>
        </a>`;
    }).join('');
  }

  // Backup reminder: never backed up (but has notes), or more than 14 days ago
  const last = Backup.lastBackup();
  const daysSince = last ? Math.floor((Date.now() - Date.parse(last)) / 86400000) : null;
  const needsBackup = notes.length > 0 && (daysSince === null || daysSince > 14);

  const statusRows = Object.keys(Library.STATUSES).map(function (key) {
    return { label: Library.STATUSES[key], count: sources.filter(function (s) { return s.status === key; }).length, link: '#/library', filter: { status: key } };
  });
  const themeRows = themes.map(function (t) {
    return { label: t, count: sources.filter(function (s) { return s.themes.includes(t); }).length, link: '#/themes/' + encodeURIComponent(t) };
  });

  main.innerHTML = `
    <div class="container">
      <div class="page-header">
        <h1>Your research</h1>
        <div class="row">
          <a class="btn" href="#/edit/new">+ Add source</a>
          <a class="btn" href="#/questions">Research questions</a>
        </div>
      </div>

      ${needsBackup ? `
        <div class="notice row">
          <span>💾 ${daysSince === null ? 'You haven’t made a backup yet.' : 'Your last backup was ' + daysSince + ' days ago.'}
            Your notes live only in this browser — a backup keeps them safe.</span>
          <span class="spacer"></span>
          <a class="btn btn-small" href="#/backup">Back up now</a>
        </div>` : ''}

      <form class="home-search" id="home-search" role="search">
        <label class="sr-only" for="home-q">Search all notes</label>
        <input type="search" id="home-q" placeholder="Search all your notes — e.g. dowry, Manusmriti, property…">
        <button type="submit" class="btn btn-primary">Search</button>
      </form>

      <div class="stat-grid">
        <a class="stat" href="#/library"><span class="stat-number">${sources.length}</span>sources</a>
        <a class="stat" href="#/notes"><span class="stat-number">${notes.length}</span>notes</a>
        <a class="stat" href="#/library" data-status="finished"><span class="stat-number">${finished}</span>finished</a>
        <a class="stat" href="#/questions"><span class="stat-number">${questions.length}</span>research questions</a>
      </div>

      <div class="two-col dash-cols">
        <section>
          <h2>Currently reading</h2>
          ${reading.length ? '<div class="card-list">' + reading.map(function (s) {
            return `
              <div class="card compact-card">
                <a class="source-title" href="#/source/${encodeURIComponent(s.id)}">${esc(s.title)}</a>
                <div class="source-meta">${esc(Library.authorsText(s.authors))}</div>
                ${s.progress ? '<p class="small progress-note">📍 ' + esc(s.progress) + '</p>' : ''}
              </div>`;
          }).join('') + '</div>'
            : '<div class="empty small">Nothing marked “Reading” yet. Open a source in the <a href="#/library">Library</a> and set its status.</div>'}
        </section>

        <section>
          <h2>Recent notes</h2>
          ${recentNotes.length ? '<div class="card-list">' + recentNotes.map(function (n) {
            const s = sourceById[n.sourceId] || { title: '(source deleted)' };
            return `
              <a class="card compact-card recent-note" href="#/source/${encodeURIComponent(n.sourceId)}/${encodeURIComponent(n.id)}">
                <div class="note-head">${Notes.typeChip(n.type)}<span class="note-page">${n.page ? 'p. ' + esc(n.page) : ''}</span></div>
                <div class="small">${esc(Notes.snippet(n.body, 140))}</div>
                <div class="source-meta small">${esc(s.title)} · ${esc(App.formatDate(n.createdAt))}</div>
              </a>`;
          }).join('') + '</div>'
            : '<div class="empty small">No notes yet. Open a source and click “+ Add note”.</div>'}
        </section>
      </div>

      <div class="two-col dash-cols">
        <section class="card">
          <h2 class="card-heading">Sources by reading status</h2>
          ${bars(statusRows)}
        </section>
        <section class="card">
          <h2 class="card-heading">Sources by theme</h2>
          ${themeRows.length ? bars(themeRows) : '<p class="muted small">No themes yet.</p>'}
        </section>
      </div>
    </div>`;

  // Status bars open the Library filtered by that status
  main.querySelectorAll('.bar-row').forEach(function (link, i) {
    if (i >= statusRows.length) return;
    link.addEventListener('click', function () {
      Library.filters = { q: '', theme: '', author: '', status: statusRows[i].filter.status, type: '', copy: '', sort: Library.filters.sort };
    });
  });
  const finishedTile = main.querySelector('[data-status="finished"]');
  finishedTile.addEventListener('click', function () {
    Library.filters = { q: '', theme: '', author: '', status: 'finished', type: '', copy: '', sort: Library.filters.sort };
  });
  // Search box → the Notes search screen, with the words filled in
  main.querySelector('#home-search').addEventListener('submit', function (e) {
    e.preventDefault();
    const q = main.querySelector('#home-q').value.trim();
    Notes.search.q = q;
    App.go('notes');
  });
});
