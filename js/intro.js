/*
  intro.js — the welcome animation, "Achieve your Goal".

  The words, colours and movement are in index.html and styles.css. This
  file only decides WHEN the animation ends:
    • after about 3 seconds by itself, or
    • straight away if she taps, clicks or presses a key.
  Then the cover lifts away (class "intro-leave") and is removed.

  It plays once per visit: sessionStorage remembers it for as long as the
  browser tab is open, so reloading or moving around the app doesn't
  replay it. Opening the site again in a new tab or window shows it again.
*/

(function () {
  const intro = document.getElementById('intro');
  if (!intro) return;

  // Already played in this tab? Remove it without showing it.
  if (document.documentElement.classList.contains('no-intro')) {
    intro.remove();
    return;
  }
  try { sessionStorage.setItem('introShown', 'yes'); } catch (e) { /* storage blocked: fine */ }

  // If her computer asks for less motion, show a short, still version
  const lessMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    intro.classList.add('intro-leave');   // styles.css slides it up and fades it
    document.removeEventListener('keydown', finish);
    setTimeout(function () { intro.remove(); }, lessMotion ? 300 : 950);
  }

  setTimeout(finish, lessMotion ? 1500 : 3000);
  intro.addEventListener('click', finish);
  document.addEventListener('keydown', finish);
})();
