// ==UserScript==
// @name          Rename Module Items
// @version       2026.05.15
// @namespace     CTLD
// @description   Pick a module, pick items, choose prefix/suffix/replace, preview, and apply changes.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/RenameModuleItems.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*/modules
// @grant         GM_addStyle
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  const PER_PAGE = 50;
  const THROTTLE_MS = 200;

  // ─── State ──────────────────────────────────────────────────────
  let modules = [];               // [{ id, name, items: [...] }]
  let selectedItems = new Set();  // Set<item.id>
  let currentModule = null;
  let mode = 'ap';                // 'ap' | 'as' | 'rp' | 'rs' | 'r'
  let inputs = {};                // { prefix, suffix, divider, from, to }
  let advanced = { caseInsensitive: false, regex: false };
  let modalEl = null;

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

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(path, { credentials: 'include', ...options });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const len = res.headers.get('content-length');
    if (len === '0') return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return res.json();
  }

  async function fetchAllPages(path, params = {}) {
    const out = [];
    let page = 1;
    while (true) {
      const url = new URL(path, location.origin);
      for (const [k, v] of Object.entries(params)) {
        if (Array.isArray(v)) for (const item of v) url.searchParams.append(k, item);
        else url.searchParams.set(k, v);
      }
      url.searchParams.set('page', page);
      url.searchParams.set('per_page', PER_PAGE);
      const chunk = await apiFetch(url.pathname + url.search);
      if (!Array.isArray(chunk)) break;
      out.push(...chunk);
      if (chunk.length < PER_PAGE) break;
      page += 1;
      await sleep(THROTTLE_MS);
    }
    return out;
  }

  // ─── Data fetch ─────────────────────────────────────────────────
  async function loadModules() {
    const courseId = getCourseId();
    const mods = await fetchAllPages(`/api/v1/courses/${courseId}/modules`, {
      'include[]': ['items'],
    });
    return mods
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((m) => ({
        id: String(m.id),
        name: m.name,
        items: (m.items || []).map((it) => ({
          id: String(it.id),
          title: it.title || `Item ${it.id}`,
          type: it.type,
        })),
      }));
  }

  function iconForType(type) {
    switch (type) {
      case 'Page': return '📄';
      case 'Assignment': return '📝';
      case 'Quiz': return '❓';
      case 'Discussion': return '💬';
      case 'ExternalUrl': return '🔗';
      case 'ExternalTool': return '🧩';
      case 'File': return '📁';
      case 'SubHeader': return '🏷️';
      default: return '•';
    }
  }

  // ─── Renaming transforms ────────────────────────────────────────
  function applyTransform(original) {
    if (mode === 'ap') {
      const prefix = (inputs.prefix || '') + (inputs.divider || '');
      return prefix + original;
    }
    if (mode === 'as') {
      const suffix = (inputs.divider || '') + (inputs.suffix || '');
      return original + suffix;
    }
    if (mode === 'rp') {
      const from = inputs.from || '';
      if (!from) return original;
      if (advanced.caseInsensitive) {
        const re = new RegExp('^' + escapeRegex(from), 'i');
        return original.replace(re, '');
      }
      return original.startsWith(from) ? original.slice(from.length) : original;
    }
    if (mode === 'rs') {
      const from = inputs.from || '';
      if (!from) return original;
      if (advanced.caseInsensitive) {
        const re = new RegExp(escapeRegex(from) + '$', 'i');
        return original.replace(re, '');
      }
      return original.endsWith(from) ? original.slice(0, -from.length) : original;
    }
    if (mode === 'r') {
      const from = inputs.from || '';
      const to = inputs.to || '';
      if (!from) return original;
      try {
        let pattern;
        let flags = 'g';
        if (advanced.caseInsensitive) flags += 'i';
        if (advanced.regex) {
          pattern = new RegExp(from, flags);
        } else {
          pattern = new RegExp(escapeRegex(from), flags);
        }
        return original.replace(pattern, to);
      } catch (err) {
        // Invalid regex → return original unchanged; UI will flag the error
        return original;
      }
    }
    return original;
  }

  function regexValid() {
    if (mode !== 'r' || !advanced.regex) return true;
    try {
      new RegExp(inputs.from || '');
      return true;
    } catch (err) {
      return false;
    }
  }

  // ─── API rename ─────────────────────────────────────────────────
  async function renameItem(courseId, moduleId, itemId, newTitle) {
    const csrf = getCSRFToken();
    return apiFetch(
      `/api/v1/courses/${courseId}/modules/${moduleId}/items/${itemId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify({ module_item: { title: newTitle } }),
      }
    );
  }

  async function executeRenames() {
    const courseId = getCourseId();
    if (!currentModule) return;

    const targets = currentModule.items
      .filter((it) => selectedItems.has(it.id))
      .map((it) => ({ ...it, newTitle: applyTransform(it.title) }))
      .filter((it) => it.newTitle !== it.title); // skip unchanged

    if (targets.length === 0) {
      setPhase('Nothing to rename — all selected items are unchanged.');
      return;
    }

    const total = targets.length;
    let done = 0;
    let errors = 0;

    setProgressVisible(true);
    setPhase(`Renaming 0/${total}…`);

    for (const t of targets) {
      try {
        setPhase(`${done + 1}/${total}: ${t.title}`);
        await renameItem(courseId, currentModule.id, t.id, t.newTitle);
        done += 1;
      } catch (err) {
        console.error(`[Rename Module Items] Failed for "${t.title}":`, err);
        errors += 1;
        done += 1;
      }
      setProgress(done, total);
      await sleep(THROTTLE_MS);
    }

    const renamed = total - errors;
    if (errors === 0) {
      setPhase(`Renamed ${renamed}. Reloading…`);
      setTimeout(() => location.reload(), 1200);
    } else {
      setPhase(`Renamed ${renamed}/${total}. ${errors} failed — see console.`);
      modalEl.querySelector('#rmi-cancel').disabled = false;
      modalEl.querySelector('#rmi-cancel').textContent = 'Close';
    }
  }

  // ─── Styles ─────────────────────────────────────────────────────
  GM_addStyle(`
    .rmi-backdrop {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
    }
    .rmi-modal {
      width: 92%; max-width: 640px; height: 86vh; max-height: 820px;
      background: #1a1d23; color: #e0e4ec;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      display: flex; flex-direction: column; overflow: hidden;
    }
    .rmi-header {
      background: #22262e;
      padding: 12px 18px;
      border-bottom: 1px solid #2d3139;
      display: flex; align-items: center; justify-content: space-between;
    }
    .rmi-header h2 {
      margin: 0; font-size: 14px; color: #fff; font-weight: 700;
    }
    .rmi-close {
      background: none; border: 0; color: #8b90a3; font-size: 20px;
      cursor: pointer; line-height: 1; padding: 0 4px;
    }
    .rmi-close:hover { color: #fff; }

    .rmi-body {
      flex: 1; overflow-y: auto;
      padding: 14px 18px;
      display: flex; flex-direction: column; gap: 14px;
    }
    .rmi-field { display: flex; flex-direction: column; gap: 5px; }
    .rmi-label {
      font-size: 11px; color: #8b90a3; text-transform: uppercase;
      letter-spacing: 0.05em; font-weight: 700;
    }
    .rmi-input, .rmi-select {
      background: #22262e; border: 1px solid #2d3139; color: #e0e4ec;
      padding: 6px 10px; border-radius: 6px; font-size: 13px;
      font-family: inherit; box-sizing: border-box; width: 100%;
    }
    .rmi-input:focus, .rmi-select:focus { outline: none; border-color: #0b65c2; }
    .rmi-input.rmi-invalid { border-color: #c62828; }

    .rmi-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .rmi-row > .rmi-field { flex: 1; min-width: 140px; }

    .rmi-mode-buttons {
      display: flex; flex-wrap: wrap; gap: 4px;
      background: #22262e; border-radius: 6px; padding: 3px;
    }
    .rmi-mode-btn {
      background: none; border: 0; color: #b0b8c8; padding: 5px 10px;
      cursor: pointer; font-size: 11px; font-weight: 600; border-radius: 4px;
      font-family: inherit; flex: 1; min-width: 80px;
    }
    .rmi-mode-btn:hover { color: #fff; }
    .rmi-mode-btn.rmi-active { background: #0b65c2; color: #fff; }

    .rmi-mode-inputs { display: none; flex-direction: column; gap: 6px; }
    .rmi-mode-inputs.rmi-visible { display: flex; }

    .rmi-advanced-toggle {
      background: none; border: 0; color: #8b90a3;
      font-size: 11px; cursor: pointer; padding: 4px 0; text-align: left;
      font-family: inherit; font-weight: 600;
    }
    .rmi-advanced-toggle:hover { color: #fff; }
    .rmi-advanced-panel {
      display: none;
      background: #22262e; padding: 10px 12px; border-radius: 6px;
      flex-direction: column; gap: 8px;
    }
    .rmi-advanced-panel.rmi-visible { display: flex; }
    .rmi-checkbox-row {
      display: flex; align-items: center; gap: 6px; font-size: 12px; color: #b0b8c8;
    }
    .rmi-checkbox-row label { cursor: pointer; }

    .rmi-items-toolbar {
      display: flex; gap: 4px; align-items: center; flex-wrap: wrap;
    }
    .rmi-mini-btn {
      background: #2d3139; color: #b0b8c8; border: 0;
      padding: 4px 8px; border-radius: 4px; font-size: 11px;
      cursor: pointer; font-family: inherit; font-weight: 600;
    }
    .rmi-mini-btn:hover { background: #3a3f4a; color: #fff; }

    .rmi-items-list {
      max-height: 280px; overflow-y: auto;
      background: #22262e; border-radius: 6px; padding: 4px 0;
    }
    .rmi-item {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 12px;
      cursor: pointer; transition: background 0.1s;
      font-size: 12px;
    }
    .rmi-item:hover { background: rgba(255,255,255,0.04); }
    .rmi-item.rmi-selected { background: rgba(11,101,194,0.16); }
    .rmi-item.rmi-unchanged .rmi-item-preview { color: #5a6070; font-style: italic; }
    .rmi-item-icon { width: 16px; text-align: center; }
    .rmi-item-title {
      flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      color: #e0e4ec;
    }
    .rmi-item-arrow { color: #8b90a3; font-size: 10px; }
    .rmi-item-preview {
      flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      color: #6ee07f; font-weight: 600;
    }
    .rmi-empty {
      padding: 20px; text-align: center; color: #8b90a3; font-style: italic; font-size: 12px;
    }

    .rmi-footer {
      padding: 12px 18px;
      border-top: 1px solid #2d3139;
      display: flex; gap: 8px; justify-content: flex-end; align-items: center;
    }
    .rmi-progress { flex: 1; }
    .rmi-bar {
      width: 100%; height: 5px; background: #2d3139; border-radius: 3px;
      overflow: hidden; margin-top: 4px; display: none;
    }
    .rmi-bar.rmi-visible { display: block; }
    .rmi-bar > div {
      height: 100%; background: #0b65c2; width: 0%;
      transition: width 0.15s linear;
    }
    .rmi-phase {
      font-size: 11px; color: #8b90a3; font-style: italic; min-height: 1.2em;
    }
    .rmi-btn {
      border: 0; padding: 7px 14px; border-radius: 6px;
      font-size: 12px; font-weight: 700; cursor: pointer;
      font-family: inherit;
    }
    .rmi-btn-cancel { background: #2d3139; color: #b0b8c8; }
    .rmi-btn-cancel:hover:not(:disabled) { background: #3a3f4a; color: #fff; }
    .rmi-btn-primary { background: #0b65c2; color: #fff; }
    .rmi-btn-primary:hover:not(:disabled) { background: #0952a0; }
    .rmi-btn-primary:disabled { background: #2d3139; color: #5a6070; cursor: default; }

    .rmi-launch {
      position: fixed; bottom: 210px; right: 18px; z-index: 9998;
      background: #0b65c2; color: #fff; border: 0; padding: 10px 14px;
      border-radius: 10px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.2); font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
    .rmi-launch:hover { background: #0952a0; }
  `);

  // ─── Modal ──────────────────────────────────────────────────────
  function buildModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'rmi-backdrop';
    backdrop.innerHTML = `
      <div class="rmi-modal" role="dialog" aria-labelledby="rmi-title">
        <div class="rmi-header">
          <h2 id="rmi-title">✏️ Rename Module Items</h2>
          <button class="rmi-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="rmi-body">

          <div class="rmi-field">
            <label class="rmi-label" for="rmi-module">Module</label>
            <select id="rmi-module" class="rmi-select" disabled>
              <option value="">Loading modules…</option>
            </select>
          </div>

          <div class="rmi-field">
            <label class="rmi-label">Transform</label>
            <div class="rmi-mode-buttons" role="group" aria-label="Rename mode">
              <button class="rmi-mode-btn rmi-active" data-mode="ap" type="button">Add Prefix</button>
              <button class="rmi-mode-btn" data-mode="as" type="button">Add Suffix</button>
              <button class="rmi-mode-btn" data-mode="rp" type="button">Remove Prefix</button>
              <button class="rmi-mode-btn" data-mode="rs" type="button">Remove Suffix</button>
              <button class="rmi-mode-btn" data-mode="r" type="button">Replace</button>
            </div>
          </div>

          <div class="rmi-mode-inputs rmi-visible" id="rmi-mode-ap">
            <div class="rmi-row">
              <div class="rmi-field">
                <label class="rmi-label" for="rmi-prefix">Prefix to add</label>
                <input type="text" id="rmi-prefix" class="rmi-input" placeholder="e.g. Week 1 - " />
              </div>
              <div class="rmi-field">
                <label class="rmi-label" for="rmi-divider-ap">Divider</label>
                <input type="text" id="rmi-divider-ap" class="rmi-input" placeholder="(optional)" />
              </div>
            </div>
          </div>

          <div class="rmi-mode-inputs" id="rmi-mode-as">
            <div class="rmi-row">
              <div class="rmi-field">
                <label class="rmi-label" for="rmi-divider-as">Divider</label>
                <input type="text" id="rmi-divider-as" class="rmi-input" placeholder="(optional)" />
              </div>
              <div class="rmi-field">
                <label class="rmi-label" for="rmi-suffix">Suffix to add</label>
                <input type="text" id="rmi-suffix" class="rmi-input" placeholder="e.g. (Draft)" />
              </div>
            </div>
          </div>

          <div class="rmi-mode-inputs" id="rmi-mode-rp">
            <div class="rmi-field">
              <label class="rmi-label" for="rmi-rp-from">Prefix to remove</label>
              <input type="text" id="rmi-rp-from" class="rmi-input" placeholder="e.g. Copy of " />
            </div>
          </div>

          <div class="rmi-mode-inputs" id="rmi-mode-rs">
            <div class="rmi-field">
              <label class="rmi-label" for="rmi-rs-from">Suffix to remove</label>
              <input type="text" id="rmi-rs-from" class="rmi-input" placeholder="e.g.  (draft)" />
            </div>
          </div>

          <div class="rmi-mode-inputs" id="rmi-mode-r">
            <div class="rmi-row">
              <div class="rmi-field">
                <label class="rmi-label" for="rmi-r-from">Find</label>
                <input type="text" id="rmi-r-from" class="rmi-input" placeholder="text to find" />
              </div>
              <div class="rmi-field">
                <label class="rmi-label" for="rmi-r-to">Replace with</label>
                <input type="text" id="rmi-r-to" class="rmi-input" placeholder="replacement" />
              </div>
            </div>
          </div>

          <div>
            <button class="rmi-advanced-toggle" id="rmi-advanced-toggle" type="button">
              ▸ Advanced options
            </button>
            <div class="rmi-advanced-panel" id="rmi-advanced-panel">
              <div class="rmi-checkbox-row">
                <input type="checkbox" id="rmi-case-insensitive" />
                <label for="rmi-case-insensitive">Case-insensitive matching</label>
              </div>
              <div class="rmi-checkbox-row">
                <input type="checkbox" id="rmi-regex" />
                <label for="rmi-regex">Use regex (Replace mode only)</label>
              </div>
            </div>
          </div>

          <div class="rmi-field">
            <label class="rmi-label">Items <span id="rmi-item-count" style="text-transform:none;color:#fff;">(0 selected)</span></label>
            <div class="rmi-items-toolbar">
              <button class="rmi-mini-btn" id="rmi-select-all" type="button">All</button>
              <button class="rmi-mini-btn" id="rmi-select-none" type="button">None</button>
              <button class="rmi-mini-btn" id="rmi-select-pages" type="button">📄 Pages</button>
              <button class="rmi-mini-btn" id="rmi-select-assignments" type="button">📝 Assignments</button>
              <button class="rmi-mini-btn" id="rmi-select-quizzes" type="button">❓ Quizzes</button>
              <button class="rmi-mini-btn" id="rmi-select-discussions" type="button">💬 Discussions</button>
            </div>
            <div class="rmi-items-list" id="rmi-items-list">
              <div class="rmi-empty">Pick a module to see its items.</div>
            </div>
          </div>

        </div>
        <div class="rmi-footer">
          <div class="rmi-progress">
            <div class="rmi-phase" id="rmi-phase"></div>
            <div class="rmi-bar" id="rmi-bar"><div></div></div>
          </div>
          <button class="rmi-btn rmi-btn-cancel" id="rmi-cancel" type="button">Cancel</button>
          <button class="rmi-btn rmi-btn-primary" id="rmi-apply" type="button" disabled>Apply</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    modalEl = backdrop.querySelector('.rmi-modal');
    return backdrop;
  }

  // ─── Wiring ─────────────────────────────────────────────────────
  function wireEvents(backdrop) {
    const $ = (sel) => modalEl.querySelector(sel);

    $('.rmi-close').addEventListener('click', closeModal);
    $('#rmi-cancel').addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    $('#rmi-module').addEventListener('change', (e) => {
      const id = e.target.value;
      currentModule = modules.find((m) => m.id === id) || null;
      // Reset selection to "all items in new module"
      selectedItems = new Set((currentModule?.items || []).map((it) => it.id));
      renderItems();
    });

    // Mode buttons
    modalEl.querySelectorAll('.rmi-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode;
        modalEl.querySelectorAll('.rmi-mode-btn').forEach((b) =>
          b.classList.toggle('rmi-active', b === btn)
        );
        // Show only the right input panel
        ['ap', 'as', 'rp', 'rs', 'r'].forEach((m) => {
          $(`#rmi-mode-${m}`).classList.toggle('rmi-visible', m === mode);
        });
        renderItems();
      });
    });

    // Mode input listeners
    const inputMap = {
      'rmi-prefix': 'prefix',
      'rmi-suffix': 'suffix',
      'rmi-divider-ap': 'divider',
      'rmi-divider-as': 'divider',
      'rmi-rp-from': 'from',
      'rmi-rs-from': 'from',
      'rmi-r-from': 'from',
      'rmi-r-to': 'to',
    };
    for (const [elId, key] of Object.entries(inputMap)) {
      $(`#${elId}`).addEventListener('input', (e) => {
        // The divider field for ap and as share a key. The two fields
        // live in different mode panels so only one is visible at a time.
        // The "from" field similarly shares across rp/rs/r.
        inputs[key] = e.target.value;
        renderItems();
      });
    }

    // Advanced toggle
    $('#rmi-advanced-toggle').addEventListener('click', () => {
      const panel = $('#rmi-advanced-panel');
      const toggle = $('#rmi-advanced-toggle');
      const open = panel.classList.toggle('rmi-visible');
      toggle.textContent = open ? '▾ Advanced options' : '▸ Advanced options';
    });

    $('#rmi-case-insensitive').addEventListener('change', (e) => {
      advanced.caseInsensitive = e.target.checked;
      renderItems();
    });
    $('#rmi-regex').addEventListener('change', (e) => {
      advanced.regex = e.target.checked;
      renderItems();
    });

    // Selection helpers
    $('#rmi-select-all').addEventListener('click', () => {
      if (!currentModule) return;
      selectedItems = new Set(currentModule.items.map((it) => it.id));
      renderItems();
    });
    $('#rmi-select-none').addEventListener('click', () => {
      selectedItems.clear();
      renderItems();
    });
    $('#rmi-select-pages').addEventListener('click', () => addTypeToSelection('Page'));
    $('#rmi-select-assignments').addEventListener('click', () => addTypeToSelection('Assignment'));
    $('#rmi-select-quizzes').addEventListener('click', () => addTypeToSelection('Quiz'));
    $('#rmi-select-discussions').addEventListener('click', () => addTypeToSelection('Discussion'));

    $('#rmi-apply').addEventListener('click', async () => {
      modalEl.querySelectorAll('button, input, select').forEach((el) => {
        if (!el.classList.contains('rmi-close')) el.disabled = true;
      });
      $('#rmi-bar').classList.add('rmi-visible');
      await executeRenames();
    });
  }

  function addTypeToSelection(type) {
    if (!currentModule) return;
    for (const it of currentModule.items) {
      if (it.type === type) selectedItems.add(it.id);
    }
    renderItems();
  }

  function closeModal() {
    if (modalEl) {
      modalEl.closest('.rmi-backdrop')?.remove();
      modalEl = null;
    }
    // Reset state
    selectedItems = new Set();
    currentModule = null;
    inputs = {};
    advanced = { caseInsensitive: false, regex: false };
    mode = 'ap';
  }

  function populateModuleDropdown() {
    const select = modalEl.querySelector('#rmi-module');
    select.innerHTML = '<option value="">— Pick a module —</option>';
    for (const m of modules) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.items.length} item${m.items.length === 1 ? '' : 's'})`;
      select.appendChild(opt);
    }
    select.disabled = false;
  }

  function renderItems() {
    const list = modalEl.querySelector('#rmi-items-list');
    const count = modalEl.querySelector('#rmi-item-count');

    if (!currentModule) {
      list.innerHTML = '<div class="rmi-empty">Pick a module to see its items.</div>';
      count.textContent = '(0 selected)';
      updateApplyButton();
      return;
    }
    if (currentModule.items.length === 0) {
      list.innerHTML = '<div class="rmi-empty">This module has no items.</div>';
      count.textContent = '(0 selected)';
      updateApplyButton();
      return;
    }

    // Flag regex errors on the find field
    const fromEl = modalEl.querySelector('#rmi-r-from');
    if (fromEl) {
      fromEl.classList.toggle('rmi-invalid', mode === 'r' && advanced.regex && !regexValid());
    }

    const rows = currentModule.items.map((it) => {
      const selected = selectedItems.has(it.id);
      const newTitle = applyTransform(it.title);
      const unchanged = newTitle === it.title;
      const classes = ['rmi-item'];
      if (selected) classes.push('rmi-selected');
      if (unchanged) classes.push('rmi-unchanged');
      const previewText = selected && !unchanged ? newTitle : (selected ? '(unchanged)' : '');
      return `
        <div class="${classes.join(' ')}" data-id="${escapeHTML(it.id)}">
          <input type="checkbox" ${selected ? 'checked' : ''} />
          <span class="rmi-item-icon" title="${escapeHTML(it.type)}">${iconForType(it.type)}</span>
          <span class="rmi-item-title">${escapeHTML(it.title)}</span>
          <span class="rmi-item-arrow">→</span>
          <span class="rmi-item-preview">${escapeHTML(previewText)}</span>
        </div>
      `;
    });
    list.innerHTML = rows.join('');

    list.querySelectorAll('.rmi-item').forEach((row) => {
      const id = row.dataset.id;
      row.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        toggleItem(id);
      });
      const cb = row.querySelector('input[type="checkbox"]');
      cb.addEventListener('change', () => toggleItem(id));
    });

    // Count text
    const total = currentModule.items.length;
    const sel = selectedItems.size;
    const willChange = currentModule.items.filter(
      (it) => selectedItems.has(it.id) && applyTransform(it.title) !== it.title
    ).length;
    count.textContent = `(${sel}/${total} selected — ${willChange} will change)`;
    updateApplyButton();
  }

  function toggleItem(id) {
    if (selectedItems.has(id)) selectedItems.delete(id);
    else selectedItems.add(id);
    renderItems();
  }

  function updateApplyButton() {
    if (!modalEl) return;
    const btn = modalEl.querySelector('#rmi-apply');
    if (!currentModule) {
      btn.disabled = true;
      return;
    }
    const willChange = currentModule.items.filter(
      (it) => selectedItems.has(it.id) && applyTransform(it.title) !== it.title
    ).length;
    btn.disabled = willChange === 0 || (mode === 'r' && advanced.regex && !regexValid());
  }

  function setPhase(text) {
    const el = modalEl?.querySelector('#rmi-phase');
    if (el) el.textContent = text;
  }
  function setProgressVisible(v) {
    const bar = modalEl?.querySelector('#rmi-bar');
    if (bar) bar.classList.toggle('rmi-visible', v);
  }
  function setProgress(done, total) {
    const bar = modalEl?.querySelector('#rmi-bar > div');
    if (bar) bar.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  }

  // ─── Launch ─────────────────────────────────────────────────────
  async function launch() {
    if (modalEl) return;
    const backdrop = buildModal();
    wireEvents(backdrop);

    try {
      modules = await loadModules();
      populateModuleDropdown();
    } catch (err) {
      console.error('[Rename Module Items] Failed to load modules:', err);
      setPhase(`Failed to load modules: ${err.message}`);
    }
  }

  // ─── Toolbar registration ───────────────────────────────────────
  function createOwnButton() {
    const btn = document.createElement('button');
    btn.className = 'rmi-launch';
    btn.textContent = '✏️ Rename Module Items';
    btn.addEventListener('click', launch);
    document.body.appendChild(btn);
  }

  if (unsafeWindow.canvasToolbar?._ready) {
    unsafeWindow.canvasToolbar.register({
      id: 'rename-module-items',
      label: 'Rename Module Items',
      icon: '✏️',
      order: 22,
      onClick: launch,
    });
  } else {
    unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
      unsafeWindow.canvasToolbar.register({
        id: 'rename-module-items',
        label: 'Rename Module Items',
        icon: '✏️',
        order: 22,
        onClick: launch,
      });
    }, { once: true });
    setTimeout(() => {
      if (!unsafeWindow.canvasToolbar?._ready) createOwnButton();
    }, 3000);
  }
})();
