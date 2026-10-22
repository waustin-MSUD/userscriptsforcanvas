// ==UserScript==
// @name          Housekeeping
// @version       2026.10.22
// @namespace     CTLD
// @description   Select-and-delete (or delete all) assignments, quizzes, discussions, announcements, modules, pages, and rubrics in a course.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/Housekeeping.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*/assignments
// @match         https://*.instructure.com/courses/*/quizzes
// @match         https://*.instructure.com/courses/*/discussion_topics
// @match         https://*.instructure.com/courses/*/announcements
// @match         https://*.instructure.com/courses/*/modules
// @match         https://*.instructure.com/courses/*/pages
// @match         https://*.instructure.com/courses/*/rubrics
// @grant         GM_addStyle
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  const PER_PAGE = 50;
  const THROTTLE_MS = 200;
  const CONFIRM_PHRASE = 'DELETE';

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
      const err = new Error(`HTTP ${res.status}: ${path} ${text.slice(0, 300)}`);
      err.status = res.status;
      err.body = text;
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

  async function apiDelete(path) {
    const csrf = getCSRFToken();
    return apiFetch(path, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': csrf },
    });
  }

  // ─── Course info ────────────────────────────────────────────────
  let courseInfo = null;

  async function getCourseInfo() {
    if (courseInfo) return courseInfo;
    courseInfo = await apiFetch(`/api/v1/courses/${getCourseId()}`);
    return courseInfo;
  }

  // ─── Page handlers ──────────────────────────────────────────────
  // Each handler describes one supported page. To add a new page type,
  // append an entry here. No other code changes needed.
  const HANDLERS = [
    {
      id: 'assignments',
 label: 'Delete Assignments',
 matches: (p) => /\/courses\/\d+\/assignments\/?$/.test(p),
 itemTypeLabel: 'assignments',
 // Fetch everything visible on the Assignments page — graded
 // assignments, quiz assignments, and discussion assignments.
 async fetchItems(courseId) {
   return fetchAllPages(`/api/v1/courses/${courseId}/assignments`, {
     'exclude_response_fields[]': ['description', 'rubric'],
   });
 },
 async deleteItem(courseId, item, log) {
   await apiDelete(`/api/v1/courses/${courseId}/assignments/${item.id}`);
 },
 // After items are gone, sweep empty assignment groups.
 // Only runs on a full (all-items) delete — see executeDeletion.
 async postDelete(courseId, log) {
   const groups = await fetchAllPages(
     `/api/v1/courses/${courseId}/assignment_groups`,
     { 'include[]': ['assignments'] }
   );
   const empty = groups.filter((g) => !g.assignments || g.assignments.length === 0);
   if (empty.length === 0) {
     log(`No empty assignment groups to remove.`);
     return;
   }
   log(`Removing ${empty.length} empty assignment group${empty.length === 1 ? '' : 's'}…`);
   for (const g of empty) {
     try {
       await apiDelete(`/api/v1/courses/${courseId}/assignment_groups/${g.id}`);
       log(`Removed group: ${g.name}`);
     } catch (err) {
       log(`Could not remove group "${g.name}": ${err.message}`);
     }
     await sleep(THROTTLE_MS);
   }
 },
    },

    {
      id: 'quizzes',
 label: 'Delete Quizzes',
 matches: (p) => /\/courses\/\d+\/quizzes\/?$/.test(p),
 itemTypeLabel: 'quizzes',
 // Classic Quizzes live on the quizzes endpoint. New Quizzes are
 // assignments with quiz_type === 'quizzes.next'. Both show on the
 // Quizzes page, so we fetch both. (The is_quiz_lti_assignment
 // flag exists but isn't reliably populated across versions;
 // quiz_type is the authoritative field.)
 async fetchItems(courseId) {
   const [classic, allAssignments] = await Promise.all([
     fetchAllPages(`/api/v1/courses/${courseId}/quizzes`),
                                                       fetchAllPages(`/api/v1/courses/${courseId}/assignments`, {
                                                         'exclude_response_fields[]': ['description', 'rubric'],
                                                       }),
   ]);
   const newQuizzes = allAssignments.filter(
     (a) => a.quiz_type === 'quizzes.next' || a.is_quiz_lti_assignment
   );
   // Tag each item with its delete strategy
   return [
     ...classic.map((q) => ({ ...q, _kind: 'classic' })),
 ...newQuizzes.map((a) => ({ ...a, _kind: 'new' })),
   ];
 },
 async deleteItem(courseId, item, log) {
   if (item._kind === 'new') {
     await apiDelete(`/api/v1/courses/${courseId}/assignments/${item.id}`);
   } else {
     await apiDelete(`/api/v1/courses/${courseId}/quizzes/${item.id}`);
   }
 },
    },

    {
      id: 'discussions',
 label: 'Delete Discussions',
 matches: (p) => /\/courses\/\d+\/discussion_topics\/?$/.test(p),
 itemTypeLabel: 'discussions',
 async fetchItems(courseId) {
   // Omit only_announcements entirely — the default returns regular discussions.
   // Passing only_announcements=false sends the string "false", which Canvas
   // may interpret as truthy, returning announcements instead.
   const all = await fetchAllPages(`/api/v1/courses/${courseId}/discussion_topics`);
   // Filter out announcements just in case
   return all.filter((d) => !d.is_announcement);
 },
 async deleteItem(courseId, item, log) {
   await apiDelete(`/api/v1/courses/${courseId}/discussion_topics/${item.id}`);
 },
    },

    {
      id: 'announcements',
      label: 'Delete Announcements',
      matches: (p) => /\/courses\/\d+\/announcements\/?$/.test(p),
 itemTypeLabel: 'announcements',
 async fetchItems(courseId) {
   return fetchAllPages(`/api/v1/courses/${courseId}/discussion_topics`, {
     only_announcements: true,
   });
 },
 async deleteItem(courseId, item, log) {
   await apiDelete(`/api/v1/courses/${courseId}/discussion_topics/${item.id}`);
 },
    },

    {
      id: 'modules',
      label: 'Delete Modules',
      matches: (p) => /\/courses\/\d+\/modules\/?$/.test(p),
 itemTypeLabel: 'modules',
 async fetchItems(courseId) {
   return fetchAllPages(`/api/v1/courses/${courseId}/modules`);
 },
 async deleteItem(courseId, item, log) {
   await apiDelete(`/api/v1/courses/${courseId}/modules/${item.id}`);
 },
    },

    {
      id: 'pages',
      label: 'Delete Pages',
      matches: (p) => /\/courses\/\d+\/pages\/?$/.test(p),
 itemTypeLabel: 'pages',
 async fetchItems(courseId) {
   const pages = await fetchAllPages(`/api/v1/courses/${courseId}/pages`);
   // The front page can't be deleted while it's set as front page.
   // Move it to the end so everything else is deleted first, then
   // attempt to delete it last (Canvas may or may not allow it).
   const sorted = pages.sort((a, b) => {
     if (a.front_page) return 1;
     if (b.front_page) return -1;
     return 0;
   });
   return sorted;
 },
 async deleteItem(courseId, item, log) {
   if (item.front_page) {
     // Try to unset front page first via course settings
     try {
       const csrf = getCSRFToken();
       await apiFetch(`/api/v1/courses/${courseId}`, {
         method: 'PUT',
         headers: {
           'Content-Type': 'application/json',
           'X-CSRF-Token': csrf,
         },
         body: JSON.stringify({
           course: { default_view: 'modules' },
         }),
       });
       // Now unset the page's front_page flag
       await apiFetch(`/api/v1/courses/${courseId}/pages/${encodeURIComponent(item.url)}`, {
         method: 'PUT',
         headers: {
           'Content-Type': 'application/json',
           'X-CSRF-Token': csrf,
         },
         body: JSON.stringify({
           wiki_page: { front_page: false },
         }),
       });
     } catch (err) {
       log(`Could not unset front page: ${err.message}. Attempting delete anyway…`);
     }
   }
   await apiDelete(`/api/v1/courses/${courseId}/pages/${encodeURIComponent(item.url)}`);
 },
 itemName: (item) => item.title || item.url || `Page ${item.page_id}`,
    },

    {
      id: 'rubrics',
      label: 'Delete Rubrics',
      matches: (p) => /\/courses\/\d+\/rubrics\/?$/.test(p),
 itemTypeLabel: 'rubrics',
 async fetchItems(courseId) {
   return fetchAllPages(`/api/v1/courses/${courseId}/rubrics`);
 },
 async deleteItem(courseId, item, log) {
   // First attempt: straight delete.
   try {
     await apiDelete(`/api/v1/courses/${courseId}/rubrics/${item.id}`);
     return;
   } catch (err) {
     // Rubrics in use can't be deleted directly. Fetch associations,
     // delete each, then retry the rubric delete.
     log(`Rubric "${item.title}" in use; removing associations…`);
   }

   let detail;
   try {
     detail = await apiFetch(
       `/api/v1/courses/${courseId}/rubrics/${item.id}?include[]=associations`
     );
   } catch (err) {
     throw new Error(`Could not fetch rubric associations: ${err.message}`);
   }

   const assocs = detail?.associations || detail?.rubric_associations || [];
   for (const a of assocs) {
     try {
       await apiDelete(`/api/v1/courses/${courseId}/rubric_associations/${a.id}`);
     } catch (err) {
       // Continue trying others even if one fails
       log(`Could not remove association ${a.id}: ${err.message}`);
     }
     await sleep(THROTTLE_MS);
   }

   // Retry the rubric delete
   await apiDelete(`/api/v1/courses/${courseId}/rubrics/${item.id}`);
 },
 itemName: (item) => item.title || `Rubric ${item.id}`,
    },
  ];

  function findHandler() {
    return HANDLERS.find((h) => h.matches(location.pathname));
  }

  function nameOf(handler, item) {
    if (handler.itemName) return handler.itemName(item);
    return item.name || item.title || `Item ${item.id}`;
  }

  // ─── Styles ─────────────────────────────────────────────────────
  GM_addStyle(`
  .bd-backdrop {
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center;
  }
  .bd-modal {
    width: 92%; max-width: 480px;
    background: #1a1d23; color: #e0e4ec;
    border-radius: 12px;
    border: 1px solid #5a1f1f;
    box-shadow: 0 0 0 1px rgba(220, 53, 69, 0.3), 0 20px 60px rgba(0,0,0,0.6);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 14px;
    overflow: hidden;
  }
  .bd-header {
    background: #3a1818;
    padding: 14px 18px;
    border-bottom: 1px solid #5a1f1f;
    display: flex; align-items: center; gap: 10px;
  }
  .bd-header h2 {
    margin: 0; font-size: 15px; color: #ffb4b4; font-weight: 700;
  }
  .bd-warning-icon { font-size: 18px; }
  .bd-body {
    padding: 18px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .bd-section {
    background: #22262e;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 13px;
  }
  .bd-section-label {
    font-size: 11px; color: #8b90a3; text-transform: uppercase;
    letter-spacing: 0.05em; font-weight: 700; margin-bottom: 4px;
  }
  .bd-section-value {
    color: #fff; font-weight: 500;
  }
  .bd-loading { color: #8b90a3; font-style: italic; }

  /* ── Item checklist ── */
  .bd-list-head {
    display: flex; justify-content: space-between; align-items: center;
  }
  .bd-master {
    display: flex; align-items: center; gap: 8px; cursor: pointer;
    font-weight: 700; color: #fff; font-size: 13px;
  }
  .bd-master input { cursor: pointer; }
  .bd-list {
    max-height: 240px; overflow-y: auto;
    display: flex; flex-direction: column; gap: 1px;
    margin-top: 8px; padding-right: 2px;
  }
  .bd-item {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 6px; border-radius: 5px; cursor: pointer;
    color: #d7dbe4;
  }
  .bd-item:hover { background: #2a2f38; }
  .bd-item input { cursor: pointer; flex: 0 0 auto; }
  .bd-item span {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    min-width: 0;
  }

  .bd-confirm-input {
    width: 100%;
    background: #22262e; border: 1px solid #2d3139; color: #e0e4ec;
    padding: 8px 10px; border-radius: 6px; font-size: 13px;
    font-family: inherit; box-sizing: border-box;
  }
  .bd-confirm-input:focus { outline: none; border-color: #c62828; }
  .bd-confirm-hint { font-size: 11px; color: #8b90a3; margin-top: 4px; }

  .bd-footer {
    padding: 12px 18px;
    border-top: 1px solid #2d3139;
    display: flex; gap: 8px; justify-content: flex-end; align-items: center;
  }
  .bd-progress { flex: 1; }
  .bd-bar {
    width: 100%; height: 5px; background: #2d3139; border-radius: 3px;
    overflow: hidden; margin-top: 4px;
  }
  .bd-bar > div {
    height: 100%; background: #c62828; width: 0%;
    transition: width 0.15s linear;
  }
  .bd-phase {
    font-size: 11px; color: #8b90a3; font-style: italic; min-height: 1.2em;
  }
  .bd-btn {
    border: 0; padding: 8px 16px; border-radius: 6px;
    font-size: 12px; font-weight: 700; cursor: pointer;
    font-family: inherit;
  }
  .bd-btn-cancel { background: #2d3139; color: #b0b8c8; }
  .bd-btn-cancel:hover { background: #3a3f4a; color: #fff; }
  .bd-btn-danger { background: #c62828; color: #fff; }
  .bd-btn-danger:hover:not(:disabled) { background: #a31e1e; }
  .bd-btn-danger:disabled { background: #5a1f1f; color: #a08080; cursor: default; }

  .bd-launch {
    position: fixed; bottom: 150px; right: 18px; z-index: 9998;
    background: #c62828; color: #fff; border: 0; padding: 8px 12px;
    border-radius: 8px; font-weight: 700; cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,.3); font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  .bd-launch:hover { background: #a31e1e; }
  `);

  // ─── Confirmation modal ─────────────────────────────────────────
  function buildModal(handler) {
    const backdrop = document.createElement('div');
    backdrop.className = 'bd-backdrop';
    backdrop.innerHTML = `
    <div class="bd-modal" role="dialog" aria-labelledby="bd-title">
    <div class="bd-header">
    <span class="bd-warning-icon">🗑️</span>
    <h2 id="bd-title">${escapeHTML(handler.label)}</h2>
    </div>
    <div class="bd-body" id="bd-body">
    <div class="bd-section">
    <div class="bd-section-label">Course</div>
    <div class="bd-section-value" id="bd-course">Loading…</div>
    </div>
    <div class="bd-section">
    <div class="bd-list-head">
    <label class="bd-master">
    <input type="checkbox" id="bd-master" checked />
    <span id="bd-count"><span class="bd-loading">Counting…</span></span>
    </label>
    </div>
    <div class="bd-list" id="bd-list"></div>
    </div>
    <div class="bd-section">
    <input type="text" class="bd-confirm-input" id="bd-confirm-input"
    placeholder="Type ${escapeHTML(CONFIRM_PHRASE)} to confirm" autocomplete="off" />
    <div class="bd-confirm-hint">Type <strong>${escapeHTML(CONFIRM_PHRASE)}</strong> to enable the delete button.</div>
    </div>
    </div>
    <div class="bd-footer">
    <div class="bd-progress">
    <div class="bd-phase" id="bd-phase"></div>
    <div class="bd-bar" id="bd-bar" style="display:none;"><div></div></div>
    </div>
    <button class="bd-btn bd-btn-cancel" id="bd-cancel" type="button">Cancel</button>
    <button class="bd-btn bd-btn-danger" id="bd-delete" type="button" disabled>Delete</button>
    </div>
    </div>
    `;
    document.body.appendChild(backdrop);
    return backdrop;
  }

  async function runFlow(handler) {
    const courseId = getCourseId();
    if (!courseId) {
      alert('No course detected in the URL.');
      return;
    }

    const modal = buildModal(handler);
    const $ = (sel) => modal.querySelector(sel);

    let items = [];
    let typedOK = false;

    function cancel() {
      modal.remove();
    }

    $('#bd-cancel').addEventListener('click', cancel);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cancel();
    });

      // Load course info and items in parallel
      try {
        const [course, fetchedItems] = await Promise.all([
          getCourseInfo(),
                                                         handler.fetchItems(courseId),
        ]);
        items = fetchedItems;
        $('#bd-course').textContent = course.name || `Course ${courseId}`;
      } catch (err) {
        console.error('[Housekeeping] Failed to load:', err);
        $('#bd-count').innerHTML = `<span style="color:#c62828">Failed to load: ${escapeHTML(err.message)}</span>`;
        return;
      }

      if (items.length === 0) {
        $('#bd-count').textContent = `No ${handler.itemTypeLabel} to delete.`;
        $('#bd-master').disabled = true;
        $('#bd-confirm-input').disabled = true;
        return;
      }

      // ── Build the checklist (all checked by default) ──
      const list = $('#bd-list');
      items.forEach((item, i) => {
        const row = document.createElement('label');
        row.className = 'bd-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.idx = String(i);
        const span = document.createElement('span');
        span.textContent = nameOf(handler, item);
        span.title = span.textContent;
        row.append(cb, span);
        list.append(row);
      });

      const master = $('#bd-master');
      const confirmInput = $('#bd-confirm-input');

      function selectedIndexes() {
        return [...list.querySelectorAll('input:checked')].map((cb) => Number(cb.dataset.idx));
      }

      function refresh() {
        const selected = selectedIndexes().length;
        const total = items.length;
        $('#bd-count').textContent = `${selected} of ${total} ${handler.itemTypeLabel} selected`;

        // Master checkbox reflects all / none / partial
        master.checked = selected === total;
        master.indeterminate = selected > 0 && selected < total;

        const btn = $('#bd-delete');
        btn.textContent = selected ? `Delete ${selected}` : 'Delete';
        btn.disabled = !(typedOK && selected > 0);
      }

      master.addEventListener('change', () => {
        const check = master.checked;
        list.querySelectorAll('input').forEach((cb) => { cb.checked = check; });
        refresh();
      });

      list.addEventListener('change', (e) => {
        if (e.target && e.target.matches('input[type="checkbox"]')) refresh();
      });

        confirmInput.addEventListener('input', () => {
          typedOK = confirmInput.value === CONFIRM_PHRASE;
          refresh();
        });

        refresh();

        $('#bd-delete').addEventListener('click', async () => {
          const chosen = selectedIndexes().map((i) => items[i]);
          if (!typedOK || chosen.length === 0) return;

          const isFullDelete = chosen.length === items.length;

          // Lock controls during deletion
          $('#bd-cancel').disabled = true;
          $('#bd-delete').disabled = true;
          $('#bd-delete').textContent = 'Deleting…';
          master.disabled = true;
          confirmInput.disabled = true;
          list.querySelectorAll('input').forEach((cb) => { cb.disabled = true; });
          $('#bd-bar').style.display = '';

          await executeDeletion(handler, courseId, chosen, modal, isFullDelete);
        });
  }

  async function executeDeletion(handler, courseId, items, modal, isFullDelete) {
    const $ = (sel) => modal.querySelector(sel);
    const total = items.length;
    let done = 0;
    let errors = 0;

    function setBar() {
      const pct = total ? Math.round((done / total) * 100) : 0;
      $('#bd-bar > div').style.width = `${pct}%`;
    }

    function log(msg) {
      console.log(`[Housekeeping] ${msg}`);
      $('#bd-phase').textContent = msg;
    }

    console.log(`[Housekeeping] Starting: ${handler.label} — ${total} ${handler.itemTypeLabel}`);

    for (const item of items) {
      const name = nameOf(handler, item);
      try {
        log(`${done + 1}/${total}: ${name}`);
        await handler.deleteItem(courseId, item, log);
        done += 1;
      } catch (err) {
        console.error(`[Housekeeping] Failed to delete "${name}":`, err);
        errors += 1;
        done += 1;
      }
      setBar();
      await sleep(THROTTLE_MS);
    }

    // Optional post-deletion step (e.g. empty assignment groups).
    // Only on a full delete — a partial delete shouldn't sweep groups
    // the user may have meant to keep.
    if (isFullDelete && handler.postDelete) {
      try {
        await handler.postDelete(courseId, log);
      } catch (err) {
        console.error('[Housekeeping] postDelete failed:', err);
      }
    }

    const succeeded = total - errors;
    console.log(`[Housekeeping] Complete: ${succeeded}/${total} deleted, ${errors} failed.`);

    if (errors === 0) {
      log(`Deleted ${succeeded}. Reloading…`);
      setTimeout(() => location.reload(), 1200);
    } else {
      log(`Deleted ${succeeded}/${total}. ${errors} failed — see console.`);
      $('#bd-cancel').disabled = false;
      $('#bd-cancel').textContent = 'Close';
    }
  }

  // ─── Toolbar registration ───────────────────────────────────────
  function launch() {
    const handler = findHandler();
    if (!handler) {
      alert('This page is not supported by the Housekeeping script.');
      return;
    }
    runFlow(handler);
  }

  function createOwnButton(handler) {
    const btn = document.createElement('button');
    btn.className = 'bd-launch';
    btn.textContent = `🗑️ ${handler.label}`;
    btn.addEventListener('click', launch);
    document.body.appendChild(btn);
  }

  const activeHandler = findHandler();
  if (!activeHandler) return; // page not supported, do nothing

  if (unsafeWindow.canvasToolbar?._ready) {
    unsafeWindow.canvasToolbar.register({
      id: `housekeeping-${activeHandler.id}`,
      label: activeHandler.label,
      icon: '🗑️',
      order: 95,
      onClick: launch,
    });
  } else {
    unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
      unsafeWindow.canvasToolbar.register({
        id: `housekeeping-${activeHandler.id}`,
        label: activeHandler.label,
        icon: '🗑️',
        order: 95,
        onClick: launch,
      });
    }, { once: true });
    setTimeout(() => {
      if (!unsafeWindow.canvasToolbar?._ready) createOwnButton(activeHandler);
    }, 3000);
  }
})();
