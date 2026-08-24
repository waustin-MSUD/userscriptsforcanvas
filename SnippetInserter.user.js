// ==UserScript==
// @name          Snippet Inserter
// @version       2026.08.25
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
  const INSERT_AFTER = 'Insert';
  const MENU_LABEL = 'Snippets';

  // ─── EDIT YOUR SNIPPETS HERE ───────────────────────────────────
  // Each GROUP has a `group` name (a header in the top menu) and a
  // `snippets` array. Each entry in `snippets` is one of:
  //   • a LEAF snippet:  { key, name, html }
  //   • a SUBMENU:       { key, name, items: [ ...leaf snippets ] }
  // Submenus fly out to the side, so a group with many elements
  // (like the theme kits below) stays tidy. Nesting is unlimited,
  // but one level of submenus is plenty here.
  //
  //   key:  short ID (documentation only; not used by the code)
  //   name: shown in the menu (emoji marker optional)
  //   html: HTML to insert (use backticks for multi-line)
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
        group: 'Cool Theme',
        snippets: [
          {
            name: 'Headings & dividers',
            items: [
              {
                key: 'secHeader',
                name: 'Section header',
                html: `<h3><span style="color: #0369a1; font-size: 12px; font-family: inherit;">MODULE 3 · LESSON 2</span></h3>
  <h2 style="margin: 0 0 8px 0; font-size: 24px; color: #1e293b;">Section title</h2>
  <hr style="border-width: 4px 0px 0px; border-style: solid none none; border-color: #2563eb currentcolor currentcolor; width: 52px; border-radius: 2px; margin: 0px 0px 16px;"/>`
              },
              {
                key: 'divFade',
                name: 'Divider — gradient fade',
                html: `<hr style="border: 0; height: 3px; border-radius: 2px; background-image: linear-gradient(to right, #1e40af, rgba(30, 64, 175, 0)); margin: 28px 0;"/>`
              },
              {
                key: 'divTwo',
                name: 'Divider — two-tone',
                html: `<hr style="border: 0; height: 3px; border-radius: 2px; background-image: linear-gradient(to right, #1e40af, #2563eb 45%, rgba(37, 99, 235, 0)); margin: 28px 0;"/>`
              },
            ]
          },
          {
            name: 'Callouts',
            items: [
              {
                key: 'coObj',
                name: 'Learning Objectives',
                html: `<div style="width: 90%; border-left: 4px solid #475569; background-color: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin: 20px auto;">
  <h3 style="color: #334155; font-size: 1.1em; margin: 0 0 8px 0;">Learning Objectives</h3>
  <p>Content goes here.</p>
  </div>`
              },
              {
                key: 'coKey',
                name: 'Key Takeaways',
                html: `<div style="width: 90%; border-left: 4px solid #0d9488; background-color: #f0fdfa; border-radius: 8px; padding: 16px 20px; margin: 20px auto;">
  <h3 style="color: #0f766e; font-size: 1.1em; margin: 0 0 8px 0;">Key Takeaways</h3>
  <p>Content goes here.</p>
  </div>`
              },
              {
                key: 'coEx',
                name: 'Examples',
                html: `<div style="width: 90%; border-left: 4px solid #2563eb; background-color: #eff6ff; border-radius: 8px; padding: 16px 20px; margin: 20px auto;">
  <h3 style="color: #1d4ed8; font-size: 1.1em; margin: 0 0 8px 0;">Examples</h3>
  <p>Content goes here.</p>
  </div>`
              },
              {
                key: 'coExer',
                name: 'Exercises',
                html: `<div style="width: 90%; border-left: 4px solid #0369a1; background-color: #eff8fc; border-radius: 8px; padding: 16px 20px; margin: 20px auto;">
  <h3 style="color: #075985; font-size: 1.1em; margin: 0 0 8px 0;">Exercises</h3>
  <p>Content goes here.</p>
  </div>`
              },
              {
                key: 'coNote',
                name: 'Notes',
                html: `<div style="width: 90%; border-left: 4px solid #7c3aed; background-color: #f5f3ff; border-radius: 8px; padding: 16px 20px; margin: 20px auto;">
  <h3 style="color: #6d28d9; font-size: 1.1em; margin: 0 0 8px 0;">Notes</h3>
  <p>Content goes here.</p>
  </div>`
              },
              {
                key: 'coFolder',
                name: 'Folder-tab callout',
                html: `<div style="width: 90%; margin: 20px auto; line-height: 0;">
  <h3 style="display: inline-block; margin: 0px; line-height: 1.25; background-color: #eff6ff; color: #1d4ed8; font-size: 0.95em; padding: 7px 18px; border-width: 1px 1px 0px; border-style: solid solid none; border-color: #2563eb #2563eb currentcolor; border-radius: 8px 8px 0px 0px; border-left: 6px solid #2563eb;">Key Takeaways</h3>
  <div style="line-height: 1.6; background-color: #eff6ff; border-radius: 0px 8px 8px; padding: 14px 18px; color: #1e293b; border-width: 1px 1px 1px 6px; border-style: solid; border-color: #2563eb;">
  <p style="margin: 0;">Content goes here.</p>
  </div>
  </div>`
              },
              {
                key: 'coAside',
                name: 'Aside (quiet)',
                html: `<div style="width: 90%; background-color: #f8fafc; border-radius: 8px; padding: 14px 18px; margin: 20px auto; color: #475569; border: 1px solid #e2e8f0;">
  <p style="margin: 0;">A lower-emphasis aside for supplementary detail. No accent bar or heading, so it stays quieter than the main callouts.</p>
  </div>`
              },
            ]
          },
          {
            name: 'Cards & stats',
            items: [
              {
                key: 'card1',
                name: 'Card — 1 across',
                html: `<div style="width: 90%; margin: 20px auto;">
  <div style="background-color: #f8fafc; color: #1e293b; border-radius: 8px; padding: 18px; border: 1px solid #cbd5e1;">
  <p style="color: #ffffff; background-color: #1e40af; padding: 10px 18px; border-radius: 8px 8px 0 0; font-size: 1.2em; margin: -18px -18px 12px -18px;">Getting started</p>
  <p style="margin: 0;">A full-width card suits a single highlighted item or an intro block.</p>
  </div>
  </div>`
              },
              {
                key: 'card2',
                name: 'Cards — 2 across',
                html: `<div class="row-fluid" style="width: 90%; margin: 20px auto;">
  <div class="span6">
  <div style="background-color: #f8fafc; color: #1e293b; border-radius: 8px; padding: 18px; margin-bottom: 16px; border: 1px solid #cbd5e1;">
  <p style="color: #ffffff; background-color: #1e3a8a; padding: 10px 18px; border-radius: 8px 8px 0 0; font-size: 1.2em; margin: -18px -18px 12px -18px;">Card one</p>
  <p style="margin: 0;">Body content for the card goes here.</p>
  </div>
  </div>
  <div class="span6">
  <div style="background-color: #f8fafc; color: #1e293b; border-radius: 8px; padding: 18px; margin-bottom: 16px; border: 1px solid #cbd5e1;">
  <p style="color: #ffffff; background-color: #1e40af; padding: 10px 18px; border-radius: 8px 8px 0 0; font-size: 1.2em; margin: -18px -18px 12px -18px;">Card two</p>
  <p style="margin: 0;">Body content for the card goes here.</p>
  </div>
  </div>
  </div>`
              },
              {
                key: 'card3',
                name: 'Cards — 3 across',
                html: `<div class="row-fluid" style="width: 90%; margin: 20px auto;">
  <div class="span4">
  <div style="background-color: #f8fafc; color: #1e293b; border-radius: 8px; padding: 18px; margin-bottom: 16px; border: 1px solid #cbd5e1;">
  <p style="color: #ffffff; background-color: #1e3a8a; padding: 10px 18px; border-radius: 8px 8px 0 0; font-size: 1.2em; margin: -18px -18px 12px -18px;">Card one</p>
  <p style="margin: 0;">Body content for the card goes here.</p>
  </div>
  </div>
  <div class="span4">
  <div style="background-color: #f8fafc; color: #1e293b; border-radius: 8px; padding: 18px; margin-bottom: 16px; border: 1px solid #cbd5e1;">
  <p style="color: #ffffff; background-color: #1e40af; padding: 10px 18px; border-radius: 8px 8px 0 0; font-size: 1.2em; margin: -18px -18px 12px -18px;">Card two</p>
  <p style="margin: 0;">Body content for the card goes here.</p>
  </div>
  </div>
  <div class="span4">
  <div style="background-color: #f8fafc; color: #1e293b; border-radius: 8px; padding: 18px; margin-bottom: 16px; border: 1px solid #cbd5e1;">
  <p style="color: #ffffff; background-color: #1d4ed8; padding: 10px 18px; border-radius: 8px 8px 0 0; font-size: 1.2em; margin: -18px -18px 12px -18px;">Card three</p>
  <p style="margin: 0;">Body content for the card goes here.</p>
  </div>
  </div>
  </div>`
              },
              {
                key: 'bigStat',
                name: 'Big stat',
                html: `<div style="width: 90%; max-width: 420px; margin: 20px auto; background-color: #eff6ff; border-radius: 8px; padding: 20px 24px; text-align: center; color: #1e293b; border: 1px solid #bfdbfe;">
  <p style="margin: 0; font-size: 2.6em; line-height: 1.1; color: #1d4ed8;">73%</p>
  <p style="margin: 6px 0 0 0; font-size: 0.95em; color: #475569;">of surface freshwater is stored in glaciers and ice caps</p>
  </div>`
              },
              {
                key: 'defChip',
                name: 'Definition chip',
                html: `<dl style="width: 90%; margin: 20px auto; background-color: #f8fafc; border-radius: 8px; padding: 14px 18px; color: #1e293b; border: 1px solid #e2e8f0;">
  <dt style="margin: 0 0 8px 0;"><span style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 0.95em; padding: 3px 12px; border-radius: 999px;">porosity</span></dt>
  <dd style="margin: 0;">The proportion of a material’s total volume made up of pore space, expressed as a percentage.</dd>
  </dl>`
              },
            ]
          },
          {
            name: 'Structure & media',
            items: [
              {
                key: 'steps',
                name: 'Numbered steps',
                html: `<div style="width: 90%; margin: 20px auto; color: #1e293b;">
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; width: 26px; height: 26px; border-radius: 50%; background-color: #2563eb; color: #ffffff; text-align: center; line-height: 26px; font-size: 0.85em; vertical-align: middle; margin-right: 10px;">1</span><span style="vertical-align: middle;">Gather materials</span></p>
  <div style="border-left: 2px solid #bfdbfe; margin-left: 12px; padding: 0 0 16px 24px; color: #475569;">Collect the field notebook, hand lens, and sample bags before leaving.</div>
  </div>
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; width: 26px; height: 26px; border-radius: 50%; background-color: #2563eb; color: #ffffff; text-align: center; line-height: 26px; font-size: 0.85em; vertical-align: middle; margin-right: 10px;">2</span><span style="vertical-align: middle;">Record the site</span></p>
  <div style="border-left: 2px solid #bfdbfe; margin-left: 12px; padding: 0 0 16px 24px; color: #475569;">Note the coordinates and describe the surroundings.</div>
  </div>
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; width: 26px; height: 26px; border-radius: 50%; background-color: #2563eb; color: #ffffff; text-align: center; line-height: 26px; font-size: 0.85em; vertical-align: middle; margin-right: 10px;">3</span><span style="vertical-align: middle;">Collect the sample</span></p>
  <div style="margin-left: 12px; padding: 0 0 0 24px; color: #475569;">Bag and label each sample. The final step omits the connector line.</div>
  </div>
  </div>`
              },
              {
                key: 'figure',
                name: 'Figure + caption',
                html: `<figure style="margin: 24px auto; max-width: 640px; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;"><img alt="Bar chart comparing annual rainfall across five cities." src="http://picsum.photos/300/200" style="display: block; width: 100%; height: auto;"/>
  <figcaption style="margin: 0; padding: 10px 14px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 0.9em; color: #475569;"><strong style="color: #1e293b;">Figure 3.</strong> Annual rainfall by city, framed with a caption bar.<span style="display: block; margin-top: 4px; font-size: 0.9em; color: #475569;">Photo by Jane Doe, via Wikimedia Commons, licensed <a href="LICENSE-URL" style="color: #1d4ed8;">CC BY 4.0</a>.</span></figcaption>
  </figure>`
              },
              {
                key: 'pullQuote',
                name: 'Pull quote',
                html: `<div style="width: 85%; background-color: #f1f5f9; border-radius: 8px; padding: 20px 24px; margin: 24px auto;">
  <p style="margin: 0; font-size: 1.15em; font-style: italic; color: #1e293b; line-height: 1.5;">“A well-placed quotation draws the reader’s attention without shouting for it.”</p>
  <p style="margin: 10px 0 0 0; font-size: 0.9em; color: #475569;">— Attribution</p>
  </div>`
              },
              {
                key: 'indexCard',
                name: 'Index card',
                html: `<div style="width: 90%; max-width: 460px; margin: 20px auto; background-color: #fffdf7; border-radius: 6px; padding: 0px 20px 6px; font-family: Georgia, 'Times New Roman', serif; color: #3a3a3a; border: 1px solid #e4dcc4;">
  <h3 style="margin: 0; padding: 14px 0 8px 0; font-size: 1.05em; color: #b03a2e; border-bottom: 2px solid #e0a9a0;">To pack</h3>
  <ul style="list-style: none; margin: 0; padding: 0;">
  <li style="padding: 9px 2px; border-bottom: 1px solid #c3d7e8;">Field notebook</li>
  <li style="padding: 9px 2px; border-bottom: 1px solid #c3d7e8;">Hand lens and ruler</li>
  <li style="padding: 9px 2px; border-bottom: 1px solid #c3d7e8;">Sample bags, labeled</li>
  <li style="padding: 9px 2px; border-bottom: 1px solid #c3d7e8;">Waterproof marker</li>
  </ul>
  </div>`
              },
              {
                key: 'catalogCard',
                name: 'Catalog card',
                html: `<div style="width: 90%; max-width: 480px; margin: 20px auto; background-color: #f4ecd8; border-radius: 3px; padding: 16px 22px 10px; font-family: 'Courier New', Courier, monospace; color: #33302a; font-size: 0.95em; line-height: 1.6; border: 1px solid #cbbf9a;">
  <div style="border-bottom: 1px solid #cbbf9a; padding-bottom: 8px; margin-bottom: 8px;">Field sampling checklist</div>
  <ul style="list-style: none; margin: 0; padding: 0;">
  <li style="padding: 3px 0; padding-left: 1.6em; text-indent: -1.6em;">1. Record the sample location</li>
  <li style="padding: 3px 0; padding-left: 1.6em; text-indent: -1.6em;">2. Note soil color and texture</li>
  <li style="padding: 3px 0; padding-left: 1.6em; text-indent: -1.6em;">3. Photograph each sample in situ before removal</li>
  <li style="padding: 3px 0; padding-left: 1.6em; text-indent: -1.6em;">4. Bag and label</li>
  </ul>
  </div>`
              },
            ]
          },
          {
            name: 'Interactive',
            items: [
              {
                key: 'tabs',
                name: 'Tabs',
                html: `<div class="enhanceable_content tabs">
  <ul>
  <li><a href="#sky-tab-1" style="text-decoration: none; background-color: #1e3a8a; color: #ffffff; border-radius: 6px 6px 0 0;"><span style="font-size: 1em;"><span style="font-size: 1.1em;">Overview</span></span></a></li>
  <li><a href="#sky-tab-2" style="text-decoration: none; background-color: #1e40af; color: #ffffff; border-radius: 6px 6px 0 0;"><span style="font-size: 1em;"><span style="font-size: 1.1em;">Method</span></span></a></li>
  <li><a href="#sky-tab-3" style="text-decoration: none; background-color: #1d4ed8; color: #ffffff; border-radius: 6px 6px 0 0;"><span style="font-size: 1em;"><span style="font-size: 1.1em;">Results</span></span></a></li>
  </ul>
  <div id="sky-tab-1" style="background-color: #f8fafc;">
  <h2>Overview</h2>
  <p style="font-size: 1rem;">Panel content. The 1rem keeps Canvas from shrinking text inside a tab.</p>
  </div>
  <div id="sky-tab-2" style="background-color: #f8fafc;">
  <h2>Method</h2>
  <p style="font-size: 1rem;">Second panel.</p>
  </div>
  <div id="sky-tab-3" style="background-color: #f8fafc;">
  <h2>Results</h2>
  <p style="font-size: 1rem;">Third panel.</p>
  </div>
  </div>`
              },
              {
                key: 'accordion',
                name: 'Accordion',
                html: `<details style="border-radius: 8px; overflow: hidden; margin: 0px 0px 8px; border: 1px solid #cbd5e1;">
  <summary style="cursor: pointer; background-color: #1e3a8a; color: #ffffff; padding: 12px 16px; font-size: 1rem;"><span style="font-size: 1.1em;">Overview</span></summary>
  <div style="padding: 14px 16px; background-color: #f8fafc;">
  <p style="margin: 0; font-size: 1rem;">Content for the first section.</p>
  </div>
  </details>
  <details style="border-radius: 8px; overflow: hidden; margin: 0px 0px 8px; border: 1px solid #cbd5e1;">
  <summary style="cursor: pointer; background-color: #1e40af; color: #ffffff; padding: 12px 16px; font-size: 1rem;"><span style="font-size: 1.1em;">Method</span></summary>
  <div style="padding: 14px 16px; background-color: #f8fafc;">
  <p style="margin: 0; font-size: 1rem;">Second section.</p>
  </div>
  </details>
  <details style="border-radius: 8px; overflow: hidden; margin: 0px; border: 1px solid #cbd5e1;">
  <summary style="cursor: pointer; background-color: #1d4ed8; color: #ffffff; padding: 12px 16px; font-size: 1rem;"><span style="font-size: 1.1em;">Results</span></summary>
  <div style="padding: 14px 16px; background-color: #f8fafc;">
  <p style="margin: 0; font-size: 1rem;">Third section.</p>
  </div>
  </details>`
              },
              {
                key: 'timeline',
                name: 'Interactive timeline',
                html: `<div style="padding: 1rem 0;">
  <div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">Interactive timeline — click "Why it mattered" on any entry</div>
  <div style="background: #ffffff; border-radius: 12px; padding: 22px 20px;">
  <div style="width: 96%; margin: 0 auto; color: #1e293b;">
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 1.1em; padding: 3px 10px; border-radius: 6px; margin-right: 12px; vertical-align: middle;">1803</span><span style="vertical-align: middle;">Dalton's atomic theory</span></p>
  <div style="border-left: 2px solid #bfdbfe; padding: 0 0 18px 20px; color: #475569;">
  <p style="margin: 0;">Matter is made of tiny, indivisible atoms; each element has atoms of a characteristic weight.</p>
  <details style="margin: 8px 0 0 0;">
  <summary style="cursor: pointer; color: #1d4ed8; font-size: 0.9em;">Why it mattered</summary>
  <p style="margin: 6px 0 0 0;">Gave chemistry its first quantitative, testable model and explained the law of definite proportions.</p>
  </details>
  </div>
  </div>
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 1.1em; padding: 3px 10px; border-radius: 6px; margin-right: 12px; vertical-align: middle;">1897</span><span style="vertical-align: middle;">Thomson discovers the electron</span></p>
  <div style="border-left: 2px solid #bfdbfe; padding: 0 0 18px 20px; color: #475569;">
  <p style="margin: 0;">Cathode-ray experiments reveal negative particles inside the atom — the "plum pudding" model.</p>
  <details style="margin: 8px 0 0 0;">
  <summary style="cursor: pointer; color: #1d4ed8; font-size: 0.9em;">Why it mattered</summary>
  <p style="margin: 6px 0 0 0;">Showed the atom is divisible, overturning Dalton's indivisible atom.</p>
  </details>
  </div>
  </div>
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 1.1em; padding: 3px 10px; border-radius: 6px; margin-right: 12px; vertical-align: middle;">1911</span><span style="vertical-align: middle;">Rutherford's nuclear model</span></p>
  <div style="border-left: 2px solid #bfdbfe; padding: 0 0 18px 20px; color: #475569;">
  <p style="margin: 0;">The gold-foil experiment shows nearly all mass and positive charge sit in a tiny, dense nucleus.</p>
  <details style="margin: 8px 0 0 0;">
  <summary style="cursor: pointer; color: #1d4ed8; font-size: 0.9em;">Why it mattered</summary>
  <p style="margin: 6px 0 0 0;">Replaced the plum-pudding picture with a mostly empty atom centered on a nucleus.</p>
  </details>
  </div>
  </div>
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 1.1em; padding: 3px 10px; border-radius: 6px; margin-right: 12px; vertical-align: middle;">1913</span><span style="vertical-align: middle;">Bohr model</span></p>
  <div style="border-left: 2px solid #bfdbfe; padding: 0 0 18px 20px; color: #475569;">
  <p style="margin: 0;">Electrons occupy fixed energy levels, emitting or absorbing light when they jump between them.</p>
  <details style="margin: 8px 0 0 0;">
  <summary style="cursor: pointer; color: #1d4ed8; font-size: 0.9em;">Why it mattered</summary>
  <p style="margin: 6px 0 0 0;">Explained the hydrogen emission spectrum that classical models could not.</p>
  </details>
  </div>
  </div>
  </div>
  </div>
  </div>`
              },
              {
                key: 'kcDialog',
                name: 'KC — dialogs',
                html: `<div style="max-width: 680px; margin: 24px auto; padding: 24px 28px; border-left: 5px solid #1a5276; background: #f0f6fb; border-radius: 8px;">
    <h2 style="margin: 0 0 4px 0; font-size: 1.35rem; color: #1a5276;">Knowledge Check</h2>
    <p style="margin: 0 0 20px 0; color: #2c3e50;">Test yourself! Try to answer the questions below without scrolling back up the page. To see if your answer is correct, click on the button below each question.</p>
    <ol style="padding-left: 24px; margin: 0;">
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 1</p>
            <div id="dialog_for_link1" class="enhanceable_content dialog" title="Answer">
                <p>Answer 1 text</p>
            </div>
            <p style="margin: 0;"><a id="link1" class="Button" style="display: inline-block; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link1">Check Your Answer #1</a></p>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 2</p>
            <div id="dialog_for_link2" class="enhanceable_content dialog" title="Answer">
                <p>Answer 2 text</p>
            </div>
            <p style="margin: 0;"><a id="link2" class="Button" style="display: inline-block; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link2">Check Your Answer #2</a></p>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 3</p>
            <div id="dialog_for_link3" class="enhanceable_content dialog" title="Answer">
                <p>Answer 3 text</p>
            </div>
            <p style="margin: 0;"><a id="link3" class="Button" style="display: inline-block; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link3">Check Your Answer #3</a></p>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 4</p>
            <div id="dialog_for_link4" class="enhanceable_content dialog" title="Answer">
                <p>Answer 4 text</p>
            </div>
            <p style="margin: 0;"><a id="link4" class="Button" style="display: inline-block; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link4">Check Your Answer #4</a></p>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 5</p>
            <div id="dialog_for_link5" class="enhanceable_content dialog" title="Answer">
                <p>Answer 5 text</p>
            </div>
            <p style="margin: 0;"><a id="link5" class="Button" style="display: inline-block; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link5">Check Your Answer #5</a></p>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 6</p>
            <div id="dialog_for_link6" class="enhanceable_content dialog" title="Answer">
                <p>Answer 6 text</p>
            </div>
            <p style="margin: 0;"><a id="link6" class="Button" style="display: inline-block; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link6">Check Your Answer #6</a></p>
        </li>
        <li>
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 7</p>
            <div id="dialog_for_link7" class="enhanceable_content dialog" title="Answer">
                <p>Answer 7 text</p>
            </div>
            <p style="margin: 0;"><a id="link7" class="Button" style="display: inline-block; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link7">Check Your Answer #7</a></p>
        </li>
    </ol>
</div>`
              },
              {
                key: 'kcDetails',
                name: 'KC — details',
                html: `<div style="max-width: 680px; margin: 24px auto; padding: 24px 28px; border-left: 5px solid #1a5276; background: #f0f6fb; border-radius: 8px;">
    <h2 style="margin: 0 0 4px 0; font-size: 1.35rem; color: #1a5276;">Knowledge Check</h2>
    <p style="margin: 0 0 20px 0; color: #2c3e50;">Test yourself! Try to answer the questions below without scrolling back up the page. To reveal the answer, select the button beneath each question.</p>
    <ol style="padding-left: 24px; margin: 0;">
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 1</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #e4eff8; border-left: 4px solid #2980b9; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #2c3e50;">Answer 1 text</p>
                </div>
            </details>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 2</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #e4eff8; border-left: 4px solid #2980b9; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #2c3e50;">Answer 2 text</p>
                </div>
            </details>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 3</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #e4eff8; border-left: 4px solid #2980b9; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #2c3e50;">Answer 3 text</p>
                </div>
            </details>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 4</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #e4eff8; border-left: 4px solid #2980b9; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #2c3e50;">Answer 4 text</p>
                </div>
            </details>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 5</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #e4eff8; border-left: 4px solid #2980b9; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #2c3e50;">Answer 5 text</p>
                </div>
            </details>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 6</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #e4eff8; border-left: 4px solid #2980b9; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #2c3e50;">Answer 6 text</p>
                </div>
            </details>
        </li>
        <li>
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 7</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #1a5276; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #e4eff8; border-left: 4px solid #2980b9; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #2c3e50;">Answer 7 text</p>
                </div>
            </details>
        </li>
    </ol>
</div>`
              },
              {
                key: 'kcMC',
                name: 'KC — multiple choice (dialog)',
                html: `<div style="max-width: 680px; margin: 24px auto; padding: 24px 28px; border-left: 5px solid #1a5276; background: #f0f6fb; border-radius: 8px;">
    <h3 style="margin: 0 0 .6rem; font-size: 1.3rem; color: #1a5276;">Quick Self-Check</h3>
    <ol style="padding-left: 24px; margin: 0;">
        <li style="margin-bottom: 22px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 1</p>
            <div style="max-width: 220px;">
                <ul style="list-style: none; margin: 0; padding: 0;" role="list">
                    <li><a class="btn btn-small" style="display: block; width: 100%; margin-bottom: 0.4rem; text-align: left; background-color: #1a5276; color: #ffffff; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600;" href="#q1_a" aria-haspopup="dialog">A. Option A</a></li>
                    <li><a class="btn btn-small" style="display: block; width: 100%; margin-bottom: 0.4rem; text-align: left; background-color: #1a5276; color: #ffffff; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600;" href="#q1_b" aria-haspopup="dialog">B. Option B</a></li>
                    <li><a class="btn btn-small" style="display: block; width: 100%; text-align: left; background-color: #1a5276; color: #ffffff; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600;" href="#q1_c" aria-haspopup="dialog">C. Option C</a></li>
                </ul>
                <div id="q1_a" class="enhanceable_content dialog" style="display: none; border-left: 6px solid #27ae60; background: #eafaf1; padding: 0.75rem 1rem;" title="Correct">
                    <p><span aria-hidden="true">✔️</span> <strong>Correct.</strong> Correct feedback text</p>
                </div>
                <div id="q1_b" class="enhanceable_content dialog" style="display: none; border-left: 6px solid #c0392b; background: #fdecea; padding: 0.75rem 1rem;" title="Incorrect">
                    <p><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Incorrect feedback text</p>
                </div>
                <div id="q1_c" class="enhanceable_content dialog" style="display: none; border-left: 6px solid #c0392b; background: #fdecea; padding: 0.75rem 1rem;" title="Incorrect">
                    <p><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Incorrect feedback text</p>
                </div>
            </div>
        </li>
        <li>
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 2</p>
            <div style="max-width: 220px;">
                <ul style="list-style: none; margin: 0; padding: 0;" role="list">
                    <li><a class="btn btn-small" style="display: block; width: 100%; margin-bottom: 0.4rem; text-align: left; background-color: #1a5276; color: #ffffff; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600;" href="#q2_a" aria-haspopup="dialog">A. Option A</a></li>
                    <li><a class="btn btn-small" style="display: block; width: 100%; margin-bottom: 0.4rem; text-align: left; background-color: #1a5276; color: #ffffff; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600;" href="#q2_b" aria-haspopup="dialog">B. Option B</a></li>
                    <li><a class="btn btn-small" style="display: block; width: 100%; text-align: left; background-color: #1a5276; color: #ffffff; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600;" href="#q2_c" aria-haspopup="dialog">C. Option C</a></li>
                </ul>
                <div id="q2_a" class="enhanceable_content dialog" style="display: none; border-left: 6px solid #c0392b; background: #fdecea; padding: 0.75rem 1rem;" title="Incorrect">
                    <p><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Incorrect feedback text</p>
                </div>
                <div id="q2_b" class="enhanceable_content dialog" style="display: none; border-left: 6px solid #27ae60; background: #eafaf1; padding: 0.75rem 1rem;" title="Correct">
                    <p><span aria-hidden="true">✔️</span> <strong>Correct.</strong> Correct feedback text</p>
                </div>
                <div id="q2_c" class="enhanceable_content dialog" style="display: none; border-left: 6px solid #c0392b; background: #fdecea; padding: 0.75rem 1rem;" title="Incorrect">
                    <p><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Incorrect feedback text</p>
                </div>
            </div>
        </li>
    </ol>
</div>`
              },
              {
                key: 'kcMCDetails',
                name: 'KC — multiple choice (details)',
                html: `<div style="max-width: 680px; margin: 24px auto; padding: 24px 28px; border-left: 5px solid #1a5276; background: #f0f6fb; border-radius: 8px;">
    <h2 style="margin: 0 0 4px 0; font-size: 1.35rem; color: #1a5276;">Knowledge Check</h2>
    <p style="margin: 0 0 20px 0; color: #2c3e50;">Select any answer choice to see if it's correct. Try comparing the feedback on all the options.</p>
    <ol style="padding-left: 24px; margin: 0;">
        <li style="margin-bottom: 22px;">
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 1</p>
            <details style="margin-bottom: 6px;">
                <summary style="cursor: pointer; padding: 8px 14px; background-color: #ffffff; border: 1px solid #c4d9ed; border-radius: 6px; color: #2c3e50;">A. Option A</summary>
                <div style="margin: 6px 0 0 0; padding: 10px 14px; background-color: #fdecea; border-left: 4px solid #c0392b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #2c3e50;"><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Feedback text for option A.</p>
                </div>
            </details>
            <details style="margin-bottom: 6px;">
                <summary style="cursor: pointer; padding: 8px 14px; background-color: #ffffff; border: 1px solid #c4d9ed; border-radius: 6px; color: #2c3e50;">B. Option B</summary>
                <div style="margin: 6px 0 0 0; padding: 10px 14px; background-color: #eafaf1; border-left: 4px solid #27ae60; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #2c3e50;"><span aria-hidden="true">✔️</span> <strong>Correct.</strong> Feedback text for option B.</p>
                </div>
            </details>
            <details>
                <summary style="cursor: pointer; padding: 8px 14px; background-color: #ffffff; border: 1px solid #c4d9ed; border-radius: 6px; color: #2c3e50;">C. Option C</summary>
                <div style="margin: 6px 0 0 0; padding: 10px 14px; background-color: #fdecea; border-left: 4px solid #c0392b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #2c3e50;"><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Feedback text for option C.</p>
                </div>
            </details>
        </li>
        <li>
            <p style="margin: 0 0 8px 0; color: #2c3e50;">Question text 2</p>
            <details style="margin-bottom: 6px;">
                <summary style="cursor: pointer; padding: 8px 14px; background-color: #ffffff; border: 1px solid #c4d9ed; border-radius: 6px; color: #2c3e50;">A. Option A</summary>
                <div style="margin: 6px 0 0 0; padding: 10px 14px; background-color: #eafaf1; border-left: 4px solid #27ae60; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #2c3e50;"><span aria-hidden="true">✔️</span> <strong>Correct.</strong> Feedback text for option A.</p>
                </div>
            </details>
            <details style="margin-bottom: 6px;">
                <summary style="cursor: pointer; padding: 8px 14px; background-color: #ffffff; border: 1px solid #c4d9ed; border-radius: 6px; color: #2c3e50;">B. Option B</summary>
                <div style="margin: 6px 0 0 0; padding: 10px 14px; background-color: #fdecea; border-left: 4px solid #c0392b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #2c3e50;"><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Feedback text for option B.</p>
                </div>
            </details>
            <details>
                <summary style="cursor: pointer; padding: 8px 14px; background-color: #ffffff; border: 1px solid #c4d9ed; border-radius: 6px; color: #2c3e50;">C. Option C</summary>
                <div style="margin: 6px 0 0 0; padding: 10px 14px; background-color: #fdecea; border-left: 4px solid #c0392b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #2c3e50;"><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Feedback text for option C.</p>
                </div>
            </details>
        </li>
    </ol>
</div>`
              },
            ]
          },
          {
            name: 'Comparison',
            items: [
              {
                key: 'table',
                name: 'Comparison table',
                html: `<div style="width: 100%; margin: 20px 0px; border-radius: 8px; overflow-x: auto; border: 1px solid #cbd5e1;">
  <table style="width: 100%; border-collapse: collapse; font-size: 0.95em; color: #1e293b;">
  <caption style="text-align: left; color: #1e293b; padding: 12px 14px 10px;">Formative vs. summative assessment</caption>
  <thead>
  <tr>
  <th scope="col" style="background-color: #1e3a8a; color: #ffffff; text-align: left; padding: 10px 14px;">Criterion</th>
  <th scope="col" style="background-color: #1e40af; color: #ffffff; text-align: left; padding: 10px 14px;">Formative</th>
  <th scope="col" style="background-color: #1d4ed8; color: #ffffff; text-align: left; padding: 10px 14px;">Summative</th>
  </tr>
  </thead>
  <tbody>
  <tr>
  <th scope="row" style="text-align: left; padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">Purpose</th>
  <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">Monitor learning in progress</td>
  <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">Evaluate against a standard</td>
  </tr>
  <tr>
  <th scope="row" style="text-align: left; padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">Timing</th>
  <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">Ongoing, during instruction</td>
  <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">End of a unit or course</td>
  </tr>
  <tr>
  <th scope="row" style="text-align: left; padding: 10px 14px;">Stakes</th>
  <td style="padding: 10px 14px;">Low; often ungraded</td>
  <td style="padding: 10px 14px;">High; counts toward the grade</td>
  </tr>
  </tbody>
  </table>
  </div>`
              },
              {
                key: 'myth',
                name: 'Myth vs. reality',
                html: `<div style="width: 90%; margin: 20px auto; border-radius: 8px; overflow: hidden; color: #1e293b; border: 1px solid #cbd5e1;">
  <div style="background-color: #f8fafc; padding: 12px 18px; border-bottom: 1px solid #e2e8f0;"><span style="display: inline-block; min-width: 68px; text-align: center; background-color: #b91c1c; color: #ffffff; font-size: 1.1em; padding: 2px 10px; border-radius: 999px;">MYTH</span><span style="margin-left: 8px;">You only use 10% of your brain.</span></div>
  <div style="background-color: #f8fafc; padding: 12px 18px;"><span style="display: inline-block; min-width: 68px; text-align: center; background-color: #15803d; color: #ffffff; font-size: 1.1em; padding: 2px 10px; border-radius: 999px;">REALITY</span><span style="margin-left: 8px;">Nearly all of the brain is active over the course of a day, even during sleep.</span></div>
  </div>`
              },
            ]
          },
        ]
      },
      {
        group: 'Warm Theme',
        snippets: [
          {
            name: 'Headings & dividers',
            items: [
              {
                key: 'secHeader',
                name: 'Section header',
                html: `<h3><span style="color: #c2410c; font-size: 12px; font-family: inherit;">MODULE 3 · LESSON 2</span></h3>
  <h2 style="margin: 0 0 8px 0; font-size: 24px; color: #292524;">Section title</h2>
  <hr style="border-width: 4px 0px 0px; border-style: solid none none; border-color: #ea580c currentcolor currentcolor; width: 52px; border-radius: 2px; margin: 0px 0px 16px;"/>`
              },
              {
                key: 'divFade',
                name: 'Divider — gradient fade',
                html: `<hr style="border: 0; height: 3px; border-radius: 2px; background-image: linear-gradient(to right, #9a3412, rgba(154, 52, 18, 0)); margin: 28px 0;"/>`
              },
              {
                key: 'divTwo',
                name: 'Divider — two-tone',
                html: `<hr style="border: 0; height: 3px; border-radius: 2px; background-image: linear-gradient(to right, #9a3412, #ea580c 45%, rgba(234, 88, 12, 0)); margin: 28px 0;"/>`
              },
            ]
          },
          {
            name: 'Callouts',
            items: [
              {
                key: 'coObj',
                name: 'Learning Objectives',
                html: `<div style="width: 90%; border-left: 4px solid #78716c; background-color: #fafaf9; border-radius: 8px; padding: 16px 20px; margin: 20px auto;">
  <h3 style="color: #57534e; font-size: 1.1em; margin: 0 0 8px 0;">Learning Objectives</h3>
  <p>Content goes here.</p>
  </div>`
              },
              {
                key: 'coKey',
                name: 'Key Takeaways',
                html: `<div style="width: 90%; border-left: 4px solid #f59e0b; background-color: #fffbeb; border-radius: 8px; padding: 16px 20px; margin: 20px auto;">
  <h3 style="color: #b45309; font-size: 1.1em; margin: 0 0 8px 0;">Key Takeaways</h3>
  <p>Content goes here.</p>
  </div>`
              },
              {
                key: 'coEx',
                name: 'Examples',
                html: `<div style="width: 90%; border-left: 4px solid #ea580c; background-color: #fff7ed; border-radius: 8px; padding: 16px 20px; margin: 20px auto;">
  <h3 style="color: #c2410c; font-size: 1.1em; margin: 0 0 8px 0;">Examples</h3>
  <p>Content goes here.</p>
  </div>`
              },
              {
                key: 'coExer',
                name: 'Exercises',
                html: `<div style="width: 90%; border-left: 4px solid #ef4444; background-color: #fef2f2; border-radius: 8px; padding: 16px 20px; margin: 20px auto;">
  <h3 style="color: #b91c1c; font-size: 1.1em; margin: 0 0 8px 0;">Exercises</h3>
  <p>Content goes here.</p>
  </div>`
              },
              {
                key: 'coNote',
                name: 'Notes',
                html: `<div style="width: 90%; border-left: 4px solid #e11d48; background-color: #fff1f2; border-radius: 8px; padding: 16px 20px; margin: 20px auto;">
  <h3 style="color: #9f1239; font-size: 1.1em; margin: 0 0 8px 0;">Notes</h3>
  <p>Content goes here.</p>
  </div>`
              },
              {
                key: 'coFolder',
                name: 'Folder-tab callout',
                html: `<div style="width: 90%; margin: 20px auto; line-height: 0;">
  <h3 style="display: inline-block; margin: 0px; line-height: 1.25; background-color: #fff7ed; color: #9a3412; font-size: 0.95em; padding: 7px 18px; border-width: 1px 1px 0px; border-style: solid solid none; border-color: #ea580c #ea580c currentcolor; border-radius: 8px 8px 0px 0px; border-left: 6px solid #ea580c;">Key Takeaways</h3>
  <div style="line-height: 1.6; background-color: #fff7ed; border-radius: 0px 8px 8px; padding: 14px 18px; color: #292524; border-width: 1px 1px 1px 6px; border-style: solid; border-color: #ea580c;">
  <p style="margin: 0;">Content goes here.</p>
  </div>
  </div>`
              },
              {
                key: 'coAside',
                name: 'Aside (quiet)',
                html: `<div style="width: 90%; background-color: #fafaf9; border-radius: 8px; padding: 14px 18px; margin: 20px auto; color: #57534e; border: 1px solid #e7e5e4;">
  <p style="margin: 0;">A lower-emphasis aside for supplementary detail. No accent bar or heading, so it stays quieter than the main callouts.</p>
  </div>`
              },
            ]
          },
          {
            name: 'Cards & stats',
            items: [
              {
                key: 'card1',
                name: 'Card — 1 across',
                html: `<div style="width: 90%; margin: 20px auto;">
  <div style="background-color: #fafaf9; color: #292524; border-radius: 8px; padding: 18px; border: 1px solid #d6d3d1;">
  <p style="color: #ffffff; background-color: #9a3412; padding: 10px 18px; border-radius: 8px 8px 0 0; font-size: 1.2em; margin: -18px -18px 12px -18px;">Getting started</p>
  <p style="margin: 0;">A full-width card suits a single highlighted item or an intro block.</p>
  </div>
  </div>`
              },
              {
                key: 'card2',
                name: 'Cards — 2 across',
                html: `<div class="row-fluid" style="width: 90%; margin: 20px auto;">
  <div class="span6">
  <div style="background-color: #fafaf9; color: #292524; border-radius: 8px; padding: 18px; margin-bottom: 16px; border: 1px solid #d6d3d1;">
  <p style="color: #ffffff; background-color: #7c2d12; padding: 10px 18px; border-radius: 8px 8px 0 0; font-size: 1.2em; margin: -18px -18px 12px -18px;">Card one</p>
  <p style="margin: 0;">Body content for the card goes here.</p>
  </div>
  </div>
  <div class="span6">
  <div style="background-color: #fafaf9; color: #292524; border-radius: 8px; padding: 18px; margin-bottom: 16px; border: 1px solid #d6d3d1;">
  <p style="color: #ffffff; background-color: #9a3412; padding: 10px 18px; border-radius: 8px 8px 0 0; font-size: 1.2em; margin: -18px -18px 12px -18px;">Card two</p>
  <p style="margin: 0;">Body content for the card goes here.</p>
  </div>
  </div>
  </div>`
              },
              {
                key: 'card3',
                name: 'Cards — 3 across',
                html: `<div class="row-fluid" style="width: 90%; margin: 20px auto;">
  <div class="span4">
  <div style="background-color: #fafaf9; color: #292524; border-radius: 8px; padding: 18px; margin-bottom: 16px; border: 1px solid #d6d3d1;">
  <p style="color: #ffffff; background-color: #7c2d12; padding: 10px 18px; border-radius: 8px 8px 0 0; font-size: 1.2em; margin: -18px -18px 12px -18px;">Card one</p>
  <p style="margin: 0;">Body content for the card goes here.</p>
  </div>
  </div>
  <div class="span4">
  <div style="background-color: #fafaf9; color: #292524; border-radius: 8px; padding: 18px; margin-bottom: 16px; border: 1px solid #d6d3d1;">
  <p style="color: #ffffff; background-color: #9a3412; padding: 10px 18px; border-radius: 8px 8px 0 0; font-size: 1.2em; margin: -18px -18px 12px -18px;">Card two</p>
  <p style="margin: 0;">Body content for the card goes here.</p>
  </div>
  </div>
  <div class="span4">
  <div style="background-color: #fafaf9; color: #292524; border-radius: 8px; padding: 18px; margin-bottom: 16px; border: 1px solid #d6d3d1;">
  <p style="color: #ffffff; background-color: #c2410c; padding: 10px 18px; border-radius: 8px 8px 0 0; font-size: 1.2em; margin: -18px -18px 12px -18px;">Card three</p>
  <p style="margin: 0;">Body content for the card goes here.</p>
  </div>
  </div>
  </div>`
              },
              {
                key: 'bigStat',
                name: 'Big stat',
                html: `<div style="width: 90%; max-width: 420px; margin: 20px auto; background-color: #fff7ed; border-radius: 8px; padding: 20px 24px; text-align: center; color: #292524; border: 1px solid #fed7aa;">
  <p style="margin: 0; font-size: 2.6em; line-height: 1.1; color: #9a3412;">73%</p>
  <p style="margin: 6px 0 0 0; font-size: 0.95em; color: #57534e;">of surface freshwater is stored in glaciers and ice caps</p>
  </div>`
              },
              {
                key: 'defChip',
                name: 'Definition chip',
                html: `<dl style="width: 90%; margin: 20px auto; background-color: #fafaf9; border-radius: 8px; padding: 14px 18px; color: #292524; border: 1px solid #e7e5e4;">
  <dt style="margin: 0 0 8px 0;"><span style="display: inline-block; background-color: #c2410c; color: #ffffff; font-size: 0.95em; padding: 3px 12px; border-radius: 999px;">porosity</span></dt>
  <dd style="margin: 0;">The proportion of a material’s total volume made up of pore space, expressed as a percentage.</dd>
  </dl>`
              },
            ]
          },
          {
            name: 'Structure & media',
            items: [
              {
                key: 'steps',
                name: 'Numbered steps',
                html: `<div style="width: 90%; margin: 20px auto; color: #292524;">
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; width: 26px; height: 26px; border-radius: 50%; background-color: #c2410c; color: #ffffff; text-align: center; line-height: 26px; font-size: 0.85em; vertical-align: middle; margin-right: 10px;">1</span><span style="vertical-align: middle;">Gather materials</span></p>
  <div style="border-left: 2px solid #fed7aa; margin-left: 12px; padding: 0 0 16px 24px; color: #57534e;">Collect the field notebook, hand lens, and sample bags before leaving.</div>
  </div>
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; width: 26px; height: 26px; border-radius: 50%; background-color: #c2410c; color: #ffffff; text-align: center; line-height: 26px; font-size: 0.85em; vertical-align: middle; margin-right: 10px;">2</span><span style="vertical-align: middle;">Record the site</span></p>
  <div style="border-left: 2px solid #fed7aa; margin-left: 12px; padding: 0 0 16px 24px; color: #57534e;">Note the coordinates and describe the surroundings.</div>
  </div>
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; width: 26px; height: 26px; border-radius: 50%; background-color: #c2410c; color: #ffffff; text-align: center; line-height: 26px; font-size: 0.85em; vertical-align: middle; margin-right: 10px;">3</span><span style="vertical-align: middle;">Collect the sample</span></p>
  <div style="margin-left: 12px; padding: 0 0 0 24px; color: #57534e;">Bag and label each sample. The final step omits the connector line.</div>
  </div>
  </div>`
              },
              {
                key: 'figure',
                name: 'Figure + caption',
                html: `<figure style="margin: 24px auto; max-width: 640px; border-radius: 8px; overflow: hidden; border: 1px solid #e7e5e4;"><img alt="Bar chart comparing annual rainfall across five cities." src="http://picsum.photos/300/200" style="display: block; width: 100%; height: auto;"/>
  <figcaption style="margin: 0; padding: 10px 14px; background-color: #fafaf9; border-top: 1px solid #e7e5e4; font-size: 0.9em; color: #57534e;"><strong style="color: #292524;">Figure 3.</strong> Annual rainfall by city, framed with a caption bar.<span style="display: block; margin-top: 4px; font-size: 0.9em; color: #57534e;">Photo by Jane Doe, via Wikimedia Commons, licensed <a href="LICENSE-URL" style="color: #9a3412;">CC BY 4.0</a>.</span></figcaption>
  </figure>`
              },
              {
                key: 'pullQuote',
                name: 'Pull quote',
                html: `<div style="width: 85%; background-color: #f5f5f4; border-radius: 8px; padding: 20px 24px; margin: 24px auto;">
  <p style="margin: 0; font-size: 1.15em; font-style: italic; color: #292524; line-height: 1.5;">“A well-placed quotation draws the reader’s attention without shouting for it.”</p>
  <p style="margin: 10px 0 0 0; font-size: 0.9em; color: #57534e;">— Attribution</p>
  </div>`
              },
              {
                key: 'indexCard',
                name: 'Index card',
                html: `<div style="width: 90%; max-width: 460px; margin: 20px auto; background-color: #fffdf7; border-radius: 6px; padding: 0px 20px 6px; font-family: Georgia, 'Times New Roman', serif; color: #3a3a3a; border: 1px solid #e4dcc4;">
  <h3 style="margin: 0; padding: 14px 0 8px 0; font-size: 1.05em; color: #b03a2e; border-bottom: 2px solid #e0a9a0;">To pack</h3>
  <ul style="list-style: none; margin: 0; padding: 0;">
  <li style="padding: 9px 2px; border-bottom: 1px solid #ece3d2;">Field notebook</li>
  <li style="padding: 9px 2px; border-bottom: 1px solid #ece3d2;">Hand lens and ruler</li>
  <li style="padding: 9px 2px; border-bottom: 1px solid #ece3d2;">Sample bags, labeled</li>
  <li style="padding: 9px 2px; border-bottom: 1px solid #ece3d2;">Waterproof marker</li>
  </ul>
  </div>`
              },
              {
                key: 'catalogCard',
                name: 'Catalog card',
                html: `<div style="width: 90%; max-width: 480px; margin: 20px auto; background-color: #f4ecd8; border-radius: 3px; padding: 16px 22px 10px; font-family: 'Courier New', Courier, monospace; color: #33302a; font-size: 0.95em; line-height: 1.6; border: 1px solid #cbbf9a;">
  <div style="border-bottom: 1px solid #cbbf9a; padding-bottom: 8px; margin-bottom: 8px;">Field sampling checklist</div>
  <ul style="list-style: none; margin: 0; padding: 0;">
  <li style="padding: 3px 0; padding-left: 1.6em; text-indent: -1.6em;">1. Record the sample location</li>
  <li style="padding: 3px 0; padding-left: 1.6em; text-indent: -1.6em;">2. Note soil color and texture</li>
  <li style="padding: 3px 0; padding-left: 1.6em; text-indent: -1.6em;">3. Photograph each sample in situ before removal</li>
  <li style="padding: 3px 0; padding-left: 1.6em; text-indent: -1.6em;">4. Bag and label</li>
  </ul>
  </div>`
              },
            ]
          },
          {
            name: 'Interactive',
            items: [
              {
                key: 'tabs',
                name: 'Tabs',
                html: `<div class="enhanceable_content tabs">
  <ul>
  <li><a href="#clay-tab-1" style="text-decoration: none; background-color: #7c2d12; color: #ffffff; border-radius: 6px 6px 0 0;"><span style="font-size: 1em;"><span style="font-size: 1.1em;">Overview</span></span></a></li>
  <li><a href="#clay-tab-2" style="text-decoration: none; background-color: #9a3412; color: #ffffff; border-radius: 6px 6px 0 0;"><span style="font-size: 1em;"><span style="font-size: 1.1em;">Method</span></span></a></li>
  <li><a href="#clay-tab-3" style="text-decoration: none; background-color: #c2410c; color: #ffffff; border-radius: 6px 6px 0 0;"><span style="font-size: 1em;"><span style="font-size: 1.1em;">Results</span></span></a></li>
  </ul>
  <div id="clay-tab-1" style="background-color: #fafaf9;">
  <h2>Overview</h2>
  <p style="font-size: 1rem;">Panel content. The 1rem keeps Canvas from shrinking text inside a tab.</p>
  </div>
  <div id="clay-tab-2" style="background-color: #fafaf9;">
  <h2>Method</h2>
  <p style="font-size: 1rem;">Second panel.</p>
  </div>
  <div id="clay-tab-3" style="background-color: #fafaf9;">
  <h2>Results</h2>
  <p style="font-size: 1rem;">Third panel.</p>
  </div>
  </div>`
              },
              {
                key: 'accordion',
                name: 'Accordion',
                html: `<details style="border-radius: 8px; overflow: hidden; margin: 0px 0px 8px; border: 1px solid #d6d3d1;">
  <summary style="cursor: pointer; background-color: #7c2d12; color: #ffffff; padding: 12px 16px; font-size: 1rem;"><span style="font-size: 1.1em;">Overview</span></summary>
  <div style="padding: 14px 16px; background-color: #fafaf9;">
  <p style="margin: 0; font-size: 1rem;">Content for the first section.</p>
  </div>
  </details>
  <details style="border-radius: 8px; overflow: hidden; margin: 0px 0px 8px; border: 1px solid #d6d3d1;">
  <summary style="cursor: pointer; background-color: #9a3412; color: #ffffff; padding: 12px 16px; font-size: 1rem;"><span style="font-size: 1.1em;">Method</span></summary>
  <div style="padding: 14px 16px; background-color: #fafaf9;">
  <p style="margin: 0; font-size: 1rem;">Second section.</p>
  </div>
  </details>
  <details style="border-radius: 8px; overflow: hidden; margin: 0px; border: 1px solid #d6d3d1;">
  <summary style="cursor: pointer; background-color: #c2410c; color: #ffffff; padding: 12px 16px; font-size: 1rem;"><span style="font-size: 1.1em;">Results</span></summary>
  <div style="padding: 14px 16px; background-color: #fafaf9;">
  <p style="margin: 0; font-size: 1rem;">Third section.</p>
  </div>
  </details>`
              },
              {
                key: 'timeline',
                name: 'Interactive timeline',
                html: `<div style="padding: 1rem 0;">
  <div style="font-size: 12px; color: #78716c; margin-bottom: 8px;">Interactive timeline — click "Why it mattered" on any entry</div>
  <div style="background: #ffffff; border-radius: 12px; padding: 22px 20px;">
  <div style="width: 96%; margin: 0 auto; color: #292524;">
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; background-color: #9a3412; color: #ffffff; font-size: 1.1em; padding: 3px 10px; border-radius: 6px; margin-right: 12px; vertical-align: middle;">1803</span><span style="vertical-align: middle;">Dalton's atomic theory</span></p>
  <div style="border-left: 2px solid #fed7aa; padding: 0 0 18px 20px; color: #57534e;">
  <p style="margin: 0;">Matter is made of tiny, indivisible atoms; each element has atoms of a characteristic weight.</p>
  <details style="margin: 8px 0 0 0;">
  <summary style="cursor: pointer; color: #9a3412; font-size: 0.9em;">Why it mattered</summary>
  <p style="margin: 6px 0 0 0;">Gave chemistry its first quantitative, testable model and explained the law of definite proportions.</p>
  </details>
  </div>
  </div>
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; background-color: #9a3412; color: #ffffff; font-size: 1.1em; padding: 3px 10px; border-radius: 6px; margin-right: 12px; vertical-align: middle;">1897</span><span style="vertical-align: middle;">Thomson discovers the electron</span></p>
  <div style="border-left: 2px solid #fed7aa; padding: 0 0 18px 20px; color: #57534e;">
  <p style="margin: 0;">Cathode-ray experiments reveal negative particles inside the atom — the "plum pudding" model.</p>
  <details style="margin: 8px 0 0 0;">
  <summary style="cursor: pointer; color: #9a3412; font-size: 0.9em;">Why it mattered</summary>
  <p style="margin: 6px 0 0 0;">Showed the atom is divisible, overturning Dalton's indivisible atom.</p>
  </details>
  </div>
  </div>
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; background-color: #9a3412; color: #ffffff; font-size: 1.1em; padding: 3px 10px; border-radius: 6px; margin-right: 12px; vertical-align: middle;">1911</span><span style="vertical-align: middle;">Rutherford's nuclear model</span></p>
  <div style="border-left: 2px solid #fed7aa; padding: 0 0 18px 20px; color: #57534e;">
  <p style="margin: 0;">The gold-foil experiment shows nearly all mass and positive charge sit in a tiny, dense nucleus.</p>
  <details style="margin: 8px 0 0 0;">
  <summary style="cursor: pointer; color: #9a3412; font-size: 0.9em;">Why it mattered</summary>
  <p style="margin: 6px 0 0 0;">Replaced the plum-pudding picture with a mostly empty atom centered on a nucleus.</p>
  </details>
  </div>
  </div>
  <div>
  <p style="margin: 0 0 4px 0;"><span style="display: inline-block; background-color: #9a3412; color: #ffffff; font-size: 1.1em; padding: 3px 10px; border-radius: 6px; margin-right: 12px; vertical-align: middle;">1913</span><span style="vertical-align: middle;">Bohr model</span></p>
  <div style="border-left: 2px solid #fed7aa; padding: 0 0 18px 20px; color: #57534e;">
  <p style="margin: 0;">Electrons occupy fixed energy levels, emitting or absorbing light when they jump between them.</p>
  <details style="margin: 8px 0 0 0;">
  <summary style="cursor: pointer; color: #9a3412; font-size: 0.9em;">Why it mattered</summary>
  <p style="margin: 6px 0 0 0;">Explained the hydrogen emission spectrum that classical models could not.</p>
  </details>
  </div>
  </div>
  </div>
  </div>
  </div>`
              },
              {
                key: 'kcDialog',
                name: 'KC — dialogs',
                html: `<div style="max-width: 680px; margin: 24px auto; padding: 24px 28px; border-left: 5px solid #7c3a1a; background: #fdf6f1; border-radius: 8px;">
    <h2 style="margin: 0 0 4px 0; font-size: 1.35rem; color: #7c3a1a;">Knowledge Check</h2>
    <p style="margin: 0 0 20px 0; color: #3e2a1e;">Test yourself! Try to answer the questions below without scrolling back up the page. To see if your answer is correct, click on the button below each question.</p>
    <ol style="padding-left: 24px; margin: 0;">
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 1</p>
            <div id="dialog_for_link1" class="enhanceable_content dialog" title="Answer">
                <p>Answer 1 text</p>
            </div>
            <p style="margin: 0;"><a id="link1" class="Button" style="display: inline-block; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link1">Check Your Answer #1</a></p>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 2</p>
            <div id="dialog_for_link2" class="enhanceable_content dialog" title="Answer">
                <p>Answer 2 text</p>
            </div>
            <p style="margin: 0;"><a id="link2" class="Button" style="display: inline-block; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link2">Check Your Answer #2</a></p>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 3</p>
            <div id="dialog_for_link3" class="enhanceable_content dialog" title="Answer">
                <p>Answer 3 text</p>
            </div>
            <p style="margin: 0;"><a id="link3" class="Button" style="display: inline-block; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link3">Check Your Answer #3</a></p>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 4</p>
            <div id="dialog_for_link4" class="enhanceable_content dialog" title="Answer">
                <p>Answer 4 text</p>
            </div>
            <p style="margin: 0;"><a id="link4" class="Button" style="display: inline-block; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link4">Check Your Answer #4</a></p>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 5</p>
            <div id="dialog_for_link5" class="enhanceable_content dialog" title="Answer">
                <p>Answer 5 text</p>
            </div>
            <p style="margin: 0;"><a id="link5" class="Button" style="display: inline-block; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link5">Check Your Answer #5</a></p>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 6</p>
            <div id="dialog_for_link6" class="enhanceable_content dialog" title="Answer">
                <p>Answer 6 text</p>
            </div>
            <p style="margin: 0;"><a id="link6" class="Button" style="display: inline-block; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link6">Check Your Answer #6</a></p>
        </li>
        <li>
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 7</p>
            <div id="dialog_for_link7" class="enhanceable_content dialog" title="Answer">
                <p>Answer 7 text</p>
            </div>
            <p style="margin: 0;"><a id="link7" class="Button" style="display: inline-block; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600;" href="#dialog_for_link7">Check Your Answer #7</a></p>
        </li>
    </ol>
</div>`
              },
              {
                key: 'kcDetails',
                name: 'KC — details',
                html: `<div style="max-width: 680px; margin: 24px auto; padding: 24px 28px; border-left: 5px solid #7c3a1a; background: #fdf6f1; border-radius: 8px;">
    <h2 style="margin: 0 0 4px 0; font-size: 1.35rem; color: #7c3a1a;">Knowledge Check</h2>
    <p style="margin: 0 0 20px 0; color: #3e2a1e;">Test yourself! Try to answer the questions below without scrolling back up the page. To reveal the answer, select the button beneath each question.</p>
    <ol style="padding-left: 24px; margin: 0;">
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 1</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #f8ebe2; border-left: 4px solid #c0612b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #3e2a1e;">Answer 1 text</p>
                </div>
            </details>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 2</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #f8ebe2; border-left: 4px solid #c0612b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #3e2a1e;">Answer 2 text</p>
                </div>
            </details>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 3</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #f8ebe2; border-left: 4px solid #c0612b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #3e2a1e;">Answer 3 text</p>
                </div>
            </details>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 4</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #f8ebe2; border-left: 4px solid #c0612b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #3e2a1e;">Answer 4 text</p>
                </div>
            </details>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 5</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #f8ebe2; border-left: 4px solid #c0612b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #3e2a1e;">Answer 5 text</p>
                </div>
            </details>
        </li>
        <li style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 6</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #f8ebe2; border-left: 4px solid #c0612b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #3e2a1e;">Answer 6 text</p>
                </div>
            </details>
        </li>
        <li>
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 7</p>
            <details>
                <summary style="cursor: pointer; display: inline-block; list-style: none; background-color: #7c3a1a; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 600;">Check your answer</summary>
                <div style="margin: 10px 0 0 0; padding: 12px 16px; background-color: #f8ebe2; border-left: 4px solid #c0612b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #3e2a1e;">Answer 7 text</p>
                </div>
            </details>
        </li>
    </ol>
</div>`
              },
              {
                key: 'kcMC',
                name: 'KC — multiple choice (dialog)',
                html: `<div style="max-width: 680px; margin: 24px auto; padding: 24px 28px; border-left: 5px solid #7c3a1a; background: #fdf6f1; border-radius: 8px;">
    <h3 style="margin: 0 0 .6rem; font-size: 1.3rem; color: #7c3a1a;">Quick Self-Check</h3>
    <ol style="padding-left: 24px; margin: 0;">
        <li style="margin-bottom: 22px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 1</p>
            <div style="max-width: 220px;">
                <ul style="list-style: none; margin: 0; padding: 0;" role="list">
                    <li><a class="btn btn-small" style="display: block; width: 100%; margin-bottom: 0.4rem; text-align: left; background-color: #7c3a1a; color: #ffffff; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600;" href="#q1_a" aria-haspopup="dialog">A. Option A</a></li>
                    <li><a class="btn btn-small" style="display: block; width: 100%; margin-bottom: 0.4rem; text-align: left; background-color: #7c3a1a; color: #ffffff; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600;" href="#q1_b" aria-haspopup="dialog">B. Option B</a></li>
                    <li><a class="btn btn-small" style="display: block; width: 100%; text-align: left; background-color: #7c3a1a; color: #ffffff; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600;" href="#q1_c" aria-haspopup="dialog">C. Option C</a></li>
                </ul>
                <div id="q1_a" class="enhanceable_content dialog" style="display: none; border-left: 6px solid #27ae60; background: #eafaf1; padding: 0.75rem 1rem;" title="Correct">
                    <p><span aria-hidden="true">✔️</span> <strong>Correct.</strong> Correct feedback text</p>
                </div>
                <div id="q1_b" class="enhanceable_content dialog" style="display: none; border-left: 6px solid #c0392b; background: #fdecea; padding: 0.75rem 1rem;" title="Incorrect">
                    <p><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Incorrect feedback text</p>
                </div>
                <div id="q1_c" class="enhanceable_content dialog" style="display: none; border-left: 6px solid #c0392b; background: #fdecea; padding: 0.75rem 1rem;" title="Incorrect">
                    <p><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Incorrect feedback text</p>
                </div>
            </div>
        </li>
        <li>
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 2</p>
            <div style="max-width: 220px;">
                <ul style="list-style: none; margin: 0; padding: 0;" role="list">
                    <li><a class="btn btn-small" style="display: block; width: 100%; margin-bottom: 0.4rem; text-align: left; background-color: #7c3a1a; color: #ffffff; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600;" href="#q2_a" aria-haspopup="dialog">A. Option A</a></li>
                    <li><a class="btn btn-small" style="display: block; width: 100%; margin-bottom: 0.4rem; text-align: left; background-color: #7c3a1a; color: #ffffff; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600;" href="#q2_b" aria-haspopup="dialog">B. Option B</a></li>
                    <li><a class="btn btn-small" style="display: block; width: 100%; text-align: left; background-color: #7c3a1a; color: #ffffff; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600;" href="#q2_c" aria-haspopup="dialog">C. Option C</a></li>
                </ul>
                <div id="q2_a" class="enhanceable_content dialog" style="display: none; border-left: 6px solid #c0392b; background: #fdecea; padding: 0.75rem 1rem;" title="Incorrect">
                    <p><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Incorrect feedback text</p>
                </div>
                <div id="q2_b" class="enhanceable_content dialog" style="display: none; border-left: 6px solid #27ae60; background: #eafaf1; padding: 0.75rem 1rem;" title="Correct">
                    <p><span aria-hidden="true">✔️</span> <strong>Correct.</strong> Correct feedback text</p>
                </div>
                <div id="q2_c" class="enhanceable_content dialog" style="display: none; border-left: 6px solid #c0392b; background: #fdecea; padding: 0.75rem 1rem;" title="Incorrect">
                    <p><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Incorrect feedback text</p>
                </div>
            </div>
        </li>
    </ol>
</div>`
              },
              {
                key: 'kcMCDetails',
                name: 'KC — multiple choice (details)',
                html: `<div style="max-width: 680px; margin: 24px auto; padding: 24px 28px; border-left: 5px solid #7c3a1a; background: #fdf6f1; border-radius: 8px;">
    <h2 style="margin: 0 0 4px 0; font-size: 1.35rem; color: #7c3a1a;">Knowledge Check</h2>
    <p style="margin: 0 0 20px 0; color: #3e2a1e;">Select any answer choice to see if it's correct. Try comparing the feedback on all the options.</p>
    <ol style="padding-left: 24px; margin: 0;">
        <li style="margin-bottom: 22px;">
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 1</p>
            <details style="margin-bottom: 6px;">
                <summary style="cursor: pointer; padding: 8px 14px; background-color: #ffffff; border: 1px solid #e8d5c4; border-radius: 6px; color: #3e2a1e;">A. Option A</summary>
                <div style="margin: 6px 0 0 0; padding: 10px 14px; background-color: #fdecea; border-left: 4px solid #c0392b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #3e2a1e;"><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Feedback text for option A.</p>
                </div>
            </details>
            <details style="margin-bottom: 6px;">
                <summary style="cursor: pointer; padding: 8px 14px; background-color: #ffffff; border: 1px solid #e8d5c4; border-radius: 6px; color: #3e2a1e;">B. Option B</summary>
                <div style="margin: 6px 0 0 0; padding: 10px 14px; background-color: #eafaf1; border-left: 4px solid #27ae60; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #3e2a1e;"><span aria-hidden="true">✔️</span> <strong>Correct.</strong> Feedback text for option B.</p>
                </div>
            </details>
            <details>
                <summary style="cursor: pointer; padding: 8px 14px; background-color: #ffffff; border: 1px solid #e8d5c4; border-radius: 6px; color: #3e2a1e;">C. Option C</summary>
                <div style="margin: 6px 0 0 0; padding: 10px 14px; background-color: #fdecea; border-left: 4px solid #c0392b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #3e2a1e;"><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Feedback text for option C.</p>
                </div>
            </details>
        </li>
        <li>
            <p style="margin: 0 0 8px 0; color: #3e2a1e;">Question text 2</p>
            <details style="margin-bottom: 6px;">
                <summary style="cursor: pointer; padding: 8px 14px; background-color: #ffffff; border: 1px solid #e8d5c4; border-radius: 6px; color: #3e2a1e;">A. Option A</summary>
                <div style="margin: 6px 0 0 0; padding: 10px 14px; background-color: #eafaf1; border-left: 4px solid #27ae60; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #3e2a1e;"><span aria-hidden="true">✔️</span> <strong>Correct.</strong> Feedback text for option A.</p>
                </div>
            </details>
            <details style="margin-bottom: 6px;">
                <summary style="cursor: pointer; padding: 8px 14px; background-color: #ffffff; border: 1px solid #e8d5c4; border-radius: 6px; color: #3e2a1e;">B. Option B</summary>
                <div style="margin: 6px 0 0 0; padding: 10px 14px; background-color: #fdecea; border-left: 4px solid #c0392b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #3e2a1e;"><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Feedback text for option B.</p>
                </div>
            </details>
            <details>
                <summary style="cursor: pointer; padding: 8px 14px; background-color: #ffffff; border: 1px solid #e8d5c4; border-radius: 6px; color: #3e2a1e;">C. Option C</summary>
                <div style="margin: 6px 0 0 0; padding: 10px 14px; background-color: #fdecea; border-left: 4px solid #c0392b; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #3e2a1e;"><span aria-hidden="true">✖️</span> <strong>Incorrect.</strong> Feedback text for option C.</p>
                </div>
            </details>
        </li>
    </ol>
</div>`
              },
            ]
          },
          {
            name: 'Comparison',
            items: [
              {
                key: 'table',
                name: 'Comparison table',
                html: `<div style="width: 100%; margin: 20px 0px; border-radius: 8px; overflow-x: auto; border: 1px solid #d6d3d1;">
  <table style="width: 100%; border-collapse: collapse; font-size: 0.95em; color: #292524;">
  <caption style="text-align: left; color: #292524; padding: 12px 14px 10px;">Formative vs. summative assessment</caption>
  <thead>
  <tr>
  <th scope="col" style="background-color: #7c2d12; color: #ffffff; text-align: left; padding: 10px 14px;">Criterion</th>
  <th scope="col" style="background-color: #9a3412; color: #ffffff; text-align: left; padding: 10px 14px;">Formative</th>
  <th scope="col" style="background-color: #c2410c; color: #ffffff; text-align: left; padding: 10px 14px;">Summative</th>
  </tr>
  </thead>
  <tbody>
  <tr>
  <th scope="row" style="text-align: left; padding: 10px 14px; border-bottom: 1px solid #e7e5e4;">Purpose</th>
  <td style="padding: 10px 14px; border-bottom: 1px solid #e7e5e4;">Monitor learning in progress</td>
  <td style="padding: 10px 14px; border-bottom: 1px solid #e7e5e4;">Evaluate against a standard</td>
  </tr>
  <tr>
  <th scope="row" style="text-align: left; padding: 10px 14px; border-bottom: 1px solid #e7e5e4;">Timing</th>
  <td style="padding: 10px 14px; border-bottom: 1px solid #e7e5e4;">Ongoing, during instruction</td>
  <td style="padding: 10px 14px; border-bottom: 1px solid #e7e5e4;">End of a unit or course</td>
  </tr>
  <tr>
  <th scope="row" style="text-align: left; padding: 10px 14px;">Stakes</th>
  <td style="padding: 10px 14px;">Low; often ungraded</td>
  <td style="padding: 10px 14px;">High; counts toward the grade</td>
  </tr>
  </tbody>
  </table>
  </div>`
              },
              {
                key: 'myth',
                name: 'Myth vs. reality',
                html: `<div style="width: 90%; margin: 20px auto; border-radius: 8px; overflow: hidden; color: #292524; border: 1px solid #d6d3d1;">
  <div style="background-color: #fafaf9; padding: 12px 18px; border-bottom: 1px solid #e7e5e4;"><span style="display: inline-block; min-width: 68px; text-align: center; background-color: #b91c1c; color: #ffffff; font-size: 1.1em; padding: 2px 10px; border-radius: 999px;">MYTH</span><span style="margin-left: 8px;">You only use 10% of your brain.</span></div>
  <div style="background-color: #fafaf9; padding: 12px 18px;"><span style="display: inline-block; min-width: 68px; text-align: center; background-color: #15803d; color: #ffffff; font-size: 1.1em; padding: 2px 10px; border-radius: 999px;">REALITY</span><span style="margin-left: 8px;">Nearly all of the brain is active over the course of a day, even during sleep.</span></div>
  </div>`
              },
            ]
          },
        ]
      }
    ];

  // ─── END SNIPPETS CONFIG ───────────────────────────────────────

  const CARET_SVG = `<svg width="10" height="10" focusable="false" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M3 1.3c-.3-.3-.3-.7 0-1 .3-.3.8-.3 1.1 0l4 4.2c.3.3.3.7 0 1L4.1 9.7c-.3.3-.8.3-1.1 0-.3-.3-.3-.7 0-1L6.4 5 3 1.3z" fill="currentColor" fill-rule="evenodd"></path></svg>`;

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
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 6px 14px;
        cursor: pointer;
        color: #222f3e;
      }
      .ctld-snippet-menu .tox-collection__item-label { flex: 1 1 auto; }
      .ctld-snippet-menu .ctld-snippet-caret {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        color: #6b7280;
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
      .ctld-snippet-modal-preview { margin-bottom: 1em; }
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

  // ─── Menu open / close (with fly-out submenus) ─────────────────
  let openMenuEl = null;
  let openMenuOwner = null;
  let submenuStack = []; // submenuStack[i] === the submenu at depth (i + 1)

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

  // Close every submenu at depth >= level (1-based).
  function closeSubmenusFrom(level) {
    while (submenuStack.length >= level) {
      const el = submenuStack.pop();
      if (el.__ownerItem) el.__ownerItem.setAttribute('aria-expanded', 'false');
      el.remove();
    }
  }

  function closeMenu() {
    closeSubmenusFrom(1);
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
    if (openMenuOwner) { openMenuOwner.setAttribute('aria-expanded', 'false'); openMenuOwner = null; }
    document.removeEventListener('click', outsideClickHandler, { capture: true });
    document.removeEventListener('keydown', escHandler);
  }

  function outsideClickHandler(e) {
    if (!openMenuEl) return;
    if (openMenuEl.contains(e.target)) return;
    if (openMenuOwner && openMenuOwner.contains(e.target)) return;
    for (const el of submenuStack) { if (el.contains(e.target)) return; }
    closeMenu();
  }

  function escHandler(e) {
    if (e.key === 'Escape') closeMenu();
  }

  // ─── Menu building ────────────────────────────────────────────
  function makeMenuEl(depth) {
    const menu = document.createElement('div');
    menu.className = 'tox-menu tox-collection tox-collection--list tox-selected-menu ctld-snippet-menu';
    menu.setAttribute('role', 'menu');
    menu.style.position = 'absolute';
    menu.style.zIndex = String(10000 + (depth || 0));
    return menu;
  }

  function buildMenu(editor) {
    const menu = makeMenuEl(0);
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
      group.snippets.forEach((entry) => collection.appendChild(makeItem(editor, entry, 1)));
      menu.appendChild(collection);
    });
    return menu;
  }

  // level = the menu depth this item lives in (root items are level 1).
  function makeItem(editor, entry, level) {
    const isBranch = Array.isArray(entry.items);

    const item = document.createElement('div');
    item.className = 'tox-collection__item';
    item.setAttribute('role', 'menuitem');
    item.setAttribute('tabindex', '-1');
    item.innerHTML =
      `<div class="tox-collection__item-label">${escapeHTML(entry.name)}</div>` +
      (isBranch ? `<div class="ctld-snippet-caret" aria-hidden="true">${CARET_SVG}</div>` : '');

    item.addEventListener('mouseenter', () => item.classList.add('tox-collection__item--active'));
    item.addEventListener('mouseleave', () => item.classList.remove('tox-collection__item--active'));

    if (isBranch) {
      item.classList.add('ctld-snippet-has-sub');
      item.setAttribute('aria-haspopup', 'true');
      item.setAttribute('aria-expanded', 'false');
      const open = () => {
        // Already open for this item? leave it.
        if (submenuStack[level] && submenuStack[level].__ownerItem === item) return;
        closeSubmenusFrom(level + 1);
        openSubmenu(editor, item, entry.items, level + 1);
      };
      item.addEventListener('mouseenter', open);
      item.addEventListener('click', (e) => { e.stopPropagation(); open(); });
    } else {
      // Entering a leaf closes any sibling's open submenu.
      item.addEventListener('mouseenter', () => closeSubmenusFrom(level + 1));
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        openPreviewModal(editor, entry);
      });
    }
    return item;
  }

  function openSubmenu(editor, ownerItem, items, depth) {
    ownerItem.setAttribute('aria-expanded', 'true');

    const menu = makeMenuEl(depth);
    menu.__ownerItem = ownerItem;
    const collection = document.createElement('div');
    collection.className = 'tox-collection__group';
    items.forEach((it) => collection.appendChild(makeItem(editor, it, depth)));
    menu.appendChild(collection);
    document.body.appendChild(menu);

    const rect = ownerItem.getBoundingClientRect();
    menu.style.left = `${rect.right + window.scrollX - 2}px`;
    menu.style.top = `${rect.top + window.scrollY - 4}px`;

    requestAnimationFrame(() => {
      const mr = menu.getBoundingClientRect();
      if (mr.right > window.innerWidth - 4) {
        menu.style.left = `${Math.max(4, rect.left + window.scrollX - mr.width + 2)}px`;
      }
      if (mr.bottom > window.innerHeight - 4) {
        menu.style.top = `${Math.max(4, window.innerHeight - mr.height - 4) + window.scrollY}px`;
      }
    });

    submenuStack.push(menu);
  }

  // ─── Preview modal ────────────────────────────────────────────
  function openPreviewModal(editor, snippet) {
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

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    const modalEsc = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', modalEsc);
      }
    };
    document.addEventListener('keydown', modalEsc);
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
