// ==UserScript==
// @name          Page H2 Navigation (CSS)
// @version       2026.05.15
// @namespace     CTLD
// @description   Inserts a CSS-grid navigation bar for each H2 heading on a page.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/NavPageCSS.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*/pages/*/edit
// @grant         GM_addStyle
// @grant         unsafeWindow
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  function slugify(text) {
    return text.toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function buildNavHTML(h2s) {
    let html = `
      <div class="auto-nav" style="
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 0.5em;
        margin-bottom: 1em;
        background: #f9f9f9;
        padding: 0.75em;
        border-radius: 6px;
        border: 1px solid #ccc;">\n`;

    h2s.forEach(h2 => {
      const text = h2.textContent.trim();
      if (!text) return;
      let id = h2.id || slugify(text);
      h2.id = id;
      html += `  <a href="#${id}" style="
          text-align: center;
          background: #e2e2e2;
          text-decoration: none;
          color: #333;
          padding: 0.5em;
          border-radius: 4px;
          display: block;
          font-weight: bold;">${text}</a>\n`;
    });

    html += '</div>\n';
    return html;
  }

  function insertH2Nav() {
    const editor = unsafeWindow.tinymce?.activeEditor;
    if (!editor) return alert('Editor not ready yet.');

    const body = editor.getBody();
    const h2s = Array.from(body.querySelectorAll('h2')).filter(h => h.textContent.trim() !== '');

    if (h2s.length === 0) {
      alert('No <h2> headings found in the content.');
      return;
    }

    const navHTML = buildNavHTML(h2s);
    editor.selection.select(body.firstChild || body);
    editor.selection.collapse(true);
    editor.execCommand('mceInsertContent', false, navHTML);
  }

  // ─── Fallback: button in the RCE toolbar ──────────────────────
  function addButtonNextToSnippets() {
    const toolbar = document.querySelector('.tox-editor-header');
    if (!toolbar || document.getElementById('h2-cssnav-insert-button')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'ic-Form-control';
    wrapper.style.margin = '12px 0';

    const button = document.createElement('button');
    button.id = 'h2-cssnav-insert-button';
    button.className = 'Button';
    button.type = 'button';
    button.textContent = '↩️ Insert H2 Nav (Grid)';
    button.style.cursor = 'pointer';
    button.style.display = 'block';
    button.style.marginTop = '4px';

    button.addEventListener('click', insertH2Nav);
    wrapper.appendChild(button);

    const reference = document.getElementById('snippet-selector')?.parentNode || toolbar;
    reference.parentNode.insertBefore(wrapper, reference.nextSibling);
  }

  // ─── Toolbar integration ──────────────────────────────────────
  if (unsafeWindow.canvasToolbar?._ready) {
    unsafeWindow.canvasToolbar.register({
      id: 'insert-cssnav',
      label: 'Insert H2 Nav (Grid)',
      icon: '🧭',
      order: 42,
      onClick: insertH2Nav,
    });
  } else {
    unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
      unsafeWindow.canvasToolbar.register({
        id: 'insert-cssnav',
        label: 'Insert H2 Nav (Grid)',
        icon: '🧭',
        order: 42,
        onClick: insertH2Nav,
      });
    }, { once: true });
    // Fallback: inject button into RCE toolbar after 3s
    setTimeout(() => {
      if (!unsafeWindow.canvasToolbar?._ready) {
        const waitForEditor = setInterval(() => {
          if (document.querySelector('.tox-editor-header') && unsafeWindow.tinymce?.activeEditor) {
            clearInterval(waitForEditor);
            addButtonNextToSnippets();
          }
        }, 500);
      }
    }, 3000);
  }
})();
