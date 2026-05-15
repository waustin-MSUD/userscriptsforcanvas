// ==UserScript==
// @name          Homepage Navigation
// @version       2026.05.15
// @namespace     CTLD
// @description   Inserts buttons for Syllabus, Modules, Overview, and Course Information with a style chooser.
// @author        CTLD
// @updateurl
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*/pages/*/edit
// @grant         GM_addStyle
// @grant         unsafeWindow
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Configuration: the four destinations ─────────────────────
  // Syllabus and Modules use predictable URLs.
  // The Overview page is found by slug, with title-search fallback.
  // The Course Information module is found by name via the modules API.
  const DESTINATIONS = [
    { kind: 'syllabus', label: 'Syllabus' },
    { kind: 'modules',  label: 'Modules' },
    { kind: 'page',     label: 'Overview',           slug: 'overview-read-me-first', title: 'Overview (Read Me First)' },
    { kind: 'module',   label: 'Course Information', name: 'Course Information' },
  ];

  // ─── Helpers ──────────────────────────────────────────────────
  function getCourseId() {
    const m = location.pathname.match(/\/courses\/(\d+)/);
    return m ? m[1] : null;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // Resolve every destination to a final URL.
  // Returns [{ label, href }, ...] in the same order as DESTINATIONS.
  async function resolveDestinations(courseId) {
    const results = [];
    for (const dest of DESTINATIONS) {
      if (dest.kind === 'syllabus') {
        results.push({ label: dest.label, href: `/courses/${courseId}/assignments/syllabus` });
      } else if (dest.kind === 'modules') {
        results.push({ label: dest.label, href: `/courses/${courseId}/modules` });
      } else if (dest.kind === 'page') {
        const href = await findPageHref(courseId, dest.slug, dest.title);
        results.push({ label: dest.label, href });
      } else if (dest.kind === 'module') {
        const href = await findModuleHref(courseId, dest.name);
        results.push({ label: dest.label, href });
      }
    }
    return results;
  }

  // Try the slug; fall back to title search via the Canvas API.
  async function findPageHref(courseId, slug, title) {
    // Slug check
    try {
      const r = await fetch(
        `/api/v1/courses/${courseId}/pages/${encodeURIComponent(slug)}`,
        { headers: { Accept: 'application/json' }, credentials: 'same-origin' }
      );
      if (r.ok) {
        const data = await r.json();
        return `/courses/${courseId}/pages/${data.url}`;
      }
    } catch (_) { /* fall through */ }

    // Title search
    try {
      const r = await fetch(
        `/api/v1/courses/${courseId}/pages?search_term=${encodeURIComponent(title)}&per_page=10`,
        { headers: { Accept: 'application/json' }, credentials: 'same-origin' }
      );
      if (r.ok) {
        const list = await r.json();
        const exact = list.find((p) => (p.title || '').toLowerCase() === title.toLowerCase());
        const match = exact || list[0];
        if (match?.url) return `/courses/${courseId}/pages/${match.url}`;
      }
    } catch (_) { /* fall through */ }

    // Last resort: link to the slug anyway. If it 404s, the designer
    // sees the broken link before publishing and can adjust.
    return `/courses/${courseId}/pages/${slug}`;
  }

  // Find a module by name and return a link to the Modules page,
  // anchored to that module so Canvas scrolls to and expands it.
  async function findModuleHref(courseId, name) {
    const fallback = `/courses/${courseId}/modules`;
    try {
      const r = await fetch(
        `/api/v1/courses/${courseId}/modules?search_term=${encodeURIComponent(name)}&per_page=20`,
        { headers: { Accept: 'application/json' }, credentials: 'same-origin' }
      );
      if (r.ok) {
        const list = await r.json();
        const exact = list.find((m) => (m.name || '').toLowerCase() === name.toLowerCase());
        const match = exact || list[0];
        if (match?.id) return `/courses/${courseId}/modules#module_${match.id}`;
      }
    } catch (_) { /* fall through */ }

    // Couldn't find it — land on the Modules page so it's not a dead link.
    return fallback;
  }

  // ─── Style presets ────────────────────────────────────────────
  // Each preset returns the inline-styled HTML for one full nav block.
  // `links` is [{ label, href }, ...].
  // All styles are inline because Canvas RCE strips <style> blocks on save.
  const PRESETS = {
    pill: {
      name: 'Pill',
      description: 'Rounded, soft, friendly',
      render: (links) => wrapRow(links, (l) => `
        <a href="${escapeHTML(l.href)}" style="
          display: inline-block;
          padding: 0.6em 1.4em;
          background: #4a7ba6;
          color: #ffffff;
          text-decoration: none;
          border-radius: 999px;
          font-weight: 600;
          font-size: 0.95em;
        ">${escapeHTML(l.label)}</a>`),
    },

    card: {
      name: 'Card',
      description: 'Bordered, with a subtle shadow',
      render: (links) => wrapGrid(links, (l) => `
        <a href="${escapeHTML(l.href)}" style="
          display: block;
          padding: 1em;
          background: #ffffff;
          color: #2c3e50;
          text-decoration: none;
          border: 1px solid #d0d7de;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          text-align: center;
          font-weight: 600;
        ">${escapeHTML(l.label)}</a>`),
    },

    outlined: {
      name: 'Outlined',
      description: 'Minimal border, neutral palette',
      render: (links) => wrapRow(links, (l) => `
        <a href="${escapeHTML(l.href)}" style="
          display: inline-block;
          padding: 0.55em 1.2em;
          background: transparent;
          color: #1f3a5f;
          text-decoration: none;
          border: 2px solid #1f3a5f;
          border-radius: 4px;
          font-weight: 600;
          font-size: 0.95em;
        ">${escapeHTML(l.label)}</a>`),
    },

    solid: {
      name: 'Solid',
      description: 'Flat colored, bold and high-contrast',
      render: (links) => wrapRow(links, (l) => `
        <a href="${escapeHTML(l.href)}" style="
          display: inline-block;
          padding: 0.7em 1.4em;
          background: #2d4a73;
          color: #ffffff;
          text-decoration: none;
          border-radius: 3px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          font-size: 0.85em;
        ">${escapeHTML(l.label)}</a>`),
    },

    underline: {
      name: 'Underline',
      description: 'Text-only links with a thick underline',
      render: (links) => wrapRow(links, (l) => `
        <a href="${escapeHTML(l.href)}" style="
          display: inline-block;
          padding: 0.3em 0.2em;
          background: transparent;
          color: #1a4480;
          text-decoration: none;
          border-bottom: 3px solid #1a4480;
          font-weight: 600;
          font-size: 1em;
          margin: 0 0.4em;
        ">${escapeHTML(l.label)}</a>`),
    },

    banner: {
      name: 'Banner',
      description: 'Full-width horizontal bar, single row',
      render: (links) => {
        const items = links.map((l) => `
          <a href="${escapeHTML(l.href)}" style="
            flex: 1;
            display: block;
            padding: 0.9em 0.5em;
            background: transparent;
            color: #ffffff;
            text-decoration: none;
            text-align: center;
            font-weight: 600;
            border-right: 1px solid rgba(255,255,255,0.25);
          ">${escapeHTML(l.label)}</a>`).join('');
        return `
          <div class="global-nav" style="
            display: flex;
            background: #2c3e50;
            border-radius: 6px;
            overflow: hidden;
            margin: 1em 0;
          ">${items}</div>`;
      },
    },
  };

  // Layout wrappers used by most presets
  function wrapRow(links, renderOne) {
    const items = links.map(renderOne).join('\n');
    return `
      <div class="global-nav" style="
        display: flex;
        flex-wrap: wrap;
        gap: 0.6em;
        justify-content: center;
        margin: 1em 0;
        padding: 0.5em 0;
      ">${items}</div>`;
  }

  function wrapGrid(links, renderOne) {
    const items = links.map(renderOne).join('\n');
    return `
      <div class="global-nav" style="
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 0.75em;
        margin: 1em 0;
      ">${items}</div>`;
  }

  // ─── Modal: style picker with live previews ───────────────────
  GM_addStyle(`
    #gnav-modal-backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 100000;
      display: flex; align-items: center; justify-content: center;
    }
    #gnav-modal {
      background: #ffffff;
      border-radius: 10px;
      max-width: 720px;
      width: 92%;
      max-height: 88vh;
      overflow-y: auto;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
    #gnav-modal .gnav-modal-header {
      padding: 16px 22px;
      border-bottom: 1px solid #e5e7eb;
      display: flex; align-items: center; justify-content: space-between;
    }
    #gnav-modal h2 {
      margin: 0; font-size: 18px; color: #1f2937;
    }
    #gnav-modal .gnav-modal-close {
      background: none; border: none; font-size: 22px; cursor: pointer;
      color: #6b7280; padding: 0; line-height: 1;
    }
    #gnav-modal .gnav-modal-subtitle {
      padding: 10px 22px 0; color: #6b7280; font-size: 13px;
    }
    #gnav-modal .gnav-preset-list {
      padding: 14px 22px 22px;
      display: flex; flex-direction: column; gap: 14px;
    }
    #gnav-modal .gnav-preset {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 14px;
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    #gnav-modal .gnav-preset:hover {
      border-color: #4a7ba6;
      box-shadow: 0 2px 8px rgba(74,123,166,0.15);
    }
    #gnav-modal .gnav-preset-name {
      font-weight: 700; font-size: 14px; color: #1f2937;
    }
    #gnav-modal .gnav-preset-desc {
      font-size: 12px; color: #6b7280; margin-bottom: 8px;
    }
    #gnav-modal .gnav-preset-preview {
      background: #fafafa;
      border-radius: 6px;
      padding: 8px;
      pointer-events: none;
    }
    #gnav-modal .gnav-resolving {
      padding: 30px; text-align: center; color: #6b7280; font-size: 14px;
    }
  `);

  function buildModal(resolvedLinks, onPick, onCancel) {
    const backdrop = document.createElement('div');
    backdrop.id = 'gnav-modal-backdrop';

    const modal = document.createElement('div');
    modal.id = 'gnav-modal';

    modal.innerHTML = `
      <div class="gnav-modal-header">
        <h2>Choose a Nav Button Style</h2>
        <button class="gnav-modal-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="gnav-modal-subtitle">Click a preview to insert that style into the page.</div>
      <div class="gnav-preset-list"></div>
    `;

    const list = modal.querySelector('.gnav-preset-list');

    Object.entries(PRESETS).forEach(([key, preset]) => {
      const card = document.createElement('div');
      card.className = 'gnav-preset';
      card.innerHTML = `
        <div class="gnav-preset-name">${preset.name}</div>
        <div class="gnav-preset-desc">${preset.description}</div>
        <div class="gnav-preset-preview">${preset.render(resolvedLinks)}</div>
      `;
      card.addEventListener('click', () => {
        onPick(key);
      });
      list.appendChild(card);
    });

    modal.querySelector('.gnav-modal-close').addEventListener('click', onCancel);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) onCancel();
    });

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function buildResolvingModal() {
    const backdrop = document.createElement('div');
    backdrop.id = 'gnav-modal-backdrop';
    backdrop.innerHTML = `
      <div id="gnav-modal">
        <div class="gnav-resolving">Looking up course pages…</div>
      </div>
    `;
    document.body.appendChild(backdrop);
    return backdrop;
  }

  // ─── Main action ──────────────────────────────────────────────
  async function insertGlobalNav() {
    const editor = unsafeWindow.tinymce?.activeEditor;
    if (!editor) {
      alert('Editor not ready yet.');
      return;
    }

    const courseId = getCourseId();
    if (!courseId) {
      alert('No course detected in the URL.');
      return;
    }

    // Show a "resolving" placeholder while we hit the API
    const resolving = buildResolvingModal();
    let links;
    try {
      links = await resolveDestinations(courseId);
    } catch (err) {
      resolving.remove();
      console.error('[Global Nav] Failed to resolve destinations:', err);
      alert('Could not look up course pages. See console for details.');
      return;
    }
    resolving.remove();

    // Show the picker
    const modal = buildModal(
      links,
      (key) => {
        modal.remove();
        const html = PRESETS[key].render(links) + '\n';
        editor.selection.select(editor.getBody().firstChild || editor.getBody());
        editor.selection.collapse(true);
        editor.execCommand('mceInsertContent', false, html);
      },
      () => modal.remove()
    );
  }

  // ─── Toolbar registration ─────────────────────────────────────
  function register() {
    unsafeWindow.canvasToolbar.register({
      id: 'insert-global-nav',
      label: 'Insert Global Nav',
      icon: '🧷',
      order: 40,
      onClick: insertGlobalNav,
    });
  }

  if (unsafeWindow.canvasToolbar?._ready) {
    register();
  } else {
    unsafeWindow.addEventListener('canvas-toolbar-ready', register, { once: true });
  }
})();
