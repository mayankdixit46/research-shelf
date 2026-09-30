/*
  files.js — "MY COPY": her own files attached to a source.

  The app does not contain any book's text. But if she HAS a copy — a PDF
  from the university library, an e-book, scans or photos of pages — she can
  attach it to the source here and open it with one click.

  Files are stored in the browser's database, like her notes: private, on this
  computer only, never uploaded anywhere.

  Each file is saved like this:
    { id, sourceId, name: 'Roy - chapter 3.pdf', type: 'application/pdf',
      size: 2345678, blob: <the file itself>, addedAt }
*/

const Files = {
  // File types she can pick in the "Attach" window
  ACCEPT: '.pdf,.epub,.doc,.docx,.odt,.rtf,.txt,.md,.png,.jpg,.jpeg,.webp,.heic',
  // SAFETY: only these types are opened inside the browser. Anything else
  // (e.g. a web page file) is downloaded instead, so it can never run code.
  VIEWABLE: ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain'],
  BIG_FILE: 150 * 1024 * 1024, // warn above 150 MB

  // 2345678 → "2.2 MB"
  size: function (bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  },

  icon: function (file) {
    const name = file.name.toLowerCase();
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) return '📕';
    if (name.endsWith('.epub')) return '📘';
    if (/^image\//.test(file.type)) return '🖼️';
    if (/\.(docx?|odt|rtf)$/.test(name)) return '📝';
    return '📄';
  },

  // Save the chosen files for a source
  add: async function (sourceId, fileList) {
    let added = 0;
    for (const file of Array.from(fileList)) {
      if (file.size > Files.BIG_FILE &&
          !confirm('“' + file.name + '” is large (' + Files.size(file.size) + '). Large files fill up the browser\'s storage and make backups big. Attach it anyway?')) {
        continue;
      }
      await DB.put('files', {
        id: App.uid(), sourceId: sourceId, name: file.name,
        type: file.type || '', size: file.size, blob: file, addedAt: App.now()
      });
      added++;
    }
    return added;
  },

  // Open a file in a new tab (PDFs and pictures), or download it (anything else)
  open: function (record) {
    const type = Files.VIEWABLE.includes(record.type) ? record.type : '';
    if (!type) { Files.download(record); return; }
    const url = URL.createObjectURL(new Blob([record.blob], { type: type }));
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  },

  download: function (record) {
    // "octet-stream" = "just some bytes": the browser saves it, never runs it
    const url = URL.createObjectURL(new Blob([record.blob], { type: 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = record.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  },

  /* ---- For backups: files ↔ text ("base64") ---- */
  toBase64: function (blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  },
  fromBase64: function (text, type) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: type || '' });
  }
};

/* "My copy" section on each source's page */
Library.sourceSections.push(async function filesSection(container, source) {
  const esc = App.esc;
  const section = document.createElement('section');
  section.className = 'files-section';
  // Put it first, right under "Find this book"
  container.insertBefore(section, container.firstChild);
  const what = source.type === 'article' ? 'article' : source.type === 'chapter' ? 'chapter' : source.type === 'thesis' ? 'thesis' : 'book';

  async function draw() {
    const files = (await DB.filesForSource(source.id)).sort(function (a, b) { return a.addedAt.localeCompare(b.addedAt); });
    section.innerHTML = `
      <h2>My copy</h2>
      <div class="card dropzone" id="dropzone">
        ${files.length ? '<ul class="file-list">' + files.map(function (f) {
          return `
            <li>
              <span class="file-icon" aria-hidden="true">${Files.icon(f)}</span>
              <span class="file-name">${esc(f.name)}<span class="muted small"> · ${Files.size(f.size)} · added ${esc(App.formatDate(f.addedAt))}</span></span>
              <span class="file-actions">
                ${Files.VIEWABLE.includes(f.type) ? '<button type="button" class="btn btn-small btn-primary" data-open="' + esc(f.id) + '">Open</button>' : ''}
                <button type="button" class="btn btn-small" data-download="${esc(f.id)}">Download</button>
                <button type="button" class="btn btn-small btn-danger" data-remove="${esc(f.id)}">Remove</button>
              </span>
            </li>`;
        }).join('') + '</ul>'
          : '<p class="muted">You haven\'t attached a copy of this ' + what + '. If you have a PDF, e-book, or photos of pages, attach them here to open them in one click.</p>'}
        <div class="row">
          <label class="btn" for="attach-input">📎 Attach a file…</label>
          <input type="file" id="attach-input" class="sr-only" multiple accept="${Files.ACCEPT}">
          <span class="small muted">or drag files onto this box · stored privately in this browser only</span>
        </div>
      </div>`;
  }

  async function addFiles(fileList) {
    if (!fileList || !fileList.length) return;
    try {
      const added = await Files.add(source.id, fileList);
      if (added) App.toast(added === 1 ? 'File attached ✓' : added + ' files attached ✓');
    } catch (error) {
      console.error(error);
      alert('Could not save the file. The browser may be out of storage space.\n\n' + error.message);
    }
    draw();
  }

  section.addEventListener('change', function (e) {
    if (e.target.id === 'attach-input') addFiles(e.target.files);
  });
  section.addEventListener('click', async function (e) {
    const b = e.target.closest('button');
    if (!b) return;
    const id = b.dataset.open || b.dataset.download || b.dataset.remove;
    const record = id && await DB.get('files', id);
    if (!record) return;
    if (b.dataset.open) Files.open(record);
    if (b.dataset.download) Files.download(record);
    if (b.dataset.remove) {
      if (!confirm('Remove “' + record.name + '” from the app?\n\nThis only removes the app\'s copy; files elsewhere on your computer are not touched.')) return;
      await DB.remove('files', id);
      App.toast('File removed');
      draw();
    }
  });
  // Drag and drop
  section.addEventListener('dragover', function (e) { e.preventDefault(); section.querySelector('#dropzone').classList.add('drag-over'); });
  section.addEventListener('dragleave', function (e) {
    if (!section.contains(e.relatedTarget)) section.querySelector('#dropzone').classList.remove('drag-over');
  });
  section.addEventListener('drop', function (e) {
    e.preventDefault();
    section.querySelector('#dropzone').classList.remove('drag-over');
    addFiles(e.dataTransfer.files);
  });

  await draw();
});
