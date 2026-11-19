// ==UserScript==
// @name          NavBar Indicator
// @version       2026.11.18
// @namespace     CTLD
// @description   Recolors the Canvas global navigation and adds vertical text to flag companion / sandbox / development shells.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/NavBarIndicator.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*
// @grant         none
// ==/UserScript==

(function () {
  'use strict';

  // One source of truth for all three shell types. Detection mirrors the
  // banner scripts; colors are darker cousins of the banner palette, chosen
  // to keep the nav's white text/icons at WCAG AA (all ≥ 4.5:1 on white):
  //   #157347 → 5.9:1   #856404 → 5.5:1   #B02A37 → 6.5:1
  const SHELLS = [
    { re: /companion/i,   label: 'COMPANION',   color: '#157347' },
    { re: /sandbox/i,     label: 'SANDBOX',     color: '#856404' },
    { re: /development/i, label: 'DEVELOPMENT', color: '#B02A37' },
  ];

  const m = /^\/courses\/(\d+)/.exec(location.pathname);
  if (!m) return;
  const courseId = m[1];

  fetch(`/api/v1/courses/${courseId}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
    .then((r) => r.json())
    .then((course) => {
      const name = course?.name;
      if (!name) return;
      const shell = SHELLS.find((s) => s.re.test(name));
      if (!shell) return;

      injectStyle(shell.color);
      whenReady(() => addLabel(shell.label));
    })
    .catch(() => {});

  // Recolor via the brand custom properties (covers hover/active states) with
  // a direct background fallback for instances that compile brand colors flat.
  function injectStyle(color) {
    if (document.getElementById('shell-nav-style')) return;
    const style = document.createElement('style');
    style.id = 'shell-nav-style';
    style.textContent = `
      :root {
        --ic-brand-global-nav-bgd: ${color} !important;
        --ic-brand-global-nav-logo-bgd: ${color} !important;
        --ic-brand-global-nav-ic-icon-fill: #ffffff !important;
        --ic-brand-global-nav-ic-icon-fill--active: #ffffff !important;
        --ic-brand-global-nav-menu-item__text-color: #ffffff !important;
        --ic-brand-global-nav-menu-item__text-color--active: #ffffff !important;
      }
      #header.ic-app-header,
      .ic-app-header,
      .ic-app-header__main-navigation,
      .ic-app-header__logomark-container {
        background-color: ${color} !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // Vertical label centered in the empty middle of the (full-height, fixed)
  // global nav. pointer-events: none so it never blocks a nav click.
  function addLabel(text) {
    const header = document.querySelector('#header.ic-app-header, #header, .ic-app-header');
    if (!header) return false;
    if (document.getElementById('shell-nav-label')) return true;

    const wrap = document.createElement('div');
    wrap.id = 'shell-nav-label';
    wrap.setAttribute('aria-hidden', 'true');
    Object.assign(wrap.style, {
      position: 'absolute',
      top: '70%',
      left: '0',
      right: '0',
      transform: 'translateY(-50%)',
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: '1',
    });

    const span = document.createElement('span');
    span.textContent = text;
    Object.assign(span.style, {
      fontFamily: '"Roboto Mono", "Consolas", ui-monospace, monospace',
      writingMode: 'vertical-rl',
      textOrientation: 'upright',
      color: 'rgba(255, 255, 255, 0.92)',
      fontWeight: '700',
      fontSize: '24px',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    });

    wrap.appendChild(span);
    header.appendChild(wrap);
    return true;
  }

  // Global nav is core chrome and usually present at load, but poll briefly in
  // case it isn't, and give up after 10s rather than spin forever.
  function whenReady(fn) {
    if (fn()) return;
    const iv = setInterval(() => { if (fn()) clearInterval(iv); }, 250);
    setTimeout(() => clearInterval(iv), 10000);
  }
})();
