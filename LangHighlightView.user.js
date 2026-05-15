// ==UserScript==
// @name          Highlight Languages (View Mode)
// @version       2026.05.15
// @namespace     CTLD
// @description   Highlight elements with lang attributes on Canvas pages in view mode only.
// @author        CTLD
// @updateurl
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         *://*.instructure.com/*
// @match         *://canvaslms.com/*
// @grant         GM_addStyle
// @grant         unsafeWindow
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'canvas-lang-boundary-style';
  const TOGGLE_CLASS = 'lang-highlight-on';

  const css = `
    body.${TOGGLE_CLASS} [lang]::before,
    body.${TOGGLE_CLASS} [lang]::after {
      font-size: 0.9em;
      font-weight: 700;
      opacity: 0.85;
      user-select: none;
      vertical-align: text-top;
    }

    body.${TOGGLE_CLASS} [lang]::before {
      content: "〖";
      margin-right: 0.15em;
    }

    body.${TOGGLE_CLASS} [lang]::after {
      content: "〗";
      margin-left: 0.15em;
    }

    body.${TOGGLE_CLASS} [lang="en"]::before,
    body.${TOGGLE_CLASS} [lang="en"]::after { color: rgba(120, 120, 120, 0.85); }

    body.${TOGGLE_CLASS} [lang="es"]::before,
    body.${TOGGLE_CLASS} [lang="es"]::after { color: rgba(210, 120, 40, 0.85); }

    body.${TOGGLE_CLASS} [lang="fr"]::before,
    body.${TOGGLE_CLASS} [lang="fr"]::after { color: rgba(40, 110, 200, 0.85); }

    body.${TOGGLE_CLASS} [lang="de"]::before,
    body.${TOGGLE_CLASS} [lang="de"]::after { color: rgba(200, 60, 120, 0.85); }

    body.${TOGGLE_CLASS} [lang="it"]::before,
    body.${TOGGLE_CLASS} [lang="it"]::after { color: rgba(60, 140, 95, 0.85); }

    body.${TOGGLE_CLASS} span[lang]::before,
    body.${TOGGLE_CLASS} span[lang]::after { opacity: 0.7; }
  `;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `
      position: fixed;
      bottom: 12px;
      right: 12px;
      z-index: 999999;
      background: rgba(0,0,0,0.75);
      color: #fff;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.2;
      opacity: 0;
      transition: opacity 120ms ease;
      pointer-events: none;
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 150);
    }, 900);
  }

  function toggleHighlight() {
    document.body.classList.toggle(TOGGLE_CLASS);
    toast(document.body.classList.contains(TOGGLE_CLASS)
      ? 'Language boundaries: ON'
      : 'Language boundaries: OFF');
  }

  function isTypingContext() {
    const a = document.activeElement;
    const tag = a?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || a?.isContentEditable;
  }

  function setupKeyboardToggle() {
    document.addEventListener('keydown', (e) => {
      if (isTypingContext()) return;

      const isAltOptL = e.altKey && (e.code === 'KeyL' || String(e.key).toLowerCase() === 'l');

      if (isAltOptL) {
        e.preventDefault();
        toggleHighlight();
      }
    }, true);
  }

  injectStyle();
  setupKeyboardToggle();

  // ─── Toolbar integration ──────────────────────────────────────
  if (unsafeWindow.canvasToolbar?._ready) {
    unsafeWindow.canvasToolbar.register({
      id: 'lang-highlight-view',
      label: 'Language Highlight',
      icon: '🌐',
      shortcut: 'Alt+L',
      order: 50,
      onClick: toggleHighlight,
    });
  } else {
    unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
      unsafeWindow.canvasToolbar.register({
        id: 'lang-highlight-view',
        label: 'Language Highlight',
        icon: '🌐',
        shortcut: 'Alt+L',
        order: 50,
        onClick: toggleHighlight,
      });
    }, { once: true });
    // No fallback button needed — keyboard shortcut is the original UI
  }
})();
