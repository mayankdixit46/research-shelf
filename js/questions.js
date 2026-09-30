/*
  questions.js — the RESEARCH QUESTIONS page.   Address: #/questions

  Each research question is saved like this:
    {
      id, text: 'How did colonial law change women's property rights?',
      status: 'draft' | 'refining' | 'final',
      thinking: 'her working notes about the question (formatting allowed)',
      versions: [ { text: 'an earlier wording', date: '…' } ],   ← kept automatically
      sourceIds: [...], noteIds: [...],                          ← linked material
      order: 1, createdAt, updatedAt
    }

  When she rewords a question, the old wording is saved in `versions`,
  so she can see how her question developed — useful for her supervisor.

  This file also adds a "Research questions" box to a source's page,
  listing the questions that source is linked to.
*/

const Questions = {
  STATUSES: { draft: 'Draft', refining: 'Refining', final: 'Final' },
  // Reuse the reading-status colours for the chips
  CHIP_CLASS: { draft: 'status-toread', refining: 'status-reading', final: 'status-finished' },

  statusChip: function (status) {
    return '<span class="chip status ' + (Questions.CHIP_CLASS[status] || '') + '">' + App.esc(Questions.STATUSES[status] || status) + '</span>';
  },

  getAll: async function () {
    const list = await DB.getAll('questions');
    return list.sort(function (a, b) { return a.order - b.order; });
  },

  /* ---- Pop-up: add or edit a question ---- */
  openEditor: function (question, afterSave) {
    const esc = App.esc;
    const isNew = !question.text;
    const box = App.dialog(`
      <form id="q-form" novalidate>
        <h2>${isNew ? 'New research question' : 'Edit research question'}</h2>
        <div class="field">
          <label for="q-text">Question</label>
          <textarea id="q-text" name="text" rows="3" style="min-height:4.5rem"
            placeholder="e.g. How did colonial legal reforms shape women's access to education in Bengal?">${esc(question.text)}</textarea>
          ${isNew ? '' : '<p class="hint">If you change the wording, the old version is kept under “Earlier versions”.</p>'}
        </div>
        <div class="field">
          <label for="q-status">Status</label>
          <select id="q-status" name="status">
            ${Object.entries(Questions.STATUSES).map(function (p) {
              return '<option value="' + p[0] + '"' + (p[0] === question.status ? ' selected' : '') + '>' + p[1] + '</option>';
            }).join('')}
          </select>
        </div>
        <div class="field">
          <label for="q-thinking">My thinking <span class="hint">why this matters, sub-questions, doubts — **bold**, “- ” lists work</span></label>
          <textarea id="q-thinking" name="thinking" rows="6">${esc(question.thinking)}</textarea>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn" data-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>`);

    const form = box.querySelector('#q-form');
    box.querySelector('[data-cancel]').addEventListener('click', function () { box.close(); });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const text = form.elements.text.value.trim();
      if (!text) { App.toast('Please write the question first'); form.elements.text.focus(); return; }
      // Keep the old wording if it changed
      if (question.text && question.text !== text) {
        question.versions.push({ text: question.text, date: App.now() });
      }
      question.text = text;
      question.status = form.elements.status.value;
      question.thinking = form.elements.thinking.value.trim();
      question.updatedAt = App.now();
      await DB.put('questions', question);
      box.close();
      App.toast('Saved ✓');
      afterSave();
    });
    form.elements.text.focus();
  },

  /* ---- Pop-up: tick items from a long list, with a search box ----
     items: [{ id, html, searchText }]   selected: array of ids */
  pickFrom: function (title, items, selected, onSave) {
    const esc = App.esc;
    const chosen = new Set(selected);
    const box = App.dialog(`
      <h2>${esc(title)}</h2>
      <input type="search" id="pick-search" placeholder="Type to filter…" aria-label="Filter the list">
      <p class="small muted" id="pick-count"></p>
      <div class="pick-list">
        ${items.length ? items.map(function (item) {
          return '<label class="pick-row" data-search="' + esc(Notes.plain(item.searchText)) + '">' +
            '<input type="checkbox" value="' + esc(item.id) + '"' + (chosen.has(item.id) ? ' checked' : '') + '>' +
            '<span>' + item.html + '</span></label>';
        }).join('') : '<p class="muted">Nothing to choose from yet.</p>'}
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="button" class="btn btn-primary" data-save>Save links</button>
      </div>`);

    const updateCount = function () { box.querySelector('#pick-count').textContent = chosen.size + ' selected'; };
    updateCount();
    box.querySelector('#pick-search').addEventListener('input', function (e) {
      const words = Notes.plain(e.target.value).split(/\s+/).filter(Boolean);
      box.querySelectorAll('.pick-row').forEach(function (row) {
        row.hidden = !words.every(function (w) { return row.dataset.search.includes(w); });
      });
    });
    box.querySelector('.pick-list').addEventListener('change', function (e) {
      if (e.target.checked) chosen.add(e.target.value); else chosen.delete(e.target.value);
      updateCount();
    });
    box.querySelector('[data-cancel]').addEventListener('click', function () { box.close(); });
    box.querySelector('[data-save]').addEventListener('click', async function () {
      await onSave(Array.from(chosen));
      box.close();
    });
    box.querySelector('#pick-search').focus();
  }
};

App.register('questions', async function (main) {
  const esc = App.esc;
  const [questions, sources, notes] = await Promise.all([Questions.getAll(), DB.getAll('sources'), DB.getAll('notes')]);
  const sourceById = {}, noteById = {};
  sources.forEach(function (s) { sourceById[s.id] = s; });
  notes.forEach(function (n) { noteById[n.id] = n; });

  function questionCard(q, index) {
    // Only show links to things that still exist
    const linkedSources = q.sourceIds.map(function (id) { return sourceById[id]; }).filter(Boolean);
    const linkedNotes = q.noteIds.map(function (id) { return noteById[id]; }).filter(Boolean);

    return `
      <article class="card question-card" data-qid="${esc(q.id)}">
        <div class="note-head">
          <span class="q-number">Q${index + 1}</span>
          ${Questions.statusChip(q.status)}
          <span class="spacer"></span>
          <button type="button" class="btn btn-small" data-move="-1" ${index === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button type="button" class="btn btn-small" data-move="1" ${index === questions.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button type="button" class="btn btn-small" data-edit>Edit</button>
          <button type="button" class="btn btn-small btn-danger" data-delete>Delete</button>
        </div>
        <h2 class="question-text">${esc(q.text)}</h2>
        ${q.thinking ? '<div class="note-body q-thinking">' + Notes.renderText(q.thinking) + '</div>' : ''}

        <div class="two-col q-links">
          <div>
            <h3>Sources <span class="muted">(${linkedSources.length})</span></h3>
            <ul class="link-list">
              ${linkedSources.map(function (s) {
                return '<li><a href="#/source/' + encodeURIComponent(s.id) + '">' + esc(s.title) + '</a>' +
                  '<span class="muted small"> — ' + esc(Library.authorsText(s.authors)) + '</span>' +
                  ' <button type="button" class="unlink" data-unlink-source="' + esc(s.id) + '" aria-label="Remove link" title="Remove link">×</button></li>';
              }).join('')}
            </ul>
            <button type="button" class="btn btn-small" data-link-sources>+ Link sources</button>
          </div>
          <div>
            <h3>Notes <span class="muted">(${linkedNotes.length})</span></h3>
            <ul class="link-list">
              ${linkedNotes.map(function (n) {
                const s = sourceById[n.sourceId] || { title: '(source deleted)' };
                return '<li>' + Notes.typeChip(n.type) + ' ' + esc(Notes.snippet(n.body, 140)) +
                  ' <a class="small" href="#/source/' + encodeURIComponent(n.sourceId) + '/' + encodeURIComponent(n.id) + '">' +
                  esc(s.title) + (n.page ? ', p. ' + esc(n.page) : '') + '</a>' +
                  ' <button type="button" class="unlink" data-unlink-note="' + esc(n.id) + '" aria-label="Remove link" title="Remove link">×</button></li>';
              }).join('')}
            </ul>
            <button type="button" class="btn btn-small" data-link-notes>+ Link notes</button>
          </div>
        </div>

        ${q.versions.length ? `
          <details class="versions">
            <summary class="small">Earlier versions (${q.versions.length})</summary>
            <ol reversed>
              ${q.versions.slice().reverse().map(function (v) {
                return '<li><span>' + esc(v.text) + '</span> <span class="muted small">— changed ' + esc(App.formatDate(v.date)) + '</span></li>';
              }).join('')}
            </ol>
          </details>` : ''}
      </article>`;
  }

  main.innerHTML = `
    <div class="container narrow">
      <div class="page-header">
        <h1>Research questions</h1>
        <button type="button" class="btn btn-primary" id="add-question">+ Add question</button>
      </div>
      <p class="muted">Write your questions, refine them over time, and link the sources and notes that help answer them.
        Earlier wordings are kept automatically.</p>
      <div class="card-list">
        ${questions.length ? questions.map(questionCard).join('')
          : '<div class="empty">No research questions yet. Click “+ Add question” to write your first one — it can be rough!</div>'}
      </div>
    </div>`;

  main.querySelector('#add-question').addEventListener('click', function () {
    const last = questions[questions.length - 1];
    Questions.openEditor({
      id: App.uid(), text: '', status: 'draft', thinking: '', versions: [],
      sourceIds: [], noteIds: [], order: last ? last.order + 1 : 1,
      createdAt: App.now(), updatedAt: App.now()
    }, App.render);
  });

  // One listener for all the buttons on all the question cards
  main.firstElementChild.addEventListener('click', async function (e) {
    const button = e.target.closest('button');
    const card = e.target.closest('[data-qid]');
    if (!button || !card) return;
    const index = questions.findIndex(function (q) { return q.id === card.dataset.qid; });
    const q = questions[index];
    const save = async function () { q.updatedAt = App.now(); await DB.put('questions', q); App.render(); };

    if (button.hasAttribute('data-edit')) Questions.openEditor(q, App.render);

    if (button.hasAttribute('data-delete')) {
      if (!confirm('Delete this research question?\n\n“' + q.text + '”\n\nLinked sources and notes are NOT deleted.')) return;
      await DB.remove('questions', q.id);
      App.toast('Question deleted');
      App.render();
    }

    if (button.dataset.move) {
      // Swap places with the question above or below
      const other = questions[index + Number(button.dataset.move)];
      if (!other) return;
      const temp = q.order; q.order = other.order; other.order = temp;
      await DB.put('questions', other);
      await save();
    }

    if (button.hasAttribute('data-link-sources')) {
      const items = sources.slice().sort(function (a, b) { return a.title.localeCompare(b.title); }).map(function (s) {
        return {
          id: s.id,
          html: '<strong>' + esc(s.title) + '</strong><br><span class="muted small">' + esc(Library.authorsText(s.authors)) + '</span>',
          searchText: s.title + ' ' + s.authors.join(' ')
        };
      });
      Questions.pickFrom('Link sources to this question', items, q.sourceIds, async function (ids) { q.sourceIds = ids; await save(); });
    }

    if (button.hasAttribute('data-link-notes')) {
      const items = notes.slice().sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); }).map(function (n) {
        const s = sourceById[n.sourceId] || { title: '', authors: [] };
        return {
          id: n.id,
          html: Notes.typeChip(n.type) + ' ' + esc(Notes.snippet(n.body, 160)) +
            '<br><span class="muted small">' + esc(s.title) + (n.page ? ', p. ' + esc(n.page) : '') + '</span>',
          searchText: n.body + ' ' + n.tags.join(' ') + ' ' + s.title + ' ' + Notes.TYPES[n.type]
        };
      });
      Questions.pickFrom('Link notes to this question', items, q.noteIds, async function (ids) { q.noteIds = ids; await save(); });
    }

    if (button.dataset.unlinkSource) {
      q.sourceIds = q.sourceIds.filter(function (id) { return id !== button.dataset.unlinkSource; });
      await save();
    }
    if (button.dataset.unlinkNote) {
      q.noteIds = q.noteIds.filter(function (id) { return id !== button.dataset.unlinkNote; });
      await save();
    }
  });
});

/* On each source's page: which research questions use this source? */
Library.sourceSections.push(async function questionsSection(container, source) {
  const questions = await Questions.getAll();
  const noteIds = new Set((await DB.notesForSource(source.id)).map(function (n) { return n.id; }));
  const linked = questions.filter(function (q) {
    return q.sourceIds.includes(source.id) || q.noteIds.some(function (id) { return noteIds.has(id); });
  });
  if (!linked.length) return;
  const section = document.createElement('section');
  section.innerHTML = '<h2>Research questions</h2><ul class="link-list">' + linked.map(function (q) {
    return '<li><a href="#/questions">' + App.esc(q.text) + '</a> ' + Questions.statusChip(q.status) + '</li>';
  }).join('') + '</ul>';
  // Put this box before the Notes section, so it isn't lost below many notes
  container.insertBefore(section, container.querySelector('.notes-section'));
});
