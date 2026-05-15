// ==UserScript==
// @name          Sidebar Shortcuts
// @version       2026.05.15
// @namespace     CTLD
// @description   Adds a popup to the sidebar for storing personal links.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/SidebarShortcuts.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/*
// @grant         none
// ==/UserScript==

(function () {
  'use strict';

  // ─── Configuration ────────────────────────────────────────────
  // Edit these to point at the shells you use most. Each entry needs
  // a `name` (shown in the popup) and a `url` (where it links to).
  const LINKS = [
    {
      name: 'ID Sandbox',
      url: 'https://msudenver.instructure.com/courses/12345'
    },
    {
      name: 'Rubric Repository',
      url: 'https://msudenver.instructure.com/courses/67890'
    },
    {
      name: 'Template Shell',
      url: 'https://msudenver.instructure.com/courses/13579'
    }
  ];

  // ─── State ────────────────────────────────────────────────────
  let popupEl = null;
  let triggerEl = null;

  // ─── Sidebar entry ────────────────────────────────────────────
  function createShortcutMenu() {
    const navList = document.querySelector('ul.ic-app-header__menu-list');
    if (!navList || document.getElementById('ctld-shortcut-entry')) return;

    const li = document.createElement('li');
    li.id = 'ctld-shortcut-entry';
    li.className = 'menu-item ic-app-header__menu-list-item';

    const btn = document.createElement('a');
    btn.href = '#';
    btn.className = 'ic-app-header__menu-list-link';
    btn.innerHTML = `
      <div class="menu-item-icon-container" aria-hidden="true">
        <svg style="width: 42px !important; height: 42px !important;" xmlns="http://www.w3.org/2000/svg" class="ic-icon-svg" viewBox="0 0 24 24">
          <path d="M10.5 10.5L11.5 11.5L14 9M8.25 5H15.75C16.4404 5 17 5.58763 17 6.3125V19L12 15.5L7 19V6.3125C7 5.58763 7.55964 5 8.25 5Z" stroke="#464455" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="menu-item__text">Shortcuts</div>
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePopup(btn);
    });

    li.appendChild(btn);
    navList.appendChild(li);
  }

  // ─── Popup open / close ───────────────────────────────────────
  function togglePopup(anchor) {
    if (popupEl && triggerEl === anchor) {
      closePopup();
      return;
    }
    closePopup();
    openPopup(anchor);
  }

  function openPopup(anchor) {
    const panel = document.createElement('div');
    panel.id = 'ctld-shortcut-modal';
    Object.assign(panel.style, {
      position: 'absolute',
      background: '#ffffff',
      border: '2px solid #1976d2',
      padding: '0.6em 1em 0.8em',
      zIndex: '9999',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      borderRadius: '8px',
      minWidth: '200px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      fontSize: '14px',
    });

    panel.innerHTML = `
      <div style="font-weight: 700; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">
        Quick Access
      </div>
      <ul style="list-style: none; padding: 0; margin: 0;">
        ${LINKS.map((link) => `
          <li style="margin: 4px 0;">
            <a href="${escapeHTML(link.url)}" target="_blank" rel="noopener"
               style="color: #1976d2; text-decoration: none; display: block; padding: 3px 0;">
              ${escapeHTML(link.name)}
            </a>
          </li>
        `).join('')}
      </ul>
    `;

    // Hover effect on links
    panel.querySelectorAll('a').forEach((a) => {
      a.addEventListener('mouseenter', () => { a.style.textDecoration = 'underline'; });
      a.addEventListener('mouseleave', () => { a.style.textDecoration = 'none'; });
    });

    document.body.appendChild(panel);

    // Position to the right of the sidebar trigger, top-aligned.
    // The Canvas global nav is on the left edge; flowing right means
    // the popup appears next to the trigger and over the page content.
    const rect = anchor.getBoundingClientRect();
    panel.style.left = `${rect.right + window.scrollX + 8}px`;
    panel.style.top = `${rect.top + window.scrollY}px`;

    // If the popup would overflow the right edge of the viewport,
    // pin it to a safe right margin.
    requestAnimationFrame(() => {
      const panelRect = panel.getBoundingClientRect();
      if (panelRect.right > window.innerWidth - 8) {
        panel.style.left = `${Math.max(8, window.innerWidth - panelRect.width - 8 + window.scrollX)}px`;
      }
    });

    popupEl = panel;
    triggerEl = anchor;

    setTimeout(() => {
      document.addEventListener('click', outsideClickHandler, { capture: true });
      document.addEventListener('keydown', escHandler);
    }, 0);
  }

  function closePopup() {
    if (popupEl) {
      popupEl.remove();
      popupEl = null;
    }
    triggerEl = null;
    document.removeEventListener('click', outsideClickHandler, { capture: true });
    document.removeEventListener('keydown', escHandler);
  }

  function outsideClickHandler(e) {
    if (!popupEl) return;
    if (popupEl.contains(e.target)) return;
    if (triggerEl && triggerEl.contains(e.target)) return;
    closePopup();
  }

  function escHandler(e) {
    if (e.key === 'Escape') closePopup();
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ─── Boot ─────────────────────────────────────────────────────
  const wait = setInterval(() => {
    const menu = document.querySelector('ul.ic-app-header__menu-list');
    if (menu) {
      clearInterval(wait);
      createShortcutMenu();
    }
  }, 500);
})();
