// Session history view — per-clinician observation feed with stats
import * as storage from '../storage/storage.js';
import { CLINICAL_SKILLS, CLINICAL_FOUNDATIONS, ALL_COMPETENCIES } from '../utils/competencies.js';
import { formatDateDisplay, formatDateLong } from '../utils/dates.js';

export function renderHistory(clinician, observations, settings, onDeleted) {
  const container = document.getElementById('view-history');

  // Sort reverse chronological
  const sorted = [...observations].sort((a, b) => b.date.localeCompare(a.date));

  // Stats
  const activeDates = (clinician.schedule || []).filter((s) => !s.skipped);
  const totalScheduled = activeDates.length;
  const sessionsLogged = observations.length;
  const totalMinutesObserved = observations.reduce((sum, o) => sum + (o.minutesObserved || 0), 0);
  const totalSessionMinutes = observations.reduce((sum, o) => sum + (o.totalMinutes || 0), 0);
  const runningPct = totalSessionMinutes > 0 ? Math.round((totalMinutesObserved / totalSessionMinutes) * 100) : 0;
  const totalPossibleMinutes = activeDates.length * (clinician.sessionLengthMin || 45);

  container.innerHTML = `
    <div class="clinician-header">
      <div>
        <span class="clinician-header-name">${clinician.name}</span>
        <span class="badge badge-${clinician.sessionDays.toLowerCase()}">${clinician.sessionDays}</span>
      </div>
      <div class="clinician-header-details">
        <span>Client: ${clinician.clientInitials}</span>
        ${settings ? `<span>${settings.name}</span>` : ''}
      </div>
    </div>

    <div class="metrics">
      <div class="metric">
        <div class="metric-value">${sessionsLogged} / ${totalScheduled}</div>
        <div class="metric-label">Sessions Logged</div>
      </div>
      <div class="metric">
        <div class="metric-value">${totalMinutesObserved}</div>
        <div class="metric-label">Minutes Observed</div>
      </div>
      <div class="metric">
        <div class="metric-value" style="color:${runningPct >= 25 ? 'var(--green-600)' : 'var(--red-600)'}">${runningPct}%</div>
        <div class="metric-label">Observation %</div>
      </div>
      <div class="metric">
        <div class="metric-value">${totalSessionMinutes} / ${totalPossibleMinutes}</div>
        <div class="metric-label">Session Min / Possible</div>
      </div>
    </div>

    <div id="obs-feed">
      ${sorted.length === 0 ? '<p class="text-muted text-sm">No observations logged yet.</p>' : ''}
      ${sorted.map((obs) => renderObsCard(obs)).join('')}
    </div>
  `;

  // Wire delete buttons
  container.querySelectorAll('[data-delete-obs]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this observation note?')) return;
      await storage.deleteObservation(clinician.id, btn.dataset.deleteObs);
      if (onDeleted) onDeleted();
    });
  });
}

function renderObsCard(obs) {
  const pct = obs.totalMinutes > 0 ? Math.round((obs.minutesObserved / obs.totalMinutes) * 100) : 0;
  const typeLabel = obs.sessionType === 'eval' ? 'Eval' : 'Tx';
  const tags = (obs.competencyTags || []).map((id) => {
    const comp = ALL_COMPETENCIES.find((c) => c.id === id);
    const isCS = id.startsWith('cs');
    return `<span class="tag tag-readonly tag-${isCS ? 'cs' : 'cf'}">${id}${comp ? ': ' + comp.label : ''}</span>`;
  }).join('');

  return `
    <div class="obs-card">
      <div class="obs-card-header">
        <div>
          <span class="obs-card-date">${formatDateDisplay(obs.date)}</span>
          <span class="badge" style="margin-left:6px;background:var(--gray-100);color:var(--gray-600);">${typeLabel}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="obs-card-meta">${obs.minutesObserved}/${obs.totalMinutes} min (${pct}%)</span>
          <button class="btn btn-sm btn-danger" data-delete-obs="${obs.id}" style="padding:2px 6px;font-size:11px;">×</button>
        </div>
      </div>
      ${obs.notes ? `<div class="obs-card-notes">${escapeHtml(obs.notes)}</div>` : ''}
      ${tags ? `<div class="obs-card-tags">${tags}</div>` : ''}
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
