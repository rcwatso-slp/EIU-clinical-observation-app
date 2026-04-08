// Branding footer component
// Renders a subtle "Built by" attribution line inside the app container.

/**
 * Creates and returns the branding footer element.
 * If branding.developerUrl is set, the name becomes a link.
 * To add the URL later, set developerUrl in js/config/branding.js.
 *
 * @param {object} branding - The branding config from js/config/branding.js
 * @returns {HTMLElement}
 */
export function createBrandingFooter(branding) {
  const footer = document.createElement('footer');
  footer.className = 'branding-footer';

  const label = document.createTextNode('Built by\u00a0'); // non-breaking space

  let nameEl;
  if (branding.developerUrl) {
    nameEl = document.createElement('a');
    nameEl.href = branding.developerUrl;
    nameEl.target = '_blank';
    nameEl.rel = 'noopener noreferrer';
    nameEl.className = 'branding-footer-link';
    nameEl.textContent = branding.developerName;
  } else {
    nameEl = document.createElement('span');
    nameEl.textContent = branding.developerName;
  }

  footer.appendChild(label);
  footer.appendChild(nameEl);

  return footer;
}
