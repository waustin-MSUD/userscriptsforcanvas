// ==UserScript==
// @name          HTML Inserter
// @version       2026.05.15
// @namespace     CTLD
// @description   HTML Insert button for use after cyberattacks.
// @author        CTLD
// @updateurl
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://msudenver.instructure.com/courses/*/pages/*/edit
// @grant         none
// @run-at        document-idle
// ==/UserScript==

(function () {
    'use strict';

    const BUTTON_ID = 'rce-html-insert-btn';
    const MODAL_ID = 'rce-html-insert-modal';
    const POLL_INTERVAL_MS = 1000;

    // ---------- Styles ----------
    const style = document.createElement('style');
    style.textContent = `
        #${BUTTON_ID} {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin: 6px 4px;
            padding: 6px 12px;
            background: #2D3B45;
            color: #fff;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 1px 2px rgba(0,0,0,0.15);
            font-family: "Lato Extended","Lato","Helvetica Neue",Helvetica,Arial,sans-serif;
        }
        #${BUTTON_ID}:hover { background: #394B59; }
        #${BUTTON_ID}::before { content: "</>"; font-family: monospace; font-weight: 700; }

        #${MODAL_ID}-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.5);
            z-index: 999998;
            display: flex; align-items: center; justify-content: center;
        }
        #${MODAL_ID} {
            background: #fff;
            width: min(800px, 92vw);
            max-height: 85vh;
            border-radius: 6px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            display: flex; flex-direction: column;
            font-family: "Lato Extended","Lato","Helvetica Neue",Helvetica,Arial,sans-serif;
            z-index: 999999;
        }
        #${MODAL_ID} header {
            padding: 14px 18px;
            border-bottom: 1px solid #e6e6e6;
            display: flex; justify-content: space-between; align-items: center;
        }
        #${MODAL_ID} header h2 { margin: 0; font-size: 16px; color: #2D3B45; }
        #${MODAL_ID} header button {
            background: transparent; border: none; font-size: 22px; cursor: pointer; color: #6B7780;
        }
        #${MODAL_ID} .body {
            padding: 14px 18px;
            display: flex; flex-direction: column; gap: 10px;
            overflow: auto;
        }
        #${MODAL_ID} textarea {
            width: 100%;
            min-height: 280px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 13px;
            padding: 10px;
            border: 1px solid #C7CDD1;
            border-radius: 4px;
            resize: vertical;
            box-sizing: border-box;
        }
        #${MODAL_ID} .opts {
            display: flex; gap: 14px; align-items: center; font-size: 13px; color: #2D3B45;
            flex-wrap: wrap;
        }
        #${MODAL_ID} .opts label { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
        #${MODAL_ID} .hint { color: #6B7780; font-size: 12px; }
        #${MODAL_ID} footer {
            padding: 12px 18px;
            border-top: 1px solid #e6e6e6;
            display: flex; justify-content: flex-end; gap: 8px;
        }
        #${MODAL_ID} footer button {
            padding: 7px 14px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid transparent;
        }
        #${MODAL_ID} .btn-cancel { background: #fff; border-color: #C7CDD1; color: #2D3B45; }
        #${MODAL_ID} .btn-insert { background: #0374B5; color: #fff; }
        #${MODAL_ID} .btn-insert:hover { background: #035E92; }
        #${MODAL_ID} .target-pill {
            display: inline-block; padding: 2px 8px; border-radius: 10px;
            background: #F2F4F4; color: #2D3B45; font-size: 11px; margin-left: 8px;
        }
    `;
    document.head.appendChild(style);

    // ---------- Find RCE iframes ----------
    function getRceIframes() {
        // Canvas RCE iframes typically have a title containing "Rich Content Editor"
        // and id starting with "tinymce" or class "tox-edit-area__iframe"
        const iframes = Array.from(document.querySelectorAll('iframe'));
        return iframes.filter(f => {
            const title = (f.title || '').toLowerCase();
            const cls = f.className || '';
            return title.includes('rich content editor') ||
                   title.includes('rce') ||
                   cls.includes('tox-edit-area__iframe');
        });
    }

    // Get a stable label for an iframe so we can show which RCE we're inserting into
    function labelForIframe(iframe, idx) {
        // Try walking up to find a related <label> or heading
        let node = iframe;
        for (let i = 0; i < 8 && node; i++) {
            node = node.parentElement;
            if (!node) break;
            const label = node.querySelector && node.querySelector('label, legend, h2, h3');
            if (label && label.textContent.trim()) {
                return label.textContent.trim().slice(0, 60);
            }
        }
        return `RCE #${idx + 1}`;
    }

    // ---------- Insert button placement ----------
    function ensureInsertButton() {
        const iframes = getRceIframes();
        if (iframes.length === 0) return;

        // Place a button just above each RCE container if not already there
        iframes.forEach((iframe) => {
            // Find the tinymce container (ancestor with class tox-tinymce or similar)
            let container = iframe.closest('.tox-tinymce') || iframe.parentElement;
            if (!container || !container.parentElement) return;

            // Avoid duplicates per container
            if (container.previousElementSibling &&
                container.previousElementSibling.classList &&
                container.previousElementSibling.classList.contains('rce-html-insert-wrap')) {
                return;
            }

            const wrap = document.createElement('div');
            wrap.className = 'rce-html-insert-wrap';
            wrap.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = BUTTON_ID;
            btn.textContent = 'Insert HTML';
            btn.title = 'Insert raw HTML into this Rich Content Editor';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                openModal(iframe);
            });

            wrap.appendChild(btn);
            container.parentElement.insertBefore(wrap, container);
        });
    }

    // ---------- Modal ----------
    let lastTargetIframe = null;

    function openModal(targetIframe) {
        lastTargetIframe = targetIframe;
        closeModal(); // remove any existing

        const overlay = document.createElement('div');
        overlay.id = `${MODAL_ID}-overlay`;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        const iframes = getRceIframes();
        const idx = iframes.indexOf(targetIframe);
        const targetLabel = idx >= 0 ? labelForIframe(targetIframe, idx) : 'RCE';

        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.innerHTML = `
            <header>
                <h2>Insert HTML <span class="target-pill">Target: ${escapeHtml(targetLabel)}</span></h2>
                <button type="button" aria-label="Close" data-action="close">&times;</button>
            </header>
            <div class="body">
                <div class="hint">
                    Paste or type HTML below. It will be inserted at the current cursor position
                    (or appended to the end if no cursor is set). Use <strong>Replace all</strong>
                    to overwrite the editor's full contents.
                </div>
                <textarea spellcheck="false" placeholder="&lt;p&gt;Hello &lt;strong&gt;world&lt;/strong&gt;&lt;/p&gt;"></textarea>
                <div class="opts">
                    <label><input type="checkbox" data-opt="replace"> Replace all content</label>
                    <label><input type="checkbox" data-opt="sanitize"> Strip &lt;script&gt; tags</label>
                </div>
            </div>
            <footer>
                <button type="button" class="btn-cancel" data-action="close">Cancel</button>
                <button type="button" class="btn-insert" data-action="insert">Insert</button>
            </footer>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const ta = modal.querySelector('textarea');
        setTimeout(() => ta.focus(), 50);

        modal.addEventListener('click', (e) => {
            const action = e.target && e.target.getAttribute('data-action');
            if (action === 'close') closeModal();
            if (action === 'insert') {
                const html = ta.value;
                const replace = modal.querySelector('[data-opt="replace"]').checked;
                const sanitize = modal.querySelector('[data-opt="sanitize"]').checked;
                doInsert(targetIframe, html, { replace, sanitize });
            }
        });

        document.addEventListener('keydown', escListener);
    }

    function escListener(e) {
        if (e.key === 'Escape') closeModal();
    }

    function closeModal() {
        const existing = document.getElementById(`${MODAL_ID}-overlay`);
        if (existing) existing.remove();
        document.removeEventListener('keydown', escListener);
    }

    // ---------- Insertion logic ----------
    function doInsert(iframe, html, opts) {
        if (!iframe) {
            alert('Could not locate the editor iframe. Try clicking into the editor first.');
            return;
        }

        if (opts.sanitize) {
            html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        }

        // Strategy 1: use TinyMCE's API if exposed on the iframe's parent window
        const tinymce = window.tinymce || window.tinyMCE;
        if (tinymce && tinymce.editors && tinymce.editors.length) {
            // Match editor by iframe element
            const editor = tinymce.editors.find(ed => ed.iframeElement === iframe) || tinymce.activeEditor;
            if (editor) {
                try {
                    if (opts.replace) {
                        editor.setContent(html);
                    } else {
                        editor.insertContent(html);
                    }
                    editor.save && editor.save(); // sync to underlying textarea
                    fireChange(editor);
                    closeModal();
                    return;
                } catch (err) {
                    console.warn('[RCE Insert] TinyMCE API failed, falling back:', err);
                }
            }
        }

        // Strategy 2: directly manipulate the iframe document
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            const body = doc.body;
            if (!body) throw new Error('No body in iframe');

            if (opts.replace) {
                body.innerHTML = html;
            } else {
                // Try to use selection/range inside the iframe
                const win = iframe.contentWindow;
                const sel = win.getSelection();
                if (sel && sel.rangeCount > 0 && body.contains(sel.anchorNode)) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    const frag = range.createContextualFragment(html);
                    range.insertNode(frag);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                } else {
                    // Fallback: append to body
                    const tmp = doc.createElement('div');
                    tmp.innerHTML = html;
                    while (tmp.firstChild) body.appendChild(tmp.firstChild);
                }
            }

            // Trigger an input event so Canvas notices the change
            const evt = new (iframe.contentWindow.Event || Event)('input', { bubbles: true });
            body.dispatchEvent(evt);
            // Also try to sync back to TinyMCE textarea if present
            syncTextarea(iframe);
            closeModal();
        } catch (err) {
            console.error('[RCE Insert] Direct DOM insertion failed:', err);
            alert('Could not insert HTML into the editor. See the browser console for details.');
        }
    }

    function fireChange(editor) {
        try {
            editor.fire && editor.fire('change');
            editor.fire && editor.fire('input');
        } catch (e) { /* noop */ }
    }

    function syncTextarea(iframe) {
        // Some Canvas pages keep a hidden textarea; try to update it
        try {
            const id = (iframe.id || '').replace(/_ifr$/, '');
            if (!id) return;
            const ta = document.getElementById(id);
            if (ta && 'value' in ta) {
                ta.value = iframe.contentDocument.body.innerHTML;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                ta.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (e) { /* noop */ }
    }

    // ---------- Helpers ----------
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // ---------- Boot ----------
    // Canvas loads RCEs lazily and on navigation; poll regularly.
    setInterval(ensureInsertButton, POLL_INTERVAL_MS);
    ensureInsertButton();
})();
