// ==UserScript==
// @name          Language Highlighter (Edit Mode)
// @version       2026.05.15
// @namespace     CTLD
// @description   Highlights elements with a language attribute in edit mode.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/LangHighlightEdit.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://msudenver.instructure.com/courses/*/pages/*/edit
// @grant         GM_addStyle
// @grant         unsafeWindow
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'tmce-lang-boundary-style';
  const TOGGLE_CLASS = 'lang-highlight-on';

  const css = `
    /* Base boundary markers */
    html.${TOGGLE_CLASS} [lang]::before,
    html.${TOGGLE_CLASS} [lang]::after {
      font-size: 1em;
      font-weight: 700;
      line-height: 1;
      opacity: 0.85;
      user-select: none;
      vertical-align: text-top;
      text-shadow: 0.03em 0 currentColor;
    }

    html.${TOGGLE_CLASS} [lang]::before {
      content: "〖";
      margin-right: 0.15em;
    }

    html.${TOGGLE_CLASS} [lang]::after {
      content: "〗";
      margin-left: 0.15em;
    }

    /* Language color coding */
    html.${TOGGLE_CLASS} [lang="en"]::before,
    html.${TOGGLE_CLASS} [lang="en"]::after {
      color: rgba(120, 120, 120, 0.85);
    }

    html.${TOGGLE_CLASS} [lang="es"]::before,
    html.${TOGGLE_CLASS} [lang="es"]::after {
      color: rgba(210, 120, 40, 0.85);
    }

    html.${TOGGLE_CLASS} [lang="fr"]::before,
    html.${TOGGLE_CLASS} [lang="fr"]::after {
      color: rgba(40, 110, 200, 0.85);
    }

    html.${TOGGLE_CLASS} [lang="de"]::before,
    html.${TOGGLE_CLASS} [lang="de"]::after {
      color: rgba(200, 60, 120, 0.85);
    }

    html.${TOGGLE_CLASS} [lang="it"]::before,
    html.${TOGGLE_CLASS} [lang="it"]::after {
      color: rgba(60, 140, 95, 0.85);
    }

    /* Inline spans slightly quieter */
    html.${TOGGLE_CLASS} span[lang]::before,
    html.${TOGGLE_CLASS} span[lang]::after {
      opacity: 0.7;
    }
  `;

  function injectStyle(editor) {
    const iframe = editor.iframeElement;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc || !doc.head) return;

    if (doc.getElementById(STYLE_ID)) return;

    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    doc.head.appendChild(style);
  }

  function toggleEditorHighlight(editor) {
    const iframe = editor.iframeElement;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.documentElement.classList.toggle(TOGGLE_CLASS);

    // Restore focus to the editor so typing continues
    editor.focus();
  }

  function toggleAllEditors() {
    if (!unsafeWindow.tinymce || !Array.isArray(unsafeWindow.tinymce.editors)) {
      alert('Editor not ready yet.');
      return;
    }
    unsafeWindow.tinymce.editors.forEach(editor => {
      try {
        injectStyle(editor);
        toggleEditorHighlight(editor);
      } catch (_) {}
    });
  }

  function bindShortcut(editor) {
    const iframe = editor.iframeElement;
    if (!iframe) return;

    iframe.contentWindow.addEventListener(
      'keydown',
      e => {
        // Alt (Windows) / Option (macOS) + L
        if (e.altKey && e.code === 'KeyL') {
          e.preventDefault();
          toggleEditorHighlight(editor);
        }
      },
      true
    );
  }

  function scanEditors() {
    if (!unsafeWindow.tinymce || !Array.isArray(unsafeWindow.tinymce.editors)) return;

    unsafeWindow.tinymce.editors.forEach(editor => {
      try {
        injectStyle(editor);
        bindShortcut(editor);
      } catch (_) {
        // TinyMCE occasionally throws while initializing. We ignore it.
      }
    });
  }

  // Canvas loves to reinitialize editors without warning
  setInterval(scanEditors, 1000);

  // ─── Toolbar integration ──────────────────────────────────────
  if (unsafeWindow.canvasToolbar?._ready) {
    unsafeWindow.canvasToolbar.register({
      id: 'lang-highlight-edit',
      label: 'Language Highlight (Edit)',
      icon: '🌐',
      shortcut: 'Alt+L',
      order: 51,
      onClick: toggleAllEditors,
    });
  } else {
    unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
      unsafeWindow.canvasToolbar.register({
        id: 'lang-highlight-edit',
        label: 'Language Highlight (Edit)',
        icon: '🌐',
        shortcut: 'Alt+L',
        order: 51,
        onClick: toggleAllEditors,
      });
    }, { once: true });
    // No fallback button needed — keyboard shortcut is the original UI
  }
})();
