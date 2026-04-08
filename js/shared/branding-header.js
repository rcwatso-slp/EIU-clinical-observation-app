// Branding header component
// Renders a university navbar strip above the existing app top-bar.
// Call updateBrandingLogo() to swap between the auth logo and dashboard logo.

/**
 * Creates and returns the branding header element.
 * Also injects --primary-color and --secondary-color as CSS variables.
 *
 * @param {object} branding - The branding config from js/config/branding.js
 * @returns {HTMLElement}
 */
export function createBrandingHeader(branding) {
  // Push brand colors into CSS variables so stylesheet rules can use them
  document.documentElement.style.setProperty('--primary-color',   branding.primaryColor);
  document.documentElement.style.setProperty('--secondary-color', branding.secondaryColor);

  const header = document.createElement('header');
  header.className = 'branding-header';
  header.id = 'branding-header';

  // --- Logo ---
  const img = document.createElement('img');
  img.className = 'branding-logo';
  img.alt = `${branding.universityShortName} logo`;
  if (branding.authLogoUrl) {
    img.src = branding.authLogoUrl;
    img.onerror = () => { img.hidden = true; }; // hide cleanly if file is missing
  } else {
    img.hidden = true;
  }

  // --- Text group ---
  const textGroup = document.createElement('div');
  textGroup.className = 'branding-title-group';

  const deptEl = document.createElement('span');
  deptEl.className = 'branding-dept-name';
  deptEl.textContent = branding.departmentName;

  const uniEl = document.createElement('span');
  uniEl.className = 'branding-uni-name';
  uniEl.textContent = branding.universityName;

  textGroup.appendChild(deptEl);
  textGroup.appendChild(uniEl);

  header.appendChild(img);
  header.appendChild(textGroup);

  return header;
}

/**
 * Swaps the logo src in the already-rendered branding header.
 * Call this after the auth state changes (login → dashboard, or logout → auth).
 *
 * @param {string|null} url - New logo URL, or null to hide the logo
 */
export function updateBrandingLogo(url) {
  const img = document.querySelector('#branding-header .branding-logo');
  if (!img) return;
  if (url) {
    img.src    = url;
    img.hidden = false;
  } else {
    img.hidden = true;
  }
}
