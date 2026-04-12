// SOAP note list view — used in both supervisor and student shells.
// Shows notes grouped by week with plan/SOAP status badges.

export function renderSoapList(container, notes, options) {
  // options: { viewMode: 'supervisor'|'student', onOpen, onCreate, onDelete, readOnly }
  const { viewMode, onOpen, onCreate, onDelete, readOnly } = options;

  if (notes.length === 0) {
    container.innerHTML = `
      <div class="soap-list-empty">
        <p class="text-muted">No session notes yet.</p>
        ${viewMode === 'student' && !readOnly
          ? `<button class="btn btn-primary" id="btn-new-soap-note">+ New Session Note</button>`
          : ''}
      </div>`;
    if (viewMode === 'student' && !readOnly) {
      container.querySelector('#btn-new-soap-note')?.addEventListener('click', onCreate);
    }
    return;
  }

  // Group by week (Mon–Sun containing sessionDate)
  const grouped = groupByWeek(notes);
  const weeks = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  container.innerHTML = `
    <div class="soap-list-header">
      ${viewMode === 'student' && !readOnly
        ? `<button class="btn btn-primary btn-sm" id="btn-new-soap-note">+ New Session Note</button>`
        : viewMode === 'supervisor' && !readOnly
          ? `<div class="soap-list-filter">
              <label><input type="checkbox" id="filter-needs-review" checked> Show only needs review</label>
             </div>`
          : ''}
    </div>
    <div class="soap-list-weeks" id="soap-weeks"></div>
  `;

  if (viewMode === 'student' && !readOnly) {
    container.querySelector('#btn-new-soap-note')?.addEventListener('click', onCreate);
  }

  // In readOnly (archive) mode always show all notes unfiltered
  if (viewMode === 'supervisor' && !readOnly) {
    const cb = container.querySelector('#filter-needs-review');
    cb?.addEventListener('change', () => renderWeeks(cb.checked));
    renderWeeks(true);
  } else {
    renderWeeks(false);
  }

  function renderWeeks(filterNeedsReview) {
    const weeksEl = container.querySelector('#soap-weeks');
    weeksEl.innerHTML = '';

    for (const weekStart of weeks) {
      const weekNotes = grouped[weekStart];
      const filtered = filterNeedsReview
        ? weekNotes.filter((n) => n.planStatus === 'submitted' || n.soapStatus === 'submitted')
        : weekNotes;
      if (filtered.length === 0) continue;

      const weekLabel = formatWeekLabel(weekStart);
      const weekEl = document.createElement('div');
      weekEl.className = 'soap-week-group';
      weekEl.innerHTML = `<div class="soap-week-label">${weekLabel}</div>`;

      for (const note of filtered) {
        const row = document.createElement('div');
        row.className = 'soap-note-row';
        row.innerHTML = `
          <div class="soap-note-row-info">
            <span class="soap-note-session">Session ${note.sessionNumber}</span>
            <span class="soap-note-date">${formatDate(note.sessionDate)}</span>
          </div>
          <div class="soap-note-row-badges">
            <span class="soap-badge plan-${note.planStatus}">Plan: ${statusLabel(note.planStatus)}</span>
            <span class="soap-badge soap-${note.soapStatus}">SOAP: ${statusLabel(note.soapStatus)}</span>
          </div>
          <div class="soap-note-row-actions">
            <button class="btn btn-sm btn-secondary" data-open="${note.id}">Open</button>
            ${viewMode === 'student' && !readOnly
              ? `<button class="btn btn-sm btn-danger" data-delete="${note.id}">Delete</button>`
              : ''}
          </div>
        `;
        row.querySelector('[data-open]').addEventListener('click', () => onOpen(note));
        row.querySelector('[data-delete]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Delete Session ${note.sessionNumber} note? This cannot be undone.`)) {
            onDelete(note.id);
          }
        });
        weekEl.appendChild(row);
      }

      weeksEl.appendChild(weekEl);
    }

    if (weeksEl.children.length === 0) {
      weeksEl.innerHTML = `<p class="text-muted" style="padding:16px 0;">No notes pending review.</p>`;
    }
  }
}

// --- Helpers ---

function groupByWeek(notes) {
  const groups = {};
  for (const note of notes) {
    const d = new Date(note.sessionDate + 'T12:00:00');
    const day = d.getDay(); // 0=Sun
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const key = monday.toISOString().slice(0, 10);
    if (!groups[key]) groups[key] = [];
    groups[key].push(note);
  }
  // Sort notes within each week by date
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate));
  }
  return groups;
}

function formatWeekLabel(mondayStr) {
  const d = new Date(mondayStr + 'T12:00:00');
  const sun = new Date(d);
  sun.setDate(d.getDate() + 6);
  const opts = {month: 'short', day: 'numeric'};
  return `Week of ${d.toLocaleDateString('en-US', opts)} – ${sun.toLocaleDateString('en-US', opts)}`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function statusLabel(s) {
  return {draft: 'Draft', submitted: 'Submitted', reviewed: 'Reviewed', complete: 'Complete'}[s] || s;
}
