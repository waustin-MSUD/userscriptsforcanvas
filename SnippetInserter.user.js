// ==UserScript==
// @name          Snippet Inserter
// @version       2026.05.15
// @namespace     CTLD
// @description   Adds menu for inserting HTML snippets from the RCE.
// @author        CTLD
// @updateurl     https://raw.githubusercontent.com/waustin-MSUD/userscriptsforcanvas/refs/heads/main/SnippetInserter.user.js
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*/pages/*/edit
// @match         https://*.instructure.com/courses/*/assignments/*/edit
// @match         https://*.instructure.com/courses/*/discussion_topics/*/edit
// @match         https://*.instructure.com/courses/*/quizzes/*/edit
// @match         https://*.instructure.com/courses/*/announcements/*/edit
// @match         https://*.instructure.com/courses/*/assignments/syllabus
// @grant         none
// @run-at        document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Placement ────────────────────────────────────────────────
  // The menubar item is inserted immediately after the item with
  // this label (case-sensitive, matched against visible text). If
  // not found, it appends at the end.
  const INSERT_AFTER = 'Insert';
  const MENU_LABEL = 'Snippets';

  // ─── EDIT YOUR SNIPPETS HERE ───────────────────────────────────
  // Each group has a name (shown as a header in the menu) and a list
  // of snippets. Each snippet has:
  //   key:  short ID, must be unique within group
  //   name: shown in the menu (you can include emoji as a marker)
  //   html: the HTML to insert (use backticks for multi-line)
  //
  // To add a new snippet: copy an existing entry, change key/name/html.
  // To add a new group: copy a `{ group, snippets }` block.
  // ───────────────────────────────────────────────────────────────
  const SNIPPETS = [
    {
      group: 'General',
      snippets: [
        {
          key: 'video',
          name: '🎥 Video Placeholder',
          html: `<h2>Video: Title</h2><p>Video length: xx:xx, CC available</p><p><iframe title="#" src="https://www.youtube.com/embed/oznr-1-poSU" width="560" height="315" loading="lazy" allowfullscreen="allowfullscreen" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" data-mce-fragment="1"></iframe></p>`
        },
        {
          key: 'hrThick',
          name: '📏 Thick HR',
          html: `<hr style="border: 0; height: 4px; background-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0));" />`
        },
        {
          key: 'sBox',
          name: 'Shadow Box',
          html: `<div style="margin: 50px 15% 50px 15%; background-color: #cccccc; border-radius: 8px;"><div style="position: relative; top: -20px; left: -20px; padding: 20px; background: #ffffff; border: 2px solid #cccccc; border-radius: 8px;"><p>Content Goes Here</p></div></div>`
        },
        {
          key: 'figure',
          name: 'Figure/Caption',
          html: `<figure><img role="presentation" src="https://picsum.photos/650/315/" alt="" /><figcaption>Paris at night | Source: Pierre Blach&eacute; from Paris, France, CC0, via Wikimedia Commons</figcaption></figure>`
        },
        {
          key: 'stToggle',
          name: 'Styled Toggle',
          html: `<details style="margin-bottom: 10px; border: 1px solid #5E5A80; border-radius: 5px; padding: 10px; background-color: #e6e6fa;">
  <summary style="cursor: pointer; color: #35203b;"><strong>Title</strong></summary>
  <p style="padding: 5px; color: #35203b;">Content Goes Here</p>
</details>`
        }
      ]
    },
    {
      group: 'Clean Cards',
      snippets: [
        {
          key: 'OC',
          name: 'Outer Container',
          html: `<div style="background: #e2e8f0; padding: 2rem 1rem; border-radius: 12px; max-width: 98%; margin: 0 auto; font-family: system-ui,sans-serif; margin-bottom: 30px;">
  <h2 style="font-size: 2rem; margin: 0 0 1.8rem; padding-left: 1rem; color: #0f172a;">This Is a Heading</h2><p></p>`
        },
        {
          key: 'IC',
          name: 'Inner Container',
          html: `<div style="background: #ffffff; border: 1px solid #d1d9e0; border-radius: 12px; padding: 1.5rem 1.5rem; margin-bottom: 1.5rem;">
    <h3 style="margin-top: 0; margin-bottom: .6rem; color: #0f172a; font-size: 1.35rem;">This is a subheading</h3>
    <p style="margin: 0; color: #475569; line-height: 1.55;">This is text.</p>
</div><p></p>`
        },
        {
          key: 'CB',
          name: 'Callout Box',
          html: `<div style="background: #eef6ff; border: 1px solid #cfe4ff; border-radius: 12px; padding: 1.5rem 1.75rem; margin: 1.5rem 0; font-family: system-ui,sans-serif;">
    <h3 style="margin: 0 0 .6rem; font-size: 1.3rem; color: #0f172a;">This is another subheading</h3>
    <p style="margin: 0; color: #475569; font-size: .95rem; line-height: 1.55;">This is a callout box.</p>
</div><p></p>`
        },
        {
          key: 'TB',
          name: 'Styled Table',
          html: `<table style="width: 100%; border-collapse: collapse; margin: 1rem 0; background: #ffffff; border: 1px solid #dfe3e8; overflow: hidden; font-family: system-ui,sans-serif; font-size: .9rem;">
    <caption style="text-align: left; margin-top: 30px; margin-bottom: 10px;"><strong>Table 1:</strong> This is a table caption.</caption>
    <thead>
        <tr style="background: #f1f5f9;">
            <th style="padding: .75rem 1rem; text-align: left; border-bottom: 1px solid #e9eef3;" scope="row">Category</th>
            <th style="padding: .75rem 1rem; text-align: left; border-bottom: 1px solid #e9eef3;" scope="row">Example</th>
            <th style="padding: .75rem 1rem; text-align: left; border-bottom: 1px solid #e9eef3;" scope="row">Comment</th>
            <th style="padding: .75rem 1rem; text-align: left; border-bottom: 1px solid #e9eef3;" scope="row">Care</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td style="padding: .75rem 1rem; border-bottom: 1px solid #e9eef3;">Dogs</td>
            <td style="padding: .75rem 1rem; border-bottom: 1px solid #e9eef3;"><span style="display: inline-block; padding: .2rem .55rem; border-radius: 6px; background: #fee2e2; color: #991b1b; font-size: .8rem;">poop outside</span></td>
            <td style="padding: .75rem 1rem; border-bottom: 1px solid #e9eef3; color: #991b1b;">Weak</td>
            <td style="padding: .75rem 1rem; border-bottom: 1px solid #e9eef3;">Hard</td>
        </tr>
        <tr>
            <td style="padding: .75rem 1rem; border-bottom: 1px solid #e9eef3;">Cats</td>
            <td style="padding: .75rem 1rem; border-bottom: 1px solid #e9eef3;"><span style="display: inline-block; padding: .2rem .55rem; border-radius: 6px; background: #e2fbe8; color: #166534; font-size: .8rem;">litterbox</span></td>
            <td style="padding: .75rem 1rem; border-bottom: 1px solid #e9eef3; color: #166534;">Strong</td>
            <td style="padding: .75rem 1rem; border-bottom: 1px solid #e9eef3;">Easy</td>
        </tr>
    </tbody>
</table><p></p>`
        }
      ]
    },
    {
      group: 'Pressbooks Lite',
      snippets: [
        {
          key: 'exBox',
          name: '🟪 Examples',
          html: `<div style="width: 90%; border-left: solid 4px #7a6886; background-color: #f8f5fa; border-radius: 12px; padding: 16px 20px; margin: 20px auto;"><h3 style="color: #7a6886; font-size: 1.1em; font-weight: bold; margin: 0 0 8px 0;">Examples</h3><p>Content goes here.</p></div>`
        },
        {
          key: 'tkBox',
          name: '🟩 Takeaways',
          html: `<div style="width: 90%; border-left: solid 4px #4a7c59; background-color: #f3f8f5; border-radius: 12px; padding: 16px 20px; margin: 20px auto;"><h3 style="color: #4a7c59; font-size: 1.1em; font-weight: bold; margin: 0 0 8px 0;">Key Takeaways</h3><p>Content goes here.</p></div>`
        },
        {
          key: 'exerBox',
          name: '🟦 Exercises',
          html: `<div style="width: 90%; border-left: solid 4px #3d6b8e; background-color: #f0f5f9; border-radius: 12px; padding: 16px 20px; margin: 20px auto;"><h3 style="color: #3d6b8e; font-size: 1.1em; font-weight: bold; margin: 0 0 8px 0;">Exercises</h3><p>Content goes here.</p></div>`
        },
        {
          key: 'noteBox',
          name: '🟧 Notes',
          html: `<div style="width: 90%; border-left: solid 4px #b5722a; background-color: #fdf6f0; border-radius: 12px; padding: 16px 20px; margin: 20px auto;"><h3 style="color: #88541e; font-size: 1.1em; font-weight: bold; margin: 0 0 8px 0;">Notes</h3><p>Content goes here.</p></div>`
        },
        {
          key: 'obBox',
          name: '⬛ Objectives',
          html: `<div style="width: 90%; border-left: solid 4px #6b6b6b; background-color: #f5f5f5; border-radius: 12px; padding: 16px 20px; margin: 20px auto;"><h3 style="color: #6b6b6b; font-size: 1.1em; font-weight: bold; margin: 0 0 8px 0;">Learning Objectives</h3><p>Content goes here.</p></div>`
        }
      ]
    }
  ];
  // ─── END SNIPPETS CONFIG ───────────────────────────────────────

  // ─── Stylesheet injection ─────────────────────────────────────
  function injectStylesheet() {
    if (document.getElementById('ctld-snippet-style')) return;
    const style = document.createElement('style');
    style.id = 'ctld-snippet-style';
    style.textContent = `
      .ctld-snippet-menu {
        background: #ffffff;
        border: 1px solid #cccccc;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        padding: 4px 0;
        min-width: 220px;
        max-width: 320px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        font-size: 14px;
        color: #222f3e;
      }
      .ctld-snippet-menu .tox-collection__item {
        padding: 6px 14px;
        cursor: pointer;
        color: #222f3e;
      }
      .ctld-snippet-menu .tox-collection__item--active,
      .ctld-snippet-menu .tox-collection__item:hover {
        background: #dee0e2;
      }
      .ctld-snippet-group-label {
        padding: 6px 14px 2px;
        font-size: 11px;
        font-weight: 700;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .ctld-snippet-divider {
        height: 1px;
        background: #e0e0e0;
        margin: 4px 0;
      }

      .ctld-snippet-overlay {
        position: fixed; inset: 0; z-index: 100001;
        background: rgba(0, 0, 0, 0.5);
        display: flex; align-items: center; justify-content: center;
      }
      .ctld-snippet-modal {
        background: #ffffff;
        padding: 20px;
        border-radius: 8px;
        max-width: 720px;
        width: 92%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }
      .ctld-snippet-modal-title {
        font-weight: 700; font-size: 13px;
        color: #6b7280; margin-bottom: 10px;
        text-transform: uppercase; letter-spacing: 0.04em;
      }
      .ctld-snippet-modal-preview {
        margin-bottom: 1em;
      }
      .ctld-snippet-modal-buttons {
        display: flex; justify-content: flex-end; gap: 10px;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ─── Boot ─────────────────────────────────────────────────────
  function waitForMenubar() {
    let attempts = 0;
    const maxAttempts = 60;

    const interval = setInterval(() => {
      attempts += 1;
      const editor = window.tinymce?.activeEditor;
      const menubar = document.querySelector('.tox-menubar');
      if (editor?.initialized && menubar && menubar.children.length > 0) {
        clearInterval(interval);
        installMenuButton(editor, menubar);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn('[Snippet Inserter] Menubar never appeared; giving up.');
      }
    }, 500);

    // Re-install if TinyMCE rebuilds the menubar
    const observer = new MutationObserver(() => {
      const editor = window.tinymce?.activeEditor;
      const menubar = document.querySelector('.tox-menubar');
      if (editor?.initialized && menubar && !menubar.querySelector('.ctld-snippet-mbtn')) {
        installMenuButton(editor, menubar);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Install ──────────────────────────────────────────────────
  function installMenuButton(editor, menubar) {
    if (menubar.querySelector('.ctld-snippet-mbtn')) return;

    const btn = createMenubarButton();
    const insertAfterBtn = findMenubarButtonByLabel(menubar, INSERT_AFTER);

    if (insertAfterBtn && insertAfterBtn.nextSibling) {
      menubar.insertBefore(btn, insertAfterBtn.nextSibling);
    } else if (insertAfterBtn) {
      menubar.appendChild(btn);
    } else {
      menubar.appendChild(btn);
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(btn, editor);
    });
  }

  function findMenubarButtonByLabel(menubar, label) {
    const buttons = menubar.querySelectorAll('.tox-mbtn');
    for (const b of buttons) {
      const text = b.querySelector('.tox-mbtn__select-label')?.textContent?.trim();
      if (text === label) return b;
    }
    return null;
  }

  function createMenubarButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tox-mbtn tox-mbtn--select ctld-snippet-mbtn';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('tabindex', '-1');
    btn.setAttribute('data-alloy-tabstop', 'true');
    btn.setAttribute('unselectable', 'on');
    btn.style.userSelect = 'none';
    btn.innerHTML = `
      <span class="tox-mbtn__select-label">${MENU_LABEL}</span>
      <div class="tox-mbtn__select-chevron">
        <svg width="10" height="10" focusable="false" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
          <path d="M8.7 2.2c.3-.3.8-.3 1.1 0 .3.3.3.7 0 1l-4.2 4.4c-.3.3-.8.3-1.1 0L.3 3.2C0 2.9 0 2.5.3 2.2c.3-.3.8-.3 1.1 0L5 6l3.7-3.8z" fill="currentColor" fill-rule="evenodd"></path>
        </svg>
      </div>
    `;
    return btn;
  }

  // ─── Menu open / close ────────────────────────────────────────
  let openMenuEl = null;
  let openMenuOwner = null;

  function toggleMenu(ownerBtn, editor) {
    if (openMenuEl && openMenuOwner === ownerBtn) {
      closeMenu();
      return;
    }
    closeMenu();
    openMenu(ownerBtn, editor);
  }

  function openMenu(ownerBtn, editor) {
    const menu = buildMenu(editor);
    document.body.appendChild(menu);

    const rect = ownerBtn.getBoundingClientRect();
    menu.style.left = `${rect.left + window.scrollX}px`;
    menu.style.top = `${rect.bottom + window.scrollY}px`;

    // Nudge left if it would overflow the right edge of the viewport
    requestAnimationFrame(() => {
      const menuRect = menu.getBoundingClientRect();
      if (menuRect.right > window.innerWidth - 4) {
        menu.style.left = `${Math.max(4, window.innerWidth - menuRect.width - 4 + window.scrollX)}px`;
      }
    });

    ownerBtn.setAttribute('aria-expanded', 'true');
    openMenuEl = menu;
    openMenuOwner = ownerBtn;

    setTimeout(() => {
      document.addEventListener('click', outsideClickHandler, { capture: true });
      document.addEventListener('keydown', escHandler);
    }, 0);
  }

  function closeMenu() {
    if (openMenuEl) {
      openMenuEl.remove();
      openMenuEl = null;
    }
    if (openMenuOwner) {
      openMenuOwner.setAttribute('aria-expanded', 'false');
      openMenuOwner = null;
    }
    document.removeEventListener('click', outsideClickHandler, { capture: true });
    document.removeEventListener('keydown', escHandler);
  }

  function outsideClickHandler(e) {
    if (!openMenuEl) return;
    if (openMenuEl.contains(e.target)) return;
    if (openMenuOwner && openMenuOwner.contains(e.target)) return;
    closeMenu();
  }

  function escHandler(e) {
    if (e.key === 'Escape') closeMenu();
  }

  // Build a grouped menu element with TinyMCE-style classes plus
  // our own scoping class.
  function buildMenu(editor) {
    const menu = document.createElement('div');
    menu.className = 'tox-menu tox-collection tox-collection--list tox-selected-menu ctld-snippet-menu';
    menu.setAttribute('role', 'menu');
    menu.style.position = 'absolute';
    menu.style.zIndex = '10000';

    SNIPPETS.forEach((group, idx) => {
      if (idx > 0) {
        const divider = document.createElement('div');
        divider.className = 'ctld-snippet-divider';
        menu.appendChild(divider);
      }

      const header = document.createElement('div');
      header.className = 'ctld-snippet-group-label';
      header.textContent = group.group;
      menu.appendChild(header);

      const collection = document.createElement('div');
      collection.className = 'tox-collection__group';

      group.snippets.forEach((snip) => {
        const item = document.createElement('div');
        item.className = 'tox-collection__item';
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '-1');
        item.innerHTML = `<div class="tox-collection__item-label">${escapeHTML(snip.name)}</div>`;
        item.addEventListener('mouseenter', () => {
          item.classList.add('tox-collection__item--active');
        });
        item.addEventListener('mouseleave', () => {
          item.classList.remove('tox-collection__item--active');
        });
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          closeMenu();
          openPreviewModal(editor, snip);
        });
        collection.appendChild(item);
      });

      menu.appendChild(collection);
    });

    return menu;
  }

  // ─── Preview modal ────────────────────────────────────────────
  function openPreviewModal(editor, snippet) {
    // Original-behavior guard: require a collapsed cursor (no selection).
    // We check before showing the preview so she finds out early
    // rather than after picking and previewing.
    const sel = editor.selection;
    if (sel && !sel.isCollapsed()) {
      alert("Please place the cursor (without selecting text) where you'd like to insert the snippet.");
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'ctld-snippet-overlay';

    const modal = document.createElement('div');
    modal.className = 'ctld-snippet-modal';

    const title = document.createElement('div');
    title.className = 'ctld-snippet-modal-title';
    title.textContent = `Preview: ${snippet.name}`;
    modal.appendChild(title);

    const preview = document.createElement('div');
    preview.className = 'ctld-snippet-modal-preview';
    preview.innerHTML = snippet.html;
    modal.appendChild(preview);

    const buttonRow = document.createElement('div');
    buttonRow.className = 'ctld-snippet-modal-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'Button';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const insertBtn = document.createElement('button');
    insertBtn.textContent = 'Insert';
    insertBtn.className = 'Button Button--primary';
    insertBtn.addEventListener('click', () => {
      overlay.remove();
      insertSnippetHTML(editor, snippet.html);
    });

    buttonRow.appendChild(cancelBtn);
    buttonRow.appendChild(insertBtn);
    modal.appendChild(buttonRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Click backdrop or press Escape to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  function insertSnippetHTML(editor, html) {
    editor.focus();
    editor.execCommand('mceInsertContent', false, html);
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ─── Go ───────────────────────────────────────────────────────
  injectStylesheet();
  waitForMenubar();
})();
