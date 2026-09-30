/*
  backup.js — EXPORT and IMPORT all data.   Address: #/backup

  Her data lives only inside this browser on this computer. So:
    • "Export all data" saves EVERYTHING into one .json file (a backup).
    • "Import data" reads such a file back — to restore a backup, or to
      move her work to another computer or browser.

  The backup file looks like this:
    { "app": "research-shelf", "version": 1, "exportedAt": "…",
      "data": { "sources": [...], "notes": [...], "questions": [...],
                "matrix": [...], "settings": [...] } }

  SAFETY: an imported file is checked and cleaned before anything is
  saved, and "Replace" first downloads a copy of the current data.
*/

const Backup = {
  FORMAT_VERSION: 1,
  LABELS: { sources: 'sources', notes: 'notes', questions: 'research questions', matrix: 'matrix rows', settings: 'settings' },

  // Collect everything from every drawer of the database.
  // Attached files are included only if `includeFiles` is true: each file
  // is turned into text ("base64") so it fits inside the backup file.
  collect: async function (includeFiles) {
    const data = {};
    for (const store of DB.STORES) {
      if (store === 'files') continue;
      data[store] = await DB.getAll(store);
    }
    if (includeFiles) {
      data.files = [];
      for (const f of await DB.getAll('files')) {
        data.files.push({ id: f.id, sourceId: f.sourceId, name: f.name, type: f.type, size: f.size,
          addedAt: f.addedAt, base64: await Files.toBase64(f.blob) });
      }
    }
    return { app: 'research-shelf', version: Backup.FORMAT_VERSION, exportedAt: App.now(), data: data };
  },

  exportAll: async function (fileLabel, includeFiles) {
    const backup = await Backup.collect(includeFiles);
    App.download('research-shelf-' + (fileLabel || 'backup') + '-' + App.today() + '.json',
      JSON.stringify(backup, null, 2), 'application/json');
    try { localStorage.setItem('lastBackup', App.now()); } catch (e) { /* storage blocked */ }
  },

  lastBackup: function () {
    try { return localStorage.getItem('lastBackup'); } catch (e) { return null; }
  },

  /* ---- Checking and cleaning an imported file ----
     We rebuild every record from scratch, keeping only the fields we know
     and making sure each has the right kind of value (text, list…).
     Anything strange is dropped, so a damaged file can't break the app. */
  clean: function (json) {
    if (!json || json.app !== 'research-shelf' || typeof json.data !== 'object' || !json.data) {
      throw new Error('This is not a Research Shelf backup file.');
    }
    const d = json.data;
    const str = function (v) { return v == null ? '' : String(v); };
    const strList = function (v) { return Array.isArray(v) ? v.map(str).filter(Boolean) : []; };
    const list = function (v) { return Array.isArray(v) ? v.filter(function (x) { return x && typeof x === 'object'; }) : []; };
    const date = function (v) { return typeof v === 'string' && !isNaN(Date.parse(v)) ? v : App.now(); };
    const pick = function (value, allowed, fallback) { return Object.prototype.hasOwnProperty.call(allowed, value) ? value : fallback; };

    const sources = list(d.sources).filter(function (s) { return s.id && s.title; }).map(function (s) {
      const clean = Library.blankSource();
      Object.keys(clean).forEach(function (k) {
        if (Array.isArray(clean[k])) clean[k] = strList(s[k]);
        else clean[k] = str(s[k]);
      });
      clean.id = str(s.id);
      clean.type = pick(clean.type, Library.TYPES, 'book');
      clean.status = pick(clean.status, Library.STATUSES, 'toread');
      clean.foundAt = pick(clean.foundAt, Library.FOUND, 'other');
      clean.createdAt = date(s.createdAt);
      clean.updatedAt = date(s.updatedAt);
      return clean;
    });

    const notes = list(d.notes).filter(function (n) { return n.id && n.sourceId; }).map(function (n) {
      return {
        id: str(n.id), sourceId: str(n.sourceId), type: pick(str(n.type), Notes.TYPES, 'summary'),
        page: str(n.page), tags: strList(n.tags), body: str(n.body),
        createdAt: date(n.createdAt), updatedAt: date(n.updatedAt)
      };
    });

    const questions = list(d.questions).filter(function (q) { return q.id && q.text; }).map(function (q, i) {
      return {
        id: str(q.id), text: str(q.text), status: pick(str(q.status), Questions.STATUSES, 'draft'),
        thinking: str(q.thinking),
        versions: list(q.versions).map(function (v) { return { text: str(v.text), date: date(v.date) }; }),
        sourceIds: strList(q.sourceIds), noteIds: strList(q.noteIds),
        order: typeof q.order === 'number' ? q.order : i + 1,
        createdAt: date(q.createdAt), updatedAt: date(q.updatedAt)
      };
    });

    const matrix = list(d.matrix).filter(function (r) { return r.sourceId; }).map(function (r) {
      const cells = {};
      if (r.cells && typeof r.cells === 'object') Object.keys(r.cells).forEach(function (k) { cells[k] = str(r.cells[k]); });
      return { sourceId: str(r.sourceId), cells: cells, updatedAt: date(r.updatedAt) };
    });

    // Attached files (only if the backup has them). Turned back from text
    // into real files. The file type is kept, but Files.open() still
    // refuses to display anything that isn't a PDF, picture or plain text.
    let files;
    if (Array.isArray(d.files)) {
      files = list(d.files).filter(function (f) { return f.id && f.sourceId && typeof f.base64 === 'string'; }).map(function (f) {
        const type = str(f.type).slice(0, 100);
        const blob = Files.fromBase64(f.base64, type);
        return { id: str(f.id), sourceId: str(f.sourceId), name: str(f.name) || 'file', type: type,
          size: blob.size, blob: blob, addedAt: date(f.addedAt) };
      });
    }

    // Settings: only the ones the app uses
    const settings = [];
    list(d.settings).forEach(function (row) {
      if (row.key === 'themes') settings.push({ key: 'themes', value: strList(row.value) });
      if (row.key === 'matrixColumns' && Array.isArray(row.value)) {
        settings.push({ key: 'matrixColumns', value: list(row.value).filter(function (c) { return c.id && c.name; })
          .map(function (c) { return { id: str(c.id), name: str(c.name) }; }) });
      }
    });
    // An imported library counts as "already set up" — don't add the 10 starting books again
    settings.push({ key: 'seeded', value: true });

    const cleaned = { sources: sources, notes: notes, questions: questions, matrix: matrix, settings: settings };
    if (files) cleaned.files = files; // no "files" key = leave her current files alone
    return cleaned;
  },

  // MERGE: add what's new; where the same item exists in both, keep the
  // more recently edited version. Nothing is deleted.
  merge: async function (incoming) {
    const counts = { added: 0, updated: 0, kept: 0 };
    for (const store of ['sources', 'notes', 'questions', 'matrix']) {
      const key = store === 'matrix' ? 'sourceId' : 'id';
      const current = {};
      (await DB.getAll(store)).forEach(function (r) { current[r[key]] = r; });
      for (const record of incoming[store]) {
        const existing = current[record[key]];
        if (!existing) { await DB.put(store, record); counts.added++; }
        else if ((record.updatedAt || '') > (existing.updatedAt || '')) { await DB.put(store, record); counts.updated++; }
        else counts.kept++;
      }
    }
    // Files never change once attached, so just add the ones not here yet
    if (incoming.files) {
      const have = new Set((await DB.getAll('files')).map(function (f) { return f.id; }));
      for (const f of incoming.files) {
        if (have.has(f.id)) { counts.kept++; continue; }
        await DB.put('files', f);
        counts.added++;
      }
    }

    // Themes: combine both lists. Matrix columns: add any new columns.
    const themes = incoming.settings.find(function (s) { return s.key === 'themes'; });
    if (themes) await Library.addThemes(themes.value);
    const cols = incoming.settings.find(function (s) { return s.key === 'matrixColumns'; });
    if (cols) {
      const mine = await Matrix.getColumns();
      cols.value.forEach(function (c) { if (!mine.some(function (m) { return m.id === c.id; })) mine.push(c); });
      await DB.setSetting('matrixColumns', mine);
    }
    await DB.setSetting('seeded', true);
    return counts;
  }
};

App.register('backup', async function (main) {
  const esc = App.esc;
  const backup = await Backup.collect(false);
  const files = await DB.getAll('files');
  const filesSize = files.reduce(function (sum, f) { return sum + (f.size || 0); }, 0);
  const last = Backup.lastBackup();
  let persisted = null, estimate = null;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) { /* ignore */ }
  try { estimate = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { /* ignore */ }

  const countList = ['sources', 'notes', 'questions', 'matrix'].map(function (k) {
    return '<li><strong>' + backup.data[k].length + '</strong> ' + Backup.LABELS[k] + '</li>';
  }).join('') + '<li><strong>' + files.length + '</strong> attached files' + (files.length ? ' (' + Files.size(filesSize) + ')' : '') + '</li>';

  main.innerHTML = `
    <div class="container narrow">
      <h1>Backup</h1>
      <p class="muted">Your work is saved only in this browser, on this computer. Nothing is uploaded anywhere.
        Export a backup regularly — for example, every week — and keep it somewhere safe (a USB stick, Google Drive, or email it to yourself).</p>

      <section class="card">
        <h2 class="card-heading">Export all data</h2>
        <p>Saves everything into one file in your Downloads folder:</p>
        <ul class="count-list">${countList}</ul>
        ${files.length ? `
          <label class="inline-check include-files"><input type="checkbox" id="include-files" ${filesSize < 300 * 1024 * 1024 ? 'checked' : ''}>
            Include my attached files (${Files.size(filesSize)}) <span class="hint">— makes the backup about ${Files.size(Math.round(filesSize * 1.34))}. Untick for a small, notes-only backup.</span></label>` : ''}
        <p class="small muted">Last backup from this browser: <strong>${last ? esc(App.formatDate(last)) : 'never'}</strong></p>
        <button type="button" class="btn btn-primary" id="export">⬇ Export all data</button>
      </section>

      <section class="card">
        <h2 class="card-heading">Import data</h2>
        <p>Open a backup file (<code>research-shelf-….json</code>) to restore your work, or to move it to another computer or browser.</p>
        <div class="field">
          <label for="import-file">Backup file</label>
          <input type="file" id="import-file" accept=".json,application/json">
        </div>
        <fieldset class="import-mode">
          <legend>How to import</legend>
          <label class="radio"><input type="radio" name="mode" value="merge" checked>
            <span><strong>Combine</strong> with what's here <span class="hint">— adds new items; where an item is in both, keeps the most recently edited version. Nothing is deleted.</span></span></label>
          <label class="radio"><input type="radio" name="mode" value="replace">
            <span><strong>Replace</strong> everything here with the file <span class="hint">— a copy of your current data is downloaded first, just in case.</span></span></label>
        </fieldset>
        <button type="button" class="btn btn-primary" id="import" disabled>⬆ Import</button>
        <p id="import-result" class="import-result" role="status" hidden></p>
      </section>

      <section class="card">
        <h2 class="card-heading">Storage</h2>
        <p class="small">${persisted === true
          ? '✓ This browser has agreed to keep your data even when the computer is low on space.'
          : 'This browser may clear site data if the computer runs very low on space, or if you clear your browsing history. Regular backups protect you.'}</p>
        ${estimate && estimate.quota ? '<p class="small">This app is using <strong>' + Files.size(estimate.usage || 0) + '</strong> of about ' + Files.size(estimate.quota) + ' the browser allows.</p>' : ''}
        <p class="small muted">Tip: clearing “cookies and site data” in the browser settings will also delete this app's data. Export first!</p>
      </section>

      <details class="card danger-zone">
        <summary><strong>Delete all data</strong></summary>
        <p class="small">Removes every source, note, question, matrix cell and attached file from this browser. The 10 starting books will be added again afterwards.
          This cannot be undone — export a backup first.</p>
        <button type="button" class="btn btn-danger" id="wipe">Delete everything…</button>
      </details>
    </div>`;

  const fileInput = main.querySelector('#import-file');
  const importButton = main.querySelector('#import');
  const result = main.querySelector('#import-result');

  function showResult(message, isError) {
    result.hidden = false;
    result.className = 'import-result ' + (isError ? 'is-error' : 'is-ok');
    result.textContent = message;
  }

  main.querySelector('#export').addEventListener('click', async function () {
    const box = main.querySelector('#include-files');
    const withFiles = !!(box && box.checked);
    if (withFiles) App.toast('Preparing backup with files…');
    await Backup.exportAll('backup', withFiles);
    App.toast('Backup saved to your Downloads ✓');
    App.render();
  });

  fileInput.addEventListener('change', function () {
    importButton.disabled = !fileInput.files.length;
    result.hidden = true;
  });

  importButton.addEventListener('click', async function () {
    const file = fileInput.files[0];
    if (!file) return;
    let incoming;
    try {
      incoming = Backup.clean(JSON.parse(await file.text()));
    } catch (error) {
      showResult('Could not read this file: ' + (error instanceof SyntaxError ? 'it is not a valid backup file.' : error.message), true);
      return;
    }
    const summary = incoming.sources.length + ' sources, ' + incoming.notes.length + ' notes, ' + incoming.questions.length + ' questions' +
      (incoming.files ? ', ' + incoming.files.length + ' files' : ' (no files in this backup — your attached files are kept)');
    const mode = main.querySelector('input[name="mode"]:checked').value;

    try {
      if (mode === 'replace') {
        const ok = confirm('Replace ALL data in this browser with the file?\n\nThe file has ' + summary + '.\n\n' +
          'A copy of your current data will be downloaded first.');
        if (!ok) return;
        await Backup.exportAll('before-import', true);
        await DB.replaceAll(incoming);
        showResult('Done ✓ Replaced your data with ' + summary + '.', false);
      } else {
        const counts = await Backup.merge(incoming);
        showResult('Done ✓ ' + counts.added + ' items added, ' + counts.updated + ' updated with newer versions, ' +
          counts.kept + ' already up to date.', false);
      }
      App.toast('Import finished ✓');
      fileInput.value = '';
      importButton.disabled = true;
    } catch (error) {
      console.error(error);
      showResult('Import failed: ' + error.message + '. Your data was not changed.', true);
    }
  });

  main.querySelector('#wipe').addEventListener('click', async function () {
    const typed = prompt('This deletes ALL your sources, notes, questions and matrix cells in this browser.\n\nType DELETE to confirm:');
    if (typed !== 'DELETE') { if (typed !== null) App.toast('Not deleted — you need to type DELETE'); return; }
    const empty = {};
    DB.STORES.forEach(function (name) { empty[name] = []; });
    await DB.replaceAll(empty);
    for (const job of App.startupJobs) await job(); // adds the 10 starting books again
    App.toast('All data deleted');
    App.go('dashboard');
  });
});
