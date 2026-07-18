/* MAN2026 — MHT mode chooser.
 * Mostra un selettore "Classica (standalone)" vs "Interpretata moderna (beta)"
 * al primo accesso alle pagine MHT Carpe. Preferenza salvata in localStorage.
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var chooser = document.getElementById('mht-chooser');
    if (!chooser) return;

    var prefKey = chooser.getAttribute('data-pref-key');
    var standaloneUrl = chooser.getAttribute('data-standalone-url');
    var modernView = document.getElementById('mht-modern');
    var classicView = document.getElementById('mht-classic');
    var indicator = document.getElementById('mht-mode-indicator');

    function applyMode(mode) {
      if (mode === 'classic') {
        chooser.style.display = 'none';
        if (modernView) modernView.style.display = 'none';
        if (classicView) classicView.style.display = 'block';
        if (indicator) indicator.textContent = 'Modalità: Classica';
      } else if (mode === 'modern') {
        chooser.style.display = 'none';
        if (classicView) classicView.style.display = 'none';
        if (modernView) modernView.style.display = 'block';
        if (indicator) indicator.textContent = 'Modalità: Interpretata (beta)';
      } else {
        // nessuna scelta → mostra chooser
        chooser.style.display = 'flex';
        if (modernView) modernView.style.display = 'none';
        if (classicView) classicView.style.display = 'none';
        if (indicator) indicator.textContent = 'Scelta modalità';
      }
    }

    function savePref(mode) {
      try { localStorage.setItem(prefKey, mode); } catch (e) {}
    }
    function loadPref() {
      try { return localStorage.getItem(prefKey); } catch (e) { return null; }
    }

    // Modalità iniziale
    var current = loadPref();
    applyMode(current);

    // Click sulle card di scelta
    chooser.addEventListener('click', function (e) {
      var card = e.target.closest('[data-mode]');
      if (!card) return;
      var mode = card.getAttribute('data-mode');
      if (mode === 'classic') {
        // Chiedi all'utente se preferisce aprire in nuova scheda o inline (iframe)
        // Default: inline (iframe) con bottone "apri fullscreen" già disponibile
        savePref('classic');
        applyMode('classic');
      } else if (mode === 'modern') {
        savePref('modern');
        applyMode('modern');
      }
    });

    // Bottone "Cambia modalità" nella toolbar
    var changeBtn = document.querySelector('[data-act="mht-change-mode"]');
    if (changeBtn) {
      changeBtn.addEventListener('click', function () {
        try { localStorage.removeItem(prefKey); } catch (e) {}
        applyMode(null);
        // Scroll to chooser
        chooser.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    // ----------------------------------------------------------------
    // Fullscreen toggle dall'iframe (postMessage dall'MHT standalone).
    // I browser bloccano requestFullscreen() chiamato dal documentElement
    // di un documento iframato senza allow="fullscreen", e in ogni caso
    // mettere in fullscreen "tutto il viewport" è meglio se l'iframe stesso
    // viene espanso. Quindi accettiamo il messaggio dal child e attiviamo
    // fullscreen sull'<iframe class="mht-frame">.
    // ----------------------------------------------------------------
    window.addEventListener('message', function (ev) {
      var d = ev && ev.data;
      if (!d || d.type !== 'man2026:toggle-fullscreen') return;
      var frame = document.querySelector('iframe.mht-frame');
      if (!frame) return;
      var isFs = document.fullscreenElement || document.webkitFullscreenElement;
      if (!isFs) {
        var p = frame.requestFullscreen ? frame.requestFullscreen()
              : frame.webkitRequestFullscreen ? frame.webkitRequestFullscreen()
              : null;
        if (p && typeof p.catch === 'function') p.catch(function (err) {
          console.warn('[mht-fullscreen] requestFullscreen rejected:', err);
        });
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    });
  });
})();
