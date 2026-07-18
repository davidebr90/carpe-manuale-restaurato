/* MAN2026 — Lightbox immagini con zoom, pan, navigazione */
(function () {
  'use strict';

  const SVG = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    zoomIn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    zoomOut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  };

  let images = [];
  let current = 0;
  let scale = 1;
  let tx = 0, ty = 0;
  let isDragging = false, dragStartX = 0, dragStartY = 0;
  let lastTouchDist = null;
  let lbEl, imgEl, captionEl, counterEl, prevBtn, nextBtn;

  function build() {
    if (lbEl) return lbEl;
    lbEl = document.createElement('div');
    lbEl.className = 'lightbox';
    lbEl.setAttribute('role', 'dialog');
    lbEl.setAttribute('aria-modal', 'true');
    lbEl.setAttribute('aria-label', 'Visualizzatore immagine');
    lbEl.innerHTML =
      '<div class="lightbox-backdrop" data-act="close"></div>' +
      '<div class="lightbox-counter" id="lb-counter">1 / 1</div>' +
      '<div class="lightbox-controls">' +
      '<button type="button" class="lb-btn" data-act="zoom-out" aria-label="Riduci">' + SVG.zoomOut + '</button>' +
      '<button type="button" class="lb-btn" data-act="reset" aria-label="Reset zoom">' + SVG.reset + '</button>' +
      '<button type="button" class="lb-btn" data-act="zoom-in" aria-label="Ingrandisci">' + SVG.zoomIn + '</button>' +
      '<button type="button" class="lb-btn" data-act="close" aria-label="Chiudi">' + SVG.close + '</button>' +
      '</div>' +
      '<button type="button" class="lightbox-nav prev" data-act="prev" aria-label="Immagine precedente">' + SVG.prev + '</button>' +
      '<div class="lightbox-stage">' +
      '<img class="lightbox-img" alt="" draggable="false">' +
      '</div>' +
      '<button type="button" class="lightbox-nav next" data-act="next" aria-label="Immagine successiva">' + SVG.next + '</button>' +
      '<div class="lightbox-caption" id="lb-caption" style="display:none;"></div>';
    document.body.appendChild(lbEl);

    imgEl = lbEl.querySelector('.lightbox-img');
    captionEl = lbEl.querySelector('#lb-caption');
    counterEl = lbEl.querySelector('#lb-counter');
    prevBtn = lbEl.querySelector('[data-act="prev"]');
    nextBtn = lbEl.querySelector('[data-act="next"]');

    lbEl.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'close') close();
      else if (act === 'prev') goto(current - 1);
      else if (act === 'next') goto(current + 1);
      else if (act === 'zoom-in') zoomBy(1.3);
      else if (act === 'zoom-out') zoomBy(1/1.3);
      else if (act === 'reset') resetTransform();
    });

    // Wheel zoom
    lbEl.addEventListener('wheel', function (e) {
      if (!lbEl.classList.contains('is-open')) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.15 : 1/1.15;
      zoomBy(delta);
    }, { passive: false });

    // Drag pan
    imgEl.addEventListener('mousedown', function (e) {
      if (scale <= 1) return;
      isDragging = true;
      imgEl.classList.add('dragging');
      dragStartX = e.clientX - tx;
      dragStartY = e.clientY - ty;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      tx = e.clientX - dragStartX;
      ty = e.clientY - dragStartY;
      applyTransform();
    });
    document.addEventListener('mouseup', function () {
      if (isDragging) { isDragging = false; imgEl.classList.remove('dragging'); }
    });

    // Touch: pinch + drag
    imgEl.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        lastTouchDist = touchDist(e.touches);
      } else if (e.touches.length === 1 && scale > 1) {
        isDragging = true;
        dragStartX = e.touches[0].clientX - tx;
        dragStartY = e.touches[0].clientY - ty;
      }
    }, { passive: true });
    imgEl.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2) {
        const d = touchDist(e.touches);
        if (lastTouchDist) {
          zoomBy(d / lastTouchDist);
        }
        lastTouchDist = d;
        e.preventDefault();
      } else if (isDragging && e.touches.length === 1) {
        tx = e.touches[0].clientX - dragStartX;
        ty = e.touches[0].clientY - dragStartY;
        applyTransform();
      }
    }, { passive: false });
    imgEl.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) lastTouchDist = null;
      if (e.touches.length === 0) isDragging = false;
    });

    // Double click to zoom
    imgEl.addEventListener('dblclick', function () {
      if (scale > 1) resetTransform();
      else zoomBy(2.5);
    });

    // Keyboard
    document.addEventListener('keydown', function (e) {
      if (!lbEl.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') goto(current - 1);
      else if (e.key === 'ArrowRight') goto(current + 1);
      else if (e.key === '+' || e.key === '=') zoomBy(1.3);
      else if (e.key === '-' || e.key === '_') zoomBy(1/1.3);
      else if (e.key === '0') resetTransform();
    });

    return lbEl;
  }

  function touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function applyTransform() {
    imgEl.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    // Marca lo stato "zoomato" così il CSS può rimuovere i max-width/max-height
    // e l'immagine non venga ritagliata oltre la sua dimensione naturale.
    if (scale > 1.01 || tx !== 0 || ty !== 0) {
      imgEl.setAttribute('data-zoomed', '1');
    } else {
      imgEl.removeAttribute('data-zoomed');
    }
  }
  function resetTransform() {
    scale = 1; tx = 0; ty = 0;
    applyTransform();
  }
  function zoomBy(factor) {
    scale = Math.max(0.5, Math.min(8, scale * factor));
    if (scale <= 1) { tx = 0; ty = 0; }
    applyTransform();
  }

  function open(index) {
    build();
    if (!images.length) return;
    document.body.style.overflow = 'hidden';
    lbEl.classList.add('is-open');
    goto(index);
  }
  function close() {
    if (!lbEl) return;
    lbEl.classList.remove('is-open');
    document.body.style.overflow = '';
    resetTransform();
  }
  function goto(idx) {
    if (idx < 0) idx = 0;
    if (idx >= images.length) idx = images.length - 1;
    current = idx;
    const img = images[current];
    imgEl.src = img.src;
    imgEl.alt = img.alt || '';
    if (img.alt && img.alt.trim() && img.alt !== '[immagine non disponibile]') {
      captionEl.textContent = img.alt;
      captionEl.style.display = '';
    } else {
      captionEl.style.display = 'none';
    }
    counterEl.textContent = (current + 1) + ' / ' + images.length;
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === images.length - 1;
    resetTransform();
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    function collect() {
      // Tutte le immagini cliccabili nella main area (escludi sidebar/topbar)
      const all = document.querySelectorAll('main .content img:not(.no-lightbox), main .mht-content img:not(.no-lightbox), iframe.mht-frame ~ * img:not(.no-lightbox)');
      images = [];
      all.forEach(function (el) {
        // Salta immagini broken / 1px / no src
        const src = el.getAttribute('src');
        if (!src) return;
        // alt utile se non vuoto e non placeholder
        images.push({ src: src, alt: el.getAttribute('alt') || el.getAttribute('title') || '', el: el });
      });
    }

    collect();

    // Click delegation
    document.addEventListener('click', function (e) {
      const t = e.target;
      if (!t || t.tagName !== 'IMG') return;
      if (t.classList.contains('no-lightbox')) return;
      // Verifica che sia in zona content/mht-content (e non sidebar)
      if (!t.closest('main .content') && !t.closest('main .mht-content')) return;
      // Skip se è dentro un link <a>
      const a = t.closest('a');
      if (a && a.getAttribute('href') && !a.getAttribute('href').startsWith('#')) return;
      e.preventDefault();
      // ricomputa images al volo (immagini possono essere caricate dopo)
      collect();
      const idx = images.findIndex(function (im) { return im.el === t; });
      open(idx >= 0 ? idx : 0);
    });

    // Esponi API
    window.MAN2026_LIGHTBOX = { open: open, close: close };
  });
})();
