/* MAN2026 — PDF viewer dual-strategy.
 * 1. Tenta <embed> (funziona in Chrome/Firefox/Safari/Edge nativi anche da file://)
 * 2. Se non funziona, offre rendering canvas via PDF.js (richiede HTTP o XHR file)
 * 3. Pulsanti "Apri in nuova scheda" e "Scarica" sempre visibili
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var holders = document.querySelectorAll('.pdfjs-shell[data-pdf]');
    if (!holders.length) return;
    holders.forEach(initOne);
  });

  function initOne(shell) {
    var url = shell.getAttribute('data-pdf');
    var wrap = shell.querySelector('.pdfjs-canvas-wrap');
    var loadingEl = shell.querySelector('.pdfjs-loading');
    var canvas = shell.querySelector('canvas.pdfjs-canvas');
    var toolbar = shell.querySelector('.pdfjs-toolbar');

    // ----- Strategia primaria: embed -----
    // Aggiungiamo subito un <embed>; se il browser lo supporta, viene
    // visualizzato con il viewer nativo. Se Edge ha disattivato il PDF reader,
    // l'embed apparirà vuoto e l'utente può usare i pulsanti di fallback.
    if (loadingEl) loadingEl.style.display = 'none';
    if (canvas) canvas.style.display = 'none';

    // Nascondi toolbar PDF.js (la rendiamo visibile solo se attivassimo render canvas)
    if (toolbar) toolbar.style.display = 'none';

    var embed = document.createElement('embed');
    embed.className = 'pdf-embed';
    embed.src = url + '#view=FitH&toolbar=1';
    embed.type = 'application/pdf';
    embed.style.width = '100%';
    embed.style.height = '100%';
    embed.style.border = '0';
    embed.style.display = 'block';

    // Fallback display
    var fallback = document.createElement('div');
    fallback.className = 'pdf-fallback';
    fallback.style.display = 'none';
    fallback.innerHTML =
      '<div style="text-align:center;padding:40px 20px;">' +
      '<div style="font-size:48px;margin-bottom:12px;opacity:.4;">📄</div>' +
      '<h3 style="margin:0 0 8px;color:var(--c-fg);">Anteprima PDF non disponibile</h3>' +
      '<p style="color:var(--c-fg-2);margin:0 0 20px;max-width:48ch;margin-left:auto;margin-right:auto;line-height:1.5;">' +
      'Il browser sta bloccando la visualizzazione inline (succede su Edge con il PDF reader disattivato, o quando il file è aperto da disco con restrizioni). ' +
      'Puoi aprire il PDF in una nuova scheda o scaricarlo.</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' +
      '<a class="btn btn--primary" href="' + escapeAttr(url) + '" target="_blank" rel="noopener">📂 Apri in nuova scheda</a>' +
      '<a class="btn" href="' + escapeAttr(url) + '" download>⬇ Scarica PDF</a>' +
      '<button type="button" class="btn" data-act="try-pdfjs">⚙ Prova render avanzato</button>' +
      '</div></div>';

    // Svuota wrap e inserisci
    if (wrap) {
      wrap.style.padding = '0';
      wrap.style.background = '#3a3a3a';
      wrap.innerHTML = '';
      wrap.appendChild(embed);
      wrap.appendChild(fallback);
    }

    // Detect se l'embed riesce a renderizzare:
    // - Su Chrome/Edge: l'embed è un plugin <iframe>-like e ha un viewer nativo
    // - Edge con PDF reader disabled: scarica direttamente -> embed resta "vuoto" (no error event)
    // Strategia: dopo 2.5s controlla se l'embed ha dimensione attiva o se è "morto"
    var fallbackShown = false;
    function showFallback(reason) {
      if (fallbackShown) return;
      fallbackShown = true;
      embed.style.display = 'none';
      fallback.style.display = 'block';
      if (reason) console.info('[PDF] Fallback:', reason);
    }
    embed.addEventListener('error', function () { showFallback('embed error event'); });
    // Heuristic: se dopo 3s l'embed non ha ancora alcuna dimensione utile, mostra fallback
    setTimeout(function () {
      // Se l'embed è 0×0 o non visibile, c'è un problema
      var rect = embed.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) {
        showFallback('embed non renderizzato (dimensioni nulle)');
      }
    }, 3000);

    // Pulsante "prova render avanzato" -> attiva PDF.js canvas
    fallback.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act="try-pdfjs"]');
      if (!b) return;
      activatePdfJs(shell, url);
    });
  }

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ----- PDF.js fallback canvas mode -----
  function activatePdfJs(shell, url) {
    if (typeof pdfjsLib === 'undefined') {
      alert('PDF.js non caricato.');
      return;
    }
    var wrap = shell.querySelector('.pdfjs-canvas-wrap');
    var toolbar = shell.querySelector('.pdfjs-toolbar');
    if (!wrap) return;

    // Reset wrap
    wrap.innerHTML = '<div class="pdfjs-loading"><div class="spinner"></div><div>Caricamento PDF...</div></div>';
    wrap.style.padding = '16px';
    wrap.style.background = 'linear-gradient(135deg, var(--c-bg-3), var(--c-bg-2))';
    if (toolbar) toolbar.style.display = '';

    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        (window.MAN2026_REL ? window.MAN2026_REL('assets/vendor/pdfjs/pdf.worker.min.js')
                            : 'assets/vendor/pdfjs/pdf.worker.min.js');
    } catch (e) {}

    // XHR ArrayBuffer
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function () {
      if ((xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) && xhr.response) {
        renderWithPdfJs(shell, new Uint8Array(xhr.response));
      } else {
        showRenderError(wrap, 'HTTP ' + xhr.status + ' - ' + (xhr.statusText || 'risposta vuota'), url);
      }
    };
    xhr.onerror = function () {
      showRenderError(wrap, 'Errore di rete o protocollo bloccato (XHR su file:// non permesso da questo browser)', url);
    };
    try { xhr.send(); }
    catch (e) { showRenderError(wrap, 'Eccezione: ' + e.message, url); }
  }

  function showRenderError(wrap, msg, url) {
    wrap.innerHTML =
      '<div style="text-align:center;padding:30px 20px;color:var(--c-fg-2);">' +
      '<h3 style="margin:0 0 10px;color:var(--c-danger);">Render avanzato non riuscito</h3>' +
      '<p style="margin:0 0 18px;font-size:13px;opacity:.85;">' + escapeAttr(msg) + '</p>' +
      '<a class="btn btn--primary" href="' + escapeAttr(url) + '" target="_blank" rel="noopener">📂 Apri in nuova scheda</a>' +
      '</div>';
  }

  function renderWithPdfJs(shell, data) {
    var wrap = shell.querySelector('.pdfjs-canvas-wrap');
    wrap.innerHTML = '<canvas class="pdfjs-canvas"></canvas>';
    var canvas = wrap.querySelector('canvas');

    var pageInfo = shell.querySelector('.pages-info');
    var pageInput = shell.querySelector('input.page-num');
    var btnPrev = shell.querySelector('[data-act="prev"]');
    var btnNext = shell.querySelector('[data-act="next"]');
    var btnZoomIn = shell.querySelector('[data-act="zoom-in"]');
    var btnZoomOut = shell.querySelector('[data-act="zoom-out"]');
    var btnZoomFit = shell.querySelector('[data-act="zoom-fit"]');

    var pdfDoc = null;
    var currentPage = 1;
    var scale = 1.0;
    var fitMode = 'width';

    function update() {
      if (!pdfDoc) return;
      pageInfo.textContent = '/ ' + pdfDoc.numPages;
      pageInput.value = currentPage;
      btnPrev.disabled = currentPage <= 1;
      btnNext.disabled = currentPage >= pdfDoc.numPages;
    }
    function go(num) {
      if (!pdfDoc) return;
      num = Math.max(1, Math.min(pdfDoc.numPages, num | 0));
      currentPage = num;
      update();
      render();
    }
    function render() {
      pdfDoc.getPage(currentPage).then(function (page) {
        var v0 = page.getViewport({ scale: 1 });
        var available = wrap.clientWidth - 32;
        var s = fitMode === 'width' ? available / v0.width : scale;
        scale = s;
        var v = page.getViewport({ scale: s * (window.devicePixelRatio || 1) });
        var ctx = canvas.getContext('2d');
        canvas.width = v.width;
        canvas.height = v.height;
        canvas.style.width = (v.width / (window.devicePixelRatio || 1)) + 'px';
        canvas.style.height = (v.height / (window.devicePixelRatio || 1)) + 'px';
        page.render({ canvasContext: ctx, viewport: v });
      });
    }

    btnPrev && btnPrev.addEventListener('click', function () { go(currentPage - 1); });
    btnNext && btnNext.addEventListener('click', function () { go(currentPage + 1); });
    pageInput && pageInput.addEventListener('change', function () { go(parseInt(pageInput.value, 10) || 1); });
    btnZoomIn && btnZoomIn.addEventListener('click', function () { fitMode = null; scale = Math.min(4, scale * 1.2); render(); });
    btnZoomOut && btnZoomOut.addEventListener('click', function () { fitMode = null; scale = Math.max(0.3, scale / 1.2); render(); });
    btnZoomFit && btnZoomFit.addEventListener('click', function () { fitMode = 'width'; render(); });

    pdfjsLib.getDocument({ data: data }).promise.then(function (doc) {
      pdfDoc = doc;
      update();
      go(1);
    }).catch(function (err) {
      showRenderError(wrap, err && err.message ? err.message : 'errore', shell.getAttribute('data-pdf'));
    });
  }
})();
