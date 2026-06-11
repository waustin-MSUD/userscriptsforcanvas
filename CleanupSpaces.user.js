// ==UserScript==
// @name          Clean Up Spaces
// @namespace     CTLD
// @version       2026.05.15
// @description   Remove &nbsp; characters and extra spaces after sentences when editing a page in Canvas.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/CleanupSpaces.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*/pages/*/edit
// @match         https://*.instructure.com/courses/*/assignments/*/edit
// @match         https://*.instructure.com/courses/*/discussion_topics/*/edit
// @match         https://*.instructure.com/courses/*/quizzes/*/edit
// @match         https://*.instructure.com/courses/*/announcements/*/edit
// @match         https://*.instructure.com/courses/*/assignments/syllabus
// @grant         GM_addStyle
// @run-at        document-idle
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
