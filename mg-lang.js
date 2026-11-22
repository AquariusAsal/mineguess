/* MineGuess Sprachflagge: Knopf in der Kopfzeile (links neben dem Zahnrad), wechselt DE <-> EN. Flaggen als eigene Inline-SVG (keine Emojis).
   Speichert mg_lang (wie mg-i18n.js). Waehrend einer laufenden Runde / im Multiplayer-Raum wird NICHT neu geladen: die Wahl wird gespeichert,
   ein Hinweis erscheint und die Seite uebernimmt sie, sobald sie im Menue/Leerlauf ist. Auf Impressum/Datenschutz wird der Knopf automatisch in die Navigation gesetzt. */
(function (global) {
  'use strict';
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  var saved = ls('mg_lang');
  function cur() { return (global.MGI18n && MGI18n.lang) || ((saved === 'en' || saved === 'de') ? saved : (/^en/i.test(navigator.language || '') ? 'en' : 'de')); }
  var FLAG = {
    de: '<svg class="mg-flag" viewBox="0 0 30 20" width="24" height="16" aria-hidden="true" focusable="false"><rect width="30" height="7" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#dd0000"/><rect y="13.33" width="30" height="6.67" fill="#ffce00"/></svg>',
    en: '<svg class="mg-flag" viewBox="0 0 60 40" width="24" height="16" aria-hidden="true" focusable="false"><rect width="60" height="40" fill="#012169"/><path d="M0 0L60 40M60 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0L60 40M60 0L0 40" stroke="#c8102e" stroke-width="3"/><path d="M30 0V40M0 20H60" stroke="#fff" stroke-width="13"/><path d="M30 0V40M0 20H60" stroke="#c8102e" stroke-width="8"/></svg>'
  };
  function busy() { try { return !!(global.MGSettings && MGSettings.isBusy && MGSettings.isBusy()); } catch (e) { return false; } }
  function note(msg) {
    var n = document.getElementById('mg-lang-note');
    if (!n) { n = document.createElement('div'); n.id = 'mg-lang-note'; n.setAttribute('role', 'status'); n.className = 'mg-lang-note'; document.body.appendChild(n); }
    n.textContent = msg; n.hidden = false; setTimeout(function () { n.hidden = true; }, 5000);
  }
  function choose(l) {
    if (l === cur() && !(ls('mg_lang') && ls('mg_lang') !== cur())) return;
    if (!busy()) { if (global.MGI18n) MGI18n.set(l); else { ls('mg_lang', l); location.reload(); } return; }
    ls('mg_lang', l);
    note(l === 'en' ? 'Language saved. It applies after this round.' : 'Sprache gespeichert. Sie gilt nach dieser Runde.');
    var iv = setInterval(function () { if (!busy()) { clearInterval(iv); location.reload(); } }, 2500);
    refresh(l);
  }
  var buttons = [];
  function label(l) { return l === 'en' ? 'EN' : 'DE'; }
  function refresh(l) {
    buttons.forEach(function (b) {
      b.innerHTML = FLAG[l] + '<span class="mg-chip-label mg-lang-code" aria-hidden="true">' + label(l) + '</span>';
      var other = l === 'en' ? 'Deutsch' : 'English';
      b.setAttribute('aria-label', (l === 'en' ? 'Language: English. Switch to ' : 'Sprache: Deutsch. Wechseln zu ') + other + ' (' + (l === 'en' ? 'DE' : 'EN') + ')');
      b.title = b.getAttribute('aria-label');
    });
  }
  function mount(container, before) {
    if (!container || container.querySelector('.mg-lang')) return null;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'mg-chip mg-lang compact';
    b.addEventListener('click', function () { choose(cur() === 'en' ? 'de' : 'en'); });
    buttons.push(b);
    if (before && before.parentNode === container) container.insertBefore(b, before); else container.insertBefore(b, container.firstChild);
    refresh(ls('mg_lang') === 'en' || ls('mg_lang') === 'de' ? ls('mg_lang') : cur());
    return b;
  }
  document.addEventListener('DOMContentLoaded', function () {
    if (/(impressum|datenschutz)/i.test(location.pathname)) { var nav = document.querySelector('.mg-nav-links'); if (nav) mount(nav); }
  });
  global.MGLang = { mount: mount, choose: choose };
})(window);
