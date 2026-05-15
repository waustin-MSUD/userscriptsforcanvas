// ==UserScript==
// @name          Create Weekly Modules
// @version       2026.05.15
// @namespace     CTLD
// @description   Creates a configurable number of weekly modules from a chosen start date.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/CreateWeeklyModules.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*/modules
// @grant         GM_addStyle
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  const THROTTLE_MS = 150;
  const DEFAULT_WEEKS = 15;
  const DEFAULT_TEMPLATE = 'Week {n} | {start} – {end}';

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

  // Parse "YYYY-MM-DD" as a local-date (not UTC). Using `new Date('YYYY-MM-DD')`
  // would parse as UTC midnight, which often appears as the previous day in
  // negative-UTC time zones. This avoids that.
  function parseLocalDate(yyyymmdd) {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDate(date, full = false) {
    const opts = full
      ? { year: 'numeric', month: 'long', day: 'numeric' }
      : { month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', opts);
  }

  function isMonday(date) {
    return date.getDay() === 1;
  }

  // Roll a date back to the most recent Monday on or before it.
  function snapToMonday(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
    const back = day === 0 ? 6 : day - 1; // distance from Monday going back
    d.setDate(d.getDate() - back);
    return d;
  }

  // Build a label from the template by substituting tokens.
  function renderLabel(template, weekNum, weekStart) {
    const start = new Date(weekStart);
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return template
      .replace(/\{n\}/g, String(weekNum))
      .replace(/\{start_full\}/g, formatDate(start, true))
      .replace(/\{end_full\}/g, formatDate(end, true))
      .replace(/\{start\}/g, formatDate(start))
      .replace(/\{end\}/g, formatDate(end));
  }

  // ─── Module creation ────────────────────────────────────────────
  async function createOneModule(courseId, name) {
    const csrf = getCSRFToken();
    const res = await fetch(`/api/v1/courses/${courseId}/modules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': csrf,
      },
      credentials: 'include',
      body: JSON.stringify({ module: { name } }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  // ─── Styles ─────────────────────────────────────────────────────
  GM_addStyle(`
    .cwm-backdrop {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
    }
    .cwm-modal {
      width: 92%; max-width: 460px;
      background: #1a1d23; color: #e0e4ec;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      overflow: hidden;
    }
    .cwm-header {
      background: #22262e;
      padding: 12px 18px;
      border-bottom: 1px solid #2d3139;
      display: flex; align-items: center; justify-content: space-between;
    }
    .cwm-header h2 {
      margin: 0; font-size: 14px; color: #fff; font-weight: 700;
    }
    .cwm-close {
      background: none; border: 0; color: #8b90a3; font-size: 20px;
      cursor: pointer; line-height: 1; padding: 0 4px;
    }
    .cwm-close:hover { color: #fff; }

    .cwm-body {
      padding: 16px 18px;
      display: flex; flex-direction: column; gap: 14px;
    }
    .cwm-field { display: flex; flex-direction: column; gap: 5px; }
    .cwm-label {
      font-size: 11px; color: #8b90a3; text-transform: uppercase;
      letter-spacing: 0.05em; font-weight: 700;
    }
    .cwm-input {
      background: #22262e; border: 1px solid #2d3139; color: #e0e4ec;
      padding: 7px 10px; border-radius: 6px; font-size: 13px;
      font-family: inherit; box-sizing: border-box;
    }
    .cwm-input:focus { outline: none; border-color: #0b65c2; }
    .cwm-hint { font-size: 11px; color: #8b90a3; }
    .cwm-hint code {
      background: #2d3139; padding: 1px 5px; border-radius: 3px;
      font-size: 10px; color: #b0b8c8;
    }

    .cwm-warn {
      display: none;
      background: #3a2f18; padding: 10px 12px; border-radius: 8px;
      border-left: 3px solid #c9a227;
      font-size: 12px; color: #e0d4a3;
    }
    .cwm-warn.cwm-visible { display: block; }
    .cwm-warn strong { color: #ffd966; display: block; margin-bottom: 6px; }
    .cwm-warn-buttons {
      display: flex; gap: 6px; margin-top: 6px;
    }
    .cwm-warn-btn {
      background: #2d3139; color: #e0d4a3; border: 1px solid #5a4818;
      padding: 5px 10px; border-radius: 4px; font-size: 11px;
      cursor: pointer; font-family: inherit; font-weight: 600;
    }
    .cwm-warn-btn:hover { background: #3a3f4a; color: #ffd966; }
    .cwm-warn-btn.cwm-active {
      background: #c9a227; color: #1a1d23; border-color: #c9a227;
    }

    .cwm-preview {
      background: #22262e;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 12px;
      color: #b0b8c8;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      max-height: 100px; overflow-y: auto;
    }
    .cwm-preview-label {
      font-size: 10px; color: #8b90a3; font-family: inherit;
      text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;
      margin-bottom: 4px;
    }

    .cwm-footer {
      padding: 12px 18px;
      border-top: 1px solid #2d3139;
      display: flex; gap: 8px; justify-content: flex-end; align-items: center;
    }
    .cwm-progress {
      flex: 1;
    }
    .cwm-bar {
      width: 100%; height: 5px; background: #2d3139; border-radius: 3px;
      overflow: hidden; margin-top: 4px; display: none;
    }
    .cwm-bar.cwm-visible { display: block; }
    .cwm-bar > div {
      height: 100%; background: #0b65c2; width: 0%;
      transition: width 0.15s linear;
    }
    .cwm-phase {
      font-size: 11px; color: #8b90a3; font-style: italic; min-height: 1.2em;
    }
    .cwm-btn {
      border: 0; padding: 7px 14px; border-radius: 6px;
      font-size: 12px; font-weight: 700; cursor: pointer;
      font-family: inherit;
    }
    .cwm-btn-cancel { background: #2d3139; color: #b0b8c8; }
    .cwm-btn-cancel:hover { background: #3a3f4a; color: #fff; }
    .cwm-btn-primary { background: #0b65c2; color: #fff; }
    .cwm-btn-primary:hover:not(:disabled) { background: #0952a0; }
    .cwm-btn-primary:disabled { background: #2d3139; color: #5a6070; cursor: default; }

    .cwm-launch {
      position: fixed; bottom: 180px; right: 18px; z-index: 9998;
      background: #0b65c2; color: #fff; border: 0; padding: 10px 14px;
      border-radius: 10px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.2); font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
    .cwm-launch:hover { background: #0952a0; }
  `);

  // ─── Modal ──────────────────────────────────────────────────────
  function buildModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'cwm-backdrop';
    backdrop.innerHTML = `
      <div class="cwm-modal" role="dialog" aria-labelledby="cwm-title">
        <div class="cwm-header">
          <h2 id="cwm-title">📅 Create Weekly Modules</h2>
          <button class="cwm-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="cwm-body">
          <div class="cwm-field">
            <label class="cwm-label" for="cwm-date">Start date</label>
            <input type="date" id="cwm-date" class="cwm-input" />
          </div>
          <div class="cwm-warn" id="cwm-warn">
            <strong>⚠️ That date isn't a Monday.</strong>
            <span id="cwm-warn-text"></span>
            <div class="cwm-warn-buttons">
              <button type="button" class="cwm-warn-btn cwm-active" data-choice="snap">Snap to Monday before</button>
              <button type="button" class="cwm-warn-btn" data-choice="keep">Use this date as Day 1</button>
            </div>
          </div>
          <div class="cwm-field">
            <label class="cwm-label" for="cwm-weeks">Number of weeks</label>
            <input type="number" id="cwm-weeks" class="cwm-input" min="1" max="52" value="${DEFAULT_WEEKS}" />
          </div>
          <div class="cwm-field">
            <label class="cwm-label" for="cwm-template">Label template</label>
            <input type="text" id="cwm-template" class="cwm-input" value="${escapeHTML(DEFAULT_TEMPLATE)}" />
            <div class="cwm-hint">
              Tokens: <code>{n}</code> <code>{start}</code> <code>{end}</code> <code>{start_full}</code> <code>{end_full}</code>
            </div>
          </div>
          <div>
            <div class="cwm-preview-label">Preview (first 3 modules)</div>
            <div class="cwm-preview" id="cwm-preview">Pick a date to see a preview.</div>
          </div>
        </div>
        <div class="cwm-footer">
          <div class="cwm-progress">
            <div class="cwm-phase" id="cwm-phase"></div>
            <div class="cwm-bar" id="cwm-bar"><div></div></div>
          </div>
          <button class="cwm-btn cwm-btn-cancel" id="cwm-cancel" type="button">Cancel</button>
          <button class="cwm-btn cwm-btn-primary" id="cwm-create" type="button" disabled>Create</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function runFlow() {
    const courseId = getCourseId();
    if (!courseId) {
      alert('No course detected in the URL.');
      return;
    }

    const modal = buildModal();
    const $ = (sel) => modal.querySelector(sel);

    let dateChoice = 'snap'; // 'snap' or 'keep' — only matters if non-Monday

    function close() {
      modal.remove();
    }

    function effectiveStartDate() {
      const raw = $('#cwm-date').value;
      if (!raw) return null;
      const parsed = parseLocalDate(raw);
      if (isNaN(parsed)) return null;
      if (isMonday(parsed) || dateChoice === 'keep') return parsed;
      return snapToMonday(parsed);
    }

    function updatePreview() {
      const start = effectiveStartDate();
      const weeks = Math.max(1, Math.min(52, parseInt($('#cwm-weeks').value, 10) || 0));
      const tpl = $('#cwm-template').value || DEFAULT_TEMPLATE;
      const preview = $('#cwm-preview');
      const createBtn = $('#cwm-create');

      if (!start || weeks < 1) {
        preview.textContent = 'Pick a date to see a preview.';
        createBtn.disabled = true;
        return;
      }

      const sample = [];
      for (let i = 0; i < Math.min(3, weeks); i++) {
        const ws = new Date(start);
        ws.setDate(ws.getDate() + i * 7);
        sample.push(renderLabel(tpl, i + 1, ws));
      }
      if (weeks > 3) sample.push(`… and ${weeks - 3} more`);
      preview.innerHTML = sample.map(escapeHTML).join('<br>');
      createBtn.disabled = false;
    }

    function checkMondayWarning() {
      const raw = $('#cwm-date').value;
      const warn = $('#cwm-warn');
      if (!raw) {
        warn.classList.remove('cwm-visible');
        return;
      }
      const parsed = parseLocalDate(raw);
      if (isNaN(parsed) || isMonday(parsed)) {
        warn.classList.remove('cwm-visible');
        return;
      }
      const snapped = snapToMonday(parsed);
      $('#cwm-warn-text').textContent =
        ` "${formatDate(parsed)}" is a ${parsed.toLocaleDateString('en-US', { weekday: 'long' })}. ` +
        `Choose how you want to handle it:`;
      warn.classList.add('cwm-visible');
      // Update button styling to reflect current choice
      modal.querySelectorAll('.cwm-warn-btn').forEach((btn) => {
        btn.classList.toggle('cwm-active', btn.dataset.choice === dateChoice);
      });
    }

    // Wire up events
    $('.cwm-close').addEventListener('click', close);
    $('#cwm-cancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    $('#cwm-date').addEventListener('input', () => {
      checkMondayWarning();
      updatePreview();
    });

    $('#cwm-weeks').addEventListener('input', updatePreview);
    $('#cwm-template').addEventListener('input', updatePreview);

    modal.querySelectorAll('.cwm-warn-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        dateChoice = btn.dataset.choice;
        modal.querySelectorAll('.cwm-warn-btn').forEach((b) => {
          b.classList.toggle('cwm-active', b.dataset.choice === dateChoice);
        });
        updatePreview();
      });
    });

    $('#cwm-create').addEventListener('click', async () => {
      const start = effectiveStartDate();
      const weeks = Math.max(1, Math.min(52, parseInt($('#cwm-weeks').value, 10) || 0));
      const tpl = $('#cwm-template').value || DEFAULT_TEMPLATE;
      if (!start || weeks < 1) return;

      // Lock UI during creation
      modal.querySelectorAll('button, input').forEach((el) => {
        if (!el.classList.contains('cwm-close')) el.disabled = true;
      });
      $('#cwm-bar').classList.add('cwm-visible');

      await runCreation(courseId, start, weeks, tpl, modal);
    });
  }

  async function runCreation(courseId, startDate, weeks, template, modal) {
    const $ = (sel) => modal.querySelector(sel);
    let done = 0;
    let errors = 0;

    function setProgress() {
      const pct = weeks ? Math.round((done / weeks) * 100) : 0;
      $('.cwm-bar > div').style.width = `${pct}%`;
    }

    function setPhase(text) {
      $('#cwm-phase').textContent = text;
    }

    console.log(`[Weekly Modules] Creating ${weeks} modules from ${startDate.toISOString().slice(0, 10)}`);

    for (let i = 0; i < weeks; i++) {
      const ws = new Date(startDate);
      ws.setDate(ws.getDate() + i * 7);
      const name = renderLabel(template, i + 1, ws);

      try {
        setPhase(`${i + 1}/${weeks}: ${name}`);
        await createOneModule(courseId, name);
        done += 1;
      } catch (err) {
        console.error(`[Weekly Modules] Failed: "${name}"`, err);
        errors += 1;
        done += 1;
      }
      setProgress();
      await sleep(THROTTLE_MS);
    }

    const created = weeks - errors;
    console.log(`[Weekly Modules] Done: ${created}/${weeks} created, ${errors} failed.`);

    if (errors === 0) {
      setPhase(`Created ${created} modules. Reloading…`);
      setTimeout(() => location.reload(), 1200);
    } else {
      setPhase(`Created ${created}/${weeks}. ${errors} failed — see console.`);
      $('#cwm-cancel').disabled = false;
      $('#cwm-cancel').textContent = 'Close';
    }
  }

  // ─── Launch / toolbar registration ─────────────────────────────
  function launch() {
    runFlow();
  }

  function createOwnButton() {
    const btn = document.createElement('button');
    btn.className = 'cwm-launch';
    btn.textContent = '📅 Create Weekly Modules';
    btn.addEventListener('click', launch);
    document.body.appendChild(btn);
  }

  if (unsafeWindow.canvasToolbar?._ready) {
    unsafeWindow.canvasToolbar.register({
      id: 'create-weekly-modules',
      label: 'Create Weekly Modules',
      icon: '📅',
      order: 20,
      onClick: launch,
    });
  } else {
    unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
      unsafeWindow.canvasToolbar.register({
        id: 'create-weekly-modules',
        label: 'Create Weekly Modules',
        icon: '📅',
        order: 20,
        onClick: launch,
      });
    }, { once: true });
    setTimeout(() => {
      if (!unsafeWindow.canvasToolbar?._ready) createOwnButton();
    }, 3000);
  }
})();
