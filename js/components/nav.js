// Clinician selector tab bar

export function renderNav(state, onSelect) {
  const container = document.getElementById('clinician-tabs');
  container.hidden = state.clinicians.length === 0;
  container.innerHTML = '';

  for (const c of state.clinicians) {
    const btn = document.createElement('button');
    btn.className = 'clinician-tab' + (c.id === state.selectedClinicianId ? ' active' : '');
    btn.textContent = c.name.split(' ')[0]; // First name only
    btn.addEventListener('click', () => onSelect(c.id));
    container.appendChild(btn);
  }
}
