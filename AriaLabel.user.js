// ==UserScript==
// @name          Aria-label for Selected Text
// @version       2026.05.15
// @namespace     CTLD
// @description   Prompts for an aria-label and applies it to selected text.
// @author        CTLD
// @updateurl
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://msudenver.instructure.com/courses/*/pages/*/edit
// @grant         GM_addStyle
// @grant         unsafeWindow
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getEditor() {
    // Canvas usually exposes tinymce globally when the RCE is active
    if (unsafeWindow.tinymce?.activeEditor) return unsafeWindow.tinymce.activeEditor;

    // Fallback: find any initialized editor
    const editors = unsafeWindow.tinymce?.editors;
    if (Array.isArray(editors) && editors.length) {
      const focused = editors.find(e => e.hasFocus?.());
      return focused || editors[0];
    }
    return null;
  }

  function wrapSelection() {
    const ed = getEditor();
    if (!ed) return alert('Editor not ready yet. (Canvas is being Canvas.)');

    const selectedText = ed.selection.getContent({ format: 'text' })?.trim();
    const selectedHtml = ed.selection.getContent({ format: 'html' });

    if (!selectedText) return alert('Select some text in the editor first.');

    const label = prompt('Screen reader should announce:', selectedText);
    if (!label) return;

    // Preserve formatting inside the selection by wrapping the HTML, not the plain text
    const wrapped = `<span aria-label="${escapeAttr(label)}">${selectedHtml}</span>`;
    ed.selection.setContent(wrapped);
  }

  // ─── Toolbar integration ──────────────────────────────────────
  function createOwnButton() {
    if (document.getElementById('ctldAriaWrapBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'ctldAriaWrapBtn';
    btn.type = 'button';
    btn.textContent = 'aria-label';
    btn.style.position = 'fixed';
    btn.style.right = '200px';
    btn.style.bottom = '16px';
    btn.style.zIndex = '99999';
    btn.style.padding = '10px 16px';
    btn.style.borderRadius = '6px';
    btn.style.border = '1px solid #cfd8dc';
    btn.style.background = '#1976d2';
    btn.style.color = 'white';
    btn.style.boxShadow = '0 2px 10px rgba(0,0,0,.12)';
    btn.style.cursor = 'pointer';

    btn.addEventListener('click', wrapSelection);
    document.body.appendChild(btn);
  }

  if (unsafeWindow.canvasToolbar?._ready) {
    unsafeWindow.canvasToolbar.register({
      id: 'aria-label',
      label: 'Aria Label',
      icon: '♿',
      shortcut: 'Alt+L',
      order: 40,
      onClick: wrapSelection,
    });
  } else {
    unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
      unsafeWindow.canvasToolbar.register({
        id: 'aria-label',
        label: 'Aria Label',
        icon: '♿',
        shortcut: 'Alt+L',
        order: 40,
        onClick: wrapSelection,
      });
    }, { once: true });
    // Fallback: if toolbar never loads, create own button after 3s
    setTimeout(() => {
      if (!unsafeWindow.canvasToolbar?._ready) createOwnButton();
    }, 3000);
  }

  // Optional: hotkey Alt+L (label)
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'l') {
      const ed = getEditor();
      if (ed) {
        e.preventDefault();
        wrapSelection();
      }
    }
  });
})();
