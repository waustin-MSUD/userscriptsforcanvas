// ==UserScript==
// @name          Module Date Headers
// @version       2026.11.18
// @namespace     CTLD
// @description   Inserts a dated Text Header (e.g. "05 August – 11 August (1 week)") at the top of selected existing modules, counting consecutively from a start date.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/ModuleDateHeaders.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*/modules
// @match         https://*.instructure.com/courses/*
// @grant         GM_addStyle
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  const THROTTLE_MS = 150;
  const PER_PAGE = 50;
  const DEFAULT_WEEKS_PER_MODULE = 1;
  // Matches "Module 1", "Module 1:", "Module 01" — but NOT "Module 10/11/…".
  const MODULE1_RE = /^\s*module\s*0*1(?!\d)/i;

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

  // Parse "YYYY-MM-DD" as a local date (not UTC) to avoid off-by-one-day
  // shifts in negative-UTC time zones.
  function parseLocalDate(yyyymmdd) {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function isMonday(date) {
    return date.getDay() === 1;
  }

  // Roll a date back to the most recent Monday on or before it.
  function snapToMonday(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun … 6=Sat
    const back = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - back);
    return d;
  }

  // "05 August" — day zero-padded, full month name.
  function formatDayMonth(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    return `${day} ${month}`;
  }

  // "05 August – 11 August (1 week)". weeksPerModule controls the span
  // (1 → 7 days, 2 → 14 days) and the duration label.
  function renderHeader(moduleStart, weeksPerModule) {
    const start = new Date(moduleStart);
    const end = new Date(moduleStart);
    end.setDate(end.getDate() + weeksPerModule * 7 - 1);
    const w = weeksPerModule;
    return `${formatDayMonth(start)} \u2013 ${formatDayMonth(end)} (${w} week${w === 1 ? '' : 's'})`;
  }

  function startForIndex(courseStart, selectedIndex, weeksPerModule) {
    const d = new Date(courseStart);
    d.setDate(d.getDate() + selectedIndex * weeksPerModule * 7);
    return d;
  }

  // ─── Canvas API ─────────────────────────────────────────────────
  async function apiFetch(path, options = {}) {
    const res = await fetch(path, { credentials: 'include', ...options });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return res.json();
  }

  async function fetchAllModules(courseId) {
    const out = [];
    let page = 1;
    while (true) {
      const chunk = await apiFetch(
        `/api/v1/courses/${courseId}/modules?per_page=${PER_PAGE}&page=${page}`
      );
      if (!Array.isArray(chunk)) break;
      out.push(...chunk);
      if (chunk.length < PER_PAGE) break;
      page += 1;
      await sleep(THROTTLE_MS);
    }
    return out; // Canvas returns these in course (position) order.
  }

  // Insert a Text Header at the top of a module. Re-running stacks a new
  // header above any existing one (no dedupe) — intended, so a shell can
  // carry e.g. both 8-week and 16-week dating for the instructor to prune.
  async function createSubHeader(courseId, moduleId, title) {
    const csrf = getCSRFToken();
    return apiFetch(`/api/v1/courses/${courseId}/modules/${moduleId}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': csrf,
      },
      body: JSON.stringify({
        module_item: { type: 'SubHeader', title, position: 1 },
      }),
    });
  }

  // ─── Styles ─────────────────────────────────────────────────────
  GM_addStyle(`
    .mdh-backdrop {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
    }
    .mdh-modal {
      width: 92%; max-width: 480px;
      background: #1a1d23; color: #e0e4ec;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      overflow: hidden;
    }
    .mdh-header {
      background: #22262e;
      padding: 12px 18px;
      border-bottom: 1px solid #2d3139;
      display: flex; align-items: center; justify-content: space-between;
    }
    .mdh-header h2 { margin: 0; font-size: 14px; color: #fff; font-weight: 700; }
    .mdh-close {
      background: none; border: 0; color: #8b90a3; font-size: 20px;
      cursor: pointer; line-height: 1; padding: 0 4px;
    }
    .mdh-close:hover { color: #fff; }

    .mdh-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }
    .mdh-row { display: flex; gap: 12px; }
    .mdh-row .mdh-field { flex: 1; }
    .mdh-field { display: flex; flex-direction: column; gap: 5px; }
    .mdh-label {
      font-size: 11px; color: #8b90a3; text-transform: uppercase;
      letter-spacing: 0.05em; font-weight: 700;
    }
    .mdh-input {
      background: #22262e; border: 1px solid #2d3139; color: #e0e4ec;
      padding: 7px 10px; border-radius: 6px; font-size: 13px;
      font-family: inherit; box-sizing: border-box;
    }
    .mdh-input:focus { outline: none; border-color: #0b65c2; }
    .mdh-hint { font-size: 11px; color: #8b90a3; }

    .mdh-warn {
      display: none;
      background: #3a2f18; padding: 10px 12px; border-radius: 8px;
      border-left: 3px solid #c9a227;
      font-size: 12px; color: #e0d4a3;
    }
    .mdh-warn.mdh-visible { display: block; }
    .mdh-warn strong { color: #ffd966; display: block; margin-bottom: 6px; }
    .mdh-warn-buttons { display: flex; gap: 6px; margin-top: 6px; }
    .mdh-warn-btn {
      background: #2d3139; color: #e0d4a3; border: 1px solid #5a4818;
      padding: 5px 10px; border-radius: 4px; font-size: 11px;
      cursor: pointer; font-family: inherit; font-weight: 600;
    }
    .mdh-warn-btn:hover { background: #3a3f4a; color: #ffd966; }
    .mdh-warn-btn.mdh-active {
      background: #c9a227; color: #1a1d23; border-color: #c9a227;
    }

    /* ── Module checklist ── */
    .mdh-list-head { display: flex; justify-content: space-between; align-items: center; }
    .mdh-master {
      display: flex; align-items: center; gap: 8px; cursor: pointer;
      font-weight: 700; color: #fff; font-size: 12px;
    }
    .mdh-master input { cursor: pointer; }
    .mdh-list {
      max-height: 200px; overflow-y: auto;
      display: flex; flex-direction: column; gap: 1px;
      margin-top: 8px; padding-right: 2px;
    }
    .mdh-item {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 6px; border-radius: 5px; cursor: pointer; color: #d7dbe4;
    }
    .mdh-item:hover { background: #2a2f38; }
    .mdh-item input { cursor: pointer; flex: 0 0 auto; }
    .mdh-item span {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    }

    .mdh-caveat {
      font-size: 11px; color: #8b90a3; line-height: 1.4;
      border-left: 2px solid #2d3139; padding-left: 8px;
    }

    .mdh-preview {
      background: #22262e; padding: 10px 12px; border-radius: 8px;
      font-size: 12px; color: #b0b8c8;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      max-height: 110px; overflow-y: auto; line-height: 1.5;
    }
    .mdh-preview-label {
      font-size: 10px; color: #8b90a3; text-transform: uppercase;
      letter-spacing: 0.05em; font-weight: 700; margin-bottom: 4px;
    }

    .mdh-footer {
      padding: 12px 18px; border-top: 1px solid #2d3139;
      display: flex; gap: 8px; justify-content: flex-end; align-items: center;
    }
    .mdh-progress { flex: 1; }
    .mdh-bar {
      width: 100%; height: 5px; background: #2d3139; border-radius: 3px;
      overflow: hidden; margin-top: 4px; display: none;
    }
    .mdh-bar.mdh-visible { display: block; }
    .mdh-bar > div {
      height: 100%; background: #0b65c2; width: 0%; transition: width 0.15s linear;
    }
    .mdh-phase { font-size: 11px; color: #8b90a3; font-style: italic; min-height: 1.2em; }
    .mdh-btn {
      border: 0; padding: 7px 14px; border-radius: 6px;
      font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
    }
    .mdh-btn-cancel { background: #2d3139; color: #b0b8c8; }
    .mdh-btn-cancel:hover { background: #3a3f4a; color: #fff; }
    .mdh-btn-primary { background: #0b65c2; color: #fff; }
    .mdh-btn-primary:hover:not(:disabled) { background: #0952a0; }
    .mdh-btn-primary:disabled { background: #2d3139; color: #5a6070; cursor: default; }

    .mdh-launch {
      position: fixed; bottom: 180px; right: 18px; z-index: 9998;
      background: #0b65c2; color: #fff; border: 0; padding: 10px 14px;
      border-radius: 10px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.2); font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
    .mdh-launch:hover { background: #0952a0; }
  `);

  // ─── Modal ──────────────────────────────────────────────────────
  function buildModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'mdh-backdrop';
    backdrop.innerHTML = `
      <div class="mdh-modal" role="dialog" aria-labelledby="mdh-title">
        <div class="mdh-header">
          <h2 id="mdh-title">🗓️ Module Date Headers</h2>
          <button class="mdh-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="mdh-body">
          <div class="mdh-row">
            <div class="mdh-field">
              <label class="mdh-label" for="mdh-date">Start date (first selected module)</label>
              <input type="date" id="mdh-date" class="mdh-input" />
            </div>
            <div class="mdh-field" style="max-width:120px;">
              <label class="mdh-label" for="mdh-wpm">Weeks / module</label>
              <input type="number" id="mdh-wpm" class="mdh-input" min="1" max="8" value="${DEFAULT_WEEKS_PER_MODULE}" />
            </div>
          </div>
          <div class="mdh-warn" id="mdh-warn">
            <strong>⚠️ That date isn't a Monday.</strong>
            <span id="mdh-warn-text"></span>
            <div class="mdh-warn-buttons">
              <button type="button" class="mdh-warn-btn mdh-active" data-choice="snap">Snap to Monday before</button>
              <button type="button" class="mdh-warn-btn" data-choice="keep">Use this date as Day 1</button>
            </div>
          </div>
          <div class="mdh-field">
            <div class="mdh-list-head">
              <label class="mdh-master">
                <input type="checkbox" id="mdh-master" />
                <span id="mdh-count">Loading modules…</span>
              </label>
            </div>
            <div class="mdh-list" id="mdh-list"></div>
            <div class="mdh-caveat" id="mdh-caveat"></div>
          </div>
          <div>
            <div class="mdh-preview-label">Preview (first 3 selected)</div>
            <div class="mdh-preview" id="mdh-preview">Pick a date to see a preview.</div>
          </div>
        </div>
        <div class="mdh-footer">
          <div class="mdh-progress">
            <div class="mdh-phase" id="mdh-phase"></div>
            <div class="mdh-bar" id="mdh-bar"><div></div></div>
          </div>
          <button class="mdh-btn mdh-btn-cancel" id="mdh-cancel" type="button">Cancel</button>
          <button class="mdh-btn mdh-btn-primary" id="mdh-create" type="button" disabled>Add Headers</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    return backdrop;
  }

  async function runFlow() {
    const courseId = getCourseId();
    if (!courseId) {
      alert('No course detected in the URL.');
      return;
    }

    const modal = buildModal();
    const $ = (sel) => modal.querySelector(sel);

    let dateChoice = 'snap'; // only matters for a non-Monday start date
    let modules = [];

    function close() { modal.remove(); }

    $('.mdh-close').addEventListener('click', close);
    $('#mdh-cancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    // Load modules, then build the checklist
    try {
      modules = await fetchAllModules(courseId);
    } catch (err) {
      $('#mdh-count').innerHTML =
        `<span style="color:#c62828">Failed to load modules: ${escapeHTML(err.message)}</span>`;
      return;
    }

    if (modules.length === 0) {
      $('#mdh-count').textContent = 'This course has no modules.';
      $('#mdh-master').disabled = true;
      return;
    }

    const list = $('#mdh-list');
    const firstIdx = modules.findIndex((m) => MODULE1_RE.test(m.name || ''));

    modules.forEach((m, i) => {
      const row = document.createElement('label');
      row.className = 'mdh-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.idx = String(i);
      // Default: select from the "Module 1" module onward; if none found, select all.
      cb.checked = firstIdx === -1 ? true : i >= firstIdx;
      const span = document.createElement('span');
      span.textContent = m.name || `Module ${m.id}`;
      span.title = span.textContent;
      row.append(cb, span);
      list.append(row);
    });

    $('#mdh-caveat').textContent = firstIdx === -1
      ? 'No module named "Module 1…" found — all modules selected. Dates run consecutively down your selection; add and select a placeholder module for any mid-term break.'
      : 'Dates run consecutively down your selection; add and select a placeholder module for any mid-term break so the dates stay aligned.';

    const master = $('#mdh-master');
    const dateInput = $('#mdh-date');
    const wpmInput = $('#mdh-wpm');

    function selectedIndexes() {
      return [...list.querySelectorAll('input:checked')].map((cb) => Number(cb.dataset.idx));
    }

    function weeksPerModule() {
      return Math.max(1, Math.min(8, parseInt(wpmInput.value, 10) || 1));
    }

    function effectiveStartDate() {
      const raw = dateInput.value;
      if (!raw) return null;
      const parsed = parseLocalDate(raw);
      if (isNaN(parsed)) return null;
      if (isMonday(parsed) || dateChoice === 'keep') return parsed;
      return snapToMonday(parsed);
    }

    function checkMondayWarning() {
      const raw = dateInput.value;
      const warn = $('#mdh-warn');
      if (!raw) { warn.classList.remove('mdh-visible'); return; }
      const parsed = parseLocalDate(raw);
      if (isNaN(parsed) || isMonday(parsed)) { warn.classList.remove('mdh-visible'); return; }
      $('#mdh-warn-text').textContent =
        ` "${formatDayMonth(parsed)}" is a ${parsed.toLocaleDateString('en-US', { weekday: 'long' })}. ` +
        `Choose how to handle it:`;
      warn.classList.add('mdh-visible');
      modal.querySelectorAll('.mdh-warn-btn').forEach((btn) => {
        btn.classList.toggle('mdh-active', btn.dataset.choice === dateChoice);
      });
    }

    function refresh() {
      const selected = selectedIndexes();
      const total = modules.length;
      $('#mdh-count').textContent = `${selected.length} of ${total} modules selected`;
      master.checked = selected.length === total;
      master.indeterminate = selected.length > 0 && selected.length < total;

      const start = effectiveStartDate();
      const w = weeksPerModule();
      const preview = $('#mdh-preview');
      const createBtn = $('#mdh-create');

      if (!start || selected.length === 0) {
        preview.textContent = selected.length === 0
          ? 'Select at least one module.'
          : 'Pick a date to see a preview.';
        createBtn.disabled = true;
        return;
      }

      const sample = selected.slice(0, 3).map((modIdx, order) => {
        const header = renderHeader(startForIndex(start, order, w), w);
        const name = modules[modIdx].name || `Module ${modules[modIdx].id}`;
        return `${name}  →  ${header}`;
      });
      if (selected.length > 3) sample.push(`… and ${selected.length - 3} more`);
      preview.innerHTML = sample.map(escapeHTML).join('<br>');
      createBtn.disabled = false;
    }

    master.addEventListener('change', () => {
      const check = master.checked;
      list.querySelectorAll('input').forEach((cb) => { cb.checked = check; });
      refresh();
    });
    list.addEventListener('change', (e) => {
      if (e.target && e.target.matches('input[type="checkbox"]')) refresh();
    });
    dateInput.addEventListener('input', () => { checkMondayWarning(); refresh(); });
    wpmInput.addEventListener('input', refresh);
    modal.querySelectorAll('.mdh-warn-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        dateChoice = btn.dataset.choice;
        modal.querySelectorAll('.mdh-warn-btn').forEach((b) => {
          b.classList.toggle('mdh-active', b.dataset.choice === dateChoice);
        });
        refresh();
      });
    });

    refresh();

    $('#mdh-create').addEventListener('click', async () => {
      const start = effectiveStartDate();
      const w = weeksPerModule();
      const selected = selectedIndexes();
      if (!start || selected.length === 0) return;

      const targets = selected.map((modIdx, order) => ({
        moduleId: modules[modIdx].id,
        name: modules[modIdx].name || `Module ${modules[modIdx].id}`,
        title: renderHeader(startForIndex(start, order, w), w),
      }));

      // Lock UI
      modal.querySelectorAll('button, input').forEach((el) => {
        if (!el.classList.contains('mdh-close')) el.disabled = true;
      });
      $('#mdh-bar').classList.add('mdh-visible');

      await runCreation(courseId, targets, modal);
    });
  }

  async function runCreation(courseId, targets, modal) {
    const $ = (sel) => modal.querySelector(sel);
    const total = targets.length;
    let done = 0;
    let errors = 0;

    function setProgress() {
      $('.mdh-bar > div').style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
    }
    function setPhase(text) { $('#mdh-phase').textContent = text; }

    console.log(`[Module Date Headers] Adding ${total} headers.`);

    for (const t of targets) {
      try {
        setPhase(`${done + 1}/${total}: ${t.name} → ${t.title}`);
        await createSubHeader(courseId, t.moduleId, t.title);
        done += 1;
      } catch (err) {
        console.error(`[Module Date Headers] Failed on "${t.name}":`, err);
        errors += 1;
        done += 1;
      }
      setProgress();
      await sleep(THROTTLE_MS);
    }

    const created = total - errors;
    console.log(`[Module Date Headers] Done: ${created}/${total} added, ${errors} failed.`);

    if (errors === 0) {
      setPhase(`Added ${created} headers. Reloading…`);
      setTimeout(() => location.reload(), 1200);
    } else {
      setPhase(`Added ${created}/${total}. ${errors} failed — see console.`);
      $('#mdh-cancel').disabled = false;
      $('#mdh-cancel').textContent = 'Close';
    }
  }

  // ─── Launch / toolbar registration ─────────────────────────────
  function launch() { runFlow(); }

  function createOwnButton() {
    if (document.querySelector('.mdh-launch')) return;
    const btn = document.createElement('button');
    btn.className = 'mdh-launch';
    btn.textContent = '🗓️ Module Date Headers';
    btn.addEventListener('click', launch);
    document.body.appendChild(btn);
  }

  // Only surface the tool on a Modules view: the direct Modules page, or a
  // course where Modules is set as the home page (served from /courses/:id
  // with the modules markup inlined, so there's no "/modules" in the URL to
  // match on). The broad @match above covers that case; this gate keeps the
  // tool off every other course sub-page.
  function onModulesView() {
    const p = location.pathname;
    if (/\/courses\/\d+\/modules\/?$/.test(p)) return true;
    if (/\/courses\/\d+\/?$/.test(p) && document.querySelector('#context_modules')) return true;
    return false;
  }
  if (!onModulesView()) return;

  // Register the moment canvasToolbar.register exists — don't gate on a
  // _ready flag or a single ready-event. On a light page (e.g. a near-empty
  // sandbox) the toolbar can initialize in a window where that event is
  // missed, which previously left this script unregistered AND suppressed
  // the fallback button. Poll briefly, then fall back to a standalone button
  // only if the toolbar never appears.
  let mdhRegistered = false;
  function tryRegister() {
    if (mdhRegistered) return true;
    const tb = unsafeWindow.canvasToolbar;
    if (!tb || typeof tb.register !== 'function') return false;
    tb.register({
      id: 'module-date-headers',
      label: 'Module Date Headers',
      icon: '🗓️',
      order: 20,
      onClick: launch,
    });
    mdhRegistered = true;
    return true;
  }

  if (!tryRegister()) {
    unsafeWindow.addEventListener('canvas-toolbar-ready', tryRegister, { once: true });
    let mdhTries = 0;
    const mdhPoll = setInterval(() => {
      if (tryRegister() || ++mdhTries >= 20) { // ~20 × 250ms = 5s
        clearInterval(mdhPoll);
        if (!mdhRegistered) createOwnButton();
      }
    }, 250);
  }
})();
