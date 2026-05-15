// ==UserScript==
// @name          Resize RCE
// @version       2026.05.15
// @namespace     CTLD
// @description   Adjusts editor window according to the size of the browser window.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/ResizeRCE.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*/pages/*/edit
// @match         https://*.instructure.com/courses/*/assignments/*/edit
// @match         https://*.instructure.com/courses/*/discussion_topics/*/edit
// @match         https://*.instructure.com/courses/*/quizzes/*/edit
// @match         https://*.instructure.com/courses/*/announcements/*/edit
// @match         https://*.instructure.com/courses/*/assignments/syllabus
// @grant         none
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Configuration ────────────────────────────────────────────
  // Scale target by window height. Big monitors get 60%; smaller
  // windows get a larger percentage since Canvas's chrome eats
  // proportionally more of the visible area.
  function targetHeightPx() {
    const h = window.innerHeight;
    let pct;
    if (h >= 1000) pct = 0.60;
    else if (h >= 700) pct = 0.70;
    else pct = 0.80;
    return Math.floor(h * pct);
  }

  // ─── State ────────────────────────────────────────────────────
  // Re-entry guard so synthetic resize events don't recursively
  // trigger our own window-resize handler.
  let resizing = false;

  // ─── Editor detection ────────────────────────────────────────
  function getTinyMCEContainer() {
    const editor = window.tinymce?.activeEditor;
    if (!editor || !editor.initialized || !editor.editorContainer) return null;
    // Only resize when actually visible — TinyMCE's container has
    // visibility: hidden when one of the HTML views is showing.
    const style = window.getComputedStyle(editor.editorContainer);
    if (style.visibility === 'hidden' || style.display === 'none') return null;
    return editor.editorContainer;
  }

  function getCodeMirrorElements() {
    const editor = document.querySelector('.cm-editor');
    if (!editor) return null;
    const wrapper = document.querySelector('.RceHtmlEditor');
    const scroller = document.querySelector('.cm-scroller');
    return { wrapper, editor, scroller };
  }

  function getRawTextarea() {
    const ta = document.querySelector('#wiki_page_body');
    if (!ta) return null;
    const style = window.getComputedStyle(ta);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    return ta;
  }

  // ─── Resize implementations ───────────────────────────────────
  function resizeTinyMCE(px) {
    const container = getTinyMCEContainer();
    if (!container) return false;
    container.style.height = `${px}px`;
    return true;
  }

  function resizeCodeMirror(px) {
    const els = getCodeMirrorElements();
    if (!els) return false;

    if (els.wrapper) els.wrapper.style.height = `${px}px`;
    if (els.editor) els.editor.style.height = `${px}px`;
    if (els.scroller) els.scroller.style.height = `${px}px`;

    // CodeMirror caches measurements at init and only refreshes them
    // on window resize. Dispatch a synthetic resize event to force
    // a remeasure. The guard keeps this from re-entering our own
    // resize handler, and the rAF lets CM finish pending layout work
    // before remeasuring.
    resizing = true;
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => { resizing = false; }, 0);
    });
    return true;
  }

  function resizeRawTextarea(px) {
    const ta = getRawTextarea();
    if (!ta) return false;
    ta.style.height = `${px}px`;
    return true;
  }

  // ─── Main resize ──────────────────────────────────────────────
  function resizeAll() {
    const px = targetHeightPx();
    resizeTinyMCE(px);
    resizeCodeMirror(px);
    resizeRawTextarea(px);
  }

  // ─── Wait for any editor to mount ─────────────────────────────
  function waitForFirstEditor() {
    let attempts = 0;
    const maxAttempts = 60; // 30s @ 500ms

    const interval = setInterval(() => {
      attempts += 1;
      const anyReady =
      window.tinymce?.activeEditor?.initialized ||
      document.querySelector('.cm-editor') ||
      document.querySelector('#wiki_page_body');

      if (anyReady) {
        clearInterval(interval);
        setTimeout(resizeAll, 300);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 500);
  }

  // ─── React to the view-switch button ──────────────────────────
  // The most reliable signal that the view is about to change is a
  // click on Canvas's [data-btn-id="rce-edit-btn"]. Capture phase so
  // we see the click even if Canvas stops propagation. We resize at
  // staggered intervals to catch whichever editor mounts — CodeMirror
  // takes longer than the textarea or TinyMCE.
  function watchViewSwitchButton() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest?.('[data-btn-id="rce-edit-btn"]');
      if (!btn) return;
      setTimeout(resizeAll, 100);
      setTimeout(resizeAll, 350);
      setTimeout(resizeAll, 800);
    }, true);
  }

  // ─── MutationObserver as a backstop ───────────────────────────
  // Handles the keyboard shortcut (Shift+O for raw HTML) and any
  // other path that mounts/swaps an editor without a button click.
  function startObserver() {
    let resizeTimer = null;
    const debounce = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeAll();
        resizeTimer = null;
      }, 200);
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // Editor mounted/unmounted
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (
            node.matches?.('.cm-editor, .tox-edit-area, .RceHtmlEditor') ||
            node.querySelector?.('.cm-editor, .tox-edit-area, .RceHtmlEditor')
          ) {
            debounce();
            return;
          }
        }
        // Visibility flipped on the textarea or TinyMCE container
        if (m.type === 'attributes' && m.attributeName === 'style') {
          const t = m.target;
          if (t.matches?.('#wiki_page_body, .tox-tinymce')) {
            debounce();
            return;
          }
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });
  }

  // ─── Window resize ────────────────────────────────────────────
  window.addEventListener('resize', () => {
    if (resizing) return;
    setTimeout(resizeAll, 150);
  });

  // ─── Boot ─────────────────────────────────────────────────────
  waitForFirstEditor();
  watchViewSwitchButton();
  startObserver();
})();
