// ==UserScript==
// @name          Move Assignments
// @version       2026.05.15
// @namespace     CTLD
// @description   Select items on the Assignments page, move them to another assignment group.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/MoveAssignments.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*/assignments
// @match         https://*.instructure.com/courses/*/assignments?*
// @grant         GM_addStyle
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  const PER_PAGE = 50;
  const THROTTLE_MS = 200;

  // ─── State ──────────────────────────────────────────────────────
  let groupsData = [];           // [{ id, name, position, assignments: [...] }]
  let assignmentIndex = new Map(); // id → assignment data
  let selectedIds = new Set();
  let lockedIds = new Set();
  let currentFilter = 'all';
  let searchTerm = '';
  let viewMode = 'grouped';
  let panelEl = null;
  let selecting = false;

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

  async function apiFetch(path, options = {}) {
    const res = await fetch(path, { credentials: 'include', ...options });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status}: ${path} ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const len = res.headers.get('content-length');
    if (len === '0') return null;
    return res.json();
  }

  async function fetchAllPages(path, params = {}) {
    const out = [];
    let page = 1;
    while (true) {
      const url = new URL(path, location.origin);
      for (const [k, v] of Object.entries(params)) {
        if (Array.isArray(v)) {
          for (const item of v) url.searchParams.append(k, item);
        } else {
          url.searchParams.set(k, v);
        }
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

  // ─── Classification ─────────────────────────────────────────────
  function classifyAssignment(a) {
    const types = a.submission_types || [];
    if (types.includes('online_quiz')) return 'quiz';
    if (a.is_quiz_lti_assignment || a.is_quiz_assignment) return 'quiz';
    if (types.includes('discussion_topic')) return 'discussion';
    return 'assignment';
  }

  function isLocked(a) {
    if (a.restricted_by_master_course) {
      const r = a.master_course_restrictions || {};
      return !!(r.content || r.due_dates || r.availability_dates || r.points || r.settings);
    }
    return false;
  }

  function typeIcon(type) {
    if (type === 'quiz') return '❓';
    if (type === 'discussion') return '💬';
    return '📝';
  }

  function typeLabel(type) {
    if (type === 'quiz') return 'Quiz';
    if (type === 'discussion') return 'Discussion';
    return 'Assignment';
  }

  // ─── Data fetch ─────────────────────────────────────────────────
  async function loadGroupsAndAssignments() {
    const courseId = getCourseId();
    const groups = await fetchAllPages(
      `/api/v1/courses/${courseId}/assignment_groups`,
      {
        'include[]': ['assignments'],
        'exclude_response_fields[]': ['description', 'rubric'],
      }
    );

    assignmentIndex.clear();
    lockedIds.clear();

    return groups
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((g) => ({
        id: String(g.id),
        name: g.name,
        position: g.position,
        assignments: (g.assignments || []).map((a) => {
          const item = {
            id: String(a.id),
            name: a.name || `Assignment ${a.id}`,
            groupId: String(g.id),
            groupName: g.name,
            type: classifyAssignment(a),
            locked: isLocked(a),
            position: a.position,
          };
          assignmentIndex.set(item.id, item);
          if (item.locked) lockedIds.add(item.id);
          return item;
        }),
      }));
  }

  // ─── Move execution ─────────────────────────────────────────────
  async function moveAssignment(courseId, assignmentId, targetGroupId) {
    const csrf = getCSRFToken();
    return apiFetch(`/api/v1/courses/${courseId}/assignments/${assignmentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
      },
      body: JSON.stringify({
        assignment: { assignment_group_id: targetGroupId },
      }),
    });
  }

  async function executeBatchMove(targetGroupId) {
    const courseId = getCourseId();
    const items = collectSelectedAssignments();
    const total = items.length;
    let done = 0;
    let errors = 0;
    let blueprintBlocks = 0;

    exitSelectionMode();

    setPhase('Moving…');
    setProgress(0, total);

    for (const item of items) {
      try {
        setDetail(`${done + 1}/${total}: ${item.name}`);
        await moveAssignment(courseId, item.id, targetGroupId);
        done += 1;
        setProgress(done, total);
      } catch (err) {
        console.error(`[Batch Move Assignments] Failed for ${item.id}:`, err);
        if (err.status === 401 || err.status === 403) blueprintBlocks += 1;
        else errors += 1;
        done += 1;
        setProgress(done, total);
      }
      await sleep(THROTTLE_MS);
    }

    const moved = total - errors - blueprintBlocks;
    if (errors + blueprintBlocks === 0) {
      setPhase('Done');
      setDetail(`Moved ${moved} items. Reloading…`);
      setTimeout(() => location.reload(), 1200);
    } else {
      setPhase('Done with issues');
      const parts = [`Moved ${moved}/${total}.`];
      if (blueprintBlocks) parts.push(`${blueprintBlocks} blocked by blueprint.`);
      if (errors) parts.push(`${errors} failed.`);
      setDetail(parts.join(' '));
    }
  }

  function collectSelectedAssignments() {
    const out = [];
    for (const g of groupsData) {
      for (const a of g.assignments) {
        if (selectedIds.has(a.id) && !a.locked) out.push(a);
      }
    }
    return out;
  }

  // ─── Filtering / search ─────────────────────────────────────────
  function matchesFilter(a) {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'quizzes') return a.type === 'quiz';
    if (currentFilter === 'discussions') return a.type === 'discussion';
    if (currentFilter === 'assignments') return a.type === 'assignment';
    return true;
  }

  function matchesSearch(a) {
    if (!searchTerm) return true;
    return a.name.toLowerCase().includes(searchTerm.toLowerCase());
  }

  function visibleAssignments(group) {
    return group.assignments.filter((a) => matchesFilter(a) && matchesSearch(a));
  }

  // ─── Page-side selection ────────────────────────────────────────
  // Canvas renders rows as <div id="assignment_NNNN" class="ig-row"> inside
  // <li class="assignment"> within <div class="assignment-list"> within
  // <div class="assignment_group">. Stable IDs make this straightforward.
  function parsePageRow(el) {
    const row = el.closest('[id^="assignment_"]');
    if (!row) return null;
    // Skip the group container, which also matches [id^="assignment_"]
    if (row.classList.contains('assignment_group')) return null;
    const idMatch = row.id.match(/^assignment_(\d+)$/);
    if (!idMatch) return null;
    return { id: idMatch[1], element: row };
  }

  function handlePageClick(e) {
    if (!selecting) return;

    const parsed = parsePageRow(e.target);
    if (!parsed) return;

    // Protect admin controls — gear menu, drag handle, anything in ig-admin
    if (e.target.closest('.al-trigger, .al-options, .ig-admin, [class*="drag_handle"]')) return;
    const tag = e.target.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;

    if (lockedIds.has(parsed.id)) return;

    e.preventDefault();
    e.stopPropagation();
    toggleSelection(parsed.id);
  }

  function syncPageHighlights() {
    document.querySelectorAll('.bma-row-selected').forEach((el) => {
      el.classList.remove('bma-row-selected');
    });
    document.querySelectorAll('.bma-row-locked').forEach((el) => {
      el.classList.remove('bma-row-locked');
    });

    for (const id of lockedIds) {
      const row = document.getElementById(`assignment_${id}`);
      if (row) row.classList.add('bma-row-locked');
    }

    for (const id of selectedIds) {
      const row = document.getElementById(`assignment_${id}`);
      if (row) row.classList.add('bma-row-selected');
    }
  }

  function enterSelectionMode() {
    selecting = true;
    document.body.classList.add('bma-selecting');
    syncPageHighlights();
  }

  function exitSelectionMode() {
    selecting = false;
    document.body.classList.remove('bma-selecting');
    document.querySelectorAll('.bma-row-selected').forEach((el) => {
      el.classList.remove('bma-row-selected');
    });
    document.querySelectorAll('.bma-row-locked').forEach((el) => {
      el.classList.remove('bma-row-locked');
    });
  }

  function toggleSelection(id) {
    if (lockedIds.has(id)) return;
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    renderList();
    syncPageHighlights();
    updateFooter();
  }

  // ─── Styles ─────────────────────────────────────────────────────
  GM_addStyle(`
    /* ── Page-side selection styles ── */
    body.bma-selecting [id^="assignment_"]:not(.assignment_group) {
      cursor: pointer;
    }
    body.bma-selecting [id^="assignment_"]:not(.assignment_group) a {
      pointer-events: none;
    }
    body.bma-selecting [id^="assignment_"]:not(.assignment_group) .al-trigger,
    body.bma-selecting [id^="assignment_"]:not(.assignment_group) .al-options,
    body.bma-selecting [id^="assignment_"]:not(.assignment_group) .ig-admin,
    body.bma-selecting [id^="assignment_"]:not(.assignment_group) [class*="drag_handle"] {
      pointer-events: auto;
    }
    body.bma-selecting [id^="assignment_"]:not(.assignment_group):hover {
      background: rgba(11, 101, 194, 0.06) !important;
    }
    [id^="assignment_"]:not(.assignment_group).bma-row-selected {
      background: rgba(11, 101, 194, 0.14) !important;
      box-shadow: inset 3px 0 0 #0b65c2 !important;
    }
    [id^="assignment_"]:not(.assignment_group).bma-row-locked {
      opacity: 0.5;
      cursor: not-allowed !important;
    }
    body.bma-selecting [id^="assignment_"]:not(.assignment_group).bma-row-locked:hover {
      background: transparent !important;
    }

    /* ── Floating panel ── */
    .bma-panel {
      position: fixed;
      top: 80px; right: 18px;
      width: 360px; max-height: calc(100vh - 100px);
      background: #1a1d23; color: #e0e4ec;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,.5);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      display: flex; flex-direction: column; overflow: hidden;
      z-index: 99998;
    }
    .bma-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; border-bottom: 1px solid #2d3139;
      cursor: move; user-select: none;
      background: #22262e;
    }
    .bma-header h2 {
      margin: 0; font-size: 13px; color: #fff; font-weight: 700;
    }
    .bma-close {
      background: none; border: 0; color: #8b90a3; font-size: 20px;
      cursor: pointer; line-height: 1; padding: 0 4px;
    }
    .bma-close:hover { color: #fff; }

    .bma-toolbar {
      padding: 8px 12px; border-bottom: 1px solid #2d3139;
      display: flex; flex-direction: column; gap: 6px;
    }
    .bma-row {
      display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
    }
    .bma-filter-group, .bma-view-toggle {
      display: flex; background: #22262e; border-radius: 6px; padding: 2px;
    }
    .bma-filter-btn, .bma-view-btn {
      background: none; border: 0; color: #b0b8c8; padding: 4px 8px;
      cursor: pointer; font-size: 11px; font-weight: 600; border-radius: 4px;
      font-family: inherit;
    }
    .bma-filter-btn:hover, .bma-view-btn:hover { color: #fff; }
    .bma-filter-btn.bma-active, .bma-view-btn.bma-active {
      background: #0b65c2; color: #fff;
    }
    .bma-search {
      flex: 1; min-width: 0;
      background: #22262e; border: 1px solid #2d3139; color: #e0e4ec;
      padding: 5px 8px; border-radius: 6px; font-size: 12px;
      font-family: inherit;
    }
    .bma-search:focus { outline: none; border-color: #0b65c2; }

    .bma-list {
      flex: 1; overflow-y: auto; padding: 6px 0;
      min-height: 100px;
    }
    .bma-loading, .bma-empty {
      padding: 24px 14px; text-align: center; color: #8b90a3;
      font-style: italic; font-size: 12px;
    }
    .bma-group-header {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 12px; background: #22262e;
      font-weight: 700; color: #fff; font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.04em;
      cursor: pointer; user-select: none;
      border-top: 1px solid #2d3139;
    }
    .bma-group-header:first-child { border-top: 0; }
    .bma-group-chev {
      display: inline-block; width: 10px; transition: transform 0.15s; font-size: 10px;
    }
    .bma-group-header.bma-collapsed .bma-group-chev { transform: rotate(-90deg); }
    .bma-group-count {
      color: #8b90a3; font-weight: 500; font-size: 10px;
      text-transform: none; letter-spacing: 0; margin-left: auto;
    }
    .bma-item {
      display: flex; align-items: center; gap: 7px;
      padding: 5px 12px 5px 28px;
      cursor: pointer; transition: background 0.1s;
      font-size: 12px;
    }
    .bma-item:hover:not(.bma-locked) { background: rgba(255,255,255,0.04); }
    .bma-item.bma-selected { background: rgba(11,101,194,0.18); }
    .bma-item.bma-locked { opacity: 0.45; cursor: not-allowed; }
    .bma-item-icon { font-size: 12px; width: 14px; text-align: center; }
    .bma-item-name {
      flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .bma-item-lock { color: #c9a227; font-size: 10px; }
    .bma-item-group { font-size: 10px; color: #8b90a3; margin-left: 6px; }

    .bma-footer {
      padding: 10px 12px; border-top: 1px solid #2d3139;
      display: flex; flex-direction: column; gap: 6px;
    }
    .bma-count { font-weight: 700; color: #fff; }
    .bma-count-muted { color: #8b90a3; font-weight: 500; font-size: 11px; }
    .bma-target {
      flex: 1; min-width: 0;
      background: #22262e; color: #e0e4ec; border: 1px solid #2d3139;
      border-radius: 6px; padding: 5px 8px; font-size: 12px;
      font-family: inherit;
    }
    .bma-btn {
      border: 0; padding: 6px 12px; border-radius: 6px;
      font-size: 11px; font-weight: 600; cursor: pointer;
      font-family: inherit;
    }
    .bma-btn-primary { background: #0b65c2; color: #fff; }
    .bma-btn-primary:hover:not(:disabled) { background: #0952a0; }
    .bma-btn-primary:disabled { background: #2d3139; color: #5a6070; cursor: default; }
    .bma-btn-secondary { background: #2d3139; color: #b0b8c8; }
    .bma-btn-secondary:hover { background: #3a3f4a; color: #fff; }

    .bma-bar {
      width: 100%; height: 5px; background: #2d3139; border-radius: 3px;
      overflow: hidden; display: none;
    }
    .bma-bar.bma-visible { display: block; }
    .bma-bar > div {
      height: 100%; background: #0b65c2; width: 0%;
      transition: width 0.15s linear;
    }
    .bma-phase {
      font-size: 11px; color: #8b90a3; font-style: italic;
      min-height: 1.2em;
    }

    .bma-launch {
      position: fixed; bottom: 118px; right: 18px; z-index: 9999;
      background: #0b65c2; color: #fff; border: 0; padding: 10px 14px;
      border-radius: 10px; font-weight: 600; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.2); font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
    .bma-launch:hover { background: #0952a0; }
  `);

  // ─── Panel construction ─────────────────────────────────────────
  function buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'bma-panel';
    panel.innerHTML = `
      <div class="bma-header" id="bma-drag-handle">
        <h2>Batch Move Assignments</h2>
        <button class="bma-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="bma-toolbar">
        <div class="bma-row">
          <div class="bma-filter-group" role="group" aria-label="Filter by type">
            <button class="bma-filter-btn bma-active" data-filter="all" type="button">All</button>
            <button class="bma-filter-btn" data-filter="assignments" type="button">Asgn</button>
            <button class="bma-filter-btn" data-filter="quizzes" type="button">Quiz</button>
            <button class="bma-filter-btn" data-filter="discussions" type="button">Disc</button>
          </div>
          <div class="bma-view-toggle" role="group" aria-label="View mode">
            <button class="bma-view-btn bma-active" data-view="grouped" type="button">Grouped</button>
            <button class="bma-view-btn" data-view="flat" type="button">Flat</button>
          </div>
        </div>
        <div class="bma-row">
          <input type="text" class="bma-search" placeholder="Search by name…" />
          <button class="bma-btn bma-btn-secondary" id="bma-select-visible" type="button">+ Visible</button>
        </div>
      </div>
      <div class="bma-list" id="bma-list">
        <div class="bma-loading">Loading assignments…</div>
      </div>
      <div class="bma-footer">
        <div class="bma-phase" id="bma-phase">Click items on the page or in this panel to select.</div>
        <div class="bma-bar" id="bma-bar"><div></div></div>
        <div class="bma-row">
          <span><span class="bma-count" id="bma-count">0</span> <span class="bma-count-muted">selected</span></span>
        </div>
        <div class="bma-row">
          <select class="bma-target" id="bma-target" disabled>
            <option value="">Loading groups…</option>
          </select>
        </div>
        <div class="bma-row">
          <button class="bma-btn bma-btn-secondary" id="bma-clear" type="button">Clear</button>
          <button class="bma-btn bma-btn-primary" id="bma-move" type="button" disabled style="flex: 1;">Move</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    panelEl = panel;

    wireEvents();
    makeDraggable(panel, panel.querySelector('#bma-drag-handle'));
    return panel;
  }

  function makeDraggable(el, handle) {
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.bma-close')) return;
      dragging = true;
      const rect = el.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      el.style.right = 'auto';
      el.style.left = startLeft + 'px';
      el.style.top = startTop + 'px';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const newLeft = startLeft + (e.clientX - startX);
      const newTop = startTop + (e.clientY - startY);
      const maxLeft = window.innerWidth - el.offsetWidth - 4;
      const maxTop = window.innerHeight - el.offsetHeight - 4;
      el.style.left = Math.max(4, Math.min(newLeft, maxLeft)) + 'px';
      el.style.top = Math.max(4, Math.min(newTop, maxTop)) + 'px';
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  function wireEvents() {
    panelEl.querySelector('.bma-close').addEventListener('click', closePanel);

    panelEl.querySelectorAll('.bma-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        panelEl.querySelectorAll('.bma-filter-btn').forEach((b) =>
          b.classList.remove('bma-active')
        );
        btn.classList.add('bma-active');
        currentFilter = btn.dataset.filter;
        renderList();
      });
    });

    panelEl.querySelectorAll('.bma-view-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        panelEl.querySelectorAll('.bma-view-btn').forEach((b) =>
          b.classList.remove('bma-active')
        );
        btn.classList.add('bma-active');
        viewMode = btn.dataset.view;
        renderList();
      });
    });

    panelEl.querySelector('.bma-search').addEventListener('input', (e) => {
      searchTerm = e.target.value.trim();
      renderList();
    });

    panelEl.querySelector('#bma-select-visible').addEventListener('click', () => {
      for (const g of groupsData) {
        for (const a of visibleAssignments(g)) {
          if (!a.locked) selectedIds.add(a.id);
        }
      }
      renderList();
      syncPageHighlights();
      updateFooter();
    });

    panelEl.querySelector('#bma-clear').addEventListener('click', () => {
      selectedIds.clear();
      renderList();
      syncPageHighlights();
      updateFooter();
    });

    panelEl.querySelector('#bma-target').addEventListener('change', updateFooter);

    panelEl.querySelector('#bma-move').addEventListener('click', async () => {
      const target = panelEl.querySelector('#bma-target').value;
      if (!target || selectedIds.size === 0) return;

      panelEl.querySelectorAll('button, select, input').forEach((el) => {
        if (!el.classList.contains('bma-close')) el.disabled = true;
      });
      panelEl.querySelector('#bma-bar').classList.add('bma-visible');

      await executeBatchMove(target);
    });
  }

  function closePanel() {
    exitSelectionMode();
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
    }
    selectedIds.clear();
    currentFilter = 'all';
    searchTerm = '';
  }

  // ─── Panel list rendering ───────────────────────────────────────
  function renderList() {
    const list = panelEl.querySelector('#bma-list');
    if (!groupsData.length) {
      list.innerHTML = '<div class="bma-empty">No assignment groups found.</div>';
      return;
    }

    const hasAny = groupsData.some((g) => visibleAssignments(g).length > 0);
    if (!hasAny) {
      list.innerHTML = '<div class="bma-empty">No items match the current filter or search.</div>';
      return;
    }

    list.innerHTML = viewMode === 'grouped' ? renderGrouped() : renderFlat();

    list.querySelectorAll('.bma-item').forEach((row) => {
      const id = row.dataset.id;
      if (row.classList.contains('bma-locked')) return;
      row.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        toggleSelection(id);
      });
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb) cb.addEventListener('change', () => toggleSelection(id));
    });

    list.querySelectorAll('.bma-group-checkbox').forEach((cb) => {
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        const groupId = cb.dataset.group;
        const group = groupsData.find((g) => g.id === groupId);
        if (!group) return;
        const visible = visibleAssignments(group).filter((a) => !a.locked);
        if (cb.checked) visible.forEach((a) => selectedIds.add(a.id));
        else visible.forEach((a) => selectedIds.delete(a.id));
        renderList();
        syncPageHighlights();
        updateFooter();
      });
    });

    list.querySelectorAll('.bma-group-header').forEach((header) => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('input')) return;
        header.classList.toggle('bma-collapsed');
        const items = header.nextElementSibling;
        if (items) {
          items.style.display = header.classList.contains('bma-collapsed') ? 'none' : '';
        }
      });
    });
  }

  function renderGrouped() {
    let html = '';
    for (const group of groupsData) {
      const visible = visibleAssignments(group);
      if (visible.length === 0) continue;

      const selectable = visible.filter((a) => !a.locked);
      const allSelected = selectable.length > 0 &&
        selectable.every((a) => selectedIds.has(a.id));

      html += `
        <div class="bma-group-header" data-group="${escapeHTML(group.id)}">
          <span class="bma-group-chev">▼</span>
          <input type="checkbox" class="bma-group-checkbox"
                 data-group="${escapeHTML(group.id)}"
                 ${allSelected ? 'checked' : ''}
                 ${selectable.length === 0 ? 'disabled' : ''} />
          <span>${escapeHTML(group.name)}</span>
          <span class="bma-group-count">${visible.length}</span>
        </div>
        <div class="bma-group-items">
          ${visible.map(renderItem).join('')}
        </div>
      `;
    }
    return html;
  }

  function renderFlat() {
    const items = [];
    for (const group of groupsData) {
      for (const a of visibleAssignments(group)) items.push(a);
    }
    return items.map(renderItem).join('');
  }

  function renderItem(a) {
    const selected = selectedIds.has(a.id);
    const classes = ['bma-item'];
    if (selected) classes.push('bma-selected');
    if (a.locked) classes.push('bma-locked');
    const tooltip = a.locked ? 'Locked by blueprint — cannot be moved' : '';
    return `
      <div class="${classes.join(' ')}" data-id="${escapeHTML(a.id)}" title="${escapeHTML(tooltip)}">
        <input type="checkbox" ${selected ? 'checked' : ''} ${a.locked ? 'disabled' : ''} />
        <span class="bma-item-icon" aria-label="${typeLabel(a.type)}">${typeIcon(a.type)}</span>
        <span class="bma-item-name">${escapeHTML(a.name)}</span>
        ${a.locked ? '<span class="bma-item-lock">🔒</span>' : ''}
        ${viewMode === 'flat' ? `<span class="bma-item-group">${escapeHTML(a.groupName)}</span>` : ''}
      </div>
    `;
  }

  function populateTargetDropdown() {
    const select = panelEl.querySelector('#bma-target');
    select.innerHTML = '<option value="">— Move to group —</option>';
    for (const g of groupsData) {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      select.appendChild(opt);
    }
    select.disabled = false;
  }

  function updateFooter() {
    if (!panelEl) return;
    const count = selectedIds.size;
    panelEl.querySelector('#bma-count').textContent = count;
    const target = panelEl.querySelector('#bma-target').value;
    panelEl.querySelector('#bma-move').disabled = !target || count === 0;
  }

  function setPhase(text) {
    const el = panelEl?.querySelector('#bma-phase');
    if (el) el.textContent = text;
  }

  function setDetail(text) {
    setPhase(text);
  }

  function setProgress(done, total) {
    const bar = panelEl?.querySelector('#bma-bar > div');
    if (bar) {
      const pct = total ? Math.round((done / total) * 100) : 0;
      bar.style.width = `${pct}%`;
    }
  }

  // ─── Launch ─────────────────────────────────────────────────────
  async function launch() {
    if (panelEl) return;

    buildPanel();
    enterSelectionMode();

    try {
      groupsData = await loadGroupsAndAssignments();
      populateTargetDropdown();
      renderList();
      syncPageHighlights();
      updateFooter();
    } catch (err) {
      console.error('[Batch Move Assignments] Failed to load data:', err);
      panelEl.querySelector('#bma-list').innerHTML =
        `<div class="bma-empty">Failed to load assignments: ${escapeHTML(err.message)}</div>`;
    }
  }

  // Delegated click listener — always attached; selecting flag gates it
  document.addEventListener('click', handlePageClick, true);

  // ─── Toolbar integration ────────────────────────────────────────
  function createOwnButton() {
    const btn = document.createElement('button');
    btn.className = 'bma-launch';
    btn.textContent = '⇄ Batch Move Assignments';
    btn.addEventListener('click', launch);
    document.body.appendChild(btn);
  }

  if (unsafeWindow.canvasToolbar?._ready) {
    unsafeWindow.canvasToolbar.register({
      id: 'batch-move-assignments',
      label: 'Batch Move Assignments',
      icon: '⇄',
      order: 31,
      onClick: launch,
    });
  } else {
    unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
      unsafeWindow.canvasToolbar.register({
        id: 'batch-move-assignments',
        label: 'Batch Move Assignments',
        icon: '⇄',
        order: 31,
        onClick: launch,
      });
    }, { once: true });
    setTimeout(() => {
      if (!unsafeWindow.canvasToolbar?._ready) createOwnButton();
    }, 3000);
  }
})();
