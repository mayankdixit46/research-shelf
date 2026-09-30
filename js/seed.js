/*
  seed.js — the starting library.

  The first time the app is opened, these 10 sources are put into the
  database. After that, this file does nothing — so if she edits or
  deletes a book, it will NOT come back.

  IMPORTANT: only the author(s) and title are filled in. Publisher, year,
  ISBN, edition etc. are deliberately left blank, so she can fill them in
  from the copy she is actually reading (or use "Look up details").

  Authors are written "Surname, Given names" because citation styles need
  to know which part is the surname. Names without a comma (like
  "Indira (M.A.)") are kept exactly as given.
*/

// The suggested themes. She can add more from the "Edit" form.
const DEFAULT_THEMES = [
  'Ancient/Early India',
  'Colonial & Modern India',
  'Law & Policy',
  'Education',
  "Women's Studies Movement",
  'Religion'
];

const SEED_SOURCES = [
  {
    type: 'book',
    authors: ['Roy, Kumkum'],
    title: 'Women in Early Indian Societies',
    themes: ['Ancient/Early India']
  },
  {
    type: 'book',
    authors: ['Singh, Snigdha'],
    title: "Beyond the Women's Question: Reconstructing Gendered Identities in Early India",
    themes: ['Ancient/Early India']
  },
  {
    type: 'book',
    authors: ['Raftery, Deirdre', 'Smyth, Elizabeth M.'],
    title: 'Education, Identity and Women Religious, 1800–1950',
    themes: ['Education', 'Religion']
  },
  {
    type: 'book',
    authors: ['Indira (M.A.)'],
    title: 'The Status of Women in Ancient India',
    themes: ['Ancient/Early India']
  },
  {
    type: 'book',
    authors: ['Desai, Neera', 'Krishnaraj, Maithreyi'],
    title: 'Women and Society in India',
    themes: ['Colonial & Modern India', "Women's Studies Movement"]
  },
  {
    type: 'book',
    authors: ['Diwan, Paras', 'Diwan, Peeyushi'],
    title: 'Women and Legal Protection',
    themes: ['Law & Policy']
  },
  {
    type: 'book',
    authors: ['Singh, Indu Prakash'],
    title: 'Indian Women: The Power Trapped',
    themes: ['Colonial & Modern India']
  },
  {
    type: 'article',
    authors: ['Pradeep M. D.'],
    title: 'Legal and Policy Framework on Women Welfare: An Inclusive Growth Strategy',
    journal: 'Annual Research Journal',
    themes: ['Law & Policy']
  },
  {
    type: 'book',
    authors: ['Mazumdar, Vina'],
    title: "Education and Social Change: Women's Studies in India",
    themes: ['Education', "Women's Studies Movement"]
  },
  {
    type: 'book',
    authors: ['Desai, N.', 'Patel, Vibhuti'],
    title: "Women's Studies in India: A Journey of Ideas and Movement",
    themes: ["Women's Studies Movement"]
  }
];

// Turn starting item number i into a full source record.
// Each gets a FIXED id ("seed-1" … "seed-10") and an old date, so that when
// she imports a backup on another computer, her edited copy of each book
// matches the fresh one there and replaces it (instead of making duplicates).
function seedRecord(item, i) {
  return Object.assign(Library.blankSource(), item, {
    id: 'seed-' + (i + 1),
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z'
  });
}

// Add a start-up job (app.js runs these before showing any screen)
App.startupJobs.push(async function seedIfFirstRun() {
  const alreadySeeded = await DB.getSetting('seeded', false);
  if (alreadySeeded) return;

  for (let i = 0; i < SEED_SOURCES.length; i++) {
    await DB.put('sources', seedRecord(SEED_SOURCES[i], i));
  }
  await DB.setSetting('themes', DEFAULT_THEMES);
  await DB.setSetting('seeded', true);
});

// "Restore starting books" (button at the bottom of the Library).
// Adds back any of the 10 starting sources that are missing, matching
// by title. Books that are already there are left untouched.
async function restoreStartingBooks() {
  const existing = await DB.getAll('sources');
  const titles = existing.map(function (s) { return s.title.trim().toLowerCase(); });
  let added = 0;
  for (let i = 0; i < SEED_SOURCES.length; i++) {
    if (titles.includes(SEED_SOURCES[i].title.toLowerCase())) continue;
    await DB.put('sources', seedRecord(SEED_SOURCES[i], i));
    added++;
  }
  await Library.addThemes(DEFAULT_THEMES);
  return added;
}
