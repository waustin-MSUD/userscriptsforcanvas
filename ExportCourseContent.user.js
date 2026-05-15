// ==UserScript==
// @name          Export Course Content
// @version       2026.05.15
// @namespace     CTLD
// @description   Export pages, assignments, discussions, and classic quizzes (with banks) as HTML.
// @author        CTLD
// @updateurl
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
// @grant         GM_addStyle
// @grant         GM_addElement
// @run-at        document-idle
// ==/UserScript==

(function () {
    /*** CONFIG ***/
    const USE_ZIP = true;
    const GROUP_BY_MODULE = true;
    const PER_PAGE = 100;
    const THROTTLE_MS = 150;
    /*** END CONFIG ***/

    let CANCELLED = false;
    let startedAt = 0;
    let showAnswers = true; // Whether to mark correct answers in quiz exports

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
    function registerWithToolbar() {
        if (unsafeWindow.canvasToolbar?._ready) {
            unsafeWindow.canvasToolbar.register({
                id: 'export-content',
                label: 'Export Content',
                icon: '⬇',
                order: 20,
                onClick: showPicker,
            });
        } else {
            unsafeWindow.addEventListener('canvas-toolbar-ready', () => {
                unsafeWindow.canvasToolbar.register({
                    id: 'export-content',
                    label: 'Export Content',
                    icon: '⬇',
                    order: 20,
                    onClick: showPicker,
                });
            }, { once: true });
            // Fallback: if toolbar never loads, create own button after 3s
            setTimeout(() => {
                if (!unsafeWindow.canvasToolbar?._ready) addUI();
            }, 3000);
        }
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

                    allExported.push({
                        typeKey,
                        typeLabel: typeDef.label,
                        url: item.url || item.id,
                        title,
                        moduleName,
                        htmlDoc: wrapHTML(title, body, typeDef.label),
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
                    answers.push({ html: `<strong>${escapeHtml(left)}</strong> → ${escapeHtml(right)}`, weight: 100 });
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
                    answers.push({ html: escapeHtml(label), weight: 100 });
                }
            } else if (qType === 'numerical_question') {
                for (const a of answerEls) {
                    const exact = a.querySelector('.answer_exact')?.textContent.trim();
                    const margin = a.querySelector('.answer_error_margin')?.textContent.trim();
                    answers.push({
                        html: `${escapeHtml(exact || '?')} <span style="color:#666;">(margin: ${escapeHtml(margin || '0')})</span>`,
                                 weight: 100,
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
    function addUI() {
        const btn = document.createElement('button');
        btn.textContent = '⬇ Export Content';
        btn.className = 'ec-launch-btn';
        btn.addEventListener('click', () => {
            btn.remove();
            showPicker();
        });
        document.body.appendChild(btn);
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
