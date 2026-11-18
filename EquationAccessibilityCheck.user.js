// ==UserScript==
// @name          Equation Accessibility Check
// @version       2026.11.18
// @namespace     CTLD
// @description   Detect Canvas equation images missing plain-language aria-labels, and offer to fix them. Registers with the Canvas Toolbar System.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/EquationAccessibilityCheck.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*
// @grant         GM_addStyle
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────
  const TOOL_ID = 'equation-accessibility';
  // SRE is the only library we need. Canvas's "new_math_equation_handling"
  // feature already embeds MathML on each equation image as
  // x-canvaslms-safe-mathml, so we skip LaTeX→MathML conversion entirely
  // when that attribute is present (which is nearly always on modern Canvas).
  const SRE_URL = 'https://cdn.jsdelivr.net/npm/speech-rule-engine@4.1.0/lib/sre.js';
  const SCAN_DEBOUNCE_MS = 400;

  // Verbose logging flag — set window.__eaDebug = true before opening the
  // panel to see library-load progress and per-equation speech attempts.
  const dbg = (...args) => {
    if (unsafeWindow.__eaDebug) console.log('[Equation Accessibility]', ...args);
  };

  // ─── State ──────────────────────────────────────────────────────
  // Equations the script has found this session. Rescanned on content
  // changes, so this is the current snapshot, not a log.
  let equations = [];
  // { el: img, latex: string, location: 'view'|'rce', iframe?, rceIndex?,
  //   hasAria: bool, autoAlt?: string, editedAlt?: string,
  //   status: 'pending'|'ready'|'skipped'|'applied'|'error' }

  let libsReady = false;       // Temml + SRE loaded
  let libsLoading = null;      // in-flight promise
  let panelEl = null;          // the side panel when open
  let markersEl = null;        // container for the on-page markers
  let scanTimer = null;
  let positionTimer = null;    // RAF handle for marker-position updates

  // ─── Styles ─────────────────────────────────────────────────────
  GM_addStyle(`
    /* ── Marker dots overlaid on candidate equations ── */
    #ea-markers {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 99990;
    }
    .ea-marker {
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #c05621;
      border: 2px solid #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
      pointer-events: auto;
      cursor: pointer;
      transition: transform 0.1s;
    }
    .ea-marker:hover {
      transform: scale(1.25);
    }
    .ea-marker.ea-applied {
      background: #2f855a;
    }

    /* ── Side panel ── */
    #ea-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 420px;
      max-height: calc(100vh - 40px);
      background: #1a1d23;
      color: #e0e4ec;
      border: 1px solid #2d3139;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      z-index: 99998;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      display: flex;
      flex-direction: column;
      opacity: 0;
      transform: translateY(-8px);
      transition: opacity 0.18s, transform 0.18s;
    }
    #ea-panel.ea-open {
      opacity: 1;
      transform: translateY(0);
    }
    .ea-panel-header {
      padding: 14px 16px;
      border-bottom: 1px solid #2d3139;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ea-panel-title {
      font-weight: 600;
      font-size: 14px;
    }
    .ea-panel-sub {
      font-size: 11px;
      color: #8b90a3;
      margin-top: 2px;
    }
    .ea-panel-close {
      background: none;
      border: none;
      color: #8b90a3;
      font-size: 18px;
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .ea-panel-close:hover {
      background: rgba(255,255,255,0.08);
      color: #fff;
    }
    .ea-panel-body {
      overflow-y: auto;
      flex: 1;
      padding: 0;
    }
    .ea-panel-footer {
      padding: 12px 16px;
      border-top: 1px solid #2d3139;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .ea-status {
      font-size: 11px;
      color: #8b90a3;
      flex: 1;
    }
    .ea-btn {
      background: #2d3139;
      color: #e0e4ec;
      border: 1px solid #3d4450;
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.1s;
    }
    .ea-btn:hover {
      background: #3d4450;
    }
    .ea-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .ea-btn-primary {
      background: #0b65c2;
      border-color: #0b65c2;
    }
    .ea-btn-primary:hover {
      background: #0d7bd9;
    }

    /* ── Equation list ── */
    .ea-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .ea-item {
      padding: 12px 16px;
      border-bottom: 1px solid #22262e;
      cursor: pointer;
      transition: background 0.1s;
    }
    .ea-item:hover {
      background: rgba(255,255,255,0.03);
    }
    .ea-item.ea-selected {
      background: rgba(11,101,194,0.15);
      border-left: 3px solid #0b65c2;
      padding-left: 13px;
    }
    .ea-item.ea-applied {
      opacity: 0.55;
    }
    .ea-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .ea-item-num {
      font-size: 10px;
      font-weight: 700;
      color: #8b90a3;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .ea-item-status {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      font-weight: 600;
    }
    .ea-item-status.pending {
      background: rgba(192,86,33,0.18);
      color: #e5a670;
    }
    .ea-item-status.ready {
      background: rgba(11,101,194,0.18);
      color: #6eb1f4;
    }
    .ea-item-status.applied {
      background: rgba(47,133,90,0.18);
      color: #7cd4a0;
    }
    .ea-item-status.error {
      background: rgba(197,48,48,0.18);
      color: #f08080;
    }
    .ea-item-status.skipped {
      background: rgba(140,140,140,0.18);
      color: #a8a8a8;
    }
    .ea-item-latex {
      font-family: "SF Mono", Monaco, Consolas, monospace;
      font-size: 11px;
      color: #e5a670;
      margin: 2px 0 6px;
      word-break: break-all;
    }
    .ea-item-alt {
      font-size: 12px;
      color: #c0c6d4;
      line-height: 1.4;
      font-style: italic;
    }
    .ea-item-alt.ea-editable {
      font-style: normal;
    }
    .ea-item textarea {
      width: 100%;
      background: #0f1216;
      color: #e0e4ec;
      border: 1px solid #3d4450;
      border-radius: 4px;
      padding: 6px 8px;
      font-family: inherit;
      font-size: 12px;
      line-height: 1.4;
      resize: vertical;
      min-height: 50px;
      margin-top: 6px;
    }
    .ea-item textarea:focus {
      outline: none;
      border-color: #0b65c2;
    }
    .ea-item-actions {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .ea-item-actions button {
      font-size: 11px;
      padding: 4px 10px;
    }

    /* ── Empty / loading states ── */
    .ea-empty {
      padding: 32px 20px;
      text-align: center;
      color: #8b90a3;
      font-size: 13px;
    }
    .ea-empty strong {
      color: #c0c6d4;
      display: block;
      margin-bottom: 4px;
    }
    .ea-loading {
      padding: 20px;
      text-align: center;
      color: #8b90a3;
      font-size: 12px;
    }
  `);

  // ─── Library loading ────────────────────────────────────────────
  // Load SRE dynamically the first time it's needed. We inject a <script>
  // tag into the page's own context (not the userscript sandbox) so
  // window.SRE is where the SRE library expects it.
  function loadLibraries() {
    if (libsReady) return Promise.resolve();
    if (libsLoading) return libsLoading;

    libsLoading = (async () => {
      dbg('Loading SRE from', SRE_URL);
      await loadScript(SRE_URL);
      dbg('SRE script loaded; polling for window.SRE');

      // SRE attaches to the page window asynchronously after the script
      // runs. Poll for it rather than assuming it's there on onload.
      const SRE = await waitForGlobal('SRE', 5000);
      if (!SRE) throw new Error('SRE did not initialize within 5s');
      dbg('window.SRE present; calling setupEngine');

      // SRE v4+ uses promises for setup
      const setupResult = SRE.setupEngine({
        domain: 'clearspeak',
        style: 'default',
        locale: 'en',
        modality: 'speech',
      });
      if (setupResult && typeof setupResult.then === 'function') await setupResult;
      const ready = SRE.engineReady();
      if (ready && typeof ready.then === 'function') await ready;
      dbg('SRE engine ready');
      libsReady = true;
    })();

    return libsLoading;
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      // Use the page's own document so the script runs in the page's real
      // JS context, where window.SRE will then be accessible via unsafeWindow.
      const doc = unsafeWindow.document;
      const s = doc.createElement('script');
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + url));
      doc.head.appendChild(s);
    });
  }

  // Poll for a global on the real page window (unsafeWindow). Returns the
  // global's value, or null on timeout.
  function waitForGlobal(name, timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (unsafeWindow[name]) return resolve(unsafeWindow[name]);
        if (Date.now() - start > timeoutMs) return resolve(null);
        setTimeout(check, 50);
      };
      check();
    });
  }

  // ─── Equation detection ─────────────────────────────────────────
  // Canvas represents equations as:
  //   <img class="equation_image"
  //        src="/equation_images/<double-url-encoded-latex>?scale=1"
  //        alt="LaTeX: <latex>"
  //        data-equation-content="<latex>">
  // A "candidate" for fixing is one without a plain-language aria-label.

  function findEquationsInRoot(root, location, iframeInfo) {
    const results = [];

    // ── Form 1: <img class="equation_image" ...>
    // Appears in edit-mode (RCE iframe) always, and in view-mode on Canvas
    // instances with new_math_equation_handling disabled.
    root.querySelectorAll('img.equation_image').forEach((img) => {
      const rawLatex =
        img.getAttribute('data-equation-content') ||
        img.getAttribute('data-equation-exp') ||
        '';
      const latex = decodeEntities(rawLatex);
      const mathml = extractMathMLFromImg(img);
      const ariaLabel = img.getAttribute('aria-label');
      // An alt-like "LaTeX: ..." is Canvas's default and not useful.
      // Anything else is a real author-written description we should keep.
      const hasAria = !!(ariaLabel && ariaLabel.trim() &&
                        !ariaLabel.startsWith('LaTeX:'));
      results.push(makeRecord({
        el: img,
        kind: 'img',
        latex,
        mathml,
        hasAria,
        existingAria: ariaLabel || '',
        location,
        iframeInfo,
      }));
    });

    // ── Form 2: <span class="math_equation_latex"> wrapping MathJax SVG
    // Appears in view-mode on Canvas instances with
    // new_math_equation_handling enabled (which is most of them now).
    // The LaTeX lives in a <script type="math/tex"> child, and the MathML
    // in the data-mathml attribute of the inner .MathJax_SVG element.
    root.querySelectorAll('span.math_equation_latex').forEach((span) => {
      const scriptEl = span.querySelector('script[type="math/tex"]');
      const latex = scriptEl ? scriptEl.textContent.trim() : '';
      const mathJaxFrame = span.querySelector('.MathJax_SVG, .MathJax');
      let mathml = '';
      if (mathJaxFrame) {
        // data-mathml is HTML-escaped MathML
        const rawMathml = mathJaxFrame.getAttribute('data-mathml');
        if (rawMathml) mathml = decodeEntities(rawMathml);
      }
      // Fallback: look for inner MathML markup directly (MJX_Assistive_MathML)
      if (!mathml) {
        const assistive = span.querySelector('.MJX_Assistive_MathML math');
        if (assistive) mathml = assistive.outerHTML;
      }
      // For the span form, screen readers read the SVG's aria-label or the
      // assistive MathML. We consider it "has alt" if the outer span has
      // a descriptive aria-label set by the author.
      const ariaLabel = span.getAttribute('aria-label');
      const hasAria = !!(ariaLabel && ariaLabel.trim());

      results.push(makeRecord({
        el: span,
        kind: 'span',
        latex,
        mathml,
        hasAria,
        existingAria: ariaLabel || '',
        location,
        iframeInfo,
      }));
    });

    return results;
  }

  function makeRecord({ el, kind, latex, mathml, hasAria, existingAria, location, iframeInfo }) {
    return {
      el,
      kind, // 'img' or 'span'
      latex,
      mathml,
      location,
      iframe: iframeInfo?.iframe,
      rceIndex: iframeInfo?.index,
      hasAria,
      existingAria,
      autoAlt: null,
      editedAlt: null,
      edited: false,
      status: hasAria ? 'skipped' : 'pending',
      errorReason: null,
    };
  }

  function extractMathMLFromImg(img) {
    // Canvas's new_math_equation_handling stores the MathML on each
    // equation image as x-canvaslms-safe-mathml, HTML-escaped once.
    const raw = img.getAttribute('x-canvaslms-safe-mathml');
    if (!raw) return '';
    return decodeEntities(raw);
  }

  function decodeEntities(s) {
    const t = document.createElement('textarea');
    t.innerHTML = s;
    return t.value;
  }

  // Scan everywhere an equation could show up on the current Canvas page.
  function scanPage() {
    const found = [];

    // View-mode content containers. Canvas uses these classes for rendered
    // page bodies, assignment descriptions, discussion posts, etc. If none
    // of these yields results, we fall back to scanning the whole body.
    const viewSelectors = [
      '.user_content',
      '.show-content',
      '.description',
      '#wiki_page_show',
      '#assignment_show',
      '.discussion-section',
      '#discussion_topic',
      '.message_wrapper',
    ];
    const seen = new Set();
    viewSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((root) => {
        if (seen.has(root)) return;
        seen.add(root);
        found.push(...findEquationsInRoot(root, 'view'));
      });
    });
    // Fallback: if the named containers found nothing, scan the whole
    // document. Some Canvas page types (newer React-rendered views) don't
    // use the legacy container classes.
    if (found.length === 0) {
      dbg('No equations in named containers, falling back to full-document scan');
      found.push(...findEquationsInRoot(document.body, 'view'));
    }

    // Edit-mode: look inside every RCE iframe on the page. Canvas Quiz
    // edit pages can have many RCEs (one per question + a header), and
    // discussions/assignments typically have one.
    const rceIframes = document.querySelectorAll('.rce-wrapper iframe, .tox-edit-area iframe');
    rceIframes.forEach((iframe, index) => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const body = doc.body;
        if (!body) return;
        found.push(...findEquationsInRoot(body, 'rce', { iframe, index }));
      } catch (err) {
        // Cross-origin iframe shouldn't happen for same-domain Canvas,
        // but swallow just in case.
      }
    });

    // Dedup by image element — view containers can overlap on some pages.
    const uniq = [];
    const seenEls = new Set();
    for (const eq of found) {
      if (seenEls.has(eq.el)) continue;
      seenEls.add(eq.el);
      // Preserve autoAlt / edits across rescans
      const prior = equations.find((p) => p.el === eq.el);
      if (prior) {
        eq.autoAlt = prior.autoAlt;
        eq.editedAlt = prior.editedAlt;
        eq.edited = prior.edited;
        if (prior.status === 'applied') eq.status = 'applied';
        else if (prior.status === 'ready') eq.status = 'ready';
      }
      uniq.push(eq);
    }
    equations = uniq;
  }

  function candidateCount() {
    return equations.filter((e) => e.status !== 'skipped' && e.status !== 'applied').length;
  }

  function fixableCount() {
    return equations.filter((e) => e.status !== 'skipped' && e.status !== 'applied' && e.location === 'rce').length;
  }

  // ─── Equation → plain-language description ─────────────────────
  // Takes an equation record (not just LaTeX) so we can prefer the MathML
  // that Canvas has already embedded. SRE's job is MathML → speech, so when
  // Canvas gives us MathML we skip the LaTeX conversion step entirely.
  function equationToSpeech(eq) {
    const SRE = unsafeWindow.SRE;
    if (!SRE) {
      dbg('equationToSpeech: SRE not loaded');
      return '';
    }
    const mathml = eq.mathml || buildMathMLFromLatex(eq.latex);
    if (!mathml) {
      dbg('equationToSpeech: no MathML available for', eq.latex);
      return '';
    }
    try {
      const speech = SRE.toSpeech(mathml);
      dbg('Generated speech:', speech.substring(0, 80));
      return speech;
    } catch (e) {
      console.warn('[Equation Accessibility] SRE.toSpeech failed:', e);
      dbg('Failed MathML was:', mathml);
      return '';
    }
  }

  // Fallback for equations without Canvas's x-canvaslms-safe-mathml.
  // Builds a minimal MathML wrapper around the raw LaTeX so SRE at least
  // has something to parse — not ideal, but better than nothing. In
  // practice, Canvas pages with new_math_equation_handling enabled will
  // always have the MathML attribute, so this path rarely runs.
  function buildMathMLFromLatex(latex) {
    if (!latex) return '';
    // Very minimal — wrap in <math><mtext>...</mtext></math> which lets
    // SRE speak at least the raw TeX source. For real conversion we'd
    // need Temml, which we skipped.
    const escaped = latex
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<math xmlns="http://www.w3.org/1998/Math/MathML"><mtext>${escaped}</mtext></math>`;
  }

  async function generateAltForAll() {
    try {
      await loadLibraries();
    } catch (err) {
      console.error('[Equation Accessibility] Could not load SRE:', err);
      equations.forEach((eq) => {
        if (eq.status === 'pending') eq.status = 'error';
        eq.errorReason = 'library-load';
      });
      renderPanel();
      return;
    }

    for (const eq of equations) {
      if (eq.status === 'applied' || eq.status === 'skipped') continue;
      if (eq.autoAlt) continue; // already generated
      const speech = equationToSpeech(eq);
      if (speech) {
        eq.autoAlt = speech;
        eq.editedAlt = speech;
        eq.status = 'ready';
      } else {
        eq.status = 'error';
        eq.errorReason = eq.mathml ? 'sre-failed' : 'no-mathml';
      }
    }
    renderPanel();
  }

  // ─── Marker overlay (edit mode) ────────────────────────────────
  function ensureMarkersContainer() {
    if (markersEl && document.body.contains(markersEl)) return;
    markersEl = document.createElement('div');
    markersEl.id = 'ea-markers';
    document.body.appendChild(markersEl);
  }

  function clearMarkers() {
    if (markersEl) markersEl.innerHTML = '';
  }

  function renderMarkers() {
    if (!panelEl) {
      // No panel open → no markers; keeps the page uncluttered.
      clearMarkers();
      return;
    }
    ensureMarkersContainer();
    markersEl.innerHTML = '';

    equations.forEach((eq, idx) => {
      if (eq.status === 'skipped') return; // already has an aria-label; no marker
      const rect = getMarkerRect(eq);
      if (!rect) return;

      const dot = document.createElement('div');
      dot.className = 'ea-marker' + (eq.status === 'applied' ? ' ea-applied' : '');
      dot.style.left = (rect.left + rect.width - 6) + 'px';
      dot.style.top = (rect.top - 6) + 'px';
      dot.title = eq.status === 'applied'
        ? 'Alt text applied — click to review'
        : 'Equation missing alt text — click to review';
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        selectEquation(idx);
      });
      markersEl.appendChild(dot);
    });
  }

  function getMarkerRect(eq) {
    const imgRect = eq.el.getBoundingClientRect();
    if (imgRect.width === 0 && imgRect.height === 0) return null;

    if (eq.location === 'view') {
      return imgRect;
    }
    // In edit mode, the image is inside an iframe. Translate the iframe
    // document's coordinates into the parent document's coordinate space.
    if (!eq.iframe) return null;
    const iframeRect = eq.iframe.getBoundingClientRect();
    return {
      left: iframeRect.left + imgRect.left,
      top: iframeRect.top + imgRect.top,
      width: imgRect.width,
      height: imgRect.height,
    };
  }

  // Keep markers glued to their equations while panel is open
  function startPositionLoop() {
    if (positionTimer) return;
    const tick = () => {
      renderMarkers();
      positionTimer = requestAnimationFrame(tick);
    };
    positionTimer = requestAnimationFrame(tick);
  }
  function stopPositionLoop() {
    if (positionTimer) {
      cancelAnimationFrame(positionTimer);
      positionTimer = null;
    }
    clearMarkers();
  }

  // ─── Side panel ─────────────────────────────────────────────────
  let selectedIdx = -1;

  function openPanel() {
    if (panelEl) return;
    panelEl = document.createElement('div');
    panelEl.id = 'ea-panel';
    document.body.appendChild(panelEl);
    requestAnimationFrame(() => panelEl.classList.add('ea-open'));
    renderPanel();
    startPositionLoop();

    // Kick off alt generation in the background
    generateAltForAll().catch((err) => {
      console.error('[Equation Accessibility] Library load failed:', err);
      const body = panelEl?.querySelector('.ea-panel-body');
      if (body) {
        body.innerHTML = `
          <div class="ea-empty">
            <strong>Could not load alt-text libraries.</strong>
            Check your network connection and try again.
          </div>`;
      }
    });
  }

  function closePanel() {
    if (!panelEl) return;
    panelEl.remove();
    panelEl = null;
    stopPositionLoop();
    selectedIdx = -1;
  }

  function selectEquation(idx) {
    selectedIdx = idx;
    renderPanel();
    // Scroll the selected item into view in the panel
    const li = panelEl?.querySelector(`.ea-item[data-idx="${idx}"]`);
    if (li) li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // And scroll the equation into view in the page (or iframe)
    scrollEquationIntoView(equations[idx]);
  }

  function scrollEquationIntoView(eq) {
    if (!eq) return;
    if (eq.location === 'view') {
      eq.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (eq.iframe) {
      // Scroll the iframe's internal document
      try {
        eq.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_) { /* iframe may block smooth scroll */ }
      // And scroll the parent to the iframe if it's offscreen
      const iframeRect = eq.iframe.getBoundingClientRect();
      if (iframeRect.top < 0 || iframeRect.top > window.innerHeight) {
        eq.iframe.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  function renderPanel() {
    if (!panelEl) return;

    const inEdit = isEditMode();
    const total = equations.length;
    const candidates = candidateCount();
    const applied = equations.filter((e) => e.status === 'applied').length;

    let bodyHTML = '';

    if (total === 0) {
      bodyHTML = `
        <div class="ea-empty">
          <strong>No equations found</strong>
          Nothing to check on this page.
        </div>`;
    } else if (candidates === 0 && applied === 0) {
      bodyHTML = `
        <div class="ea-empty">
          <strong>All equations have alt text</strong>
          No action needed on this page.
        </div>`;
    } else {
      bodyHTML = '<ul class="ea-list">';
      equations.forEach((eq, idx) => {
        if (eq.status === 'skipped') return; // hide equations that already have aria
        const cls = 'ea-item' +
          (idx === selectedIdx ? ' ea-selected' : '') +
          (eq.status === 'applied' ? ' ea-applied' : '');
        const statusLabel = {
          pending: 'Generating…',
          ready: 'Ready',
          applied: 'Applied',
          error: 'Error',
          skipped: 'Has alt',
        }[eq.status] || '';

        let altHTML = '';
        if (eq.status === 'pending') {
          altHTML = '<div class="ea-item-alt">Generating alt text…</div>';
        } else if (eq.status === 'error') {
          altHTML = '<div class="ea-item-alt">Could not generate description — edit manually below.</div>';
        } else if (idx === selectedIdx) {
          // Show editor
          const value = eq.editedAlt ?? eq.autoAlt ?? '';
          altHTML = `
            <textarea data-idx="${idx}" spellcheck="false">${escapeHTML(value)}</textarea>
            <div class="ea-item-actions">
              ${inEdit && eq.location === 'rce' && eq.status !== 'applied'
                ? `<button class="ea-btn ea-btn-primary" data-action="apply-one" data-idx="${idx}">Apply to equation</button>`
                : ''}
              ${eq.edited
                ? `<button class="ea-btn" data-action="reset" data-idx="${idx}">Reset</button>`
                : ''}
            </div>`;
        } else {
          const value = eq.editedAlt ?? eq.autoAlt ?? '';
          altHTML = `<div class="ea-item-alt ea-editable">${escapeHTML(value || '—')}</div>`;
        }

        bodyHTML += `
          <li class="${cls}" data-idx="${idx}">
            <div class="ea-item-header">
              <span class="ea-item-num">
                Equation ${idx + 1} of ${total}
                ${eq.location === 'rce' ? '· editor' : '· view only'}
              </span>
              <span class="ea-item-status ${eq.status}">${statusLabel}</span>
            </div>
            <div class="ea-item-latex">${escapeHTML(eq.latex)}</div>
            ${altHTML}
          </li>`;
      });
      bodyHTML += '</ul>';
    }

    // Header
    const sub = inEdit
      ? (candidates > 0
          ? `${candidates} equation${candidates === 1 ? '' : 's'} need${candidates === 1 ? 's' : ''} attention`
          : (applied > 0 ? `${applied} applied this session` : 'All set'))
      : `${total} equation${total === 1 ? '' : 's'} on this page (view-only — edit to apply)`;

    // Footer button state
    const readyCount = equations.filter((e) => e.status === 'ready' && e.location === 'rce').length;
    const canApplyAll = inEdit && readyCount > 0;

    panelEl.innerHTML = `
      <div class="ea-panel-header">
        <div>
          <div class="ea-panel-title">Equation Accessibility</div>
          <div class="ea-panel-sub">${sub}</div>
        </div>
        <button class="ea-panel-close" id="ea-close" aria-label="Close panel">✕</button>
      </div>
      <div class="ea-panel-body">${bodyHTML}</div>
      <div class="ea-panel-footer">
        <div class="ea-status" id="ea-status"></div>
        <button class="ea-btn" id="ea-rescan">Rescan</button>
        ${inEdit
          ? `<button class="ea-btn ea-btn-primary" id="ea-apply-all" ${canApplyAll ? '' : 'disabled'}>
              Apply all (${readyCount})
             </button>`
          : ''}
      </div>`;

    // Rebind
    panelEl.querySelector('#ea-close').addEventListener('click', closePanel);
    panelEl.querySelector('#ea-rescan').addEventListener('click', () => {
      scanPage();
      generateAltForAll();
      renderPanel();
    });
    const applyAllBtn = panelEl.querySelector('#ea-apply-all');
    if (applyAllBtn) applyAllBtn.addEventListener('click', applyAll);

    // Item clicks
    panelEl.querySelectorAll('.ea-item').forEach((li) => {
      li.addEventListener('click', (e) => {
        if (e.target.closest('textarea') || e.target.closest('button')) return;
        const idx = Number(li.dataset.idx);
        selectEquation(idx);
      });
    });

    // Textarea edits
    panelEl.querySelectorAll('.ea-item textarea').forEach((ta) => {
      ta.addEventListener('input', () => {
        const idx = Number(ta.dataset.idx);
        equations[idx].editedAlt = ta.value;
        equations[idx].edited = ta.value !== equations[idx].autoAlt;
      });
    });

    // Action buttons
    panelEl.querySelectorAll('[data-action="apply-one"]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(b.dataset.idx);
        applyOne(idx);
      });
    });
    panelEl.querySelectorAll('[data-action="reset"]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(b.dataset.idx);
        equations[idx].editedAlt = equations[idx].autoAlt;
        equations[idx].edited = false;
        renderPanel();
      });
    });
  }

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ─── Applying alt text ──────────────────────────────────────────
  // This is the only place the script mutates the page's equation images.
  // Nothing is written until the user clicks Apply.
  function applyOne(idx) {
    const eq = equations[idx];
    if (!eq || eq.location !== 'rce') return;
    const text = (eq.editedAlt ?? eq.autoAlt ?? '').trim();
    if (!text) return;

    eq.el.setAttribute('aria-label', text);
    if (!eq.el.hasAttribute('data-ignore-a11y-check')) {
      eq.el.setAttribute('data-ignore-a11y-check', '');
    }
    eq.status = 'applied';
    markRCEDirty(eq);
    setStatus(`Applied to equation ${idx + 1}.`);
    renderPanel();
    updateBadge();
  }

  function applyAll() {
    let applied = 0;
    equations.forEach((eq) => {
      if (eq.status !== 'ready' || eq.location !== 'rce') return;
      const text = (eq.editedAlt ?? eq.autoAlt ?? '').trim();
      if (!text) return;
      eq.el.setAttribute('aria-label', text);
      if (!eq.el.hasAttribute('data-ignore-a11y-check')) {
        eq.el.setAttribute('data-ignore-a11y-check', '');
      }
      eq.status = 'applied';
      markRCEDirty(eq);
      applied += 1;
    });
    setStatus(`Applied ${applied} equation${applied === 1 ? '' : 's'}. Save the page to persist.`);
    renderPanel();
    updateBadge();
  }

  function markRCEDirty(eq) {
    // TinyMCE's dirty check doesn't automatically notice direct DOM mutation
    // of iframe content. Nudge it so Canvas's Save button lights up.
    try {
      const tiny = unsafeWindow.tinyMCE || unsafeWindow.tinymce;
      if (!tiny) return;
      // Find the editor whose iframe matches
      const editor = tiny.editors?.find(
        (e) => e.iframeElement === eq.iframe
      ) || tiny.activeEditor;
      if (editor) {
        editor.setDirty(true);
        // Fire a change event so Canvas's unsaved-changes guard notices
        if (typeof editor.fire === 'function') {
          editor.fire('change');
        }
      }
    } catch (err) {
      console.warn('[Equation Accessibility] Could not mark RCE dirty:', err);
    }
  }

  function setStatus(text) {
    const el = panelEl?.querySelector('#ea-status');
    if (el) el.textContent = text;
  }

  // ─── Edit-mode detection ────────────────────────────────────────
  function isEditMode() {
    // Check both URL and DOM — Canvas's SPA navigation can leave stale URLs
    if (/\/edit($|\?|#)/.test(location.pathname + location.search)) return true;
    if (document.querySelector('.rce-wrapper, .tox-edit-area')) return true;
    return false;
  }

  // ─── Toolbar integration ────────────────────────────────────────
  function updateBadge() {
    if (!unsafeWindow.canvasToolbar?._ready) return;
    const n = candidateCount();
    const label = n > 0
      ? `Fix Equations (${n})`
      : 'Equation Accessibility';
    unsafeWindow.canvasToolbar.register({
      id: TOOL_ID,
      label,
      icon: 'Σ',
      order: 40,
      onClick: openPanel,
    });
  }

  function registerWithToolbar() {
    if (unsafeWindow.canvasToolbar?._ready) {
      updateBadge();
    } else {
      unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
        updateBadge();
      }, { once: true });
      // Fallback: standalone floating button if toolbar never arrives
      setTimeout(() => {
        if (!unsafeWindow.canvasToolbar?._ready) createOwnButton();
      }, 3000);
    }
  }

  function createOwnButton() {
    const btn = document.createElement('button');
    btn.textContent = 'Σ Equations';
    btn.style.cssText = `
      position: fixed; bottom: 18px; right: 18px;
      background: #1a1d23; color: #e0e4ec;
      border: 1px solid #2d3139; border-radius: 10px;
      padding: 10px 14px; cursor: pointer;
      font-family: system-ui, sans-serif; font-size: 13px;
      box-shadow: 0 3px 14px rgba(0,0,0,0.3); z-index: 99997;
    `;
    btn.addEventListener('click', openPanel);
    document.body.appendChild(btn);
  }

  // ─── Scanning & lifecycle ───────────────────────────────────────
  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanPage();
      updateBadge();
      if (panelEl) renderPanel();
    }, SCAN_DEBOUNCE_MS);
  }

  // Watch the document for dynamic content changes (Canvas's SPA nav,
  // RCE iframes mounting/unmounting, questions being added to quizzes).
  function startWatching() {
    const mo = new MutationObserver((mutations) => {
      // Cheap filter: only rescan when something relevant changes
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node;
          if (
            el.matches?.('img.equation_image') ||
            el.matches?.('.rce-wrapper, .tox-edit-area') ||
            el.querySelector?.('img.equation_image, .rce-wrapper, .tox-edit-area, iframe')
          ) {
            scheduleScan();
            return;
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Also watch the URL (Canvas uses SPA-style navigation)
    let lastHref = location.href;
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        // On navigation, close panel and rescan
        if (panelEl) closePanel();
        equations = [];
        scheduleScan();
      }
    }, 500);

    // Also watch RCE iframes for content changes once they're mounted
    // (user types/pastes new content containing equations). We add
    // listeners inside each iframe as we see them.
    let watchedIframes = new WeakSet();
    function attachIframeWatcher() {
      document.querySelectorAll('.rce-wrapper iframe, .tox-edit-area iframe').forEach((iframe) => {
        if (watchedIframes.has(iframe)) return;
        try {
          const doc = iframe.contentDocument;
          if (!doc?.body) return;
          const inner = new MutationObserver(() => scheduleScan());
          inner.observe(doc.body, { childList: true, subtree: true });
          watchedIframes.add(iframe);
        } catch (_) { /* cross-origin — shouldn't happen for Canvas */ }
      });
    }
    setInterval(attachIframeWatcher, 1000);
  }

  // ─── Boot ───────────────────────────────────────────────────────
  function boot() {
    registerWithToolbar();
    startWatching();
    // Initial scan after a moment — give Canvas's own JS a chance to render
    setTimeout(() => {
      scanPage();
      updateBadge();
    }, 800);
  }

  boot();
})();
