// ==UserScript==
// @name          Canvas Toolbar System
// @version       2026.05.15
// @namespace     CTLD
// @description   Universal floating toolbar for Canvas LMS userscripts.
// @author        CTLD
// @updateurl
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/*
// @grant         GM_addStyle
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Config ─────────────────────────────────────────────────────
  const STORAGE_KEY = 'canvas-toolbar-pos';
  const TOOLBAR_ID = 'ctld-toolbar';
  const READY_EVENT = 'canvas-toolbar-ready';

  // ─── State ──────────────────────────────────────────────────────
  let expanded = false;
  let tools = [];       // [{ id, label, icon, onClick, order }]
  let toolbarEl = null;
  let fabEl = null;
  let listEl = null;
  let badgeEl = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartLeft = 0;
  let dragStartTop = 0;
  let hasMoved = false;

  // ─── Styles ─────────────────────────────────────────────────────
  GM_addStyle(`
    /* ── Toolbar container ── */
    #${TOOLBAR_ID} {
      position: fixed;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      user-select: none;
      transition: opacity 0.2s;
    }

    /* ── FAB (collapsed state) ── */
    .ct-fab {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: #1a1d23;
      border: 1px solid #2d3139;
      color: #8b90a3;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      box-shadow: 0 3px 14px rgba(0,0,0,0.3);
      transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
      position: relative;
    }
    .ct-fab:hover {
      background: #22262e;
      border-color: #3d4450;
      color: #b0b8c8;
      box-shadow: 0 4px 18px rgba(0,0,0,0.4);
    }
    .ct-fab:active {
      cursor: grabbing;
    }
    .ct-fab svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
      pointer-events: none;
    }

    /* ── Badge ── */
    .ct-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      background: #0b65c2;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      min-width: 16px;
      height: 16px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      pointer-events: none;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      transition: transform 0.2s, opacity 0.2s;
    }
    .ct-badge.ct-hidden {
      transform: scale(0);
      opacity: 0;
    }

    /* ── Expanded panel ── */
    .ct-panel {
      position: absolute;
      bottom: 52px;
      right: 0;
      background: #1a1d23;
      border: 1px solid #2d3139;
      border-radius: 12px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.4);
      min-width: 200px;
      overflow: hidden;
      opacity: 0;
      transform: translateY(8px) scale(0.96);
      pointer-events: none;
      transition: opacity 0.18s, transform 0.18s;
    }
    .ct-panel.ct-open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* ── Panel header ── */
    .ct-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px 8px;
      border-bottom: 1px solid #2d3139;
    }
    .ct-header-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #5a6070;
    }
    .ct-header-count {
      font-size: 11px;
      color: #444b58;
    }

    /* ── Tool list ── */
    .ct-list {
      list-style: none;
      margin: 0;
      padding: 6px 0;
    }
    .ct-tool {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 14px;
      cursor: pointer;
      color: #b0b8c8;
      transition: background 0.1s, color 0.1s;
      border: none;
      background: none;
      width: 100%;
      font-family: inherit;
      font-size: 13px;
      text-align: left;
    }
    .ct-tool:hover {
      background: rgba(255,255,255,0.05);
      color: #e0e4ec;
    }
    .ct-tool:active {
      background: rgba(255,255,255,0.08);
    }
    .ct-tool-icon {
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      flex-shrink: 0;
      border-radius: 6px;
      background: rgba(255,255,255,0.04);
    }
    .ct-tool-label {
      flex: 1;
      white-space: nowrap;
      font-weight: 500;
    }
    .ct-tool-key {
      font-size: 10px;
      color: #444b58;
      font-weight: 500;
      padding: 2px 5px;
      border-radius: 4px;
      background: rgba(255,255,255,0.03);
    }

    /* ── Empty state ── */
    .ct-empty {
      padding: 16px 14px;
      color: #444b58;
      font-size: 12px;
      text-align: center;
      font-style: italic;
    }

    /* ── Drag state ── */
    #${TOOLBAR_ID}.ct-dragging {
      opacity: 0.85;
    }
    #${TOOLBAR_ID}.ct-dragging .ct-fab {
      cursor: grabbing;
      box-shadow: 0 6px 24px rgba(0,0,0,0.5);
    }
  `);

  // ─── Load/save position ─────────────────────────────────────────
  function loadPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved.right === 'number' && typeof saved.bottom === 'number') {
        return saved;
      }
    } catch (_) {}
    return { right: 18, bottom: 18 };
  }

  function savePosition(right, bottom) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ right, bottom }));
    } catch (_) {}
  }

  // ─── Clamp position to viewport ─────────────────────────────────
  function clamp(right, bottom) {
    const maxRight = window.innerWidth - 52;
    const maxBottom = window.innerHeight - 52;
    return {
      right: Math.max(4, Math.min(right, maxRight)),
      bottom: Math.max(4, Math.min(bottom, maxBottom)),
    };
  }

  function applyPosition(right, bottom) {
    const pos = clamp(right, bottom);
    toolbarEl.style.right = pos.right + 'px';
    toolbarEl.style.bottom = pos.bottom + 'px';
    // Remove any left/top that might interfere
    toolbarEl.style.left = 'auto';
    toolbarEl.style.top = 'auto';
  }

  // ─── Build the toolbar DOM ──────────────────────────────────────
  function buildToolbar() {
    toolbarEl = document.createElement('div');
    toolbarEl.id = TOOLBAR_ID;

    const pos = loadPosition();
    applyPosition(pos.right, pos.bottom);

    // Panel (expanded state)
    const panel = document.createElement('div');
    panel.className = 'ct-panel';

    const header = document.createElement('div');
    header.className = 'ct-header';
    header.innerHTML = `
      <span class="ct-header-title">Tools</span>
      <span class="ct-header-count" id="ct-count"></span>
    `;

    listEl = document.createElement('ul');
    listEl.className = 'ct-list';

    panel.appendChild(header);
    panel.appendChild(listEl);

    // FAB
    fabEl = document.createElement('div');
    fabEl.className = 'ct-fab';
    fabEl.setAttribute('role', 'button');
    fabEl.setAttribute('aria-label', 'Canvas Tools');
    fabEl.setAttribute('title', 'Canvas Tools (drag to move)');
    fabEl.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>
      </svg>
    `;

    // Badge
    badgeEl = document.createElement('span');
    badgeEl.className = 'ct-badge ct-hidden';
    fabEl.appendChild(badgeEl);

    toolbarEl.appendChild(panel);
    toolbarEl.appendChild(fabEl);
    document.body.appendChild(toolbarEl);

    // ── Click to toggle (only if not dragged) ──
    fabEl.addEventListener('mouseup', (e) => {
      if (!hasMoved) {
        togglePanel();
      }
    });

    // ── Drag handling ──
    fabEl.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);

    // Close panel on outside click
    document.addEventListener('click', (e) => {
      if (expanded && !toolbarEl.contains(e.target)) {
        closePanel();
      }
    });

    // Recalculate on resize
    window.addEventListener('resize', () => {
      const pos = loadPosition();
      applyPosition(pos.right, pos.bottom);
    });

    renderTools();
  }

  // ─── Drag logic ─────────────────────────────────────────────────
  function startDrag(e) {
    isDragging = true;
    hasMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    // Current position
    const rect = toolbarEl.getBoundingClientRect();
    dragStartLeft = rect.left;
    dragStartTop = rect.top;
    toolbarEl.classList.add('ct-dragging');
    e.preventDefault();
  }

  function onDrag(e) {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMoved = true;
    }
    if (!hasMoved) return;

    // Close panel while dragging
    if (expanded) closePanel();

    const newLeft = dragStartLeft + dx;
    const newTop = dragStartTop + dy;
    // Convert to right/bottom
    const newRight = window.innerWidth - newLeft - 44;
    const newBottom = window.innerHeight - newTop - 44;
    applyPosition(newRight, newBottom);
  }

  function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    toolbarEl.classList.remove('ct-dragging');
    if (hasMoved) {
      // Save final position
      const rect = toolbarEl.getBoundingClientRect();
      const right = window.innerWidth - rect.right;
      const bottom = window.innerHeight - rect.bottom;
      savePosition(right, bottom);
    }
  }

  // ─── Panel toggle ───────────────────────────────────────────────
  function togglePanel() {
    if (expanded) closePanel();
    else openPanel();
  }

  function openPanel() {
    expanded = true;
    toolbarEl.querySelector('.ct-panel').classList.add('ct-open');
    fabEl.setAttribute('aria-expanded', 'true');
  }

  function closePanel() {
    expanded = false;
    toolbarEl.querySelector('.ct-panel').classList.remove('ct-open');
    fabEl.setAttribute('aria-expanded', 'false');
  }

  // ─── Render the tool list ───────────────────────────────────────
  function renderTools() {
    if (!listEl) return;

    // Sort by order, then by registration time
    const sorted = [...tools].sort((a, b) => (a.order || 50) - (b.order || 50));

    listEl.innerHTML = '';

    if (sorted.length === 0) {
      listEl.innerHTML = '<li class="ct-empty">No tools on this page</li>';
    } else {
      for (const tool of sorted) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.className = 'ct-tool';
        btn.type = 'button';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'ct-tool-icon';
        iconSpan.textContent = tool.icon || '⚙';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'ct-tool-label';
        labelSpan.textContent = tool.label;

        btn.appendChild(iconSpan);
        btn.appendChild(labelSpan);

        if (tool.shortcut) {
          const keySpan = document.createElement('span');
          keySpan.className = 'ct-tool-key';
          keySpan.textContent = tool.shortcut;
          btn.appendChild(keySpan);
        }

        btn.addEventListener('click', () => {
          closePanel();
          try {
            tool.onClick();
          } catch (err) {
            console.error(`[Canvas Toolbar] Error in tool "${tool.id}":`, err);
          }
        });

        li.appendChild(btn);
        listEl.appendChild(li);
      }
    }

    // Update badge
    updateBadge();

    // Update count
    const countEl = toolbarEl.querySelector('#ct-count');
    if (countEl) countEl.textContent = tools.length ? `${tools.length}` : '';
  }

  function updateBadge() {
    if (!badgeEl) return;
    if (tools.length > 0) {
      badgeEl.textContent = tools.length;
      badgeEl.classList.remove('ct-hidden');
    } else {
      badgeEl.classList.add('ct-hidden');
    }
  }

  // ─── Public API ─────────────────────────────────────────────────
  const api = {
    /**
     * Register a tool with the toolbar.
     * @param {Object} opts
     * @param {string} opts.id        - Unique identifier
     * @param {string} opts.label     - Display name
     * @param {string} [opts.icon]    - Emoji or short string for the icon
     * @param {string} [opts.shortcut]- Keyboard shortcut hint (display only)
     * @param {number} [opts.order]   - Sort order (lower = higher in list, default 50)
     * @param {Function} opts.onClick - Called when the tool is activated
     */
    register(opts) {
      if (!opts || !opts.id || !opts.onClick) {
        console.warn('[Canvas Toolbar] register() requires id and onClick');
        return;
      }
      // Prevent duplicates
      const existing = tools.findIndex((t) => t.id === opts.id);
      if (existing >= 0) {
        tools[existing] = { ...tools[existing], ...opts };
      } else {
        tools.push(opts);
      }
      renderTools();
      console.log(`[Canvas Toolbar] Registered: ${opts.label || opts.id}`);
    },

    /**
     * Remove a tool from the toolbar.
     * @param {string} id
     */
    unregister(id) {
      tools = tools.filter((t) => t.id !== id);
      renderTools();
    },

    /**
     * Check if the toolbar is available.
     * @returns {boolean}
     */
    isReady() {
      return true;
    },
  };

  // ─── Boot ───────────────────────────────────────────────────────
  function boot() {
    buildToolbar();

    // Expose the API globally on the page's real window
    unsafeWindow.canvasToolbar = api;
    unsafeWindow.canvasToolbar._ready = true;

    // Dispatch ready event for scripts that are waiting
    unsafeWindow.dispatchEvent(new CustomEvent(READY_EVENT));

    console.log('[Canvas Toolbar] Ready');
  }

  boot();
})();
