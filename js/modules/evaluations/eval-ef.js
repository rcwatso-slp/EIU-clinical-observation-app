// Core Functions section — collapsible on the evaluation form
// Replaces the old Essential Functions grid (CAPCSD, 2023)
import { CORE_FUNCTIONS } from '../../utils/competencies.js';

export function renderEFSection(container, clinician, evaluation, onUpdate) {
  // Ensure coreFunctions exists on the evaluation object
  if (!evaluation.coreFunctions) {
    evaluation.coreFunctions = { midtermFlags: {}, finalFlags: {}, midtermComment: '', finalComment: '' };
  }
  const cf = evaluation.coreFunctions;

  const allItems = CORE_FUNCTIONS.flatMap((d) => d.items);

  // Build table rows: domain header rows + item rows
  let tableRows = '';
  for (const domain of CORE_FUNCTIONS) {
    tableRows += `
      <tr class="cf-domain-row">
        <td class="cf-domain-cell" colspan="3">${domain.domain}</td>
      </tr>`;
    for (const item of domain.items) {
      const midChecked  = cf.midtermFlags[item.id] ? 'checked' : '';
      const finChecked  = cf.finalFlags[item.id]   ? 'checked' : '';
      tableRows += `
        <tr class="cf-item-row">
          <td class="cf-item-text">${item.text}</td>
          <td class="cf-check-cell">
            <input type="checkbox" class="cf-checkbox" data-id="${item.id}" data-period="midterm" ${midChecked}>
          </td>
          <td class="cf-check-cell">
            <input type="checkbox" class="cf-checkbox" data-id="${item.id}" data-period="final" ${finChecked}>
          </td>
        </tr>`;
    }
  }

  container.innerHTML = `
    <div class="card">
      <div class="collapsible-header" id="cf-toggle">
        <h3>Core Functions <span style="font-size:11px;font-weight:400;color:var(--gray-400);">(CAPCSD, 2023)</span></h3>
        <span class="collapsible-chevron" id="cf-chevron">▼ Show</span>
      </div>
      <div id="cf-content" hidden>
        <p class="text-sm text-muted" style="margin-bottom:12px;">
          Check any items that were a concern for this student at midterm or final.
        </p>

        <div class="cf-table-wrapper">
          <table class="cf-table">
            <thead>
              <tr>
                <th class="cf-item-header">Core Function</th>
                <th class="cf-period-header">Midterm</th>
                <th class="cf-period-header">Final</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
          <div class="form-group">
            <label>Midterm Core Function Notes</label>
            <textarea id="cf-midterm-comment" rows="4" placeholder="Notes on core function concerns at midterm…">${cf.midtermComment || ''}</textarea>
          </div>
          <div class="form-group">
            <label>Final Core Function Notes</label>
            <textarea id="cf-final-comment" rows="4" placeholder="Notes on core function concerns at final…">${cf.finalComment || ''}</textarea>
          </div>
        </div>
      </div>
    </div>
  `;

  // Collapsible toggle
  const toggle  = container.querySelector('#cf-toggle');
  const content = container.querySelector('#cf-content');
  const chevron = container.querySelector('#cf-chevron');

  toggle.addEventListener('click', () => {
    content.hidden = !content.hidden;
    chevron.textContent = content.hidden ? '▼ Show' : '▲ Hide';
  });

  // Wire checkboxes
  container.querySelectorAll('.cf-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      const { id, period } = cb.dataset;
      const flagsKey = period === 'midterm' ? 'midtermFlags' : 'finalFlags';
      if (cb.checked) {
        cf[flagsKey][id] = true;
      } else {
        delete cf[flagsKey][id];
      }
      evaluation.coreFunctions = cf;
      if (onUpdate) onUpdate(cf);
    });
  });

  // Wire comment textareas (live sync into evaluation object)
  const midTextarea = container.querySelector('#cf-midterm-comment');
  const finTextarea = container.querySelector('#cf-final-comment');

  midTextarea.addEventListener('input', () => {
    cf.midtermComment = midTextarea.value;
    evaluation.coreFunctions = cf;
  });
  finTextarea.addEventListener('input', () => {
    cf.finalComment = finTextarea.value;
    evaluation.coreFunctions = cf;
  });
}
