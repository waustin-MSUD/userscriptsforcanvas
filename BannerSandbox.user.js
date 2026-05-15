// ==UserScript==
// @name          Banner for Sandbox Shells
// @version       2026.05.15
// @namespace     CTLD
// @description   Display a banner at the top of Sandbox Shells
// @author        CTLD
// @updateurl
// @icon          https://du11hjcvx0uqb.cloudfront.net/br/dist/images/favicon-e10d657a73.ico
// @match         https://*.instructure.com/courses/*
// @grant         none
// ==/UserScript==

(function () {
  'use strict';

  const courseRegex = /^\/courses\/(\d+)/;
  const match = courseRegex.exec(location.pathname);
  if (!match) return;
  const courseId = match[1];

  fetch(`/api/v1/courses/${courseId}`, {
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json' }
  })
    .then(res => res.json())
    .then(course => {
      if (!course?.name || !/sandbox/i.test(course.name)) return;

      // Avoid inserting multiple times
      if (document.getElementById('sandbox-banner')) return;

      const banner = document.createElement('div');
      banner.id = 'sandbox-banner';
      banner.textContent = '🏝️ Sandbox Shell 🏝️';

      Object.assign(banner.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        backgroundColor: 'LemonChiffon',
        color: 'black',
        textAlign: 'center',
        fontSize: '1.2em',
        fontWeight: 'bold',
        padding: '6px 0',
        zIndex: 9999,
        pointerEvents: 'none',
        userSelect: 'none'
      });

      // Extra protection to avoid editor capturing it
      banner.setAttribute('data-no-editor', 'true');
      banner.setAttribute('aria-hidden', 'true');

      // Append banner safely
      waitForSafeInjection(() => {
        document.body.appendChild(banner);

        // Avoid overlapping content
        if (!document.body.style.paddingTop) {
          document.body.style.paddingTop = '40px';
        }
      });
    });

  // Wait until we're sure the RCE/DOM is fully stable before injecting
  function waitForSafeInjection(callback) {
    const interval = setInterval(() => {
      const rce = document.querySelector('#content .tox-edit-area, iframe.tox-edit-area, .note-editor'); // Common RCE containers
      const contentArea = document.querySelector('#content');
      const layoutMain = document.querySelector('.ic-Layout-contentMain');

      // Wait until edit fields and content areas are present, so we can avoid them
      if (contentArea || rce || layoutMain) {
        clearInterval(interval);
        callback();
      }
    }, 250);
  }
})();
