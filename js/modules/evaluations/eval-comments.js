// Evaluation narrative comments section

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderCommentsSection(container, evaluation) {
  container.innerHTML = `
    <div class="card">
      <h3 class="section-header">Comments</h3>
      <div class="form-group">
        <label>Midterm Comments</label>
        <textarea id="eval-midterm-comments" rows="3" placeholder="Brief general comments or specific concerns...">${escapeHtml(evaluation.midtermComments)}</textarea>
      </div>
      <div class="form-group">
        <label>Final Comments <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--gray-400);">(detailed narrative)</span></label>
        <textarea id="eval-final-comments" rows="8" placeholder="Detailed narrative covering strengths, weaknesses, and overall performance across all clinical skills and foundations...">${escapeHtml(evaluation.finalComments)}</textarea>
      </div>
    </div>
  `;
}
