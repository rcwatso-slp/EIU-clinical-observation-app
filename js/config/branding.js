// =============================================================================
// Branding Configuration
// =============================================================================
// To deploy this app for a different university:
//   1. Update the fields below with the new institution's values
//   2. Drop your logo files into the assets/ folder (project root)
//   3. Update primaryColor / secondaryColor to match the institution's palette
//   4. Set developerUrl once the ExecuSpeech Innovations site is live
// =============================================================================

export const branding = {
  // ---- Institution ----
  universityName:      'Eastern Illinois University',
  universityShortName: 'EIU',
  departmentName:      'Communication Disorders & Sciences',

  // ---- Logos ----
  // Place PNG/SVG files in the assets/ folder at the project root.
  // Set either value to null to fall back to text-only display.
  //
  //   assets/eiu-logo.png     — EIU athletic panther mark (shown on login screen)
  //   assets/eiu-cds-logo.png — CDS department logo     (shown on app dashboard)
  authLogoUrl:      'assets/eiu-logo.png',
  dashboardLogoUrl: 'assets/eiu-cds-logo.png',

  // ---- Colors ----
  // Derived from the EIU athletic mark.
  // These are injected as CSS variables (--primary-color, --secondary-color)
  // so any stylesheet rule can reference them.
  primaryColor:   '#003087', // EIU Panther Blue
  secondaryColor: '#A7A9AC', // EIU Panther Silver

  // ---- Developer attribution ----
  developerName: 'ExecuSpeech Innovations',
  developerUrl:  null, // Set to 'https://execuspeech.com' (or similar) when available
};
