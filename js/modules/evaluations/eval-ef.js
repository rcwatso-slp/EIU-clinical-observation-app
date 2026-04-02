// Essential Functions tracking grid — collapsible section on the evaluation form
import { ESSENTIAL_FUNCTIONS } from '../../utils/competencies.js';
import { formatDateDisplay } from '../../utils/dates.js';

// Flatten all EF items in order
const ALL_EF_ITEMS = Object.entries(ESSENTIAL_FUNCTIONS).flatMap(([domain, cat]) =>
  cat.items.map((item) => ({ domain, item, label: cat.label }))
);

export function renderEFSection(container, clinician, evaluation, onUpdate) {
  const activeDates = (clinician.schedule || [])
    .filter((s) => !s.skipped)
    .map((s) => s.date);

  container.innerHTML = `
    <div class="card">
      <div class="collapsible-header" id="ef-toggle">
        <h3>Essential Functions</h3>
        <span class="collapsible-chevron" id="ef-chevron">▼ Show</span>
      </div>
      <div id="ef-content" hidden>
        <p class="text-sm text-muted" style="margin-bottom:10px;">
          Check each essential function observed per session date.
        </p>
        <div class="ef-grid-container">
          <table class="ef-table">
            <thead>
              <tr>
                <th class="ef-date-col">Date</th>
                ${Object.entries(ESSENTIAL_FUNCTIONS).map(([domain, cat]) =>
                  `<th colspan="${cat.items.length}" class="ef-domain-header">${domain}: ${cat.label}</th>`
                ).join('')}
              </tr>
              <tr>
                <th class="ef-date-col"></th>
                ${ALL_EF_ITEMS.map(({ item }) => `<th class="ef-item-header">${item}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${activeDates.map((date) => {
                const dateData = (evaluation.essentialFunctions || {})[date] || {};
                return `
                  <tr data-ef-date="${date}">
                    <td class="ef-date-cell">${formatDateDisplay(date)}</td>
                    ${ALL_EF_ITEMS.map(({ item }) => `
                      <td class="ef-check-cell">
                        <input type="checkbox" class="ef-checkbox" data-date="${date}" data-item="${item}"
                          ${dateData[item] ? 'checked' : ''}>
                      </td>
                    `).join('')}
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td class="ef-date-cell"><strong>Total</strong></td>
                ${ALL_EF_ITEMS.map(({ item }) => {
                  const col = activeDates.reduce((n, date) => {
                    const dd = (evaluation.essentialFunctions || {})[date] || {};
                    return n + (dd[item] ? 1 : 0);
                  }, 0);
                  return `<td class="ef-total-cell" data-ef-total="${item}">${col}</td>`;
                }).join('')}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  `;

  // Collapsible toggle
  const toggle  = container.querySelector('#ef-toggle');
  const content = container.querySelector('#ef-content');
  const chevron = container.querySelector('#ef-chevron');

  toggle.addEventListener('click', () => {
    content.hidden = !content.hidden;
    chevron.textContent = content.hidden ? '▼ Show' : '▲ Hide';
  });

  // Wire checkboxes
  container.querySelectorAll('.ef-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      const date = cb.dataset.date;
      const item = cb.dataset.item;

      if (!evaluation.essentialFunctions) evaluation.essentialFunctions = {};
      if (!evaluation.essentialFunctions[date]) evaluation.essentialFunctions[date] = {};
      evaluation.essentialFunctions[date][item] = cb.checked;

      // Update column total
      const totalCell = container.querySelector(`[data-ef-total="${item}"]`);
      if (totalCell) {
        const colTotal = Object.values(evaluation.essentialFunctions).reduce((n, dateData) => {
          return n + (dateData[item] ? 1 : 0);
        }, 0);
        totalCell.textContent = colTotal;
      }

      if (onUpdate) onUpdate(evaluation.essentialFunctions);
    });
  });
}
