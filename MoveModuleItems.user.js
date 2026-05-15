// ==UserScript==
// @name          Move Module Items
// @version       2026.05.15
// @namespace     CTLD
// @description   Select multiple module items and batch-move them to another module via the Canvas API.
// @author        CTLD
// @updateurl
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*/modules
// @match         https://*.instructure.com/courses/*/modules?*
// @grant         GM_addStyle
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  const PER_PAGE = 100;
  const THROTTLE_MS = 200;

  let selecting = false;
  let selectedItems = new Map(); // moduleItemId → { moduleId, title, element }
  let modulesCache = null;      // [{ id, name, position }]

  // ─── Helpers ────────────────────────────────────────────────────
  function getCourseId() {
    const m = location.pathname.match(/\/courses\/(\d+)/);
    return m ? m[1] : null;
  }

  function getCSRFToken() {
    const match = document.cookie.match(/(?:^|;\s*)_csrf_token=([^;]*)/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      ...options,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${path} ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  async function fetchAllPages(path, params = {}) {
    const out = [];
    let page = 1;
    while (true) {
      const url = new URL(path, location.origin);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      url.searchParams.set('page', page);
      url.searchParams.set('per_page', PER_PAGE);
      const chunk = await apiFetch(url.pathname + url.search);
      out.push(...chunk);
      if (!Array.isArray(chunk) || chunk.length < PER_PAGE) break;
      page += 1;
      await sleep(THROTTLE_MS);
    }
    return out;
  }

  // ─── Fetch modules list ─────────────────────────────────────────
  async function getModules() {
    if (modulesCache) return modulesCache;
    const courseId = getCourseId();
    const modules = await fetchAllPages(`/api/v1/courses/${courseId}/modules`);
    modulesCache = modules.map((m) => ({
      id: m.id,
      name: m.name,
      position: m.position,
    }));
    return modulesCache;
  }

  // ─── Move a single item to a new module ─────────────────────────
  async function moveItem(courseId, currentModuleId, itemId, targetModuleId) {
    const csrf = getCSRFToken();
    return apiFetch(
      `/api/v1/courses/${courseId}/modules/${currentModuleId}/items/${itemId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify({
          module_item: {
            module_id: targetModuleId,
          },
        }),
      }
    );
  }

  // ─── Parse module item data from DOM ────────────────────────────
  // Canvas module items have data attributes or IDs we can extract.
  // The item row typically has id="context_module_item_XXXX"
  // The parent module has id="context_module_XXXX"
  function parseItemElement(el) {
    // Walk up to find the item container
    const itemRow = el.closest('[id^="context_module_item_"]');
    if (!itemRow) return null;

    // Skip subheaders — they can't be moved
    if (itemRow.classList.contains('context_module_sub_header')) return null;

    const itemId = itemRow.id.replace('context_module_item_', '');
    if (!itemId || isNaN(itemId)) return null;

    // Find parent module — must match context_module_XXXX but NOT context_module_item_XXXX
    const moduleContainer = itemRow.closest('.context_module');
    if (!moduleContainer) return null;

    const moduleIdMatch = moduleContainer.id.match(/^context_module_(\d+)$/);
    if (!moduleIdMatch) return null;
    const moduleId = moduleIdMatch[1];

    // Get title
    const titleEl =
      itemRow.querySelector('.ig-title') ||
      itemRow.querySelector('.item_name a') ||
      itemRow.querySelector('.title');
    const title = titleEl?.textContent?.trim() || `Item ${itemId}`;

    return { itemId, moduleId, title, element: itemRow };
  }

  // ─── Selection mode ─────────────────────────────────────────────
  function enterSelectionMode() {
    selecting = true;
    selectedItems.clear();
    document.body.classList.add('bm-selecting');
    updatePanel();
  }

  function exitSelectionMode() {
    selecting = false;
    // Remove selection highlights
    document.querySelectorAll('.bm-selected').forEach((el) => {
      el.classList.remove('bm-selected');
    });
    selectedItems.clear();
    document.body.classList.remove('bm-selecting');
    updatePanel();
  }

  function toggleItem(el) {
    const data = parseItemElement(el);
    if (!data) return;

    const key = data.itemId;
    if (selectedItems.has(key)) {
      selectedItems.delete(key);
      data.element.classList.remove('bm-selected');
    } else {
      selectedItems.set(key, data);
      data.element.classList.add('bm-selected');
    }
    updatePanel();
  }

  // ─── Click handler (delegated) ──────────────────────────────────
  function handleClick(e) {
    if (!selecting) return;

    // Find if this click is inside a module item row
    const itemRow = e.target.closest('[id^="context_module_item_"]');
    if (!itemRow) return;

    // Protect admin controls (gear menu, drag handle, etc.) — let those work normally
    if (e.target.closest('.al-trigger, .al-options, .ig-admin, [class*="drag_handle"]')) return;

    // Protect inputs/selects inside module items (rare, but possible)
    const tag = e.target.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;

    // In selection mode, intercept everything else — including title links
    e.preventDefault();
    e.stopPropagation();
    toggleItem(itemRow);
  }

  // ─── Batch move execution ───────────────────────────────────────
  async function executeBatchMove(targetModuleId) {
    const courseId = getCourseId();
    const items = [...selectedItems.values()];
    const total = items.length;
    let done = 0;
    let errors = 0;

    setPhase('Moving items…');
    setProgress(0, total);

    for (const item of items) {
      try {
        setDetail(`${done + 1}/${total}: ${item.title}`);
        await moveItem(courseId, item.moduleId, item.itemId, targetModuleId);
        done += 1;
        setProgress(done, total);
      } catch (err) {
        console.error(`[Batch Move] Failed to move item ${item.itemId}:`, err);
        errors += 1;
        done += 1;
        setProgress(done, total);
      }
      await sleep(THROTTLE_MS);
    }

    if (errors > 0) {
      setPhase('Done with errors');
      setDetail(`Moved ${done - errors}/${total}. ${errors} failed.`);
    } else {
      setPhase('Done');
      setDetail(`Moved ${done} items. Reloading…`);
      setTimeout(() => location.reload(), 1200);
    }
  }

  // ─── UI ─────────────────────────────────────────────────────────
  GM_addStyle(`
    /* ── Selection mode highlighting ── */
    body.bm-selecting [id^="context_module_item_"] {
      cursor: pointer;
      transition: background 0.1s;
    }
    body.bm-selecting [id^="context_module_item_"] a {
      cursor: pointer;
      pointer-events: none;
    }
    body.bm-selecting [id^="context_module_item_"]:hover {
      background: rgba(11, 101, 194, 0.06) !important;
    }
    [id^="context_module_item_"].bm-selected {
      background: rgba(11, 101, 194, 0.12) !important;
      border-left: 3px solid #0b65c2 !important;
    }

    /* ── Panel ── */
    .bm-panel {
      position: fixed; bottom: 118px; right: 18px; z-index: 9999;
      background: #111; color: #eee; padding: 14px 16px; border-radius: 12px;
      min-width: 300px; max-width: 380px;
      box-shadow: 0 4px 20px rgba(0,0,0,.35);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      transition: opacity 0.3s, transform 0.3s;
    }
    .bm-panel.bm-hidden {
      opacity: 0; transform: translateY(10px); pointer-events: none;
    }
    .bm-panel h3 {
      margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #fff;
    }
    .bm-row {
      display: flex; justify-content: space-between; align-items: center;
      gap: 8px; margin-bottom: 6px;
    }
    .bm-muted { color: #bbb; font-size: 12px; }
    .bm-strong { font-weight: 700; }
    .bm-bar {
      width: 100%; height: 6px; background: #333; border-radius: 4px;
      overflow: hidden; margin: 8px 0;
      display: none;
    }
    .bm-bar.bm-visible { display: block; }
    .bm-bar > div {
      height: 100%; background: #0b65c2; width: 0%;
      transition: width .15s linear;
    }
    .bm-actions {
      display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;
    }
    .bm-actions button, .bm-actions select {
      font-size: 12px; font-weight: 600; border: 0; border-radius: 8px;
      padding: 7px 14px; cursor: pointer; transition: background 0.15s;
      font-family: inherit;
    }
    .bm-btn-primary {
      background: #0b65c2; color: #fff;
    }
    .bm-btn-primary:hover { background: #0952a0; }
    .bm-btn-primary:disabled {
      background: #333; color: #666; cursor: default;
    }
    .bm-btn-danger {
      background: #b21d1d; color: #fff;
    }
    .bm-btn-danger:hover { background: #8f1717; }
    .bm-btn-secondary {
      background: #333; color: #ccc;
    }
    .bm-btn-secondary:hover { background: #444; }
    .bm-select {
      flex: 1; background: #222; color: #eee; border: 1px solid #444;
      border-radius: 8px; padding: 7px 10px; font-size: 12px;
      font-family: inherit; min-width: 0;
    }
    .bm-detail {
      color: #bbb; font-size: 11px; font-style: italic;
      min-height: 1.2em; margin-top: 4px;
    }

    /* ── Launch button ── */
    .bm-launch {
      position: fixed; bottom: 118px; right: 18px; z-index: 9999;
      background: #0b65c2; color: #fff; border: 0; padding: 10px 14px;
      border-radius: 10px; font-weight: 600; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.2); font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      transition: background 0.15s;
    }
    .bm-launch:hover { background: #0952a0; }
  `);

  // ─── Toolbar integration ──────────────────────────────────────
  function launchBatchMove() {
    showPanel();
    enterSelectionMode();
    populateModuleDropdown();
  }

  function createOwnButton() {
    const launchBtn = document.createElement('button');
    launchBtn.className = 'bm-launch';
    launchBtn.textContent = '⇄ Batch Move Items';
    launchBtn.addEventListener('click', () => {
      launchBtn.style.display = 'none';
      launchBatchMove();
    });
    document.body.appendChild(launchBtn);
  }

  if (unsafeWindow.canvasToolbar?._ready) {
    unsafeWindow.canvasToolbar.register({
      id: 'batch-move',
      label: 'Batch Move Items',
      icon: '⇄',
      order: 30,
      onClick: launchBatchMove,
    });
  } else {
    unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
      unsafeWindow.canvasToolbar.register({
        id: 'batch-move',
        label: 'Batch Move Items',
        icon: '⇄',
        order: 30,
        onClick: launchBatchMove,
      });
    }, { once: true });
    // Fallback: if toolbar never loads, create own button after 3s
    setTimeout(() => {
      if (!unsafeWindow.canvasToolbar?._ready) createOwnButton();
    }, 3000);
  }

  // ── Delegated click listener ──
  document.addEventListener('click', handleClick, true);

  // ── Panel ──
  let panelEl = null;

  function showPanel() {
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
    }

    panelEl = document.createElement('div');
    panelEl.className = 'bm-panel';
    panelEl.innerHTML = `
      <h3>Batch Move Module Items</h3>
      <div class="bm-row">
        <span>Selected: <span class="bm-strong" id="bm-count">0</span> items</span>
        <span class="bm-muted" id="bm-phase"></span>
      </div>
      <div class="bm-bar" id="bm-bar-wrap"><div id="bm-bar"></div></div>
      <div class="bm-detail" id="bm-detail">Click items in any module to select them.</div>
      <div class="bm-actions" id="bm-actions">
        <select class="bm-select" id="bm-target" disabled>
          <option value="">Loading modules…</option>
        </select>
        <button class="bm-btn-primary" id="bm-move" disabled>Move</button>
        <button class="bm-btn-secondary" id="bm-deselect">Clear</button>
        <button class="bm-btn-danger" id="bm-cancel-select">Cancel</button>
      </div>
    `;
    document.body.appendChild(panelEl);

    // Wire up Cancel button to close panel
    panelEl.querySelector('#bm-cancel-select').addEventListener('click', () => {
      exitSelectionMode();
      panelEl.classList.add('bm-hidden');
      setTimeout(() => {
        panelEl.remove();
        panelEl = null;
      }, 350);
    });

    panelEl.querySelector('#bm-deselect').addEventListener('click', () => {
      document.querySelectorAll('.bm-selected').forEach((el) => {
        el.classList.remove('bm-selected');
      });
      selectedItems.clear();
      updatePanel();
    });

    panelEl.querySelector('#bm-move').addEventListener('click', async () => {
      const select = panelEl.querySelector('#bm-target');
      const targetId = select.value;
      if (!targetId || selectedItems.size === 0) return;

      // Disable controls during move
      select.disabled = true;
      panelEl.querySelector('#bm-move').disabled = true;
      panelEl.querySelector('#bm-deselect').style.display = 'none';
      panelEl.querySelector('#bm-cancel-select').style.display = 'none';
      selecting = false;
      document.body.classList.remove('bm-selecting');

      const barWrap = panelEl.querySelector('#bm-bar-wrap');
      barWrap.classList.add('bm-visible');

      await executeBatchMove(targetId);
    });
  }

  async function populateModuleDropdown() {
    try {
      const modules = await getModules();
      const select = panelEl.querySelector('#bm-target');
      select.innerHTML = '<option value="">— Move to module —</option>';
      for (const mod of modules) {
        const opt = document.createElement('option');
        opt.value = mod.id;
        opt.textContent = mod.name;
        select.appendChild(opt);
      }
      select.disabled = false;
      select.addEventListener('change', () => updatePanel());
      setDetail('Click items to select them, then choose a destination.');
    } catch (err) {
      setDetail(`Failed to load modules: ${err.message}`);
    }
  }

  function updatePanel() {
    if (!panelEl) return;

    const countEl = panelEl.querySelector('#bm-count');
    if (countEl) countEl.textContent = selectedItems.size;

    const moveBtn = panelEl.querySelector('#bm-move');
    const targetSelect = panelEl.querySelector('#bm-target');
    if (moveBtn && targetSelect) {
      moveBtn.disabled = selectedItems.size === 0 || !targetSelect.value;
    }
  }

  function setPhase(text) {
    const el = panelEl?.querySelector('#bm-phase');
    if (el) el.textContent = text;
  }

  function setDetail(text) {
    const el = panelEl?.querySelector('#bm-detail');
    if (el) el.textContent = text;
  }

  function setProgress(done, total) {
    const bar = panelEl?.querySelector('#bm-bar');
    if (bar) {
      const pct = total ? Math.round((done / total) * 100) : 0;
      bar.style.width = `${pct}%`;
    }
  }
})();
