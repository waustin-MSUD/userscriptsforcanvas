// ==UserScript==
// @name         Cleanup Spaces
// @namespace    CTLD
// @version      2026.06.11
// @description  Replace nbsp with spaces and collapse multiple spaces after end-of-sentence punctuation in the Canvas RCE
// @author       CTLD
// @match        https://*.instructure.com/*
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  function getActiveEditor() {
    const eds = (win.tinymce && win.tinymce.editors) || [];
    return (
      eds.find((ed) => ed && !ed.isHidden() && ed.hasFocus && ed.hasFocus()) ||
      eds.find((ed) => ed && !ed.isHidden()) ||
      null
    );
  }

  function cleanupTextNode(node) {
    let text = node.nodeValue;

    // 1. nbsp -> regular space
    text = text.replace(/\u00A0/g, ' ');

    // 2. End-of-sentence punctuation followed by 2+ spaces -> punctuation + single space
    text = text.replace(/([.!?:;])[ ]{2,}/g, '$1 ');

    if (text !== node.nodeValue) node.nodeValue = text;
  }

  function cleanup() {
    const ed = getActiveEditor();
    if (!ed) {
      alert('No active Canvas RCE editor found. Click into a content area first.');
      return;
    }

    const body = ed.getBody();
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    ed.undoManager.transact(() => {
      nodes.forEach(cleanupTextNode);
    });

    ed.setDirty(true);
    ed.fire('change');
  }

  function register() {
    if (win.canvasToolbar && typeof win.canvasToolbar.register === 'function') {
      win.canvasToolbar.register({
        id: 'cleanup-spaces',
        label: 'Cleanup Spaces',
        icon: '␣',
        order: 50,
        onClick: cleanup,
      });
      return true;
    }
    return false;
  }

  // Register now if the toolbar already loaded, otherwise wait for its ready event.
  if (!register()) {
    win.addEventListener('canvas-toolbar-ready', register, { once: true });
  }
})();
