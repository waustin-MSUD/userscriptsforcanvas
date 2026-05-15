// ==UserScript==
// @name          Font "em" Sizing
// @version       2026.05.15
// @namespace     CTLD
// @description   RCE menu to apply em units instead of points for font sizes.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/FontEmSize.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*/pages/*/edit
// @match         https://*.instructure.com/courses/*/assignments/*/edit
// @match         https://*.instructure.com/courses/*/discussion_topics/*/edit
// @match         https://*.instructure.com/courses/*/quizzes/*/edit
// @match         https://*.instructure.com/courses/*/assignments/syllabus
// @grant         unsafeWindow
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Configuration ────────────────────────────────────────────
  // Set UNIT to 'em' or 'rem'. em scales relative to the parent
  // element's font size; rem scales relative to the page root.
  // For Canvas content, em is usually what you want — it lets a
  // sized container (like a callout box) scale its contents.
  const UNIT = 'em';

  // Round steps as requested. Add or remove values freely.
  const SIZES = [0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

  // Button label shown in the toolbar.
  const BUTTON_LABEL = `Size (${UNIT})`;

  // ─── Format registration ──────────────────────────────────────
  // Register one TinyMCE format per size. Using the formatter
  // (instead of raw HTML insertion) handles selection edges,
  // nested spans, and toggling cleanly.
  function registerFormats(editor) {
    SIZES.forEach((size) => {
      const formatName = `emfontsize_${String(size).replace('.', '_')}`;
      editor.formatter.register(formatName, {
        inline: 'span',
        styles: { 'font-size': `${size}${UNIT}` },
      });
    });
  }

  function formatNameForSize(size) {
    return `emfontsize_${String(size).replace('.', '_')}`;
  }

  // ─── Dropdown registration ────────────────────────────────────
  function addDropdownToEditor(editor) {
    if (!editor || editor._emFontSizeAdded) return;
    editor._emFontSizeAdded = true;

    registerFormats(editor);
    injectToolbarButton(editor);
  }

  // ─── Direct DOM injection ─────────────────────────────────────
  // TinyMCE renders its toolbar once at init and doesn't re-render
  // when settings change post-init. So we inject a button directly
  // into the rendered DOM, styled to match TinyMCE's native buttons.
  function injectToolbarButton(editor) {
    // The toolbar lives in a container that's a sibling of the
    // iframe. Wait for it to render before injecting.
    let attempts = 0;
    const maxAttempts = 40;

    const interval = setInterval(() => {
      attempts++;
      const container = editor.getContainer?.();
      if (!container) {
        if (attempts >= maxAttempts) clearInterval(interval);
        return;
      }

      // Find the rendered font-size control. TinyMCE renders it as
      // a .tox-tbtn (or .tox-split-button) with a data attribute or
      // recognizable text. We look for it inside the toolbar.
      const fontSizeBtn = findFontSizeButton(container);
      if (!fontSizeBtn) {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          console.warn('[em/rem font size] Could not find existing font size button in toolbar.');
        }
        return;
      }

      // Already injected?
      if (container.querySelector('.ct-emfontsize-btn')) {
        clearInterval(interval);
        return;
      }

      clearInterval(interval);
      const btn = buildButton(editor);
      fontSizeBtn.parentNode.insertBefore(btn, fontSizeBtn.nextSibling);
    }, 250);
  }

  // Locate the rendered fontsize control in the toolbar DOM.
  // It's typically a .tox-tbtn or .tox-split-button containing
  // text like "12pt" or a numeric value.
  function findFontSizeButton(container) {
    // Look for buttons inside toolbar groups.
    const buttons = container.querySelectorAll(
      '.tox-tbtn, .tox-split-button, .tox-number-input'
    );
    for (const b of buttons) {
      const label = (b.textContent || '').trim();
      // Numeric labels (with or without 'pt') indicate the fontsize control.
      if (/^\d+(\.\d+)?\s*pt?$/i.test(label) || /^\d+(\.\d+)?$/.test(label)) {
        return b;
      }
      // Also check aria-label as backup.
      const aria = b.getAttribute('aria-label') || '';
      if (/font\s*size/i.test(aria)) return b;
    }
    return null;
  }

  // Build a button styled to match TinyMCE's native toolbar buttons.
  function buildButton(editor) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tox-tbtn tox-tbtn--select ct-emfontsize-btn';
    btn.setAttribute('aria-label', BUTTON_LABEL);
    btn.setAttribute('title', `Apply font size in ${UNIT} units`);
    btn.style.cssText = 'display: flex; align-items: center;';
    btn.innerHTML = `
      <span class="tox-tbtn__select-label" style="margin: 0 4px;">${BUTTON_LABEL}</span>
      <span class="tox-tbtn__select-chevron">
        <svg width="10" height="10" viewBox="0 0 10 10" focusable="false">
          <path d="M8.7 2.2c.3-.3.8-.3 1.1 0 .3.3.3.7 0 1l-4.2 4.4c-.3.3-.8.3-1.1 0L.3 3.2C0 2.9 0 2.5.3 2.2c.3-.3.8-.3 1.1 0L5 6l3.7-3.8z" fill="currentColor" fill-rule="evenodd"></path>
        </svg>
      </span>
    `;

    let menu = null;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu && menu.parentNode) {
        closeMenu();
        return;
      }
      menu = buildMenu(editor, btn, () => closeMenu());
      document.body.appendChild(menu);
      positionMenu(menu, btn);

      // Close on outside click.
      setTimeout(() => {
        document.addEventListener('click', outsideClickHandler, { once: true });
      }, 0);
    });

    function closeMenu() {
      if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
      menu = null;
    }

    function outsideClickHandler(e) {
      if (menu && !menu.contains(e.target) && e.target !== btn) {
        closeMenu();
      } else if (menu) {
        // Click was inside menu but not on an item; reattach handler.
        setTimeout(() => {
          document.addEventListener('click', outsideClickHandler, { once: true });
        }, 0);
      }
    }

    return btn;
  }

  // Build the menu element with size options.
  function buildMenu(editor, anchorBtn, onPick) {
    const menu = document.createElement('div');
    menu.className = 'tox-menu tox-collection tox-collection--list ct-emfontsize-menu';
    menu.style.cssText = `
      position: absolute;
      z-index: 100000;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 4px 0;
      min-width: 100px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    `;

    SIZES.forEach((size) => {
      const item = document.createElement('div');
      item.className = 'tox-collection__item ct-emfontsize-item';
      item.style.cssText = `
        padding: 6px 14px;
        cursor: pointer;
        color: #222f3e;
        font-size: ${size}em;
        line-height: 1.2;
      `;
      item.textContent = `${size}${UNIT}`;
      item.addEventListener('mouseenter', () => {
        item.style.background = '#dee0e2';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = '';
      });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        editor.focus();
        editor.formatter.apply(formatNameForSize(size));
        onPick();
      });
      menu.appendChild(item);
    });

    return menu;
  }

  function positionMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${rect.left + window.scrollX}px`;
    menu.style.top = `${rect.bottom + window.scrollY + 2}px`;
  }

  // ─── Boot ─────────────────────────────────────────────────────
  // Wait for TinyMCE to exist and have an active editor. Canvas
  // loads it asynchronously, sometimes well after page idle.
  function waitForEditor() {
    let attempts = 0;
    const maxAttempts = 60; // ~30s at 500ms intervals

    const interval = setInterval(() => {
      attempts++;
      const tinymce = unsafeWindow.tinymce;

      if (tinymce?.activeEditor && tinymce.activeEditor.initialized) {
        clearInterval(interval);
        addDropdownToEditor(tinymce.activeEditor);

        // Also handle the case where the editor is replaced or
        // re-initialized (e.g., when switching between RCE views).
        tinymce.on('AddEditor', (e) => {
          if (e.editor && !e.editor._emFontSizeAdded) {
            // Wait for the new editor to initialize before patching.
            e.editor.on('init', () => addDropdownToEditor(e.editor));
          }
        });
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn('[em/rem font size] TinyMCE editor never appeared; giving up.');
      }
    }, 500);
  }

  waitForEditor();
})();
