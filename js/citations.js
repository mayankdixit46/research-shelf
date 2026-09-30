/*
  citations.js — CITATIONS and BIBLIOGRAPHY EXPORT.   Address: #/citations

  1. Makes a citation for any source in three styles:
       APA 7th edition · MLA 9th edition · Chicago 17th edition (bibliography entry)
  2. Exports a bibliography as BibTeX (.bib) or RIS (.ris) — files that
     Zotero, Mendeley, EndNote and LaTeX can import.
  3. Adds a "Cite this" box to every source's page.

  IMPORTANT: a citation is only as good as the details entered. Blank
  fields are simply left out, and titles are used exactly as typed
  (APA wants "Sentence case" titles, MLA and Chicago want "Title Case" —
  the app can't reliably change this because of names like "India").
  Always give citations a final check before submitting work.

  How the formatting works: each style function builds the citation in
  HTML (with <i> for italics). A plain-text copy is made from it too.
*/

const Cite = {
  STYLES: { apa: 'APA 7', mla: 'MLA 9', chicago: 'Chicago' },

  /* ------------ Small text helpers ------------ */

  // Split "Roy, Kumkum" into { family: 'Roy', given: 'Kumkum' }.
  // Names without a comma (e.g. "Indira (M.A.)") are kept whole.
  parseName: function (name) {
    const i = name.indexOf(',');
    if (i < 0) return { family: name.trim(), given: '', single: true };
    return { family: name.slice(0, i).trim(), given: name.slice(i + 1).trim(), single: false };
  },

  // "Elizabeth M." → "E. M."   "Jean-Paul" → "J.-P."
  initials: function (given) {
    return given.split(/\s+/).filter(Boolean).map(function (part) {
      return part.split('-').map(function (p) { return p.charAt(0).toUpperCase() + '.'; }).join('-');
    }).join(' ');
  },

  // Add a full stop unless the text already ends with . ? or !
  period: function (text) {
    return /[.?!]$/.test(text.replace(/<[^>]+>/g, '').trim()) ? text : text + '.';
  },

  // "2" → "2nd",  "3rd" stays "3rd",  "Revised" stays "Revised"
  edition: function (ed) {
    ed = String(ed || '').trim().replace(/\s*(ed\.?|edition)$/i, '');
    if (!/^\d+$/.test(ed)) return ed;
    const n = Number(ed), last2 = n % 100, last = n % 10;
    const suffix = (last2 >= 11 && last2 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[last] || 'th');
    return n + suffix;
  },

  // Page ranges use an en dash: "45-67" → "45–67"
  pages: function (p) {
    return String(p || '').trim().replace(/\s*[-–—]+\s*/g, '–');
  },

  doiUrl: function (doi) {
    doi = String(doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
    return doi ? 'https://doi.org/' + doi : '';
  },

  // Join a list: ["A","B","C"] → "A, B, and C"  (with Oxford comma)
  joinList: function (items, word) {
    if (items.length <= 1) return items.join('');
    if (items.length === 2) return items[0] + ' ' + word + ' ' + items[1];
    return items.slice(0, -1).join(', ') + ', ' + word + ' ' + items[items.length - 1];
  },

  // "Given Family" (used for editors in MLA/Chicago, and 2nd+ authors)
  givenFirst: function (name) {
    const n = Cite.parseName(name);
    return n.single ? n.family : (n.given + ' ' + n.family).trim();
  },

  // The HTML citation → plain text (for copying into plain text boxes)
  toPlain: function (html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent;
  },

  /* ------------ APA 7 ------------ */
  apa: function (s) {
    const e = App.esc;
    // Authors: "Roy, K." — two: "A, & B" — up to 20 listed, then "… Last"
    const names = s.authors.map(function (a) {
      const n = Cite.parseName(a);
      return n.single ? n.family : n.family + ', ' + Cite.initials(n.given);
    });
    let authors = '';
    if (names.length === 1) authors = names[0];
    else if (names.length <= 20) authors = names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1];
    else authors = names.slice(0, 19).join(', ') + ', . . . ' + names[names.length - 1];

    const year = '(' + (s.year ? e(s.year) : 'n.d.') + ').';
    const ed = Cite.edition(s.edition);
    const link = Cite.doiUrl(s.doi) || ((s.type === 'article' || s.type === 'thesis') ? App.safeUrl(s.url) : '');
    let out = '';

    // With no author, APA moves the title to the front
    const lead = function (titleHtml) {
      return authors ? Cite.period(e(authors)) + ' ' + year + ' ' + titleHtml : titleHtml + ' ' + year;
    };

    if (s.type === 'article') {
      let source = '<i>' + e(s.journal) + '</i>';
      if (s.volume) source += ', <i>' + e(s.volume) + '</i>';
      if (s.issue) source += '(' + e(s.issue) + ')';
      if (s.pages) source += ', ' + e(Cite.pages(s.pages));
      out = lead(Cite.period(e(s.title))) + (s.journal ? ' ' + source + '.' : '');
    } else if (s.type === 'chapter') {
      const eds = s.editors.map(function (a) {
        const n = Cite.parseName(a);
        return n.single ? n.family : (Cite.initials(n.given) + ' ' + n.family).trim();
      });
      let inPart = 'In ';
      if (eds.length) inPart += (eds.length === 1 ? eds[0] : eds.length === 2 ? eds[0] + ' & ' + eds[1] : eds.slice(0, -1).join(', ') + ', & ' + eds[eds.length - 1]) +
        (eds.length === 1 ? ' (Ed.), ' : ' (Eds.), ');
      inPart = e(inPart) + '<i>' + e(s.containerTitle || '[Book title]') + '</i>';
      const extra = [ed ? e(ed) + ' ed.' : '', s.pages ? 'pp. ' + e(Cite.pages(s.pages)) : ''].filter(Boolean).join(', ');
      if (extra) inPart += ' (' + extra + ')';
      out = lead(Cite.period(e(s.title))) + ' ' + inPart + '.' + (s.publisher ? ' ' + Cite.period(e(s.publisher)) : '');
    } else if (s.type === 'thesis') {
      const title = '<i>' + e(s.title) + '</i> [Doctoral dissertation' + (s.publisher ? ', ' + e(s.publisher) : '') + ']';
      out = lead(title + '.');
    } else { // book
      let title = '<i>' + e(s.title) + '</i>';
      if (ed) title += ' (' + e(ed) + ' ed.)';
      out = lead(Cite.period(title)) + (s.publisher ? ' ' + Cite.period(e(s.publisher)) : '');
    }
    if (link) out += ' ' + e(link);
    return out;
  },

  /* ------------ MLA 9 ------------ */
  mla: function (s) {
    const e = App.esc;
    // Authors: "Roy, Kumkum." — two: "A, and B C." — three or more: "A, et al."
    let authors = '';
    if (s.authors.length === 1) authors = s.authors[0];
    else if (s.authors.length === 2) authors = s.authors[0] + ', and ' + Cite.givenFirst(s.authors[1]);
    else if (s.authors.length > 2) authors = s.authors[0] + ', et al';
    const start = authors ? Cite.period(e(authors)) + ' ' : '';
    const ed = Cite.edition(s.edition);
    const edPart = ed ? e(ed) + ' ed., ' : '';
    const link = Cite.doiUrl(s.doi) || App.safeUrl(s.url).replace(/^https?:\/\//, '');
    let out = '';

    if (s.type === 'article') {
      const bits = ['<i>' + e(s.journal) + '</i>', s.volume ? 'vol. ' + e(s.volume) : '', s.issue ? 'no. ' + e(s.issue) : '',
        e(s.year), s.pages ? 'pp. ' + e(Cite.pages(s.pages)) : '', e(link)].filter(function (b) { return b && b !== '<i></i>'; });
      out = start + '“' + Cite.period(e(s.title)) + '” ' + bits.join(', ') + '.';
    } else if (s.type === 'chapter') {
      const editors = s.editors.length ? 'edited by ' + e(Cite.joinList(s.editors.map(Cite.givenFirst), 'and')) : '';
      const bits = ['<i>' + e(s.containerTitle || '[Book title]') + '</i>', editors, ed ? e(ed) + ' ed.' : '', e(s.publisher), e(s.year),
        s.pages ? 'pp. ' + e(Cite.pages(s.pages)) : ''].filter(Boolean);
      out = start + '“' + Cite.period(e(s.title)) + '” ' + bits.join(', ') + '.';
    } else if (s.type === 'thesis') {
      out = start + Cite.period('<i>' + e(s.title) + '</i>') + (s.year ? ' ' + e(s.year) + '.' : '') +
        ' ' + (s.publisher ? e(s.publisher) + ', ' : '') + 'PhD dissertation.';
    } else {
      const bits = [e(s.publisher), e(s.year)].filter(Boolean).join(', ');
      out = start + Cite.period('<i>' + e(s.title) + '</i>') + (edPart || bits ? ' ' + edPart + bits + '.' : '');
      out = out.replace(/, \.$/, '.');
    }
    if (link && s.type !== 'article') out += ' ' + e(link) + '.';
    return out;
  },

  /* ------------ Chicago 17 (bibliography entry) ------------ */
  chicago: function (s) {
    const e = App.esc;
    // Authors: first "Roy, Kumkum", others "Given Family"; more than 10 → first 7 + et al.
    let list = s.authors.map(function (a, i) { return i === 0 ? a : Cite.givenFirst(a); });
    if (list.length > 10) list = list.slice(0, 7).concat(['et al']);
    let authors;
    if (list.length > 2 && list[list.length - 1] === 'et al') authors = list.slice(0, -1).join(', ') + ', et al';
    // Two authors: "Raftery, Deirdre, and Elizabeth M. Smyth" (comma after the inverted first name)
    else if (list.length === 2) authors = list[0] + (Cite.parseName(s.authors[0]).single ? ' and ' : ', and ') + list[1];
    else authors = Cite.joinList(list, 'and');
    const start = authors ? Cite.period(e(authors)) + ' ' : '';
    const year = s.year ? e(s.year) : 'n.d.';
    const ed = Cite.edition(s.edition);
    const pub = [e(s.place), e(s.publisher)].filter(Boolean).join(': ');
    const pubYear = (pub ? pub + ', ' : '') + year;
    const link = Cite.doiUrl(s.doi) || App.safeUrl(s.url);
    let out = '';

    if (s.type === 'article') {
      let journal = '<i>' + e(s.journal) + '</i>';
      if (s.volume) journal += ' ' + e(s.volume);
      if (s.issue) journal += ', no. ' + e(s.issue);
      journal += ' (' + year + ')';
      if (s.pages) journal += ': ' + e(Cite.pages(s.pages));
      out = start + '“' + Cite.period(e(s.title)) + '” ' + journal + '.';
    } else if (s.type === 'chapter') {
      let inPart = 'In <i>' + e(s.containerTitle || '[Book title]') + '</i>';
      if (s.editors.length) inPart += ', edited by ' + e(Cite.joinList(s.editors.map(Cite.givenFirst), 'and'));
      if (s.pages) inPart += ', ' + e(Cite.pages(s.pages));
      out = start + '“' + Cite.period(e(s.title)) + '” ' + inPart + '.' + (ed ? ' ' + e(ed) + ' ed.' : '') + ' ' + Cite.period(pubYear);
    } else if (s.type === 'thesis') {
      out = start + '“' + Cite.period(e(s.title)) + '” PhD diss., ' + (s.publisher ? e(s.publisher) + ', ' : '') + year + '.';
    } else {
      out = start + Cite.period('<i>' + e(s.title) + '</i>') + (ed ? ' ' + e(ed) + ' ed.' : '') + ' ' + Cite.period(pubYear);
    }
    if (link) out += ' ' + e(link) + '.';
    return out;
  },

  format: function (style, source) {
    return Cite[style](source);
  },

  // Which important details are missing, per type (shown as a warning)
  missing: function (s) {
    const needed = { book: ['authors', 'year', 'publisher'], article: ['authors', 'year', 'journal', 'volume', 'pages'],
      chapter: ['authors', 'year', 'containerTitle', 'editors', 'publisher', 'pages'], thesis: ['authors', 'year', 'publisher'] };
    const labels = { authors: 'author', year: 'year', publisher: s.type === 'thesis' ? 'university' : 'publisher', journal: 'journal',
      volume: 'volume', pages: 'pages', containerTitle: 'book title', editors: 'editors' };
    return (needed[s.type] || needed.book).filter(function (k) {
      return Array.isArray(s[k]) ? !s[k].length : !String(s[k] || '').trim();
    }).map(function (k) { return labels[k]; });
  },

  // Sort for a bibliography: first author's surname, then year, then title
  sortSources: function (list) {
    return list.slice().sort(function (a, b) {
      const fa = a.authors[0] ? Cite.parseName(a.authors[0]).family : a.title;
      const fb = b.authors[0] ? Cite.parseName(b.authors[0]).family : b.title;
      return fa.localeCompare(fb) || String(a.year).localeCompare(String(b.year)) || a.title.localeCompare(b.title);
    });
  },

  // Copy with italics kept (for Word / Google Docs), falling back to plain text
  copyRich: async function (html, plain) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' })
      })]);
      App.toast('Copied ✓ (italics are kept when pasted into Word or Docs)');
    } catch (e) {
      App.copy(plain);
    }
  },

  /* ------------ BibTeX ------------ */
  bibEscape: function (text) {
    return String(text || '')
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/([&%$#_{}])/g, '\\$1')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  },

  bibtex: function (sources) {
    const used = {};
    return sources.map(function (s) {
      // A citation key like "roy2005women" (letters only), made unique
      const first = s.authors[0] ? Cite.parseName(s.authors[0]).family : 'anon';
      const word = (s.title.split(/\s+/).find(function (w) { return w.length > 3; }) || s.title).toLowerCase();
      const plainKey = function (t) { return t.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase(); };
      let key = plainKey(first) + (s.year ? plainKey(s.year) : '') + plainKey(word);
      if (used[key]) { used[key]++; key += String.fromCharCode(96 + used[key]); } else { used[key] = 1; }

      const type = { book: 'book', article: 'article', chapter: 'incollection', thesis: 'phdthesis' }[s.type] || 'misc';
      // Single-word names are wrapped in {braces} so BibTeX doesn't split them
      const names = function (list) {
        return list.map(function (a) { return Cite.parseName(a).single ? '{' + Cite.bibEscape(a) + '}' : Cite.bibEscape(a); }).join(' and ');
      };
      const fields = [
        ['author', s.authors.length ? names(s.authors) : ''],
        ['title', Cite.bibEscape(s.title)],
        ['journal', s.type === 'article' ? Cite.bibEscape(s.journal) : ''],
        ['booktitle', s.type === 'chapter' ? Cite.bibEscape(s.containerTitle) : ''],
        ['editor', s.type === 'chapter' && s.editors.length ? names(s.editors) : ''],
        ['year', Cite.bibEscape(s.year)],
        ['edition', Cite.bibEscape(s.edition)],
        ['volume', Cite.bibEscape(s.volume)],
        ['number', Cite.bibEscape(s.issue)],
        ['pages', Cite.bibEscape(Cite.pages(s.pages).replace(/–/g, '--'))],
        [s.type === 'thesis' ? 'school' : 'publisher', Cite.bibEscape(s.publisher)],
        ['address', Cite.bibEscape(s.place)],
        ['isbn', Cite.bibEscape(s.isbn)],
        ['doi', Cite.bibEscape(Cite.doiUrl(s.doi).replace('https://doi.org/', ''))],
        ['url', Cite.bibEscape(App.safeUrl(s.url))],
        ['keywords', Cite.bibEscape(s.themes.join(', '))]
      ].filter(function (f) { return f[1]; });
      return '@' + type + '{' + key + ',\n' + fields.map(function (f) { return '  ' + f[0] + ' = {' + f[1] + '}'; }).join(',\n') + '\n}';
    }).join('\n\n') + '\n';
  },

  /* ------------ RIS ------------ */
  ris: function (sources) {
    return sources.map(function (s) {
      const lines = [];
      const add = function (tag, value) {
        value = String(value || '').replace(/\s*\n\s*/g, ' ').trim();
        if (value) lines.push(tag + '  - ' + value);
      };
      add('TY', { book: 'BOOK', article: 'JOUR', chapter: 'CHAP', thesis: 'THES' }[s.type] || 'GEN');
      s.authors.forEach(function (a) { add('AU', a); });
      if (s.type === 'chapter') s.editors.forEach(function (a) { add('ED', a); });
      add('TI', s.title);
      if (s.type === 'article') add('T2', s.journal);
      if (s.type === 'chapter') add('T2', s.containerTitle);
      add('PY', s.year);
      add('ET', s.edition);
      add('VL', s.volume);
      add('IS', s.issue);
      const pageParts = Cite.pages(s.pages).split('–');
      add('SP', pageParts[0]);
      add('EP', pageParts[1]);
      add('PB', s.publisher);
      add('CY', s.place);
      add('SN', s.isbn);
      add('DO', Cite.doiUrl(s.doi).replace('https://doi.org/', ''));
      add('UR', App.safeUrl(s.url));
      s.themes.forEach(function (t) { add('KW', t); });
      lines.push('ER  - ');
      return lines.join('\r\n');
    }).join('\r\n\r\n') + '\r\n';
  }
};

/* =====================================================================
   SCREEN: Citations & bibliography
   ===================================================================== */
Cite.state = { style: 'apa', theme: '', status: '', q: '', selected: new Set() };

App.register('citations', async function (main) {
  const esc = App.esc;
  const st = Cite.state;
  const [allSources, themes] = await Promise.all([DB.getAll('sources'), Library.getThemes()]);
  const sources = Cite.sortSources(allSources);
  // Forget selections of sources that no longer exist
  const existing = new Set(sources.map(function (s) { return s.id; }));
  st.selected.forEach(function (id) { if (!existing.has(id)) st.selected.delete(id); });

  function option(value, label, selected) {
    return '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  main.innerHTML = `
    <div class="container">
      <div class="page-header"><h1>Citations</h1></div>
      <div class="notice">
        <strong>Please double-check before submitting.</strong> Citations are built from the details you entered —
        blank fields are left out, and titles appear exactly as you typed them
        (APA uses <em>Sentence case</em>; MLA and Chicago use <em>Title Case</em>).
      </div>

      <div class="tabs" role="tablist" aria-label="Citation style">
        ${Object.entries(Cite.STYLES).map(function (p) {
          return '<button type="button" role="tab" data-style="' + p[0] + '" aria-selected="' + (st.style === p[0]) + '">' + p[1] + '</button>';
        }).join('')}
      </div>

      <div class="filters cite-filters" role="search">
        <div class="filter-search">
          <label class="sr-only" for="c-q">Filter</label>
          <input type="search" id="c-q" placeholder="Filter by title or author…" value="${esc(st.q)}">
        </div>
        <div><label class="sr-only" for="c-theme">Theme</label>
          <select id="c-theme">${option('', 'All themes', st.theme)}${themes.map(function (t) { return option(t, t, st.theme); }).join('')}</select></div>
        <div><label class="sr-only" for="c-status">Status</label>
          <select id="c-status">${option('', 'Any status', st.status)}${Object.entries(Library.STATUSES).map(function (p) { return option(p[0], p[1], st.status); }).join('')}</select></div>
      </div>

      <div class="cite-actions card">
        <label class="inline-check"><input type="checkbox" id="select-all"> Select all shown</label>
        <span class="muted small" id="selected-count"></span>
        <span class="spacer"></span>
        <button type="button" class="btn" id="copy-bib">📋 Copy bibliography</button>
        <button type="button" class="btn" id="export-bib">⬇ BibTeX (.bib)</button>
        <button type="button" class="btn" id="export-ris">⬇ RIS (.ris)</button>
      </div>
      <p class="small muted">Tick the sources you want, then copy them as a formatted list or export them for Zotero / Mendeley / EndNote.</p>

      <ul class="cite-list" id="cite-list"></ul>
    </div>`;

  const listEl = main.querySelector('#cite-list');

  function shown() {
    const words = Notes.plain(st.q).split(/\s+/).filter(Boolean);
    return sources.filter(function (s) {
      if (st.theme && !s.themes.includes(st.theme)) return false;
      if (st.status && s.status !== st.status) return false;
      const text = Notes.plain(s.title + ' ' + s.authors.join(' '));
      return words.every(function (w) { return text.includes(w); });
    });
  }
  function selectedSources() {
    return sources.filter(function (s) { return st.selected.has(s.id); });
  }

  function updateCounts() {
    const list = shown();
    const n = st.selected.size;
    main.querySelector('#selected-count').textContent = n + ' selected';
    ['#copy-bib', '#export-bib', '#export-ris'].forEach(function (id) { main.querySelector(id).disabled = !n; });
    const all = main.querySelector('#select-all');
    all.checked = list.length > 0 && list.every(function (s) { return st.selected.has(s.id); });
  }

  function draw() {
    const list = shown();
    listEl.innerHTML = list.length ? list.map(function (s) {
      const missing = Cite.missing(s);
      return `
        <li class="cite-item">
          <input type="checkbox" data-select="${esc(s.id)}" aria-label="Select ${esc(s.title)}" ${st.selected.has(s.id) ? 'checked' : ''}>
          <div class="cite-body">
            <p class="citation">${Cite.format(st.style, s)}</p>
            ${missing.length ? '<p class="small cite-missing">Missing: ' + esc(missing.join(', ')) +
              ' — <a href="#/edit/' + encodeURIComponent(s.id) + '">fill in</a></p>' : ''}
          </div>
          <button type="button" class="btn btn-small" data-copy="${esc(s.id)}">Copy</button>
        </li>`;
    }).join('') : '<li class="empty">No sources match.</li>';
    updateCounts();
  }

  main.querySelector('.tabs').addEventListener('click', function (e) {
    const style = e.target.dataset.style;
    if (!style) return;
    st.style = style;
    main.querySelectorAll('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.style === style)); });
    draw();
  });

  const controls = { q: '#c-q', theme: '#c-theme', status: '#c-status' };
  Object.keys(controls).forEach(function (key) {
    const el = main.querySelector(controls[key]);
    const update = function () { st[key] = el.value; draw(); };
    el.addEventListener(key === 'q' ? 'input' : 'change', key === 'q' ? App.debounce(update, 150) : update);
  });

  listEl.addEventListener('change', function (e) {
    const id = e.target.dataset.select;
    if (!id) return;
    if (e.target.checked) st.selected.add(id); else st.selected.delete(id);
    updateCounts();
  });
  listEl.addEventListener('click', function (e) {
    const id = e.target.dataset.copy;
    if (!id) return;
    const html = Cite.format(st.style, sources.find(function (s) { return s.id === id; }));
    Cite.copyRich(html, Cite.toPlain(html));
  });
  main.querySelector('#select-all').addEventListener('change', function (e) {
    shown().forEach(function (s) { if (e.target.checked) st.selected.add(s.id); else st.selected.delete(s.id); });
    draw();
  });

  main.querySelector('#copy-bib').addEventListener('click', function () {
    const items = selectedSources().map(function (s) { return Cite.format(st.style, s); });
    const heading = { apa: 'References', mla: 'Works Cited', chicago: 'Bibliography' }[st.style];
    const html = '<p><b>' + heading + '</b></p>' + items.map(function (h) { return '<p>' + h + '</p>'; }).join('');
    const plain = heading + '\n\n' + items.map(Cite.toPlain).join('\n\n');
    Cite.copyRich(html, plain);
  });
  main.querySelector('#export-bib').addEventListener('click', function () {
    App.download('bibliography-' + App.today() + '.bib', Cite.bibtex(selectedSources()), 'application/x-bibtex');
    App.toast('BibTeX file saved to Downloads ✓');
  });
  main.querySelector('#export-ris').addEventListener('click', function () {
    App.download('bibliography-' + App.today() + '.ris', Cite.ris(selectedSources()), 'application/x-research-info-systems');
    App.toast('RIS file saved to Downloads ✓');
  });

  draw();
});

/* "Cite this" box on every source's page */
Library.sourceSections.push(async function citeSection(container, source) {
  const esc = App.esc;
  const section = document.createElement('section');
  const missing = Cite.missing(source);
  section.innerHTML = `
    <h2>Cite this</h2>
    ${missing.length ? '<p class="small cite-missing">Missing for a complete citation: ' + esc(missing.join(', ')) + '</p>' : ''}
    <div class="card cite-box">
      ${Object.entries(Cite.STYLES).map(function (p) {
        return `
          <div class="cite-row">
            <span class="cite-style">${p[1]}</span>
            <p class="citation">${Cite.format(p[0], source)}</p>
            <button type="button" class="btn btn-small" data-copy-style="${p[0]}">Copy</button>
          </div>`;
      }).join('')}
    </div>`;
  section.addEventListener('click', function (e) {
    const style = e.target.dataset.copyStyle;
    if (!style) return;
    const html = Cite.format(style, source);
    Cite.copyRich(html, Cite.toPlain(html));
  });
  // Place "Cite this" before the Notes section
  const notes = container.querySelector('.notes-section');
  container.insertBefore(section, notes || null);
});
