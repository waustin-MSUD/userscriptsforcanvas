// ==UserScript==
// @name          My Snippets
// @version       2026.09.01
// @namespace     CTLD
// @description   Adds a personal menu for inserting your own HTML snippets from the RCE. Runs alongside the main Snippet Inserter.
// @author        CTLD
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

// ─── ABOUT THIS SCRIPT ─────────────────────────────────────────────
// This is the "blank" template. It is designed to run at the SAME TIME
// as the main auto-updating "Snippet Inserter": you get your colleague's
// snippets (which update automatically) in the "Snippets" menu, and your
// own personal snippets in a separate "My Snippets" menu.
// ─────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ─── Identity / isolation ─────────────────────────────────────
  // NS namespaces every class + id this script creates so it can never
  // clash with the main Snippet Inserter (which uses the `ctld-snippet-*`
  // names). Change NS + MENU_LABEL to spin up another independent menu.
  const NS = 'ctld-mysnip';
  const MENU_LABEL = 'My Snippets';

  // ─── Placement ────────────────────────────────────────────────
  // The menubar item is inserted immediately after the item with
  // this label (case-sensitive, matched against visible text). If
  // not found, it appends at the end. (Both scripts anchor to
  // "Insert"; they simply sit next to each other in the menubar.)
  const INSERT_AFTER = 'Insert';

  // Derived DOM names — do not edit individually; change NS instead.
  const CLS = {
    style:        `${NS}-style`,
    mbtn:         `${NS}-mbtn`,
    menu:         `${NS}-menu`,
    groupLabel:   `${NS}-group-label`,
    divider:      `${NS}-divider`,
    overlay:      `${NS}-overlay`,
    modal:        `${NS}-modal`,
    modalTitle:   `${NS}-modal-title`,
    modalPreview: `${NS}-modal-preview`,
    modalButtons: `${NS}-modal-buttons`,
  };

  // ─── EDIT YOUR SNIPPETS HERE ───────────────────────────────────
  // Each group has a name (shown as a header in the menu) and a list
  // of snippets. Each snippet has:
  //   key:  short ID, must be unique within group
  //   name: shown in the menu (you can include emoji as a marker)
  //   html: the HTML to insert (use backticks for multi-line)
  //
  // To add a new snippet: copy an existing entry, change key/name/html.
  // To add a new group: copy a `{ group, snippets }` block.
  // ───────────────────────────────────────────────────────────────
  const SNIPPETS = [
    {
      group: 'GROUP NAME',
      snippets: [
        {
          key: 'UNIQUE ID',
          name: 'FRIENDLY NAME',
          html: `<p>INSERT HTML</p>`
        },
      ]
    }
  ];
  // ─── END SNIPPETS CONFIG ───────────────────────────────────────

  // ─── Stylesheet injection ─────────────────────────────────────
  function injectStylesheet() {
    if (document.getElementById(CLS.style)) return;
    const style = document.createElement('style');
    style.id = CLS.style;
    style.textContent = `
      .${CLS.menu} {
        background: #ffffff;
        border: 1px solid #cccccc;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        padding: 4px 0;
        min-width: 220px;
        max-width: 320px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        font-size: 14px;
        color: #222f3e;
      }
      .${CLS.menu} .tox-collection__item {
        padding: 6px 14px;
        cursor: pointer;
        color: #222f3e;
      }
      .${CLS.menu} .tox-collection__item--active,
      .${CLS.menu} .tox-collection__item:hover {
        background: #dee0e2;
      }
      .${CLS.groupLabel} {
        padding: 6px 14px 2px;
        font-size: 11px;
        font-weight: 700;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .${CLS.divider} {
        height: 1px;
        background: #e0e0e0;
        margin: 4px 0;
      }

      .${CLS.overlay} {
        position: fixed; inset: 0; z-index: 100001;
        background: rgba(0, 0, 0, 0.5);
        display: flex; align-items: center; justify-content: center;
      }
      .${CLS.modal} {
        background: #ffffff;
        padding: 20px;
        border-radius: 8px;
        max-width: 720px;
        width: 92%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }
      .${CLS.modalTitle} {
        font-weight: 700; font-size: 13px;
        color: #6b7280; margin-bottom: 10px;
        text-transform: uppercase; letter-spacing: 0.04em;
      }
      .${CLS.modalPreview} {
        margin-bottom: 1em;
      }
      .${CLS.modalButtons} {
        display: flex; justify-content: flex-end; gap: 10px;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ─── Boot ─────────────────────────────────────────────────────
  function waitForMenubar() {
    let attempts = 0;
    const maxAttempts = 60;

    const interval = setInterval(() => {
      attempts += 1;
      const editor = window.tinymce?.activeEditor;
      const menubar = document.querySelector('.tox-menubar');
      if (editor?.initialized && menubar && menubar.children.length > 0) {
        clearInterval(interval);
        installMenuButton(editor, menubar);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn(`[${MENU_LABEL}] Menubar never appeared; giving up.`);
      }
    }, 500);

    // Re-install if TinyMCE rebuilds the menubar
    const observer = new MutationObserver(() => {
      const editor = window.tinymce?.activeEditor;
      const menubar = document.querySelector('.tox-menubar');
      if (editor?.initialized && menubar && !menubar.querySelector(`.${CLS.mbtn}`)) {
        installMenuButton(editor, menubar);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Install ──────────────────────────────────────────────────
  function installMenuButton(editor, menubar) {
    if (menubar.querySelector(`.${CLS.mbtn}`)) return;

    const btn = createMenubarButton();
    const insertAfterBtn = findMenubarButtonByLabel(menubar, INSERT_AFTER);

    if (insertAfterBtn && insertAfterBtn.nextSibling) {
      menubar.insertBefore(btn, insertAfterBtn.nextSibling);
    } else if (insertAfterBtn) {
      menubar.appendChild(btn);
    } else {
      menubar.appendChild(btn);
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(btn, editor);
    });
  }

  function findMenubarButtonByLabel(menubar, label) {
    const buttons = menubar.querySelectorAll('.tox-mbtn');
    for (const b of buttons) {
      const text = b.querySelector('.tox-mbtn__select-label')?.textContent?.trim();
      if (text === label) return b;
    }
    return null;
  }

  function createMenubarButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tox-mbtn tox-mbtn--select ${CLS.mbtn}`;
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('tabindex', '-1');
    btn.setAttribute('data-alloy-tabstop', 'true');
    btn.setAttribute('unselectable', 'on');
    btn.style.userSelect = 'none';
    btn.innerHTML = `
      <span class="tox-mbtn__select-label">${MENU_LABEL}</span>
      <div class="tox-mbtn__select-chevron">
        <svg width="10" height="10" focusable="false" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
          <path d="M8.7 2.2c.3-.3.8-.3 1.1 0 .3.3.3.7 0 1l-4.2 4.4c-.3.3-.8.3-1.1 0L.3 3.2C0 2.9 0 2.5.3 2.2c.3-.3.8-.3 1.1 0L5 6l3.7-3.8z" fill="currentColor" fill-rule="evenodd"></path>
        </svg>
      </div>
    `;
    return btn;
  }

  // ─── Menu open / close ────────────────────────────────────────
  let openMenuEl = null;
  let openMenuOwner = null;

  function toggleMenu(ownerBtn, editor) {
    if (openMenuEl && openMenuOwner === ownerBtn) {
      closeMenu();
      return;
    }
    closeMenu();
    openMenu(ownerBtn, editor);
  }

  function openMenu(ownerBtn, editor) {
    const menu = buildMenu(editor);
    document.body.appendChild(menu);

    const rect = ownerBtn.getBoundingClientRect();
    menu.style.left = `${rect.left + window.scrollX}px`;
    menu.style.top = `${rect.bottom + window.scrollY}px`;

    // Nudge left if it would overflow the right edge of the viewport
    requestAnimationFrame(() => {
      const menuRect = menu.getBoundingClientRect();
      if (menuRect.right > window.innerWidth - 4) {
        menu.style.left = `${Math.max(4, window.innerWidth - menuRect.width - 4 + window.scrollX)}px`;
      }
    });

    ownerBtn.setAttribute('aria-expanded', 'true');
    openMenuEl = menu;
    openMenuOwner = ownerBtn;

    setTimeout(() => {
      document.addEventListener('click', outsideClickHandler, { capture: true });
      document.addEventListener('keydown', escHandler);
    }, 0);
  }

  function closeMenu() {
    if (openMenuEl) {
      openMenuEl.remove();
      openMenuEl = null;
    }
    if (openMenuOwner) {
      openMenuOwner.setAttribute('aria-expanded', 'false');
      openMenuOwner = null;
    }
    document.removeEventListener('click', outsideClickHandler, { capture: true });
    document.removeEventListener('keydown', escHandler);
  }

  function outsideClickHandler(e) {
    if (!openMenuEl) return;
    if (openMenuEl.contains(e.target)) return;
    if (openMenuOwner && openMenuOwner.contains(e.target)) return;
    closeMenu();
  }

  function escHandler(e) {
    if (e.key === 'Escape') closeMenu();
  }

  // Build a grouped menu element with TinyMCE-style classes plus
  // our own scoping class.
  function buildMenu(editor) {
    const menu = document.createElement('div');
    menu.className = `tox-menu tox-collection tox-collection--list tox-selected-menu ${CLS.menu}`;
    menu.setAttribute('role', 'menu');
    menu.style.position = 'absolute';
    menu.style.zIndex = '10000';

    SNIPPETS.forEach((group, idx) => {
      if (idx > 0) {
        const divider = document.createElement('div');
        divider.className = CLS.divider;
        menu.appendChild(divider);
      }

      const header = document.createElement('div');
      header.className = CLS.groupLabel;
      header.textContent = group.group;
      menu.appendChild(header);

      const collection = document.createElement('div');
      collection.className = 'tox-collection__group';

      group.snippets.forEach((snip) => {
        const item = document.createElement('div');
        item.className = 'tox-collection__item';
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '-1');
        item.innerHTML = `<div class="tox-collection__item-label">${escapeHTML(snip.name)}</div>`;
        item.addEventListener('mouseenter', () => {
          item.classList.add('tox-collection__item--active');
        });
        item.addEventListener('mouseleave', () => {
          item.classList.remove('tox-collection__item--active');
        });
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          closeMenu();
          openPreviewModal(editor, snip);
        });
        collection.appendChild(item);
      });

      menu.appendChild(collection);
    });

    return menu;
  }

  // ─── Preview modal ────────────────────────────────────────────
  function openPreviewModal(editor, snippet) {
    // Original-behavior guard: require a collapsed cursor (no selection).
    // We check before showing the preview so the user finds out early
    // rather than after picking and previewing.
    const sel = editor.selection;
    if (sel && !sel.isCollapsed()) {
      alert("Please place the cursor (without selecting text) where you'd like to insert the snippet.");
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = CLS.overlay;

    const modal = document.createElement('div');
    modal.className = CLS.modal;

    const title = document.createElement('div');
    title.className = CLS.modalTitle;
    title.textContent = `Preview: ${snippet.name}`;
    modal.appendChild(title);

    const preview = document.createElement('div');
    preview.className = CLS.modalPreview;
    preview.innerHTML = snippet.html;
    modal.appendChild(preview);

    const buttonRow = document.createElement('div');
    buttonRow.className = CLS.modalButtons;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'Button';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const insertBtn = document.createElement('button');
    insertBtn.textContent = 'Insert';
    insertBtn.className = 'Button Button--primary';
    insertBtn.addEventListener('click', () => {
      overlay.remove();
      insertSnippetHTML(editor, snippet.html);
    });

    buttonRow.appendChild(cancelBtn);
    buttonRow.appendChild(insertBtn);
    modal.appendChild(buttonRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Click backdrop or press Escape to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  function insertSnippetHTML(editor, html) {
    editor.focus();
    editor.execCommand('mceInsertContent', false, html);
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ─── Go ───────────────────────────────────────────────────────
  injectStylesheet();
  waitForMenubar();
})();
