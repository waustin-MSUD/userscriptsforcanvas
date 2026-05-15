// ==UserScript==
// @name          Accessibility Checker
// @version       2026.05.15
// @namespace     CTLD
// @description   Adds a toggle button to check accessibility issues (WCAG 2.1 AA) on Canvas pages.
// @author        CTLD
// @updateurl     https://msudenver.instructure.com/files/20821942/download
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://msudenver.instructure.com/courses/*/pages/*
// @match         https://msudenver.instructure.com/courses/*/assignments/*
// @match         https://msudenver.instructure.com/courses/*/discussion_topics/*
// @match         https://msudenver.instructure.com/courses/*/quizzes/*
// @grant         GM_addStyle
// @grant         unsafeWindow
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  // Abort if we're in edit mode with TinyMCE / RCE present
  if (
    document.querySelector('.tox-editor-container') ||
    document.querySelector('.mce-content-body') ||
    document.querySelector('.ic-RichContentEditor')
  ) return;

  let axeLoaded = false;
  let overlayVisible = false;

  // Load axe-core script onto the real page
  function loadAxe() {
    return new Promise((resolve, reject) => {
      if (unsafeWindow.axe) { axeLoaded = true; resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js';
      s.onload = () => { axeLoaded = true; resolve(); };
      s.onerror = () => reject(new Error('Failed to load axe-core'));
      document.head.appendChild(s);
    });
  }

  function toggleAccessibilityCheck() {
    if (!overlayVisible) {
      runAccessibilityCheck();
    } else {
      removeHighlights();
    }
    overlayVisible = !overlayVisible;
  }

  async function runAccessibilityCheck() {
    try {
      if (!axeLoaded) await loadAxe();
      const results = await unsafeWindow.axe.run(document.querySelector('#content'), {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21aa']
        }
      });
      highlightIssues(results.violations);
    } catch (err) {
      console.error('Axe check failed:', err);
      alert('Accessibility check failed: ' + err.message);
    }
  }

  function highlightIssues(violations) {
    removeHighlights();
    violations.forEach(v => {
      v.nodes.forEach(node => {
        node.target.forEach(selector => {
          const el = document.querySelector(selector);
          if (el) {
            el.classList.add('axe-highlight');
            el.setAttribute('data-axe-issue', v.help);
          }
        });
      });
    });
    injectHighlightStyles();
  }

  function injectHighlightStyles() {
    if (document.getElementById('axe-highlight-style')) return;
    const style = document.createElement('style');
    style.id = 'axe-highlight-style';
    style.textContent = `
      .axe-highlight {
        outline: 3px solid #ff9800 !important;
        outline-offset: 2px;
        position: relative;
      }
      .axe-highlight::after {
        content: attr(data-axe-issue);
        position: absolute;
        top: 0;
        left: 100%;
        margin-left: 8px;
        background: #ff9800;
        color: white;
        font-size: 0.85em;
        padding: 4px 8px;
        border-radius: 4px;
        white-space: normal;
        max-width: 200px;
        z-index: 99999;
        line-height: 1.2;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        display: none;
      }
      .axe-highlight:hover::after {
        display: block;
      }
      .axe-highlight {
        overflow: visible !important;
      }
    `;
    document.head.appendChild(style);
  }

  function removeHighlights() {
    document.querySelectorAll('.axe-highlight').forEach(el => {
      el.classList.remove('axe-highlight');
      el.removeAttribute('data-axe-issue');
    });
    const style = document.getElementById('axe-highlight-style');
    if (style) style.remove();
  }

  // ─── Toolbar integration ──────────────────────────────────────
  function createOwnButton() {
    if (document.getElementById('a11y-check-button')) return;

    const button = document.createElement('button');
    button.textContent = 'Check Accessibility';
    button.style.position = 'fixed';
    button.style.bottom = '20px';
    button.style.right = '20px';
    button.style.zIndex = '10000';
    button.style.padding = '10px 16px';
    button.style.border = 'none';
    button.style.borderRadius = '6px';
    button.style.backgroundColor = '#1976d2';
    button.style.color = 'white';
    button.style.fontWeight = 'bold';
    button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
    button.style.cursor = 'pointer';
    button.setAttribute('id', 'a11y-check-button');

    button.addEventListener('click', () => {
      toggleAccessibilityCheck();
      button.textContent = overlayVisible ? 'Hide Accessibility' : 'Check Accessibility';
    });

    document.body.appendChild(button);
  }

  // Preload axe-core so the first toolbar click isn't slow
  loadAxe().catch(() => {});

  if (unsafeWindow.canvasToolbar?._ready) {
    unsafeWindow.canvasToolbar.register({
      id: 'a11y-checker',
      label: 'Accessibility Check',
      icon: '♿',
      order: 10,
      onClick: toggleAccessibilityCheck,
    });
  } else {
    unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
      unsafeWindow.canvasToolbar.register({
        id: 'a11y-checker',
        label: 'Accessibility Check',
        icon: '♿',
        order: 10,
        onClick: toggleAccessibilityCheck,
      });
    }, { once: true });
    // Fallback: if toolbar never loads, create own button after 3s
    setTimeout(() => {
      if (!unsafeWindow.canvasToolbar?._ready) createOwnButton();
    }, 3000);
  }
})();
