// ==UserScript==
// @name         Focus Edit (testing)
// @namespace    CTLD
// @version      2026.09.16
// @description  Distraction-free full-width Canvas editor. Auto-enters on edit pages, hides Canvas chrome, keeps the title/options/Save controls intact, and auto-exits when you Save (the saved view is a non-edit URL). Floating toggle to bail back to normal Canvas; registers with Canvas Toolbar if present.
// @author       CTLD / MSU Denver
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/FocusEdit.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match        https://msudenver.instructure.com/*
// @run-at       document-start
// @noframes
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/<CTLD-ORG>/<REPO>/main/canvas-focus-edit.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'ctld-focus-edit-style';
  const BTN_ID   = 'ctld-focus-edit-btn';
  const LS_KEY   = 'ctld-focus-edit-enabled'; // sticky preference: 'on' | 'off'
  const ATTR     = 'data-ctld-focus';         // set on <html>

  // ---------------------------------------------------------------------------
  // 1. Which surfaces do we handle?
  //    Explicit patterns (not a blanket /edit) so we don't grab stray routes.
  //    New page creation is intentionally omitted — verify that URL on your
  //    instance and add it here if you want it covered.
  // ---------------------------------------------------------------------------
  function isEditRoute() {
    const p = location.pathname;
    return [
      /\/pages\/[^/]+\/edit\/?$/,            // Pages
      /\/assignments\/\d+\/edit\/?$/,        // Assignments (guarded vs New Quizzes below)
      /\/discussion_topics\/\d+\/edit\/?$/,  // Discussions & Announcements
      /\/discussion_topics\/new\/?$/,        // New discussion / announcement
      /\/quizzes\/\d+\/edit\/?$/             // Classic Quizzes
    ].some((re) => re.test(p));
  }

  // Default ON; respect an explicit OFF the user set earlier (sticky).
  // To make it non-sticky (always auto-enter), just `return true;`.
  function shouldBeOn() {
    return localStorage.getItem(LS_KEY) !== 'off';
  }

  function setFocus(on) {
    const html = document.documentElement;
    if (on) html.setAttribute(ATTR, 'on');
    else html.removeAttribute(ATTR);
    updateButton(on);
  }

  // ---------------------------------------------------------------------------
  // 2. Chrome-hiding + full-width CSS. Injected at document-start and gated on
  //    the <html> attribute, so there's no flash of the full layout.
  //    NOTE: height is deliberately NOT touched — your Resize Canvas Editor
  //    script keeps owning that (60vh). It'll just have more room to breathe.
  //    Selector IDs/classes drift between Canvas builds; verify against your
  //    instance's current edit-page DOM and adjust as needed.
  // ---------------------------------------------------------------------------
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const on = `html[${ATTR}="on"]`;
    const css = `
      ${on} #header,
      ${on} #mobile-header,
      ${on} #left-side,
      ${on} #right-side-wrapper,
      ${on} #right-side,
      ${on} .ic-app-nav-toggle-and-crumbs,
      ${on} #breadcrumbs,
      ${on} footer#footer,
      ${on} .ic-app-footer { display: none !important; }

      ${on} #application.ic-app,
      ${on} #wrapper.ic-Layout-wrapper,
      ${on} #main.ic-Layout-columns,
      ${on} #not_right_side,
      ${on} #content-wrapper,
      ${on} #content {
        display: block !important;
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
      }

      /* Neutralize the global-nav offset different builds apply. */
      ${on} body,
      ${on} #application.ic-app { padding-left: 0 !important; }
      ${on} #wrapper.ic-Layout-wrapper { margin-left: 0 !important; }

      /* Comfortable inner gutter so content isn't edge-to-edge. */
      ${on} #content {
        padding: 24px 28px !important;
        box-sizing: border-box !important;
      }

      /* Floating toggle. */
      #${BTN_ID} {
        position: fixed; top: 10px; right: 12px; z-index: 2147483000;
        font: 600 12px/1 system-ui, -apple-system, sans-serif; letter-spacing: .02em;
        padding: 8px 12px; border-radius: 999px;
        border: 1px solid rgba(0,0,0,.15); background: #fff; color: #2d3b45;
        cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.18);
      }
      #${BTN_ID}:hover { background: #f5f7f9; }
      ${on} #${BTN_ID} { background: #2d3b45; color: #fff; border-color: #2d3b45; }
    `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // 3. Floating toggle button (works with no toolbar installed).
  // ---------------------------------------------------------------------------
  function ensureButton() {
    if (!document.body || document.getElementById(BTN_ID)) return;
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.addEventListener('click', toggle);
    document.body.appendChild(btn);
    updateButton(document.documentElement.getAttribute(ATTR) === 'on');
  }

  function updateButton(on) {
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.textContent = on ? 'Exit focus' : 'Focus editor';
  }

  function toggle() {
    const on = document.documentElement.getAttribute(ATTR) !== 'on';
    localStorage.setItem(LS_KEY, on ? 'on' : 'off');
    setFocus(on);
  }

  // ---------------------------------------------------------------------------
  // 4. Optional Canvas Toolbar registration. Uses the page window (unsafeWindow)
  //    and the canvas-toolbar-ready event with a { once: true } fallback.
  //    >>> Field names below (id/title/label/onClick) are a guess — align them
  //    to your toolbar's real register() signature. <<<
  //    If the toolbar registers, we hide the floating button to avoid a duplicate.
  //    (Our CSS only targets Canvas's own IDs, so the toolbar itself survives
  //    focus mode.)
  // ---------------------------------------------------------------------------
  function registerToolbar() {
    const uw = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    const doRegister = () => {
      try {
        if (uw.canvasToolbar && typeof uw.canvasToolbar.register === 'function') {
          uw.canvasToolbar.register({
            id: 'ctld-focus-edit',
            title: 'Toggle focus editor',
            label: 'Focus',
            onClick: toggle
          });
          const btn = document.getElementById(BTN_ID);
          if (btn) btn.style.display = 'none';
        }
      } catch (e) { /* toolbar is optional */ }
    };
    if (uw.canvasToolbar) doRegister();
    else uw.addEventListener('canvas-toolbar-ready', doRegister, { once: true });
  }

  // ---------------------------------------------------------------------------
  // 5. New Quizzes guard. Editing a New Quiz lands on /assignments/:id/edit but
  //    hands the page to an LTI tool with no native RCE. Poll briefly; if no
  //    editor mounts, auto-exit focus and restore normal Canvas. (setInterval
  //    polling, per the async-DOM pattern.)
  // ---------------------------------------------------------------------------
  function guardNewQuizzes() {
    if (!/\/assignments\/\d+\/edit\/?$/.test(location.pathname)) return;
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      const hasRce = document.querySelector(
        '#assignment_description, textarea#assignment_description, .tox-tinymce'
      );
      if (hasRce) { clearInterval(iv); return; }   // real assignment editor -> stay
      if (tries > 20) {                            // ~5s, nothing -> New Quizzes/other
        clearInterval(iv);
        setFocus(false);
      }
    }, 250);
  }

  // ---------------------------------------------------------------------------
  // Init. CSS + attribute happen at document-start (no flash); button/toolbar/
  // guard wait for the body. Edit navigation and Save are full page loads in
  // Canvas, so there's no SPA watcher here — if you hit a soft-nav case, this is
  // where you'd re-run init() on a pathname change.
  // ---------------------------------------------------------------------------
  function init() {
    if (!isEditRoute()) return;
    injectStyle();
    setFocus(shouldBeOn());
    const onReady = () => { ensureButton(); registerToolbar(); guardNewQuizzes(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady, { once: true });
    } else {
      onReady();
    }
  }

  init();
})();
