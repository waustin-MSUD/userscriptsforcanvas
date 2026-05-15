// ==UserScript==
// @name          Lang Menu
// @version       2026.05.15
// @namespace     CTLD
// @description   Adds a menu to apply a lang attribute to selected elements.
// @author        CTLD
// @updateurl
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
  // Add languages here. `code` is what gets written to the lang
  // attribute. `label` is what appears in the menu. The list is
  // sorted alphabetically by code; adjust the order as you like.
  const LANGUAGES = [
    { code: 'de', label: 'Deutsch (de)' },
    { code: 'en', label: 'English (en)' },
    { code: 'es', label: 'Español (es)' },
    { code: 'fr', label: 'Français (fr)' },
    { code: 'it', label: 'Italiano (it)' },
    { code: 'ja', label: '日本語 (ja)' },
    { code: 'pt', label: 'Português (pt)' },
    { code: 'zh', label: '中文 (zh)' },
  ];

  // Where to insert the menu in the menubar. The button is placed
  // immediately AFTER the item with this label (case-sensitive,
  // matched against the visible text). If the named item isn't
  // present, the button appends at the end.
  const INSERT_AFTER = 'Format';

  // Menu button label.
  const MENU_LABEL = 'Lang';

  // ─── Boot ─────────────────────────────────────────────────────
  // Wait for TinyMCE's menubar to render. Canvas mounts the editor
  // asynchronously, and the menubar appears a bit after the JS
  // `initialized` flag flips. Poll until both conditions hold.
  function waitForMenubar() {
    let attempts = 0;
    const maxAttempts = 60; // 30s @ 500ms

    const interval = setInterval(() => {
      attempts += 1;
      const editor = window.tinymce?.activeEditor;
      const menubar = document.querySelector('.tox-menubar');
      if (editor?.initialized && menubar && menubar.children.length > 0) {
        clearInterval(interval);
        installMenuButton(editor, menubar);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn('[Lang Helper] Menubar never appeared; giving up.');
      }
    }, 500);

    // Also watch for menubar replacement. TinyMCE can re-render
    // the menubar on certain events; if our button vanishes, put
    // it back.
    const observer = new MutationObserver(() => {
      const editor = window.tinymce?.activeEditor;
      const menubar = document.querySelector('.tox-menubar');
      if (editor?.initialized && menubar && !menubar.querySelector('.ctld-lang-mbtn')) {
        installMenuButton(editor, menubar);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Install ──────────────────────────────────────────────────
  function installMenuButton(editor, menubar) {
    if (menubar.querySelector('.ctld-lang-mbtn')) return;

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

  // Build a menubar button matching TinyMCE's native markup.
  function createMenubarButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tox-mbtn tox-mbtn--select ctld-lang-mbtn';
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

    // Mount on document.body so absolute positioning resolves to
    // the viewport. We previously tried mounting inside
    // .tox-tinymce-aux to pick up TinyMCE's native CSS, but that
    // container's positioning context shifts the menu off-screen.
    // The fallback stylesheet handles appearance instead.
    document.body.appendChild(menu);

    const rect = ownerBtn.getBoundingClientRect();
    menu.style.left = `${rect.left + window.scrollX}px`;
    menu.style.top = `${rect.bottom + window.scrollY}px`;

    // Nudge left if it would overflow the viewport
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

  // Build a menu element using TinyMCE's own classes so Canvas's
  // CSS styles it natively. The ctld-lang-menu class is also
  // applied so our fallback styling targets the right element.
  function buildMenu(editor) {
    const menu = document.createElement('div');
    menu.className = 'tox-menu tox-collection tox-collection--list tox-selected-menu ctld-lang-menu';
    menu.setAttribute('role', 'menu');
    // Set positioning inline so it's unambiguous regardless of
    // what other CSS is in play.
    menu.style.position = 'absolute';
    menu.style.zIndex = '10000';

    const collection = document.createElement('div');
    collection.className = 'tox-collection__group';

    LANGUAGES.forEach((lang) => {
      const item = document.createElement('div');
      item.className = 'tox-collection__item';
      item.setAttribute('role', 'menuitem');
      item.setAttribute('tabindex', '-1');
      item.innerHTML = `
        <div class="tox-collection__item-label">${escapeHTML(lang.label)}</div>
      `;
      item.addEventListener('mouseenter', () => {
        item.classList.add('tox-collection__item--active');
      });
      item.addEventListener('mouseleave', () => {
        item.classList.remove('tox-collection__item--active');
      });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        editor.focus();
        applyLang(editor, lang.code);
      });
      collection.appendChild(item);
    });

    menu.appendChild(collection);
    return menu;
  }

  // ─── Lang application (logic from the original script) ───────
  function applyLang(editor, lang) {
    const dom = editor.dom;
    const sel = editor.selection;
    const body = editor.getBody();
    if (!body) return;

    if (sel.isCollapsed()) {
      const caretNode = sel.getNode();
      const existing = findExistingLangNode(caretNode, caretNode, body);
      if (existing) return setLangWithPrompt(existing, lang);
      const block = dom.getParent(caretNode, (n) => isBlockLike(dom, n)) || caretNode;
      if (block && block !== body) setLangWithPrompt(block, lang);
      return;
    }

    const start = sel.getStart();
    const end = sel.getEnd();
    const existing = findExistingLangNode(start, end, body);
    if (existing) return setLangWithPrompt(existing, lang);

    let ancestor = dom.getParent(start, (n) => n.nodeType === 1 && n.contains(end));
    if (!ancestor) ancestor = sel.getNode();

    let blockAncestor = null;
    if (ancestor && ancestor !== body) {
      blockAncestor = isBlockLike(dom, ancestor)
        ? ancestor
        : dom.getParent(ancestor, (n) => isBlockLike(dom, n)) || null;
    }

    if (blockAncestor && blockAncestor !== body) {
      if (selectionCoversBlock(editor, blockAncestor)) {
        setLangWithPrompt(blockAncestor, lang);
      } else {
        wrapSelectionWithSpan(editor, lang);
      }
      return;
    }
    wrapSelectionWithSpan(editor, lang);
  }

  function findExistingLangNode(startNode, endNode, root) {
    let node = startNode;
    while (node && node !== root && node.nodeType === 1) {
      if (node.hasAttribute?.('lang') && node.contains(endNode)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function isBlockLike(dom, node) {
    if (!node || node.nodeType !== 1) return false;
    if (dom?.isBlock?.(node)) return true;
    return ['P', 'DIV', 'LI', 'UL', 'OL', 'SECTION', 'ARTICLE', 'BLOCKQUOTE'].includes(node.nodeName);
  }

  // Cleaner replacement for the old serialized-HTML compare.
  // True if the current selection covers the entire content of `block`.
  function selectionCoversBlock(editor, block) {
    const rng = editor.selection.getRng();
    if (!rng || !block) return false;
    // Build a range that covers exactly the block's contents.
    const blockRange = block.ownerDocument.createRange();
    blockRange.selectNodeContents(block);
    // Selection covers the block if it starts at or before, and
    // ends at or after, the block's content boundaries.
    const startsAtOrBefore = rng.compareBoundaryPoints(Range.START_TO_START, blockRange) <= 0;
    const endsAtOrAfter = rng.compareBoundaryPoints(Range.END_TO_END, blockRange) >= 0;
    return startsAtOrBefore && endsAtOrAfter;
  }

  function setLangWithPrompt(node, lang) {
    const nodeName = (node.nodeName || '').toLowerCase();
    const existing = node.getAttribute?.('lang') || null;
    const newLang = lang.toLowerCase();
    if (existing) {
      if (existing.toLowerCase() === newLang) {
        if (confirm(`This <${nodeName}> already has lang="${existing}".\nRemove the lang attribute?`)) {
          node.removeAttribute('lang');
        }
        return;
      }
      if (!confirm(`This <${nodeName}> already has lang="${existing}".\nReplace it with lang="${newLang}"?`)) return;
    }
    node.setAttribute('lang', newLang);
  }

  function wrapSelectionWithSpan(editor, lang) {
    const sel = editor.selection;
    const html = sel.getContent({ format: 'html' });
    if (!html) return;
    sel.setContent(`<span lang="${lang.toLowerCase()}">${html}</span>`);
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ─── Go ───────────────────────────────────────────────────────
  // Minimal fallback styling. If TinyMCE's native CSS for .tox-menu
  // applies (because we mounted inside .tox-tinymce-aux), TinyMCE's
  // more specific selectors win and these rules are inert. If we
  // fell back to document.body, these provide enough styling that
  // the menu is readable and looks reasonable.
  // (Injected as a <style> element so we don't depend on GM_addStyle.)
  function injectStylesheet() {
    if (document.getElementById('ctld-lang-helper-style')) return;
    const style = document.createElement('style');
    style.id = 'ctld-lang-helper-style';
    style.textContent = `
      .ctld-lang-menu {
        background: #ffffff;
        border: 1px solid #cccccc;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        padding: 4px 0;
        min-width: 160px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        font-size: 14px;
        color: #222f3e;
      }
      .ctld-lang-menu .tox-collection__item {
        padding: 6px 14px;
        cursor: pointer;
        color: #222f3e;
      }
      .ctld-lang-menu .tox-collection__item--active,
      .ctld-lang-menu .tox-collection__item:hover {
        background: #dee0e2;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  injectStylesheet();
  waitForMenubar();
})();
