# 📚 Research Shelf

A private notebook for PhD reading. Keep your reading list, write notes on every
book, gather material by theme, compare sources in a literature-review table,
and produce citations — all in your web browser.

- **Private:** everything stays on your own computer. There is no account, no login,
  and no tracking. Nothing you write is sent anywhere.
- **Free and offline:** once opened, it works without internet (except the optional
  “Look up details” and “Find this book” buttons, which search other websites).
- **Yours:** you can export all your work to a single file at any time.

---

## How to open it

**Option 1 — the website (easiest).**
Open this link in Chrome, Firefox, Safari or Edge, and bookmark it:

> **https://mayankdixit46.github.io/research-shelf/**

After the first visit it opens even without internet. On a phone you can add it to
your home screen (Safari: Share → *Add to Home Screen*; Chrome: ⋮ → *Add to Home screen*).

**Option 2 — from a folder on your computer.**
Download the project (on GitHub: green **Code** button → **Download ZIP**), unzip it,
and double-click **`index.html`**. It opens in your browser and works completely offline.

> ⚠️ **Important: each browser keeps its own separate copy of your data.**
> The website and the downloaded folder do not share notes, and neither do Chrome and
> Safari. Pick one way of opening the app and stick to it. To move your work, use
> **Backup → Export** and then **Import** (see below).

---

## A quick tour

The menu at the top has eight pages.

### 🏠 Home
What you're reading now, your latest notes, and counts of your sources by status and
by theme. There is also a search box for your notes.

### 📖 Library
All your sources. The ten starting books are already there, with only the **author and
title** filled in, so you can add the publisher, year and so on from your own copy.

- **Search and filters:** by theme, author, reading status, and type (book, article, chapter, thesis).
- **+ Add source:** add any book, journal article, book chapter or thesis.
- **Click a title** to open its page, where you can:
  - set the **reading status** (To read / Reading / Finished / Revisit) and a
    **progress note** such as “up to chapter 4”;
  - click **✎ Edit details** to fill in the year, publisher, ISBN, DOI and so on;
  - click **🔎 Look up details** to search the free Open Library catalogue. It shows what
    it finds next to what you have. **Tick only the details you have checked against your
    own copy**, and nothing else is saved. (Open Library shows the *first* year of
    publication, and editions differ, so check the back of your copy.)
  - use **Find this book** to search WorldCat, Google Books, Open Library, the Internet
    Archive, and Shodhganga (Indian PhD theses);
  - under **My copy**, attach your own copy of the source (a PDF, an e-book, or
    photos of pages). It is stored privately in this browser and opens in one click. The
    Library's *My copy* filter shows which books still need one;
  - use **Cite this** to copy a citation;
  - write **notes**.

Missing one of the ten starting books? The **Restore starting books** link at the
bottom of the Library puts it back.

### 📝 Notes
Every note belongs to a source and has:
- a **type**: Summary, Key argument, Quote, My thoughts, or Question;
- a **page number**;
- **tags**, such as `dowry, property`.

Formatting works with simple symbols (or the toolbar buttons):

| You type | You get |
|---|---|
| `**important**` | **important** |
| `*term*` | *term* |
| `## Heading` | a heading |
| `- point` | a bullet list |
| `1. point` | a numbered list |
| `> quotation` | an indented quotation |

The **Notes** page in the menu **searches every note from every book**. Type “dowry” to
see every note that mentions it. You can also filter by type, tag or book. Accents
don't matter: “stridhana” also finds “strīdhana”.

### 🏷️ Themes
Pick a theme to see all its sources and every note **tagged with the theme's name**
(for example, a note tagged `Law & Policy`). You can also show every note from those
sources, group notes by book or by type, and **Copy as outline** to paste into Word as
a first draft of a literature-review section. Add, rename or delete themes under
**Manage themes**.

### ❓ Questions
Write your research questions and give each one a status (Draft / Refining / Final) and
your thinking. **Link the sources and notes** that help answer it. When you reword a
question, the old wording is kept under *Earlier versions*, which is useful to show how
your thinking developed.

### 📊 Matrix
The literature-review table. There is one row per source, and the columns are your own
(it starts with *Main argument, Time period, Method, Relevance to my research*). Type in
any cell and it saves by itself. Add, rename, move or delete columns from the column
headings. **Export CSV** opens in Excel, Google Sheets or Numbers. On a phone, use
the **Cards** view.

### 📑 Citations
Citations in **APA 7, MLA 9 and Chicago**. Copy one, or tick several and click
**Copy bibliography** (italics are kept when pasted into Word or Google Docs).
Export the selection as **BibTeX** or **RIS** to import into Zotero, Mendeley or EndNote.

> Citations are built from the details you entered, so **always give them a final check**.
> Blank fields are left out, and titles appear exactly as typed: APA uses *Sentence case*,
> while MLA and Chicago use *Title Case*.

### 💾 Backup
- **Export all data** saves everything in one file (`research-shelf-backup-DATE.json`)
  in your Downloads folder. **Do this every week** and keep the file somewhere safe,
  such as Google Drive, a USB stick, or an email to yourself.
- **Import data** opens a backup file.
  - **Combine** adds new things and keeps the most recently edited version of each item.
    Nothing is deleted. Use this to move your work to another computer.
  - **Replace** swaps everything for the file's contents, after first downloading a copy
    of what was there.

---

## Keeping your work safe

1. **Export a backup every week.** Home shows a reminder if it has been more than two weeks.
2. Clearing your browser's “cookies and site data” or “browsing history” **deletes the
   app's data**, so export first.
3. Private or incognito windows forget everything when closed. Don't use them for the app.

## Moving to a new computer or browser

1. On the old one: **Backup → Export all data**.
2. Send the file to yourself (by email, Google Drive or USB).
3. On the new one: open the app, then **Backup → Import data**, choose the file, and pick **Combine**.

## Questions

**Can anyone else see my notes?** No. They are stored only in your browser. Even
if the app is on a public website, each visitor has their own empty copy.

**Does the app contain the books' text?** No. It comes with only bibliographic details
(author, title and so on). You can attach **your own** copies under *My copy*. These stay
in your browser and are never published or uploaded.

**Are attached files included in backups?** Yes, if **Include my attached files** is
ticked on the Backup page. Large PDFs make the backup file large, so untick it for a
quick notes-only backup.

**Something looks wrong or old.** Reload the page (⌘ + R on a Mac, Ctrl + R on Windows).

---

## For programmers

Plain HTML, CSS and JavaScript, with no frameworks, no build step and no server. Data
is stored in IndexedDB.

```
index.html        the single page (top bar, menu, script tags)
css/styles.css    all styling, including light/dark mode and the phone layout
sw.js             service worker: offline support when served over http(s)
js/db.js          IndexedDB helpers (stores: sources, notes, questions, matrix, settings)
js/app.js         router (#/screen/param), helpers, theme toggle, start-up
js/library.js     library list, source page, add/edit form, Open Library lookup
js/seed.js        the ten starting sources and default themes
js/notes.js       notes, formatting, search across notes
js/files.js       "My copy": attach your own PDFs/e-books to a source (IndexedDB blobs)
js/themes.js      themes board
js/questions.js   research questions
js/matrix.js      literature-review matrix and CSV export
js/citations.js   APA / MLA / Chicago, BibTeX and RIS
js/backup.js      JSON export and import
js/dashboard.js   home page
```

To run it locally with offline mode enabled: `python3 -m http.server 8000` in this
folder, then open <http://localhost:8000>.

Licensed under the [MIT License](LICENSE).
