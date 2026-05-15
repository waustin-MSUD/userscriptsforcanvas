// ==UserScript==
// @name          Sandbox Reset
// @version       2026.05.15
// @namespace     CTLD
// @description   Bulk deletion for assignments, quizzes, discussions, announcements, modules, and rubrics in a Sandbox.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/SandboxReset.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*/assignments
// @match         https://*.instructure.com/courses/*/quizzes
// @match         https://*.instructure.com/courses/*/discussion_topics
// @match         https://*.instructure.com/courses/*/announcements
// @match         https://*.instructure.com/courses/*/modules
// @match         https://*.instructure.com/courses/*/rubrics
// @grant         GM_addStyle
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  const PER_PAGE = 50;
  const THROTTLE_MS = 200;
  const COUNTDOWN_SECONDS = 5;
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

  function isSandbox(course) {
    return /sandbox/i.test(course?.name || '');
  }

  // ─── Page handlers ──────────────────────────────────────────────
  // Each handler describes one supported page. To add a new page type,
  // append an entry here. No other code changes needed.
  const HANDLERS = [
    {
      id: 'assignments',
      label: 'Reset: Delete All Assignments',
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
      label: 'Reset: Delete All Quizzes',
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
      label: 'Reset: Delete All Discussions',
      matches: (p) => /\/courses\/\d+\/discussion_topics\/?$/.test(p),
      itemTypeLabel: 'discussions',
      async fetchItems(courseId) {
        // only_announcements=false fetches regular discussions (graded and ungraded)
        return fetchAllPages(`/api/v1/courses/${courseId}/discussion_topics`, {
          only_announcements: false,
        });
      },
      async deleteItem(courseId, item, log) {
        await apiDelete(`/api/v1/courses/${courseId}/discussion_topics/${item.id}`);
      },
    },

    {
      id: 'announcements',
      label: 'Reset: Delete All Announcements',
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
      label: 'Reset: Delete All Modules',
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
      id: 'rubrics',
      label: 'Reset: Delete All Rubrics',
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
    .sr-backdrop {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,0.55);
      display: flex; align-items: center; justify-content: center;
    }
    .sr-modal {
      width: 92%; max-width: 480px;
      background: #1a1d23; color: #e0e4ec;
      border-radius: 12px;
      border: 1px solid #5a1f1f;
      box-shadow: 0 0 0 1px rgba(220, 53, 69, 0.3), 0 20px 60px rgba(0,0,0,0.6);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 14px;
      overflow: hidden;
    }
    .sr-header {
      background: #3a1818;
      padding: 14px 18px;
      border-bottom: 1px solid #5a1f1f;
      display: flex; align-items: center; gap: 10px;
    }
    .sr-header h2 {
      margin: 0; font-size: 15px; color: #ffb4b4; font-weight: 700;
    }
    .sr-warning-icon { font-size: 18px; }
    .sr-body {
      padding: 18px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .sr-section {
      background: #22262e;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 13px;
    }
    .sr-section-label {
      font-size: 11px; color: #8b90a3; text-transform: uppercase;
      letter-spacing: 0.05em; font-weight: 700; margin-bottom: 4px;
    }
    .sr-section-value {
      color: #fff; font-weight: 500;
    }
    .sr-section-value.sr-count { font-size: 18px; font-weight: 700; }
    .sr-loading { color: #8b90a3; font-style: italic; }

    .sr-warn-row {
      display: flex; align-items: flex-start; gap: 8px;
      background: #3a2f18; padding: 10px 12px; border-radius: 8px;
      border-left: 3px solid #c9a227;
      font-size: 12px; color: #e0d4a3;
    }
    .sr-warn-row strong { color: #ffd966; }

    .sr-force-row {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; color: #b0b8c8;
    }
    .sr-confirm-input {
      width: 100%;
      background: #22262e; border: 1px solid #2d3139; color: #e0e4ec;
      padding: 8px 10px; border-radius: 6px; font-size: 13px;
      font-family: inherit; box-sizing: border-box;
    }
    .sr-confirm-input:focus { outline: none; border-color: #c62828; }
    .sr-confirm-hint { font-size: 11px; color: #8b90a3; margin-top: 4px; }

    .sr-footer {
      padding: 12px 18px;
      border-top: 1px solid #2d3139;
      display: flex; gap: 8px; justify-content: flex-end; align-items: center;
    }
    .sr-progress {
      flex: 1;
    }
    .sr-bar {
      width: 100%; height: 5px; background: #2d3139; border-radius: 3px;
      overflow: hidden; margin-top: 4px;
    }
    .sr-bar > div {
      height: 100%; background: #c62828; width: 0%;
      transition: width 0.15s linear;
    }
    .sr-phase {
      font-size: 11px; color: #8b90a3; font-style: italic; min-height: 1.2em;
    }
    .sr-btn {
      border: 0; padding: 8px 16px; border-radius: 6px;
      font-size: 12px; font-weight: 700; cursor: pointer;
      font-family: inherit;
    }
    .sr-btn-cancel { background: #2d3139; color: #b0b8c8; }
    .sr-btn-cancel:hover { background: #3a3f4a; color: #fff; }
    .sr-btn-danger { background: #c62828; color: #fff; }
    .sr-btn-danger:hover:not(:disabled) { background: #a31e1e; }
    .sr-btn-danger:disabled { background: #5a1f1f; color: #a08080; cursor: default; }

    .sr-launch {
      position: fixed; bottom: 150px; right: 18px; z-index: 9998;
      background: #c62828; color: #fff; border: 0; padding: 8px 12px;
      border-radius: 8px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.3); font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
    .sr-launch:hover { background: #a31e1e; }
  `);

  // ─── Confirmation modal ─────────────────────────────────────────
  function buildModal(handler) {
    const backdrop = document.createElement('div');
    backdrop.className = 'sr-backdrop';
    backdrop.innerHTML = `
      <div class="sr-modal" role="dialog" aria-labelledby="sr-title">
        <div class="sr-header">
          <span class="sr-warning-icon">⚠️</span>
          <h2 id="sr-title">${escapeHTML(handler.label)}</h2>
        </div>
        <div class="sr-body" id="sr-body">
          <div class="sr-section">
            <div class="sr-section-label">Course</div>
            <div class="sr-section-value" id="sr-course">Loading…</div>
          </div>
          <div class="sr-section">
            <div class="sr-section-label">Items to delete</div>
            <div class="sr-section-value sr-count" id="sr-count">
              <span class="sr-loading">Counting…</span>
            </div>
          </div>
          <div id="sr-non-sandbox" style="display:none;">
            <div class="sr-warn-row">
              <span>⚠️</span>
              <div>
                <strong>This course doesn't look like a sandbox.</strong>
                <div>The name doesn't contain "sandbox." To proceed, enable the force toggle and type <strong>${escapeHTML(CONFIRM_PHRASE)}</strong>.</div>
              </div>
            </div>
            <div class="sr-force-row" style="margin-top:10px;">
              <input type="checkbox" id="sr-force" />
              <label for="sr-force">I understand this is not a sandbox</label>
            </div>
            <div style="margin-top:10px;">
              <input type="text" class="sr-confirm-input" id="sr-confirm-input"
                     placeholder="Type ${escapeHTML(CONFIRM_PHRASE)} to confirm" disabled />
              <div class="sr-confirm-hint">The countdown will start once both are complete.</div>
            </div>
          </div>
        </div>
        <div class="sr-footer">
          <div class="sr-progress">
            <div class="sr-phase" id="sr-phase"></div>
            <div class="sr-bar" id="sr-bar" style="display:none;"><div></div></div>
          </div>
          <button class="sr-btn sr-btn-cancel" id="sr-cancel" type="button">Cancel</button>
          <button class="sr-btn sr-btn-danger" id="sr-delete" type="button" disabled>Delete</button>
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

    // Track state for gating the delete button
    let items = [];
    let inferredSandbox = false;
    let isForced = false;
    let typedOK = false;
    let countdownActive = false;
    let countdownInterval = null;
    let canFire = false;

    function cancel() {
      if (countdownInterval) clearInterval(countdownInterval);
      modal.remove();
    }

    $('#sr-cancel').addEventListener('click', cancel);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cancel();
    });

    // Load course info and item count in parallel
    try {
      const [course, fetchedItems] = await Promise.all([
        getCourseInfo(),
        handler.fetchItems(courseId),
      ]);
      items = fetchedItems;
      $('#sr-course').textContent = course.name || `Course ${courseId}`;
      $('#sr-count').textContent = `${items.length} ${handler.itemTypeLabel}`;
      inferredSandbox = isSandbox(course);
      if (!inferredSandbox) {
        $('#sr-non-sandbox').style.display = '';
      }
    } catch (err) {
      console.error('[Sandbox Reset] Failed to load:', err);
      $('#sr-count').innerHTML = `<span style="color:#c62828">Failed to load: ${escapeHTML(err.message)}</span>`;
      return;
    }

    if (items.length === 0) {
      $('#sr-phase').textContent = 'Nothing to delete.';
      $('#sr-delete').disabled = true;
      return;
    }

    function updateGate() {
      const eligibilityMet = inferredSandbox || (isForced && typedOK);
      if (!eligibilityMet) {
        canFire = false;
        $('#sr-delete').disabled = true;
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
          countdownActive = false;
          $('#sr-delete').textContent = 'Delete';
          $('#sr-phase').textContent = '';
        }
        return;
      }
      // Start countdown if not already running
      if (!countdownActive) startCountdown();
    }

    function startCountdown() {
      countdownActive = true;
      let remaining = COUNTDOWN_SECONDS;
      $('#sr-delete').disabled = true;
      $('#sr-delete').textContent = `Delete in ${remaining}…`;
      $('#sr-phase').textContent = 'Confirming…';
      countdownInterval = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(countdownInterval);
          countdownInterval = null;
          canFire = true;
          $('#sr-delete').disabled = false;
          $('#sr-delete').textContent = 'Delete now';
          $('#sr-phase').textContent = '';
        } else {
          $('#sr-delete').textContent = `Delete in ${remaining}…`;
        }
      }, 1000);
    }

    if (!inferredSandbox) {
      const forceCb = $('#sr-force');
      const confirmInput = $('#sr-confirm-input');
      forceCb.addEventListener('change', () => {
        isForced = forceCb.checked;
        confirmInput.disabled = !isForced;
        if (!isForced) {
          confirmInput.value = '';
          typedOK = false;
        }
        updateGate();
      });
      confirmInput.addEventListener('input', () => {
        typedOK = confirmInput.value === CONFIRM_PHRASE;
        updateGate();
      });
    } else {
      // Sandbox detected — start countdown immediately
      startCountdown();
    }

    $('#sr-delete').addEventListener('click', async () => {
      if (!canFire) return;
      // Disable controls during deletion
      $('#sr-cancel').disabled = true;
      $('#sr-delete').disabled = true;
      $('#sr-delete').textContent = 'Deleting…';
      const nonSandbox = $('#sr-non-sandbox');
      if (nonSandbox) nonSandbox.style.display = 'none';
      $('#sr-bar').style.display = '';

      await executeDeletion(handler, courseId, items, modal);
    });
  }

  async function executeDeletion(handler, courseId, items, modal) {
    const $ = (sel) => modal.querySelector(sel);
    const total = items.length;
    let done = 0;
    let errors = 0;

    function setBar() {
      const pct = total ? Math.round((done / total) * 100) : 0;
      $('#sr-bar > div').style.width = `${pct}%`;
    }

    function log(msg) {
      console.log(`[Sandbox Reset] ${msg}`);
      $('#sr-phase').textContent = msg;
    }

    console.log(`[Sandbox Reset] Starting: ${handler.label} — ${total} ${handler.itemTypeLabel}`);

    for (const item of items) {
      const name = nameOf(handler, item);
      try {
        log(`${done + 1}/${total}: ${name}`);
        await handler.deleteItem(courseId, item, log);
        done += 1;
      } catch (err) {
        console.error(`[Sandbox Reset] Failed to delete "${name}":`, err);
        errors += 1;
        done += 1;
      }
      setBar();
      await sleep(THROTTLE_MS);
    }

    // Optional post-deletion step (e.g. empty assignment groups)
    if (handler.postDelete) {
      try {
        await handler.postDelete(courseId, log);
      } catch (err) {
        console.error('[Sandbox Reset] postDelete failed:', err);
      }
    }

    const succeeded = total - errors;
    console.log(`[Sandbox Reset] Complete: ${succeeded}/${total} deleted, ${errors} failed.`);

    if (errors === 0) {
      log(`Deleted ${succeeded}. Reloading…`);
      setTimeout(() => location.reload(), 1200);
    } else {
      log(`Deleted ${succeeded}/${total}. ${errors} failed — see console.`);
      $('#sr-cancel').disabled = false;
      $('#sr-cancel').textContent = 'Close';
    }
  }

  // ─── Toolbar registration ───────────────────────────────────────
  function launch() {
    const handler = findHandler();
    if (!handler) {
      alert('This page is not supported by the reset script.');
      return;
    }
    runFlow(handler);
  }

  function createOwnButton(handler) {
    const btn = document.createElement('button');
    btn.className = 'sr-launch';
    btn.textContent = `⚠️ ${handler.label}`;
    btn.addEventListener('click', launch);
    document.body.appendChild(btn);
  }

  const activeHandler = findHandler();
  if (!activeHandler) return; // page not supported, do nothing

  if (unsafeWindow.canvasToolbar?._ready) {
    unsafeWindow.canvasToolbar.register({
      id: `sandbox-reset-${activeHandler.id}`,
      label: activeHandler.label,
      icon: '⚠️',
      order: 95,
      onClick: launch,
    });
  } else {
    unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
      unsafeWindow.canvasToolbar.register({
        id: `sandbox-reset-${activeHandler.id}`,
        label: activeHandler.label,
        icon: '⚠️',
        order: 95,
        onClick: launch,
      });
    }, { once: true });
    setTimeout(() => {
      if (!unsafeWindow.canvasToolbar?._ready) createOwnButton(activeHandler);
    }, 3000);
  }
})();
