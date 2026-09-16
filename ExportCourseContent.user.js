// ==UserScript==
// @name          Export Course Content
// @version       2026.09.14
// @namespace     CTLD
// @description   Export pages, assignments, discussions, and classic quizzes (with banks) as HTML, with optional text2qti/qticonverter-format .txt output.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/ExportCourseContent.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*/courses/*/modules
// @match         https://*/courses/*/modules?*
// @match         https://*/courses/*/pages
// @match         https://*/courses/*/pages?*
// @match         https://*/courses/*/assignments
// @match         https://*/courses/*/assignments?*
// @match         https://*/courses/*/discussion_topics
// @match         https://*/courses/*/discussion_topics?*
// @match         https://*/courses/*/quizzes
// @match         https://*/courses/*/quizzes?*
// @match         https://*/courses/*/banks*
// @match         https://*/courses/*/banks/*
// @grant         GM_addStyle
// @grant         GM_addElement
// @run-at        document-start
// ==/UserScript==

(function () {
    // ─── New Quizzes token/apiBase capture ───────────────────────────
    // New Quizzes item banks live on a separate quiz-api-*-prod.instructure.com
    // service, authorized with a short-lived signed token that the Canvas page's
    // own JS mints and attaches to its own requests. We can't mint one ourselves,
    // but we can watch the page's outgoing fetch calls and reuse whatever token it
    // used. This has to install before New Quizzes' own bundle makes its first
    // request, hence @run-at document-start.
    if (!unsafeWindow.__ecNewQuizAuth) unsafeWindow.__ecNewQuizAuth = new Map(); // host -> {token, isJWT, authType, apiBase}
    const newQuizAuth = unsafeWindow.__ecNewQuizAuth;

    (function installNewQuizTokenCapture() {
        if (unsafeWindow.__ecFetchPatched) return;
        unsafeWindow.__ecFetchPatched = true;
        const origFetch = unsafeWindow.fetch;
        unsafeWindow.fetch = function (input, init) {
            try {
                const url = typeof input === 'string' ? input : input?.url;
                const headers = init?.headers || (typeof input === 'object' ? input.headers : null);
                if (url && /quiz-api|quiz-lti/.test(url)) {
                    let authHeader = null, authType = null;
                    if (headers instanceof Headers) {
                        authHeader = headers.get('Authorization') || headers.get('authorization');
                        authType = headers.get('Authtype') || headers.get('authtype');
                    } else if (headers && typeof headers === 'object') {
                        authHeader = headers.Authorization || headers.authorization;
                        authType = headers.Authtype || headers.authtype;
                    }
                    if (authHeader) recordNewQuizAuth(url, authHeader, authType);
                }
            } catch { /* never let capture break the page's own request */ }
            return origFetch.apply(this, arguments);
        };
    })();

    // The New Quizzes frontend likely issues these calls via XMLHttpRequest
    // (e.g. through axios, which defaults to the XHR adapter in browsers) rather
    // than fetch — DevTools' "Copy as fetch" reconstructs a fetch() snippet for
    // ANY request type, so a captured trace looking like fetch() is not proof it
    // actually was one. Patch XHR too so we don't miss the real token.
    (function installNewQuizXHRCapture() {
        if (unsafeWindow.__ecXHRPatched) return;
        unsafeWindow.__ecXHRPatched = true;
        const origOpen = XMLHttpRequest.prototype.open;
        const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        const origSend = XMLHttpRequest.prototype.send;
        const pending = new WeakMap(); // xhr instance -> { url, headers }

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            try { pending.set(this, { url, headers: {} }); } catch {}
            return origOpen.call(this, method, url, ...rest);
        };
        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            try {
                const rec = pending.get(this);
                if (rec) rec.headers[String(name).toLowerCase()] = value;
            } catch {}
            return origSetHeader.call(this, name, value);
        };
        XMLHttpRequest.prototype.send = function (...args) {
            try {
                const rec = pending.get(this);
                if (rec?.url && /quiz-api|quiz-lti/.test(rec.url)) {
                    const authHeader = rec.headers['authorization'];
                    const authType = rec.headers['authtype'];
                    if (authHeader) recordNewQuizAuth(rec.url, authHeader, authType);
                }
            } catch { /* never let capture break the page's own request */ }
            return origSend.apply(this, args);
        };
    })();

    function recordNewQuizAuth(url, authHeader, authType) {
        const host = new URL(url, location.origin).host;
        const isJWT = authHeader.startsWith('eyJ') || authHeader.replace(/^Bearer\s+/i, '').startsWith('eyJ');
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const apiBaseMatch = url.match(/(.*\/api\/?)banks\/(\d+)/) || url.match(/(.*\/api\/?)[a-z_]+/);
        newQuizAuth.set(host, {
            token, isJWT, authType: authType || null,
            apiBase: apiBaseMatch ? apiBaseMatch[1] : `https://${host}/api/`,
        });
    }

    /*** CONFIG ***/
    const USE_ZIP = true;
    const GROUP_BY_MODULE = true;
    const PER_PAGE = 100;
    const THROTTLE_MS = 150;
    /*** END CONFIG ***/

    let CANCELLED = false;
    let startedAt = 0;
    let showAnswers = true; // Whether to mark correct answers in quiz exports
    let exportText2qti = false; // Whether to also emit a text2qti-format .txt alongside each quiz's HTML
    let exportQtiConverter = false; // Whether to also emit a qtiConverter-format .txt alongside each quiz's HTML

    // ─── Content type definitions ───────────────────────────────────
    // Each type defines how to list, fetch detail, extract HTML, and
    // map to modules.
    const CONTENT_TYPES = {
        pages: {
            label: 'Pages',
            emoji: '📄',
            listEndpoint: (cid) => `/api/v1/courses/${cid}/pages`,
 detailEndpoint: (cid, item) =>
 `/api/v1/courses/${cid}/pages/${encodeURIComponent(item.url)}`,
 extractBody: (detail) => detail.body || '',
 extractTitle: (detail, listItem) =>
 detail.title || listItem.title || listItem.url || 'Untitled',
 slugKey: (listItem) => listItem.url || listItem.title,
 moduleItemType: 'Page',
 moduleItemKey: 'page_url',
        },
        assignments: {
            label: 'Assignments',
            emoji: '📝',
            listEndpoint: (cid) => `/api/v1/courses/${cid}/assignments`,
 // Assignments return full body in the list call, no detail fetch needed
 detailEndpoint: null,
 // Filter out shadow assignments that Canvas creates for graded quizzes and discussions
 filterItems: (item) =>
 !item.is_quiz_assignment &&
 !item.quiz_id &&
 !(item.submission_types?.length === 1 &&
 (item.submission_types[0] === 'online_quiz' || item.submission_types[0] === 'discussion_topic')),
 extractBody: (detail) => detail.description || '',
 extractTitle: (detail) =>
 detail.name || detail.title || 'Untitled Assignment',
 slugKey: (listItem) => listItem.name || listItem.title || `assignment-${listItem.id}`,
 moduleItemType: 'Assignment',
 moduleItemKey: 'content_id',
 matchModuleItem: (listItem, moduleItem) =>
 String(moduleItem.content_id) === String(listItem.id),
 // Extra metadata to include in the exported HTML
 buildMeta: (item) => {
     const parts = [];
     if (item.due_at)
         parts.push(`<p><strong>Due:</strong> ${new Date(item.due_at).toLocaleString()}</p>`);
     if (item.points_possible != null)
         parts.push(`<p><strong>Points:</strong> ${item.points_possible}</p>`);
     if (item.submission_types?.length)
         parts.push(`<p><strong>Submission:</strong> ${item.submission_types.join(', ')}</p>`);
     return parts.length
     ? `<div class="export-meta" style="background:#f5f5f5;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:14px;">${parts.join('\n')}</div>`
     : '';
 },
        },
        discussions: {
            label: 'Discussions',
            emoji: '💬',
            listEndpoint: (cid) => `/api/v1/courses/${cid}/discussion_topics`,
 detailEndpoint: null,
 extractBody: (detail) => detail.message || '',
 extractTitle: (detail) =>
 detail.title || 'Untitled Discussion',
 slugKey: (listItem) => listItem.title || `discussion-${listItem.id}`,
 moduleItemType: 'Discussion',
 moduleItemKey: 'content_id',
 matchModuleItem: (listItem, moduleItem) =>
 String(moduleItem.content_id) === String(listItem.id),
 buildMeta: (item) => {
     const parts = [];
     if (item.posted_at)
         parts.push(`<p><strong>Posted:</strong> ${new Date(item.posted_at).toLocaleString()}</p>`);
     if (item.discussion_type)
         parts.push(`<p><strong>Type:</strong> ${item.discussion_type}</p>`);
     if (item.assignment)
         parts.push(`<p><strong>Graded:</strong> ${item.assignment.points_possible ?? '—'} points</p>`);
     return parts.length
     ? `<div class="export-meta" style="background:#f5f5f5;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:14px;">${parts.join('\n')}</div>`
     : '';
 },
        },
        quizzes: {
            label: 'Classic Quizzes',
 emoji: '❓',
 listEndpoint: (cid) => `/api/v1/courses/${cid}/quizzes`,
 detailEndpoint: null,
 extractBody: (detail) => detail.description || '',
 extractTitle: (detail) =>
 detail.title || 'Untitled Quiz',
 slugKey: (listItem) => listItem.title || `quiz-${listItem.id}`,
 moduleItemType: 'Quiz',
 moduleItemKey: 'content_id',
 matchModuleItem: (listItem, moduleItem) =>
 String(moduleItem.content_id) === String(listItem.id),
 // Quizzes: also fetch questions and compose them into the export
 fetchQuestions: true,
 questionsEndpoint: (cid, quizId) =>
 `/api/v1/courses/${cid}/quizzes/${quizId}/questions`,
 buildMeta: (item) => {
     const parts = [];
     if (item.due_at)
         parts.push(`<p><strong>Due:</strong> ${new Date(item.due_at).toLocaleString()}</p>`);
     if (item.points_possible != null)
         parts.push(`<p><strong>Points:</strong> ${item.points_possible}</p>`);
     if (item.time_limit)
         parts.push(`<p><strong>Time limit:</strong> ${item.time_limit} minutes</p>`);
     if (item.question_count != null)
         parts.push(`<p><strong>Questions:</strong> ${item.question_count}</p>`);
     if (item.quiz_type)
         parts.push(`<p><strong>Type:</strong> ${item.quiz_type.replace(/_/g, ' ')}</p>`);
     return parts.length
     ? `<div class="export-meta" style="background:#f5f5f5;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:14px;">${parts.join('\n')}</div>`
     : '';
 },
        },
    };

    // ─── Toolbar integration ──────────────────────────────────────
    let currentFallbackBtn = null;
    let lastRegisteredIsBankPage = null;

    function registerWithToolbar() {
        const bankPage = detectNewQuizBankPage();
        const isBankPage = !!bankPage;
        if (lastRegisteredIsBankPage === isBankPage) return; // no change since last check
        lastRegisteredIsBankPage = isBankPage;

        // Use ONE stable id for both variants so a toolbar that keys registrations
        // by id replaces the old entry instead of accumulating duplicate buttons.
        const action = bankPage
            ? { id: 'export-content', label: 'Export Item Bank', icon: '⬇', order: 20, onClick: () => runNewQuizBankExport(bankPage) }
            : { id: 'export-content', label: 'Export Content', icon: '⬇', order: 20, onClick: showPicker };

        if (unsafeWindow.canvasToolbar?._ready) {
            unsafeWindow.canvasToolbar.register(action);
        } else {
            unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
                unsafeWindow.canvasToolbar.register(action);
            }, { once: true });
            // Fallback: if toolbar never loads, create own button after 3s
            setTimeout(() => {
                if (!unsafeWindow.canvasToolbar?._ready) addUI(bankPage);
            }, 3000);
        }
    }

    // Canvas's Item Banks section (and potentially other areas) can navigate
    // client-side via pushState/replaceState without a full page reload, which
    // means our one-time @run-at detection would otherwise miss the transition
    // into or out of a specific bank's URL. Re-check on any navigation signal.
    (function watchForClientSideNavigation() {
        const fire = () => setTimeout(registerWithToolbar, 50); // let the SPA finish updating the URL/DOM first
        for (const fn of ['pushState', 'replaceState']) {
            const orig = history[fn];
            history[fn] = function (...args) {
                const ret = orig.apply(this, args);
                fire();
                return ret;
            };
        }
        window.addEventListener('popstate', fire);
    })();

    function runNewQuizBankExport(bankPage) {
        const picker = document.createElement('div');
        picker.className = 'ec-picker';
        picker.innerHTML = `
        <h3>Export Item Bank</h3>
        <div class="ec-picker-option">
        <input type="checkbox" id="ec-nq-answers" checked>
        <span class="ec-emoji">🔑</span>
        <label for="ec-nq-answers">Show correct answers</label>
        </div>
        <div class="ec-picker-option">
        <input type="checkbox" id="ec-nq-text2qti">
        <span class="ec-emoji">📋</span>
        <label for="ec-nq-text2qti">Also export text2qti (.txt)</label>
        </div>
        <div class="ec-picker-option">
        <input type="checkbox" id="ec-nq-qticonverter">
        <span class="ec-emoji">🗂️</span>
        <label for="ec-nq-qticonverter">Also export qtiConverter (.txt)</label>
        </div>
        <div class="ec-picker-actions">
        <button class="ec-btn-cancel-pick" id="ec-nq-cancel">Cancel</button>
        <button class="ec-btn-start" id="ec-nq-start">Export</button>
        </div>
        `;
        document.body.appendChild(picker);
        picker.querySelector('#ec-nq-cancel').addEventListener('click', () => picker.remove());
        picker.querySelector('#ec-nq-start').addEventListener('click', () => {
            showAnswers = picker.querySelector('#ec-nq-answers').checked;
            exportText2qti = picker.querySelector('#ec-nq-text2qti').checked;
            exportQtiConverter = picker.querySelector('#ec-nq-qticonverter').checked;
            picker.remove();
            buildPanel();
            exportNewQuizItemBank(bankPage.courseId, bankPage.bankId).catch((err) => {
                setSpinner(false);
                setPhase('Failed');
                setDetail(err.message);
                console.error(err);
                alert(`Item bank export failed: ${err.message}`);
                showDismissState(0);
            });
        });
    }

    registerWithToolbar();

    // ─── Main export function ───────────────────────────────────────
    async function startExport(selectedTypes) {
        try {
            CANCELLED = false;
            startedAt = performance.now();
            setPhase('Starting');
            setSpinner(true);

            const courseId = getCourseId();
            if (!courseId) throw new Error('Could not detect course_id in URL.');

            let useZip = USE_ZIP;
            if (USE_ZIP) {
                setPhase('Loading ZIP library');
                const ok = await loadJsZipWithTimeout(6000);
                if (!ok) {
                    useZip = false;
                    setDetail('ZIP library blocked by CSP. Falling back to individual files.');
                }
            }

            // Build module map once (shared across all content types)
            let moduleMap = null;
            if (GROUP_BY_MODULE) {
                setPhase('Mapping modules');
                moduleMap = await buildFullModuleMap(courseId);
            }

            // Process each selected content type
            const allExported = [];

            for (const typeKey of selectedTypes) {
                checkCancel();
                const typeDef = CONTENT_TYPES[typeKey];
                setPhase(`Fetching ${typeDef.label.toLowerCase()}`);

                let items = await fetchAll(
                    typeDef.listEndpoint(courseId),
                                           { per_page: PER_PAGE },
                                           (batch) => setDetail(`${typeDef.label} list: batch ${batch}`)
                );
                // Allow content types to filter out unwanted items
                if (typeDef.filterItems) {
                    const before = items.length;
                    items = items.filter(typeDef.filterItems);
                    if (items.length < before) {
                        setDetail(`${typeDef.label}: filtered ${before - items.length} quiz/discussion-linked assignments`);
                        await sleep(600);
                    }
                }
                setCounter('pagesTotal', items.length);
                setCounter('pagesDone', 0);
                setDetail(`Found ${items.length} ${typeDef.label.toLowerCase()}`);

                let i = 0;
                for (const item of items) {
                    checkCancel();
                    i += 1;
                    setCounter('pagesDone', i);
                    setProgress(i, items.length);

                    // Fetch detail if needed (pages need a second call)
                    let detail = item;
                    if (typeDef.detailEndpoint) {
                        const detailUrl = typeDef.detailEndpoint(courseId, item);
                        setDetail(`${typeDef.label} ${i}/${items.length}: fetching detail`);
                        const res = await fetch(detailUrl, { credentials: 'include' });
                        if (!res.ok) {
                            const msg = `HTTP ${res.status} on ${detailUrl}`;
                            setDetail(msg);
                            throw new Error(msg);
                        }
                        detail = await res.json();
                    }

                    const title = typeDef.extractTitle(detail, item);
                    setDetail(`${typeDef.label} ${i}/${items.length}: ${title}`);

                    let body = typeDef.extractBody(detail);

                    // Prepend metadata if the type defines it
                    if (typeDef.buildMeta) {
                        body = typeDef.buildMeta(detail) + body;
                    }

                    // Fetch quiz questions if applicable
                    if (typeDef.fetchQuestions && detail.id) {
                        try {
                            setDetail(`${typeDef.label} ${i}/${items.length}: fetching questions`);

                            // 1. Direct questions on the quiz (quizzes authored without banks).
                            const qUrl = `${typeDef.questionsEndpoint(courseId, detail.id)}?per_page=${PER_PAGE}&page=1`;
                            const qRes = await fetch(qUrl, { credentials: 'include' });
                            let directQuestions = [];
                            if (qRes.ok && (qRes.headers.get('content-type') || '').includes('application/json')) {
                                try {
                                    const parsed = JSON.parse(await qRes.text());
                                    if (Array.isArray(parsed)) directQuestions = parsed;
                                } catch {}
                            }

                            // 2. Question groups → bank questions (scraped from HTML).
                            const allQuestions = [...directQuestions];
                            try {
                                const gRes = await fetch(`/api/v1/courses/${courseId}/quizzes/${detail.id}/groups`, { credentials: 'include' });
                                if (gRes.ok) {
                                    const payload = await gRes.json();
                                    const groups = Array.isArray(payload) ? payload : (payload.quiz_groups || []);
                                    for (const g of groups) {
                                        if (!g.assessment_question_bank_id) continue;
                                        const bankQs = await fetchBankQuestionsFromHTML(courseId, g.assessment_question_bank_id);
                                        // Annotate each with the group context so the renderer can show pool structure.
                                        for (const bq of bankQs) {
                                            allQuestions.push({
                                                ...bq,
                                                _fromBank: `${g.name || 'Group'} (bank ${g.assessment_question_bank_id}, picks ${g.pick_count} of ${bankQs.length})`,
                                            });
                                        }
                                    }
                                }
                            } catch (gErr) {
                                console.warn(`[Export] Question groups fetch failed:`, gErr);
                            }

                            console.log(`[Export] Quiz "${title}" total questions: ${allQuestions.length} (direct: ${directQuestions.length})`);

                            detail.__allQuestionsForExport = allQuestions;

                            if (allQuestions.length) {
                                body += renderQuizQuestions(allQuestions);
                            } else {
                                body += `\n<p style="color:#b00;font-style:italic;">(No questions retrievable for this quiz.)</p>`;
                            }
                        } catch (qErr) {
                            body += `\n<p style="color:#888;font-style:italic;">(Quiz questions could not be exported: ${escapeHtml(qErr.message)})</p>`;
                            console.error(`[Export] Quiz fetch threw:`, qErr);
                        }
                    }



                    // Module mapping
                    let moduleName = null;
                    if (moduleMap) {
                        moduleName = resolveModuleName(moduleMap, typeDef, item);
                    }

                    let text2qtiDoc = null;
                    let qtiConverterDoc = null;
                    if (typeDef.fetchQuestions && detail.__allQuestionsForExport?.length) {
                        if (exportText2qti) {
                            try { text2qtiDoc = toText2QTI(detail.__allQuestionsForExport, title); }
                            catch (tErr) { console.error(`[Export] text2qti conversion failed for "${title}":`, tErr); }
                        }
                        if (exportQtiConverter) {
                            try { qtiConverterDoc = toQtiConverter(detail.__allQuestionsForExport, title); }
                            catch (tErr) { console.error(`[Export] qtiConverter conversion failed for "${title}":`, tErr); }
                        }
                    }

                    allExported.push({
                        typeKey,
                        typeLabel: typeDef.label,
                        url: item.url || item.id,
                        title,
                        moduleName,
                        htmlDoc: wrapHTML(title, body, typeDef.label),
                                     text2qtiDoc,
                                     qtiConverterDoc,
                                     slug: safeSlug(typeDef.slugKey(item)),
                    });

                    await sleep(THROTTLE_MS);
                    updateTiming(i, items.length);
                }
            }

            // ── Package output ────────────────────────────────────
            if (!allExported.length) {
                setPhase('Done');
                setDetail('Nothing to export.');
                setSpinner(false);
                return;
            }

            if (useZip) {
                setPhase('Packaging ZIP');
                await saveAsZip(getCourseId(), allExported, selectedTypes.length > 1, (current, total) => {
                    setDetail(`Adding ${current}/${total} to ZIP`);
                    setProgress(current, total);
                    updateTiming(current, total);
                });
                setPhase('Done');
                setDetail(`Exported ${allExported.length} items as ZIP.`);
            } else {
                setPhase('Saving files');
                await saveAsDownloads(allExported, selectedTypes.length > 1, (current, total, name) => {
                    setDetail(`Saving ${current}/${total}: ${name}`);
                    setProgress(current, total);
                    updateTiming(current, total);
                });
                setPhase('Done');
                setDetail(`Exported ${allExported.length} individual HTML files.`);
            }
            setSpinner(false);
            showDismissState(4000); // Auto-dismiss after 4 seconds
        } catch (err) {
            setSpinner(false);
            if (err.message === 'Cancelled by user') {
                setPhase('Cancelled');
                setDetail('Export was cancelled.');
                showDismissState(3000); // Auto-dismiss after 3 seconds
            } else {
                setPhase('Failed');
                setDetail(err.message);
                console.error(err);
                alert(`Export failed: ${err.message}`);
                showDismissState(0); // Show dismiss button but don't auto-dismiss
            }
        }
    }

    // ─── Bank question scraper ──────────────────────────────────────
    // Canvas does not expose individual bank question contents through
    // /api/v1/. We scrape the bank-editing HTML page instead.
    const bankCache = new Map(); // bankId → array of question objects

    async function fetchBankQuestionsFromHTML(courseId, bankId) {
        if (bankCache.has(bankId)) return bankCache.get(bankId);

        const url = `/courses/${courseId}/question_banks/${bankId}`;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) {
            console.warn(`[Export] Bank ${bankId} fetch HTTP ${res.status}`);
            bankCache.set(bankId, []);
            return [];
        }
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const holders = doc.querySelectorAll('div.question_holder');
        const questions = [];

        for (const holder of holders) {
            const dq = holder.querySelector('div.display_question');
            if (!dq) continue;

            // Question type comes from a class on .display_question
            const typeClass = [...dq.classList].find(c => c.endsWith('_question') && c !== 'display_question');
            if (!typeClass) {
                // Canvas's bank edit page includes hidden template stubs with no
                // specific type class; these aren't real questions. Skip them.
                continue;
            }
            const qType = typeClass;

            // Stable ID
            const idMatch = (dq.id || '').match(/question_(\d+)/);
            const aqIdEl = dq.querySelector('.assessment_question_id');
            const questionId = aqIdEl?.textContent.trim() || idMatch?.[1] || null;

            // Stem
            const stemEl = dq.querySelector('.question_text.user_content');
            const questionText = stemEl ? stemEl.innerHTML.trim() : '';

            // Points
            const ptsEl = dq.querySelector('.points.question_points');
            const points = ptsEl ? parseFloat(ptsEl.textContent.trim()) : null;

            // Answers — shape depends on type
            const answers = [];
            const answerEls = dq.querySelectorAll('.answers .answers_wrapper > .answer');

            if (qType === 'matching_question') {
                for (const a of answerEls) {
                    const left = a.querySelector('.answer_match_left')?.textContent.trim() || '';
                    const right = a.querySelector('.answer_match_right .correct_answer')?.textContent.trim() || '';
                    answers.push({ html: `<strong>${escapeHtml(left)}</strong> → ${escapeHtml(right)}`, weight: 100, left, right });
                }
                // Distractors (incorrect match options)
                const distractors = [...dq.querySelectorAll('.matching_answer_incorrect_matches_list li')]
                .map(li => li.textContent.trim()).filter(Boolean);
                if (distractors.length) {
                    answers.push({
                        html: `<em>Distractors (not paired with any prompt):</em> ${distractors.map(escapeHtml).join(', ')}`,
                                 weight: 0,
                    });
                }
            } else if (qType === 'true_false_question' || qType === 'multiple_choice_question' || qType === 'multiple_answers_question') {
                for (const a of answerEls) {
                    const textEl = a.querySelector('.answer_text');
                    const htmlEl = a.querySelector('.answer_html');
                    const text = (htmlEl && htmlEl.innerHTML.trim()) || textEl?.textContent.trim() || '';
                    // Correctness comes from .answer_weight (hidden span), not from .correct_answer
                    // which appears on every answer in the bank-edit DOM for unrelated reasons.
                    const weightEl = a.querySelector('.answer_weight');
                    const weight = weightEl ? parseFloat(weightEl.textContent.trim()) || 0 : 0;
                    answers.push({ html: text, weight });
                }
            } else if (qType === 'short_answer_question' || qType === 'fill_in_multiple_blanks_question' || qType === 'multiple_dropdowns_question') {
                for (const a of answerEls) {
                    const input = a.querySelector('.answer_type.short_answer input[name="answer_text"]');
                    const text = input?.value?.trim() || a.querySelector('.answer_text')?.textContent.trim() || '';
                    const blankIdEl = a.querySelector('.blank_id');
                    const blank = blankIdEl?.textContent.trim();
                    const label = blank && blank !== 'none' ? `[${blank}] ${text}` : text;
                    answers.push({ html: escapeHtml(label), weight: 100, text, blank });
                }
            } else if (qType === 'numerical_question') {
                for (const a of answerEls) {
                    const exact = a.querySelector('.answer_exact')?.textContent.trim();
                    const margin = a.querySelector('.answer_error_margin')?.textContent.trim();
                    answers.push({
                        html: `${escapeHtml(exact || '?')} <span style="color:#666;">(margin: ${escapeHtml(margin || '0')})</span>`,
                                 weight: 100,
                                 exact, margin,
                    });
                }
            } else if (qType === 'essay_question' || qType === 'file_upload_question' || qType === 'text_only_question') {
                // No answers to render; the stem is the whole question.
            } else {
                // Unknown type — log it so we can extend support later.
                console.warn(`[Export] Bank ${bankId} q${questionId}: unhandled type "${qType}"`);
            }

            questions.push({
                id: questionId,
                question_type: qType,
                question_text: questionText,
                points_possible: points,
                answers,
            });
        }

        console.log(`[Export] Bank ${bankId}: scraped ${questions.length} questions`);
        bankCache.set(bankId, questions);
        return questions;
    }

    // ─── New Quizzes item bank fetcher ───────────────────────────────
    // Endpoint names aren't consistent across Instructure's own front-end calls,
    // so we try candidates in the same order the New Quizzes UI itself falls back
    // through. Pagination follows the standard Canvas Link-header convention.
    function parseLinkHeader(header) {
        if (!header) return {};
        const links = {};
        for (const part of header.split(',')) {
            const m = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
            if (m) links[m[2]] = m[1];
        }
        return links;
    }

    function buildNewQuizAuthHeaders(auth) {
        const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
        if (auth.isJWT) {
            headers['Authorization'] = auth.token; // no "Bearer" prefix for JWT, matches Canvas's own calls
            if (auth.authType) headers['Authtype'] = auth.authType;
        } else {
            headers['Authorization'] = `Bearer ${auth.token}`;
        }
        return headers;
    }

    async function newQuizFetch(url, auth) {
        const res = await fetch(url, { method: 'GET', headers: buildNewQuizAuthHeaders(auth), credentials: 'omit' });
        if (res.status === 401) throw new Error('TOKEN_EXPIRED: New Quizzes token was rejected (401). Reload the item bank page and try again.');
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return res;
    }

    // A JWT's payload cryptographically binds it to one specific host (we
    // decoded a captured token earlier and saw a "host" claim inside it), so
    // swapping quiz-lti<->quiz-api under a JWT just produces a 401, not a
    // useful fallback. Only non-JWT "session" tokens are safely portable
    // across the two hosts, per the same cross-mapping the reference extension
    // implements.
    function apiBaseVariants(apiBase, auth) {
        if (auth?.isJWT) return [apiBase];
        if (apiBase.includes('quiz-lti')) return [apiBase.replace('quiz-lti', 'quiz-api'), apiBase];
        if (apiBase.includes('quiz-api')) return [apiBase, apiBase.replace('quiz-api', 'quiz-lti')];
        return [apiBase];
    }

    async function paginatedNewQuizFetch(baseUrl, auth) {
        const out = [];
        let url = baseUrl;
        while (url) {
            const res = await newQuizFetch(url, auth);
            const data = await res.json();
            const chunk = data?.entries || (Array.isArray(data) ? data : [data]);
            out.push(...chunk);
            const links = parseLinkHeader(res.headers.get('Link'));
            url = links.next || null;
            await sleep(THROTTLE_MS);
        }
        return out;
    }

    async function fetchNewQuizBankEntries(apiBase, bankId, auth) {
        const bases = apiBaseVariants(apiBase, auth);
        const candidates = bases.flatMap((base) => [
            `${base}banks/${bankId}/bank_entries/search`,
            `${base}banks/${bankId}/bank_entries`,
            `${base}banks/${bankId}/items`,
            `${base}item_banks/${bankId}/items`,
        ]);
        const errors = [];
        for (const url of candidates) {
            try {
                const entries = await paginatedNewQuizFetch(url, auth);
                return entries;
            } catch (e) {
                errors.push(e.message);
                if (String(e.message).startsWith('TOKEN_EXPIRED')) throw e;
            }
        }
        throw new Error(`All item-bank endpoints failed: ${errors.join(' | ')}`);
    }

    async function resolveNewQuizEntry(apiBase, bankId, entry, auth) {
        // Some list responses already embed the full item under `.entry`; others
        // are the item itself; others are a stub that needs a follow-up fetch.
        if (entry.entry && entry.entry.id) return { ...entry.entry, bank_entry_id: entry.id };
        if (entry.interaction_data || entry.item_body || entry.answers) return entry;
        const itemId = entry.item_id || entry.id;
        const bases = apiBaseVariants(apiBase, auth);
        const candidates = bases.flatMap((base) => [
            `${base}banks/${bankId}/bank_entries/${entry.id}`,
            `${base}items/${itemId}`,
        ]);
        for (const url of candidates) {
            try {
                const res = await newQuizFetch(url, auth);
                const data = await res.json();
                return data.entry && data.entry.id ? { ...data.entry, bank_entry_id: data.id } : data;
            } catch { /* try next candidate */ }
        }
        return null;
    }

    // Maps a New Quizzes item into the same {question_type, question_text,
    // points_possible, answers:[{html, weight, ...raw fields}]} shape the classic
    // renderers (renderQuizQuestions / toText2QTI) already consume, so no
    // duplicate rendering logic is needed for the New Quizzes path.
    function normalizeNewQuizItem(item, position) {
        const slug = item.interaction_type?.slug || item.question_type || item.interaction_type;
        const stem = item.question_text || item.stimulus || item.item_body || item.body || '';
        const points = typeof item.points_possible === 'number' ? item.points_possible : 1;
        let question_type = 'unsupported_new_quiz_question';
        let answers = [];

        if (slug === 'choice' || slug === 'multi-answer') {
            question_type = slug === 'choice' ? 'multiple_choice_question' : 'multiple_answers_question';
            const choices = Array.isArray(item.interaction_data?.choices) ? item.interaction_data.choices : [];
            const scoringValue = item.scoring_data?.value;
            const correctIds = new Set(Array.isArray(scoringValue) ? scoringValue : scoringValue != null ? [scoringValue] : []);
            answers = choices.map((c) => ({ html: c.item_body || c.text || c.html || c.body || '', weight: correctIds.has(c.id) ? 100 : 0 }));
        } else if (slug === 'true-false') {
            question_type = 'true_false_question';
            const correctIsTrue = item.scoring_data?.value === true;
            answers = [
                { html: item.interaction_data?.true_choice || 'True', weight: correctIsTrue ? 100 : 0 },
                { html: item.interaction_data?.false_choice || 'False', weight: correctIsTrue ? 0 : 100 },
            ];
        } else if (slug === 'numeric') {
            question_type = 'numerical_question';
            const entries = Array.isArray(item.scoring_data?.value) ? item.scoring_data.value : [];
            const exactEntry = entries.find((e) => e.type === 'exactResponse') || entries[0];
            const marginEntry = entries.find((e) => e.type === 'marginOfError');
            answers = [{ html: '', weight: 100, exact: exactEntry?.value, margin: marginEntry?.value }];
        } else if (slug === 'matching') {
            question_type = 'matching_question';
            const questions = Array.isArray(item.interaction_data?.questions) ? item.interaction_data.questions : [];
            const options = Array.isArray(item.interaction_data?.answers) ? item.interaction_data.answers : [];
            const scoringValue = item.scoring_data?.value || {};
            answers = questions.map((q) => {
                const answerId = scoringValue[q.id];
                const opt = options.find((a) => a.id === answerId);
                const left = stripToMarkdownish(q.item_body || q.body || '');
                const right = stripToMarkdownish(opt?.item_body || opt?.body || '');
                return { html: `<strong>${escapeHtml(left)}</strong> → ${escapeHtml(right)}`, weight: 100, left, right };
            });
        } else if (slug === 'essay') {
            question_type = 'essay_question';
        } else if (slug === 'file-upload') {
            question_type = 'file_upload_question';
        } else if (slug === 'rich-fill-blank') {
            // Closest fit is short-answer, but blanks/acceptable-answer shape differs
            // enough (rich content per blank) that we fall back to the manual-review
            // table pattern rather than risk a bad automatic conversion.
            question_type = 'fill_in_multiple_blanks_question';
            const blanks = item.scoring_data?.value || [];
            answers = (Array.isArray(blanks) ? blanks : []).map((b, i) => ({
                html: '', weight: 100, blank: b.id || `blank_${i}`,
                text: b.scoring_data?.blank_text || (Array.isArray(b.scoring_data?.value) ? b.scoring_data.value.join(' | ') : ''),
            }));
        } else if (slug === 'categorization') {
            question_type = 'categorization_question';
            const categories = Array.isArray(item.interaction_data?.categories) ? item.interaction_data.categories : [];
            const distractors = Array.isArray(item.interaction_data?.distractors) ? item.interaction_data.distractors : [];
            const scoringValue = item.scoring_data?.value;
            const used = new Set();
            if (Array.isArray(scoringValue)) {
                for (const catScore of scoringValue) {
                    const category = categories.find((c) => c.id === catScore.id);
                    const catName = stripToMarkdownish(category?.item_body || category?.body || 'Category');
                    const answerIds = catScore.scoring_data?.value || [];
                    for (const aId of answerIds) {
                        used.add(aId);
                        const choice = distractors.find((d) => d.id === aId);
                        answers.push({ html: stripToMarkdownish(choice?.item_body || choice?.body || ''), weight: 100, category: catName });
                    }
                }
            }
            for (const d of distractors) {
                if (!used.has(d.id)) answers.push({ html: stripToMarkdownish(d.item_body || d.body || ''), weight: 0, category: null });
            }
        } else if (slug === 'ordering') {
            question_type = 'ordering_question';
            const choices = Array.isArray(item.interaction_data?.choices) ? item.interaction_data.choices : [];
            const scoringValue = Array.isArray(item.scoring_data?.value) ? item.scoring_data.value : [];
            answers = scoringValue.map((id, idx) => {
                const c = choices.find((ch) => ch.id === id);
                return { html: stripToMarkdownish(c?.item_body || c?.body || String(id)), weight: 100, position: idx + 1 };
            });
        } else {
            // hot-spot, formula, stimulus/text-block, etc. — no equivalent renderer
            // path (hot-spot needs image coordinates our pipeline doesn't carry).
            // Flag clearly rather than guess.
            question_type = `unsupported_new_quiz_question`;
            answers = [];
        }

        return {
            id: item.id, position, question_type,
            question_text: stem, points_possible: points, answers,
            _newQuizType: slug,
            _topLabel: slug === 'ordering' ? (item.interaction_data?.top_label || item.properties?.top_label || null) : undefined,
            _bottomLabel: slug === 'ordering' ? (item.interaction_data?.bottom_label || item.properties?.bottom_label || null) : undefined,
        };
    }

    async function exportNewQuizItemBank(courseId, bankId) {
        // The page's own JS has to have made at least one quiz-api request already
        // for us to have a token; poll briefly rather than failing immediately in
        // case the New Quizzes bundle is still loading.
        setPhase('Waiting for New Quizzes token');
        let auth = null;
        for (let i = 0; i < 30 && !auth; i++) {
            // Prefer a token captured directly against a quiz-api host — it's
            // correctly host-bound for the domain that actually serves bank
            // data. Only fall back to whatever else is available once we've
            // given quiz-api a real chance to show up (it may be issued a
            // moment after the quiz-lti launch handshake, not before it).
            for (const [host, v] of newQuizAuth) {
                if (host.includes('quiz-api')) { auth = v; break; }
            }
            if (!auth && i >= 20) {
                for (const [, v] of newQuizAuth) { auth = v; break; }
            }
            if (!auth) await sleep(300);
        }
        if (!auth) {
            throw new Error('No New Quizzes API token captured yet. Reload this item bank page (so its own scripts run first) and try again.');
        }

        setPhase('Fetching bank metadata');
        let bankTitle = `bank-${bankId}`;
        for (const base of apiBaseVariants(auth.apiBase, auth)) {
            try {
                const res = await newQuizFetch(`${base}banks/${bankId}`, auth);
                const meta = await res.json();
                bankTitle = meta.title || bankTitle;
                break;
            } catch (e) {
                console.warn(`[Export] Bank metadata fetch failed for ${base}:`, e);
            }
        }

        setPhase('Fetching item bank entries');
        const entries = await fetchNewQuizBankEntries(auth.apiBase, bankId, auth);
        setCounter('pagesTotal', entries.length);
        setDetail(`Found ${entries.length} entries`);

        const questions = [];
        for (let i = 0; i < entries.length; i++) {
            checkCancel();
            setCounter('pagesDone', i + 1);
            setProgress(i + 1, entries.length);
            const entry = entries[i];
            if (entry.entry_type === 'Stimulus' || entry.entry?.stimulus_type) continue; // text blocks: no question to export
            const resolved = await resolveNewQuizEntry(auth.apiBase, bankId, entry, auth);
            if (resolved) questions.push(normalizeNewQuizItem(resolved, i + 1));
            await sleep(THROTTLE_MS);
        }

        setPhase('Packaging');
        const body = renderQuizQuestions(questions);
        const htmlDoc = wrapHTML(bankTitle, body, 'New Quizzes Item Bank');
        triggerDownload(`${safeSlug(bankTitle)}.html`, new Blob([htmlDoc], { type: 'text/html;charset=utf-8' }));
        if (exportText2qti) {
            await sleep(150);
            triggerDownload(`${safeSlug(bankTitle)}.text2qti.txt`, new Blob([toText2QTI(questions, bankTitle)], { type: 'text/plain;charset=utf-8' }));
        }
        if (exportQtiConverter) {
            await sleep(150);
            triggerDownload(`${safeSlug(bankTitle)}.qticonverter.txt`, new Blob([toQtiConverter(questions, bankTitle)], { type: 'text/plain;charset=utf-8' }));
        }

        setPhase('Done');
        setDetail(`Exported ${questions.length} items from "${bankTitle}".`);
        setSpinner(false);
        showDismissState(4000);
    }

    function detectNewQuizBankPage() {
        const m = location.pathname.match(/\/courses\/(\d+)\/banks\/(\d+)/);
        return m ? { courseId: m[1], bankId: m[2] } : null;
    }

    // ─── Quiz question renderer ─────────────────────────────────────
    function renderQuizQuestions(questions) {
        const sorted = [...questions].sort(
            (a, b) => (a.position || 0) - (b.position || 0)
        );
        let html = `\n<hr style="margin:24px 0;">\n<h2 style="margin-bottom:16px;">Questions</h2>\n`;

        for (const q of sorted) {
            const qNum = q.position || '';
            const qType = (q.question_type || '').replace(/_/g, ' ');
            const pts = q.points_possible != null ? ` (${q.points_possible} pts)` : '';

            html += `<div style="margin-bottom:20px;padding:12px 16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;">`;
            let header = `Q${qNum} · ${qType}${pts}`;
            if (q._fromBank) header += ` · <span style="color:#0a4;">${escapeHtml(q._fromBank)}</span>`;
            html += `<div style="font-size:12px;color:#666;margin-bottom:6px;">${header}</div>`;
            html += `<div>${q.question_text || ''}</div>`;

            // Render answers if present
            if (q.answers?.length) {
                html += `<ul style="margin-top:8px;padding-left:20px;">`;
                for (const a of q.answers) {
                    let marker;
                    if (showAnswers) {
                        const isCorrect = a.weight > 0;
                        marker = isCorrect
                        ? '<span style="color:#228636;font-weight:700;">✓</span> '
                        : '<span style="color:#999;">○</span> ';
                    } else {
                        marker = '<span style="color:#999;">○</span> ';
                    }
                    html += `<li style="margin-bottom:4px;">${marker}${a.html || a.text || ''}</li>`;
                }
                html += `</ul>`;
            }

            html += `</div>\n`;
        }
        return html;
    }

    // ─── text2qti export ─────────────────────────────────────────────
    // Converts the same normalized question objects used by renderQuizQuestions()
    // into text2qti/qticonverter-compatible plain text. Both tools share the same
    // core syntax (numbered questions, a)/b)/c) choices, * for correct, [*] for
    // multi-answer correct, GROUP/END_GROUP for pools), so one output works for either.

    // Light HTML→Markdown-ish conversion. text2qti stems/choices are processed as
    // Markdown and tolerate inline HTML, but we flatten our own decorative markup
    // and paragraph breaks so the plain-text file stays readable.
    function stripToMarkdownish(html) {
        if (!html) return '';
        let s = String(html);
        s = s.replace(/<br\s*\/?>/gi, '\n');
        s = s.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
        s = s.replace(/<(strong|b)>(.*?)<\/\1>/gi, '**$2**');
        s = s.replace(/<(em|i)>(.*?)<\/\1>/gi, '*$2*');
        s = s.replace(/<[^>]+>/g, '');
        s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        return s.trim();
    }

    // Normalizes an answer object regardless of whether it came from the direct
    // Canvas quiz-questions API (answer_match_left, blank_id, exact, margin, ...)
    // or from the bank-HTML scraper (left/right, blank, exact, margin added above).
    function getRawAnswerFields(a) {
        return {
            text: a.text ?? stripToMarkdownish(a.html),
            weight: a.weight ?? 0,
            exact: a.exact,
            margin: a.margin,
            rangeStart: a.start,
            rangeEnd: a.end,
            blank: a.blank ?? a.blank_id,
            left: a.left ?? a.answer_match_left,
            right: a.right ?? a.answer_match_right,
        };
    }

    // Indents continuation lines of a multi-line block to match text2qti's
    // "everything after the first line must share the first line's indent" rule.
    function indentBlock(text, indent = '    ') {
        return String(text).split('\n').map((l, i) => (i === 0 ? l : indent + l)).join('\n');
    }

    function toText2QTIQuestion(q, qNum) {
        const type = q.question_type;
        const stem = stripToMarkdownish(q.question_text) || '(no question text)';
        const pts = q.points_possible;
        const answers = q.answers || [];
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        let out = '';
        if (pts) out += `Points: ${Number.isInteger(pts) ? pts : pts.toFixed(1)}\n`;

        if (type === 'multiple_choice_question' || type === 'true_false_question') {
            out += `${qNum}.  ${indentBlock(stem)}\n`;
            answers.forEach((a, i) => {
                const { text, weight } = getRawAnswerFields(a);
                out += `${weight > 0 ? '*' : ''}${letters[i] || '?'}) ${indentBlock(text)}\n`;
            });
        } else if (type === 'multiple_answers_question') {
            out += `${qNum}.  ${indentBlock(stem)}\n`;
            answers.forEach((a) => {
                const { text, weight } = getRawAnswerFields(a);
                out += `[${weight > 0 ? '*' : ' '}] ${indentBlock(text)}\n`;
            });
        } else if (type === 'short_answer_question') {
            out += `${qNum}.  ${indentBlock(stem)}\n`;
            answers.forEach((a) => {
                const { text } = getRawAnswerFields(a);
                out += `*   ${indentBlock(text)}\n`;
            });
        } else if (type === 'numerical_question') {
            out += `${qNum}.  ${indentBlock(stem)}\n`;
            const a = answers[0] ? getRawAnswerFields(answers[0]) : {};
            if (a.rangeStart != null && a.rangeEnd != null) {
                out += `=   [${a.rangeStart}, ${a.rangeEnd}]\n`;
            } else if (a.exact != null && a.exact !== '') {
                out += `=   ${a.exact}${a.margin != null && a.margin !== '' ? ` +- ${a.margin}` : ' +- 0'}\n`;
            } else {
                out += `=   0\n% (!) Could not determine numeric answer for Q${qNum} — check manually.\n`;
            }
        } else if (type === 'essay_question' || type === 'file_upload_question' || type === 'text_only_question') {
            out += `${qNum}.  ${indentBlock(stem)}\n`;
            out += type === 'file_upload_question' ? '^^^^\n' : '____\n';
        } else if (type === 'matching_question' || type === 'fill_in_multiple_blanks_question' || type === 'multiple_dropdowns_question') {
            // text2qti has no native matching or multi-blank question type. Export
            // as an ungraded essay stub with a Markdown table of the pairs/blanks
            // so a person can re-key it by hand.
            let table;
            if (type === 'matching_question') {
                table = `\n\n| Prompt | Correct match |\n| --- | --- |\n`;
                answers.forEach((a) => {
                    const { left, right } = getRawAnswerFields(a);
                    if (left || right) table += `| ${(left || '').replace(/\|/g, '\\|')} | ${(right || '').replace(/\|/g, '\\|')} |\n`;
                });
            } else {
                table = `\n\n| Blank | Accepted answer |\n| --- | --- |\n`;
                answers.forEach((a) => {
                    const { blank, text } = getRawAnswerFields(a);
                    table += `| ${blank || '?'} | ${(text || '').replace(/\|/g, '\\|')} |\n`;
                });
            }
            out += `${qNum}.  ${indentBlock(stem)}${indentBlock(table)}\n`;
            out += `... (${type.replace(/_/g, ' ')} — no text2qti equivalent; pairs listed above for manual re-entry.)\n`;
            out += `____\n`;
        } else {
            out += `${qNum}.  ${indentBlock(stem)}\n____\n% (!) Unhandled question type "${type}" for Q${qNum} — exported as essay stub.\n`;
        }
        return out + '\n';
    }

    function toText2QTI(questions, quizTitle) {
        const sorted = [...questions].sort((a, b) => (a.position || 0) - (b.position || 0));
        let out = `Quiz title: ${String(quizTitle).replace(/\n/g, ' ')}\n\n`;
        sorted.forEach((q, i) => {
            if (q._fromBank) out += `% From bank: ${q._fromBank}\n`;
            out += toText2QTIQuestion(q, i + 1);
        });
        return out;
    }

    // ─── qtiConverter export (github.com/backyardbiomech/qtiConverter) ──────
    // Unlike text2qti, this format natively supports matching, ordering,
    // categorization, and true/false — so it covers several types text2qti
    // can't represent at all. The file uses 2-letter type headers (MC/MA/TF/
    // SA/ES/MB/MD/MT/OR/CT) rather than punctuation-based type detection.
    function toQtiConverterQuestion(q, qNum) {
        const type = q.question_type;
        const stem = stripToMarkdownish(q.question_text) || '(no question text)';
        const answers = q.answers || [];
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const pts = q.points_possible;
        let header = '';
        if (pts) header += `(${Number.isInteger(pts) ? pts : pts.toFixed(1)} pts)\n`;

        const codeMap = {
            multiple_choice_question: 'MC',
            multiple_answers_question: 'MA',
            true_false_question: 'TF',
            short_answer_question: 'SA',
            essay_question: 'ES',
            matching_question: 'MT',
            fill_in_multiple_blanks_question: 'MB',
            multiple_dropdowns_question: 'MD',
            categorization_question: 'CT',
            ordering_question: 'OR',
        };
        const code = codeMap[type];
        let out = header;

        if (code === 'MC' || code === 'MA') {
            out += `${code}\n${qNum}. ${stem}\n`;
            answers.forEach((a, i) => {
                const { text, weight } = getRawAnswerFields(a);
                out += `${weight > 0 ? '*' : ''}${letters[i] || '?'}. ${text}\n`;
            });
        } else if (code === 'TF') {
            const correct = answers.find((a) => getRawAnswerFields(a).weight > 0);
            const isTrue = correct ? /^true$/i.test(getRawAnswerFields(correct).text) : true;
            out += `${code}\n${qNum}. ${stem}\nA: ${isTrue ? 'True' : 'False'}\n`;
        } else if (code === 'SA') {
            out += `${code}\n${qNum}. ${stem}\n`;
            answers.forEach((a, i) => {
                const { text } = getRawAnswerFields(a);
                out += `${letters[i] || '?'}. ${text}\n`;
            });
        } else if (code === 'ES') {
            out += `${code}\n${qNum}. ${stem}\n`;
        } else if (code === 'MT') {
            out += `${code}\n${qNum}. ${stem}\n`;
            const rightLabels = new Map(); // right text -> label
            let rightCount = 0;
            const leftLines = [];
            answers.forEach((a, i) => {
                const { left, right } = getRawAnswerFields(a);
                if (!left || !right) return; // skip distractor-only entries with no pairing
                if (!rightLabels.has(right)) {
                    rightCount += 1;
                    rightLabels.set(right, `right${rightCount}`);
                }
                leftLines.push(`[${rightLabels.get(right)}]left${i + 1}: ${left}`);
            });
            out += leftLines.join('\n') + '\n';
            for (const [text, label] of rightLabels) out += `${label}: ${text}\n`;
        } else if (code === 'MB') {
            out += `${code}\n${qNum}. ${stem}\n`;
            const byBlank = new Map();
            answers.forEach((a) => {
                const { blank, text } = getRawAnswerFields(a);
                const key = blank || 'blank1';
                if (!byBlank.has(key)) byBlank.set(key, []);
                byBlank.get(key).push(text);
            });
            for (const [blank, texts] of byBlank) out += `${blank}: ${texts.join(', ')}\n`;
        } else if (code === 'MD') {
            out += `${code}\n${qNum}. ${stem}\n`;
            out += `# NOTE: source data didn't reliably indicate which dropdown option is correct — first option per dropdown was marked correct; verify in Canvas after import.\n`;
            const byBlank = new Map();
            answers.forEach((a) => {
                const { blank, text } = getRawAnswerFields(a);
                const key = blank || 'drop1';
                if (!byBlank.has(key)) byBlank.set(key, []);
                byBlank.get(key).push(text);
            });
            for (const [blank, texts] of byBlank) {
                texts.forEach((t, i) => out += `${i === 0 ? '*' : ''}${blank}: ${t}\n`);
            }
        } else if (code === 'CT') {
            out += `${code}\n${qNum}. ${stem}\n`;
            answers.forEach((a) => {
                out += `${a.category || 'distractor'}: ${a.html || ''}\n`;
            });
        } else if (code === 'OR') {
            out += `${code}\n${qNum}. ${stem}\n`;
            if (q._topLabel) out += `toplabel: ${q._topLabel}\n`;
            answers.forEach((a, i) => out += `${i + 1}: ${a.html || ''}\n`);
            if (q._bottomLabel) out += `bottomlabel: ${q._bottomLabel}\n`;
        } else {
            out += `ES\n${qNum}. ${stem}\n`;
            out += `# NOTE: question type "${type}" has no qtiConverter equivalent implemented — exported as an essay stub for manual re-entry.\n`;
        }
        return out + '\n';
    }

    function toQtiConverter(questions, title) {
        const sorted = [...questions].sort((a, b) => (a.position || 0) - (b.position || 0));
        // qtiConverter takes the bank/quiz name from the filename, not a header line.
        let out = `# ${String(title).replace(/\n/g, ' ')}\n\n`;
        sorted.forEach((q, i) => {
            if (q._fromBank) out += `# From bank: ${q._fromBank}\n`;
            out += toQtiConverterQuestion(q, i + 1);
        });
        return out;
    }

    // ─── Module mapping ─────────────────────────────────────────────
    // Builds a comprehensive module map once, covering all item types.
    async function buildFullModuleMap(courseId) {
        const modules = await fetchAll(
            `/api/v1/courses/${courseId}/modules`,
            { per_page: PER_PAGE },
            (batch) => setDetail(`Modules list: batch ${batch}`)
        );
        setCounter('modulesTotal', modules.length);

        const map = {
            // Keyed by module item type → lookup structure
            Page: {},       // page_url → module label
            Assignment: {}, // content_id → module label
            Discussion: {}, // content_id → module label
            Quiz: {},       // content_id → module label
        };

        let idx = 1;
        let processed = 0;
        for (const mod of modules) {
            checkCancel();
            const items = await fetchAll(
                `/api/v1/courses/${courseId}/modules/${mod.id}/items`,
                { per_page: PER_PAGE },
                (b) => setDetail(`Module "${mod.name}" items: batch ${b}`)
            );
            const modLabel = `${String(idx).padStart(2, '0')}-${mod.name || 'Module'}`;

            for (const it of items) {
                if (it.type === 'Page' && it.page_url) {
                    map.Page[it.page_url] = modLabel;
                } else if (it.type === 'Assignment' && it.content_id) {
                    map.Assignment[String(it.content_id)] = modLabel;
                } else if (it.type === 'Discussion' && it.content_id) {
                    map.Discussion[String(it.content_id)] = modLabel;
                } else if (it.type === 'Quiz' && it.content_id) {
                    map.Quiz[String(it.content_id)] = modLabel;
                }
            }

            idx += 1;
            processed += 1;
            setCounter('modulesDone', processed);
            setProgress(processed, modules.length);
            updateTiming(processed, modules.length);
            await sleep(THROTTLE_MS);
        }
        return map;
    }

    function resolveModuleName(moduleMap, typeDef, listItem) {
        const type = typeDef.moduleItemType;
        if (!moduleMap[type]) return null;

        if (type === 'Page') {
            return moduleMap.Page[listItem.url] || null;
        }
        return moduleMap[type][String(listItem.id)] || null;
    }

    // ─── Helpers ────────────────────────────────────────────────────
    function getCourseId() {
        const m = location.pathname.match(/\/courses\/(\d+)/);
        return m ? m[1] : null;
    }

    function safeSlug(s) {
        return String(s || '')
        .toLowerCase()
        .trim()
        .replace(/&amp;/g, 'and')
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    function wrapHTML(title, body, typeLabel) {
        return `<!doctype html>
        <html lang="en">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(title)}</title>
        <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1.5rem; color: #222; line-height: 1.6; }
        img { max-width: 100%; height: auto; }
        table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
        th { background: #f5f5f5; }
        pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
        code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-size: 0.9em; }
        pre code { background: none; padding: 0; }
        .export-header { color: #666; font-size: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 20px; }
        </style>
        </head>
        <body>
        <div class="export-header">${escapeHtml(typeLabel)}</div>
        <h1>${escapeHtml(title)}</h1>
        ${body}
        </body>
        </html>`;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
        );
    }

    async function fetchAll(path, params = {}, onBatch) {
        const out = [];
        let page = 1;
        while (true) {
            checkCancel();
            const url = new URL(path, location.origin);
            for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
            url.searchParams.set('page', page);
            const chunk = await getJSON(url.pathname + url.search);
            out.push(...chunk);
            onBatch && onBatch(page, chunk.length === 0);
            if (!Array.isArray(chunk) || chunk.length < (params.per_page || 10))
                break;
            page += 1;
            await sleep(THROTTLE_MS);
        }
        return out;
    }

    async function getJSON(path) {
        const res = await fetch(path, { credentials: 'include' });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(
                `HTTP ${res.status} for ${path}${text ? ` — ${text.slice(0, 200)}` : ''}`
            );
        }
        return res.json();
    }

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    // ─── Packaging ──────────────────────────────────────────────────
    async function saveAsZip(courseId, items, multiType, onStep) {
        const zip = new JSZip();
        let i = 0;
        for (const p of items) {
            checkCancel();
            const filename = `${p.slug || 'item'}.html`;

            // Build folder path: optionally type folder, then module folder
            let folder = zip;
            if (multiType) {
                folder = zip.folder(safeSlug(p.typeLabel));
            }
            if (GROUP_BY_MODULE && p.moduleName) {
                folder = folder.folder(safeSlug(p.moduleName));
            }
            folder.file(filename, p.htmlDoc);
            if (p.text2qtiDoc) {
                folder.file(`${p.slug || 'item'}.text2qti.txt`, p.text2qtiDoc);
            }
            if (p.qtiConverterDoc) {
                folder.file(`${p.slug || 'item'}.qticonverter.txt`, p.qtiConverterDoc);
            }

            i += 1;
            onStep && onStep(i, items.length);
            await sleep(25);
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(`course-${courseId}-export.zip`, blob);
    }

    async function saveAsDownloads(items, multiType, onStep) {
        let i = 0;
        for (const p of items) {
            checkCancel();
            let name = `${p.slug || 'item'}.html`;
            if (GROUP_BY_MODULE && p.moduleName) {
                name = `${safeSlug(p.moduleName)}__${name}`;
            }
            if (multiType) {
                name = `${safeSlug(p.typeLabel)}__${name}`;
            }
            triggerDownload(
                name,
                new Blob([p.htmlDoc], { type: 'text/html;charset=utf-8' })
            );
            if (p.text2qtiDoc) {
                triggerDownload(
                    name.replace(/\.html$/, '.text2qti.txt'),
                    new Blob([p.text2qtiDoc], { type: 'text/plain;charset=utf-8' })
                );
                await sleep(100);
            }
            if (p.qtiConverterDoc) {
                triggerDownload(
                    name.replace(/\.html$/, '.qticonverter.txt'),
                    new Blob([p.qtiConverterDoc], { type: 'text/plain;charset=utf-8' })
                );
                await sleep(100);
            }
            i += 1;
            onStep && onStep(i, items.length, name);
            await sleep(100);
        }
    }

    function triggerDownload(filename, blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        a.remove();
    }

    // ─── Styles (always injected) ────────────────────────────────────
    GM_addStyle(`
    /* ── Launch button (fallback) ── */
    .ec-launch-btn {
        position: fixed; bottom: 72px; right: 18px; z-index: 9999;
        background: #0b65c2; color: #fff; border: 0; padding: 10px 14px;
        border-radius: 10px; font-weight: 600; cursor: pointer;
        box-shadow: 0 4px 16px rgba(0,0,0,.2); font-size: 13px;
        transition: background 0.15s;
    }
    .ec-launch-btn:hover { background: #0952a0; }

    /* ── Picker panel ── */
    .ec-picker {
        position: fixed; bottom: 72px; right: 18px; z-index: 9999;
        background: #111; color: #eee; padding: 16px 18px; border-radius: 12px;
        min-width: 300px; box-shadow: 0 4px 20px rgba(0,0,0,.35);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        font-size: 13px;
    }
    .ec-picker h3 {
        margin: 0 0 12px 0; font-size: 14px; font-weight: 700; color: #fff;
    }
    .ec-picker-option {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 10px; border-radius: 8px; cursor: pointer;
        transition: background 0.1s; margin-bottom: 2px;
    }
    .ec-picker-option:hover { background: rgba(255,255,255,0.06); }
    .ec-picker-option input[type=checkbox] {
        width: 16px; height: 16px; accent-color: #0b65c2; cursor: pointer;
        flex-shrink: 0;
    }
    .ec-picker-option label {
        cursor: pointer; flex: 1; user-select: none;
    }
    .ec-picker-option .ec-emoji {
        font-size: 16px; width: 22px; text-align: center; flex-shrink: 0;
    }
    .ec-picker-actions {
        display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end;
    }
    .ec-picker-actions button {
        padding: 7px 16px; border-radius: 8px; border: 0;
        font-weight: 600; font-size: 12px; cursor: pointer;
        transition: background 0.15s;
    }
    .ec-btn-start {
        background: #0b65c2; color: #fff;
    }
    .ec-btn-start:hover { background: #0952a0; }
    .ec-btn-start:disabled {
        background: #333; color: #666; cursor: default;
    }
    .ec-btn-cancel-pick {
        background: #333; color: #ccc;
    }
    .ec-btn-cancel-pick:hover { background: #444; }

    /* ── Progress panel ── */
    .ec-panel {
        position: fixed; bottom: 72px; right: 18px; z-index: 9999;
        background: #111; color: #eee; padding: 12px 14px; border-radius: 10px;
        min-width: 300px; box-shadow: 0 4px 16px rgba(0,0,0,.25); font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        transition: opacity 0.4s, transform 0.4s;
    }
    .ec-panel.ec-fade-out {
        opacity: 0; transform: translateY(10px); pointer-events: none;
    }
    .ec-dismiss-btn {
        background: #333; color: #ccc; border: 0; padding: 6px 10px;
        border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px;
        display: none;
    }
    .ec-dismiss-btn:hover { background: #444; }
    .ec-row {
        display: flex; justify-content: space-between; align-items: baseline;
        gap: 8px; margin-bottom: 2px;
    }
    .ec-muted { color: #bbb; }
    .ec-strong { font-weight: 700; }
    .ec-bar {
        width: 100%; height: 8px; background: #333; border-radius: 6px;
        overflow: hidden; margin: 8px 0 6px;
    }
    .ec-bar > div {
        height: 100%; background: #0b65c2; width: 0%;
        transition: width .15s linear;
    }
    .ec-controls { display: flex; gap: 8px; margin-top: 8px; }
    .ec-cancel-btn {
        background: #b21d1d; color: #fff; border: 0; padding: 6px 10px;
        border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px;
    }
    .ec-spinner {
        display: inline-block; width: 12px; height: 12px;
        border: 2px solid #fff; border-top-color: transparent;
        border-radius: 50%; animation: ec-spin .8s linear infinite;
        margin-left: 6px;
    }
    @keyframes ec-spin { to { transform: rotate(360deg); } }
    `);

    // ─── Fallback UI (only if toolbar not available) ────────────────
    function addUI(bankPage) {
        if (currentFallbackBtn) currentFallbackBtn.remove();
        const btn = document.createElement('button');
        btn.textContent = bankPage ? '⬇ Export Item Bank' : '⬇ Export Content';
        btn.className = 'ec-launch-btn';
        btn.addEventListener('click', () => {
            btn.remove();
            if (bankPage) runNewQuizBankExport(bankPage);
            else showPicker();
        });
        document.body.appendChild(btn);
        currentFallbackBtn = btn;
    }

    function showPicker() {
        const picker = document.createElement('div');
        picker.className = 'ec-picker';

        const typeKeys = Object.keys(CONTENT_TYPES);
        const checkboxes = {};

        let optionsHTML = '';
        for (const key of typeKeys) {
            const t = CONTENT_TYPES[key];
            optionsHTML += `
            <div class="ec-picker-option">
            <input type="checkbox" id="ec-pick-${key}" checked>
            <span class="ec-emoji">${t.emoji}</span>
            <label for="ec-pick-${key}">${t.label}</label>
            </div>`;
        }

        picker.innerHTML = `
        <h3>Export Course Content</h3>
        ${optionsHTML}
        <div class="ec-picker-divider" style="border-top:1px solid #333;margin:12px 0 10px;"></div>
        <div class="ec-picker-option">
        <input type="checkbox" id="ec-pick-answers" checked>
        <span class="ec-emoji">🔑</span>
        <label for="ec-pick-answers">Show correct answers in quizzes</label>
        </div>
        <div class="ec-picker-option">
        <input type="checkbox" id="ec-pick-text2qti">
        <span class="ec-emoji">📋</span>
        <label for="ec-pick-text2qti">Also export text2qti (.txt) for quizzes</label>
        </div>
        <div class="ec-picker-option">
        <input type="checkbox" id="ec-pick-qticonverter">
        <span class="ec-emoji">🗂️</span>
        <label for="ec-pick-qticonverter">Also export qtiConverter (.txt) for quizzes</label>
        </div>
        <div class="ec-picker-actions">
        <button class="ec-btn-cancel-pick" id="ec-pick-cancel">Cancel</button>
        <button class="ec-btn-start" id="ec-pick-start">Export Selected</button>
        </div>
        `;

        document.body.appendChild(picker);

        // Wire up
        const startBtn = picker.querySelector('#ec-pick-start');
        const cancelBtn = picker.querySelector('#ec-pick-cancel');

        for (const key of typeKeys) {
            checkboxes[key] = picker.querySelector(`#ec-pick-${key}`);
        }

        // Update button state when checkboxes change
        function updateStartBtn() {
            const anyChecked = typeKeys.some((k) => checkboxes[k].checked);
            startBtn.disabled = !anyChecked;
        }
        for (const key of typeKeys) {
            checkboxes[key].addEventListener('change', updateStartBtn);
        }

        cancelBtn.addEventListener('click', () => {
            picker.remove();
        });

        startBtn.addEventListener('click', () => {
            const selected = typeKeys.filter((k) => checkboxes[k].checked);
            if (!selected.length) return;
            console.log('[Export] Selected types:', selected); // <-- add this
            showAnswers = picker.querySelector('#ec-pick-answers').checked;
            exportText2qti = picker.querySelector('#ec-pick-text2qti').checked;
            exportQtiConverter = picker.querySelector('#ec-pick-qticonverter').checked;
            picker.remove();
            buildPanel();
            startExport(selected);
        });
    }

    function buildPanel() {
        const panel = document.createElement('div');
        panel.className = 'ec-panel';
        panel.innerHTML = `
        <div class="ec-row">
        <div>
        <span class="ec-strong" id="ep-phase">Idle</span>
        <span class="ec-spinner" id="ep-spin" style="display:none"></span>
        </div>
        <div class="ec-muted" id="ep-elapsed">0s</div>
        </div>
        <div class="ec-bar"><div id="ep-bar"></div></div>
        <div class="ec-row"><div class="ec-muted">Detail</div><div id="ep-detail">—</div></div>
        <div class="ec-row"><div class="ec-muted">Items</div><div><span id="ep-pagesDone">0</span>/<span id="ep-pagesTotal">0</span></div></div>
        <div class="ec-row"><div class="ec-muted">Modules</div><div><span id="ep-modulesDone">0</span>/<span id="ep-modulesTotal">0</span></div></div>
        <div class="ec-row"><div class="ec-muted">ETA</div><div id="ep-eta">—</div></div>
        <div class="ec-controls">
        <button class="ec-cancel-btn" id="ep-cancel">Cancel</button>
        <button class="ec-dismiss-btn" id="ep-dismiss">Dismiss</button>
        </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('ep-cancel').addEventListener('click', () => {
            CANCELLED = true;
            setPhase('Cancelling');
            setDetail('Stopping after current request…');
        });

        document.getElementById('ep-dismiss').addEventListener('click', () => {
            dismissPanel();
        });

        const elapsedEl = document.getElementById('ep-elapsed');
        const timer = setInterval(() => {
            if (!startedAt) return;
            const s = Math.floor((performance.now() - startedAt) / 1000);
            elapsedEl.textContent =
            s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
            const phaseEl = document.getElementById('ep-phase');
            if (
                phaseEl?.textContent === 'Done' ||
                phaseEl?.textContent === 'Cancelled' ||
                CANCELLED
            )
                clearInterval(timer);
        }, 500);
    }

    // ── Panel update helpers ──
    function setPhase(text) {
        const el = document.getElementById('ep-phase');
        if (el) el.textContent = text;
    }
    function setDetail(text) {
        const el = document.getElementById('ep-detail');
        if (el) el.textContent = text;
    }
    function setSpinner(on) {
        const el = document.getElementById('ep-spin');
        if (el) el.style.display = on ? '' : 'none';
    }

    // Show the dismiss button and hide the cancel button once export ends
    function showDismissState(autoMs) {
        const cancelBtn = document.getElementById('ep-cancel');
        const dismissBtn = document.getElementById('ep-dismiss');
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (dismissBtn) dismissBtn.style.display = '';
        // Auto-dismiss after delay
        if (autoMs > 0) {
            setTimeout(dismissPanel, autoMs);
        }
    }

    function dismissPanel() {
        const panel = document.querySelector('.ec-panel');
        if (!panel) return;
        panel.classList.add('ec-fade-out');
        setTimeout(() => {
            panel.remove();
        }, 450);
    }
    function setCounter(which, val) {
        const id = {
            pagesTotal: 'ep-pagesTotal',
            pagesDone: 'ep-pagesDone',
            modulesTotal: 'ep-modulesTotal',
            modulesDone: 'ep-modulesDone',
        }[which];
        const el = id ? document.getElementById(id) : null;
        if (el) el.textContent = String(val);
    }
    function setProgress(done, total) {
        const pct = total ? Math.round((done / total) * 100) : 0;
        const el = document.getElementById('ep-bar');
        if (el) el.style.width = `${pct}%`;
    }
    function updateTiming(done, total) {
        if (!startedAt || done === 0 || !total) return;
        const elapsedMs = performance.now() - startedAt;
        const rate = done / (elapsedMs / 1000);
        const remaining = total - done;
        const etaSec = remaining / Math.max(rate, 0.001);
        const mins = Math.floor(etaSec / 60);
        const secs = Math.round(etaSec % 60);
        const el = document.getElementById('ep-eta');
        if (el)
            el.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }
    function checkCancel() {
        if (CANCELLED) throw new Error('Cancelled by user');
    }

    async function loadJsZipWithTimeout(ms = 5000) {
        if (window.JSZip) return true;
        return await new Promise((resolve) => {
            let done = false;
            const finish = (ok) => {
                if (!done) {
                    done = true;
                    resolve(ok);
                }
            };
            const s = document.createElement('script');
            s.src =
            'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
            s.onload = () => finish(true);
            s.onerror = () => finish(false);
            document.head.appendChild(s);
            setTimeout(() => finish(false), ms);
        });
    }
})();
