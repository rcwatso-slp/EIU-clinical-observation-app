// SOAP Note editor — all tabs (Therapy Plan, SOAP, Export) in all view modes.
// viewMode: 'supervisor' | 'student'
// In student mode, shows normal edit form OR diff/feedback view if note has been reviewed.
import { saveSoapNote, saveSoapNoteAsStudent, newUuid } from './soap-storage.js';
import { computeDiff, renderDiffInteractive, renderDiffHtml, countPendingHunks, applyAccepted } from './soap-diff.js';
import { exportSoapPdf } from './soap-export.js';
import { formatDate, statusLabel } from './soap-list.js';

const CUEING_LEVELS = ['independent', 'min', 'mod', 'max', 'models', 'other'];
const COMMENT_TAGS  = ['clinical-judgment', 'professional-writing', 'general'];
const TAG_LABELS    = {'clinical-judgment': 'Clinical Judgment', 'professional-writing': 'Professional Writing', 'general': 'General'};

// Text fields that get word-level diff tracking
const PLAN_TEXT_FIELDS = ['longTermGoal', 'methods', 'materials', 'dataCollectionPlan'];
const SOAP_TEXT_FIELDS = ['subjective', 'objectiveNarrative', 'assessment', 'soapPlan'];
const ALL_TEXT_FIELDS  = [...PLAN_TEXT_FIELDS, ...SOAP_TEXT_FIELDS];

// renderSoapEditor: main entry point
// options: { viewMode, clinician, supervisorId (student only) }
// onBack: called to return to the list view
export function renderSoapEditor(container, note, options, onBack, onSave) {
  const { viewMode, clinician, supervisorId } = options;
  let n = JSON.parse(JSON.stringify(note)); // working copy
  let activeTab = 'plan';

  // Snapshot of student text taken when supervisor opens in review mode
  // Used to compute diffs on save
  const snapshot = viewMode === 'supervisor' ? captureTextSnapshot(n) : null;

  function render() {
    const isReviewed  = (tab) => tab === 'plan'
      ? (n.planStatus === 'reviewed' || n.planStatus === 'complete')
      : (n.soapStatus === 'reviewed' || n.soapStatus === 'complete');

    container.innerHTML = `
      <div class="soap-editor">

        <div class="soap-editor-topbar">
          <button class="btn btn-secondary btn-sm" id="btn-soap-back">← Back</button>
          <div class="soap-editor-title">
            <strong>${esc(clinician.name)}</strong> — Session ${n.sessionNumber}
            <span class="soap-date-label">${formatDate(n.sessionDate)}</span>
          </div>
          <div class="soap-status-pills">
            <span class="soap-badge plan-${n.planStatus}">Plan: ${statusLabel(n.planStatus)}</span>
            <span class="soap-badge soap-${n.soapStatus}">SOAP: ${statusLabel(n.soapStatus)}</span>
          </div>
        </div>

        <div class="soap-tabs">
          <button class="soap-tab ${activeTab==='plan'?'active':''}" data-tab="plan">Therapy Plan</button>
          <button class="soap-tab ${activeTab==='soap'?'active':''}" data-tab="soap">SOAP Note</button>
          <button class="soap-tab ${activeTab==='export'?'active':''}" data-tab="export">Export</button>
        </div>

        <div class="soap-tab-body">
          ${activeTab === 'plan'   ? renderPlanTab(n, viewMode, isReviewed('plan')) : ''}
          ${activeTab === 'soap'   ? renderSoapTab(n, viewMode, isReviewed('soap')) : ''}
          ${activeTab === 'export' ? renderExportTab() : ''}
        </div>

        <div class="soap-editor-footer">
          ${renderFooter(n, viewMode, activeTab)}
        </div>

        <div id="soap-flash" class="soap-flash" hidden></div>
      </div>
    `;

    wireEditor();

    // Read-only lockdown (archive mode): disable all inputs and hide action footer
    if (options.readOnly) {
      container.querySelectorAll('input, textarea, select').forEach((el) => { el.disabled = true; });
      const footer = container.querySelector('.soap-editor-footer');
      if (footer) footer.hidden = true;
    }
  }

  function wireEditor() {
    container.querySelector('#btn-soap-back').addEventListener('click', onBack);

    // Tab switching
    container.querySelectorAll('.soap-tab').forEach((t) => {
      t.addEventListener('click', () => { activeTab = t.dataset.tab; render(); });
    });

    // --- Footer actions ---
    wireSave();
    wireSubmit();
    wireReview();
    wireComplete();

    // --- Plan tab wiring ---
    if (activeTab === 'plan') wirePlanTab();
    if (activeTab === 'soap') wireSoapTab();
    if (activeTab === 'export') {
      container.querySelector('#btn-soap-print')?.addEventListener('click', () => {
        exportSoapPdf(n, clinician);
      });
    }
  }

  // ── Save (student draft) ────────────────────────────────────────────────────

  function wireSave() {
    container.querySelector('#btn-soap-save')?.addEventListener('click', async () => {
      collectFormData();
      await doSave();
      flash('Saved.');
    });
  }

  async function doSave() {
    if (viewMode === 'student') {
      await saveSoapNoteAsStudent(n, supervisorId);
    } else {
      await saveSoapNote(n);
    }
    if (onSave) onSave(n);
  }

  // ── Submit (student → supervisor) ───────────────────────────────────────────

  function wireSubmit() {
    container.querySelector('#btn-submit-plan')?.addEventListener('click', async () => {
      if (!confirm('Submit this Therapy Plan for supervisor review?')) return;
      collectFormData();
      n.planStatus = 'submitted';
      await doSave();
      flash('Therapy Plan submitted for review.');
      render();
    });
    container.querySelector('#btn-submit-soap')?.addEventListener('click', async () => {
      if (!confirm('Submit this SOAP Note for supervisor review?')) return;
      collectFormData();
      n.soapStatus = 'submitted';
      await doSave();
      flash('SOAP Note submitted for review.');
      render();
    });
  }

  // ── Save Review (supervisor) ─────────────────────────────────────────────────

  function wireReview() {
    container.querySelector('#btn-save-review')?.addEventListener('click', async () => {
      collectFormData();
      computeAndStoreReview();
      if (activeTab === 'plan') n.planStatus = 'reviewed';
      if (activeTab === 'soap') n.soapStatus = 'reviewed';
      n.review.reviewedAt = new Date().toISOString();
      await doSave();
      flash('Review saved.');
      render();
    });
  }

  function computeAndStoreReview() {
    // For each text field, diff snapshot vs current value → store in review.fieldEdits
    const fields = activeTab === 'plan' ? PLAN_TEXT_FIELDS : SOAP_TEXT_FIELDS;
    for (const field of fields) {
      const orig = snapshot[field] || '';
      const curr = getFieldValue(n, field);
      if (orig !== curr) {
        if (!n.review.fieldEdits[field]) {
          n.review.fieldEdits[field] = {originalText: orig, supervisorText: curr, acceptedHunks: {}};
        } else {
          n.review.fieldEdits[field].supervisorText = curr;
        }
      }
    }

    // Objectives and data rows: store supervisor versions
    if (activeTab === 'plan') {
      n.review.objectiveChanges = collectObjectiveChanges(snapshot.objectives, n.plan.objectives);
    }
    if (activeTab === 'soap') {
      n.review.dataRowChanges = collectDataRowChanges(snapshot.objectiveData, n.soap.objectiveData);
    }
  }

  // ── Auto-complete (student) ──────────────────────────────────────────────────

  function wireComplete() {
    container.querySelector('#btn-mark-complete')?.addEventListener('click', async () => {
      await markSectionComplete();
    });
  }

  async function markSectionComplete() {
    if (activeTab === 'plan') n.planStatus = 'complete';
    if (activeTab === 'soap') n.soapStatus = 'complete';
    await doSave();
    flash('Marked complete!');
    render();
  }

  // Check if all hunks and comments for a tab are resolved → auto-complete
  function checkAutoComplete(tab) {
    const fields    = tab === 'plan' ? PLAN_TEXT_FIELDS : SOAP_TEXT_FIELDS;
    const section   = tab === 'plan' ? 'plan' : 'soap';

    const allHunksResolved = fields.every((f) => {
      const fe = n.review.fieldEdits[f];
      if (!fe) return true;
      const ops = computeDiff(fe.originalText, fe.supervisorText);
      return countPendingHunks(ops, fe.acceptedHunks) === 0;
    });

    const tabComments = n.review.comments.filter((c) => {
      const planSections = ['longTermGoal','objectives','methods','materials','dataCollectionPlan'];
      const soapSections = ['subjective','objectiveNarrative','objectiveData','assessment','soapPlan'];
      return section === 'plan'
        ? planSections.includes(c.section)
        : soapSections.includes(c.section);
    });
    const allCommentsRead = tabComments.every((c) => c.readByStudent);

    const objResolved = Object.values(n.review.objectiveChanges || {}).every((ch) => ch.accepted !== null);
    const rowResolved = Object.values(n.review.dataRowChanges   || {}).every((ch) => ch.accepted !== null);

    if (allHunksResolved && allCommentsRead && objResolved && rowResolved) {
      setTimeout(async () => {
        await markSectionComplete();
      }, 400);
    }
  }

  // ── Collect form data ────────────────────────────────────────────────────────

  function collectFormData() {
    if (activeTab === 'plan') collectPlanData();
    if (activeTab === 'soap') collectSoapData();
  }

  function collectPlanData() {
    n.plan.longTermGoal      = val('#plan-ltg');
    n.plan.methods           = val('#plan-methods');
    n.plan.materials         = val('#plan-materials');
    n.plan.dataCollectionPlan = val('#plan-dcp');
    // Objectives collected live via wireObjectives()
  }

  function collectSoapData() {
    n.soap.subjective         = val('#soap-subjective');
    n.soap.objectiveNarrative = val('#soap-obj-narrative');
    n.soap.assessment         = val('#soap-assessment');
    n.soap.soapPlan           = val('#soap-plan');
    // Data rows collected live via wireDataRows()
  }

  // ── PLAN TAB ─────────────────────────────────────────────────────────────────

  // ── ITP Objectives Panel (shown when an ITP is available) ───────────────────

  function renderItpFogPanel(itp) {
    if (!itp || !itp.functionalOutcomeGoals || itp.functionalOutcomeGoals.length === 0) return '';
    const fogRows = itp.functionalOutcomeGoals.map((fog, fi) => `
      <div class="itp-fog-panel-fog">
        <div class="itp-fog-panel-goal">${esc(fog.goal || `Functional Outcome Goal ${fi + 1}`)}</div>
        ${(fog.objectives || []).map((obj, oi) => `
          <div class="itp-fog-panel-obj">
            <span class="itp-fog-panel-obj-text">${esc(obj.text)}</span>
            <button class="btn btn-sm btn-secondary itp-add-obj-to-plan-btn"
              data-fog-idx="${fi}" data-obj-idx="${oi}"
              title="Add this objective to the session plan">+ Add to Plan</button>
          </div>
        `).join('')}
      </div>
    `).join('');

    return `
      <div class="itp-fog-panel">
        <div class="itp-fog-panel-header">
          ITP Objectives
          <span class="itp-fog-panel-subtitle">Click "+ Add to Plan" to include an objective in this session</span>
        </div>
        ${fogRows}
      </div>
    `;
  }

  function renderPlanTab(note, mode, isReviewed) {
    // In student mode with review: show diff view per field + comments
    // In supervisor mode: show editable textareas (for making edits)
    // In student draft mode: show editable textareas

    if (mode === 'student' && isReviewed) {
      return renderPlanFeedback(note);
    }

    return `
      <div class="soap-section">
        ${options.itp && options.itp.completed ? renderItpFogPanel(options.itp) : ''}
        <div class="form-group">
          <label class="soap-label">Long-Term Goal</label>
          ${mode === 'supervisor'
            ? `<div class="sup-edit-hint">Edit below — changes will be tracked</div>`
            : ''}
          <textarea id="plan-ltg" class="soap-textarea" rows="3">${esc(note.plan.longTermGoal)}</textarea>
        </div>

        <div class="soap-section-divider">Short-Term Objectives</div>
        <div id="objectives-list"></div>
        <button class="btn btn-sm btn-secondary soap-add-btn" id="btn-add-objective">+ Add Objective</button>

        <div class="form-group" style="margin-top:16px">
          <label class="soap-label">Methods / Procedures</label>
          <textarea id="plan-methods" class="soap-textarea" rows="3">${esc(note.plan.methods)}</textarea>
        </div>
        <div class="form-group">
          <label class="soap-label">Materials / Stimuli</label>
          <textarea id="plan-materials" class="soap-textarea" rows="2">${esc(note.plan.materials)}</textarea>
        </div>
        <div class="form-group">
          <label class="soap-label">Data Collection Plan</label>
          <textarea id="plan-dcp" class="soap-textarea" rows="2">${esc(note.plan.dataCollectionPlan)}</textarea>
        </div>

        ${mode === 'supervisor' ? renderCommentEditor('plan', note) : ''}
      </div>
    `;
  }

  function renderPlanFeedback(note) {
    const fe = note.review.fieldEdits;
    const oc = note.review.objectiveChanges || {};
    const planComments = note.review.comments.filter((c) =>
      ['longTermGoal','objectives','methods','materials','dataCollectionPlan'].includes(c.section));

    return `
      <div class="soap-section soap-feedback-mode">
        <div class="soap-feedback-banner">
          Supervisor review — accept or reject each change, then acknowledge comments.
          <button class="btn btn-sm btn-secondary" id="btn-accept-all-plan" style="margin-left:12px">Accept All</button>
        </div>

        ${renderFeedbackField('Long-Term Goal', 'longTermGoal', fe, note.plan.longTermGoal)}

        <div class="soap-section-divider">Short-Term Objectives</div>
        ${renderObjectiveFeedback(note.plan.objectives, oc)}

        ${renderFeedbackField('Methods / Procedures', 'methods', fe, note.plan.methods)}
        ${renderFeedbackField('Materials / Stimuli', 'materials', fe, note.plan.materials)}
        ${renderFeedbackField('Data Collection Plan', 'dataCollectionPlan', fe, note.plan.dataCollectionPlan)}

        ${renderCommentDisplay(planComments, 'plan')}
      </div>
    `;
  }

  // ── SOAP TAB ─────────────────────────────────────────────────────────────────

  function renderSoapTab(note, mode, isReviewed) {
    if (mode === 'student' && isReviewed) {
      return renderSoapFeedback(note);
    }

    return `
      <div class="soap-section">
        <div class="form-group">
          <label class="soap-label">Subjective</label>
          ${mode === 'supervisor' ? `<div class="sup-edit-hint">Edit below — changes will be tracked</div>` : ''}
          <textarea id="soap-subjective" class="soap-textarea" rows="3">${esc(note.soap.subjective)}</textarea>
        </div>
        <div class="form-group">
          <label class="soap-label">Objective Narrative</label>
          <textarea id="soap-obj-narrative" class="soap-textarea" rows="3">${esc(note.soap.objectiveNarrative)}</textarea>
        </div>

        <div class="soap-section-divider">Objective Data</div>
        <div id="data-rows-list"></div>
        ${n.plan.objectives.length > 0 ? `
          <button class="btn btn-sm btn-secondary soap-add-btn" id="btn-gen-from-plan">
            Generate Rows from Plan Objectives
          </button>
        ` : ''}
        <button class="btn btn-sm btn-secondary soap-add-btn" id="btn-add-data-row">+ Add Data Row</button>

        <div class="form-group" style="margin-top:16px">
          <label class="soap-label">Assessment</label>
          <textarea id="soap-assessment" class="soap-textarea" rows="3">${esc(note.soap.assessment)}</textarea>
        </div>
        <div class="form-group">
          <label class="soap-label">Plan</label>
          <textarea id="soap-plan" class="soap-textarea" rows="3">${esc(note.soap.soapPlan)}</textarea>
        </div>

        ${mode === 'supervisor' ? renderCommentEditor('soap', note) : ''}
      </div>
    `;
  }

  function renderSoapFeedback(note) {
    const fe = note.review.fieldEdits;
    const dc = note.review.dataRowChanges || {};
    const soapComments = note.review.comments.filter((c) =>
      ['subjective','objectiveNarrative','objectiveData','assessment','soapPlan'].includes(c.section));

    return `
      <div class="soap-section soap-feedback-mode">
        <div class="soap-feedback-banner">
          Supervisor review — accept or reject each change, then acknowledge comments.
          <button class="btn btn-sm btn-secondary" id="btn-accept-all-soap" style="margin-left:12px">Accept All</button>
        </div>

        ${renderFeedbackField('Subjective', 'subjective', fe, note.soap.subjective)}
        ${renderFeedbackField('Objective Narrative', 'objectiveNarrative', fe, note.soap.objectiveNarrative)}

        <div class="soap-section-divider">Objective Data</div>
        ${renderDataRowFeedback(note.soap.objectiveData, dc)}

        ${renderFeedbackField('Assessment', 'assessment', fe, note.soap.assessment)}
        ${renderFeedbackField('Plan', 'soapPlan', fe, note.soap.soapPlan)}

        ${renderCommentDisplay(soapComments, 'soap')}
      </div>
    `;
  }

  // ── EXPORT TAB ────────────────────────────────────────────────────────────────

  function renderExportTab() {
    return `
      <div class="soap-section" style="text-align:center;padding:32px">
        <h3 style="margin-bottom:8px">Export Session Note</h3>
        <p class="text-muted" style="margin-bottom:24px">Opens a printable version in a new tab. Use your browser's Print dialog (Ctrl+P / Cmd+P) to save as PDF.</p>
        <button class="btn btn-primary" id="btn-soap-print">Open Print View</button>
      </div>
    `;
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────────

  function renderFooter(note, mode, tab) {
    if (mode === 'supervisor') {
      return `<button class="btn btn-primary" id="btn-save-review">Save Review</button>`;
    }

    // Student mode
    const planReviewed = note.planStatus === 'reviewed';
    const soapReviewed = note.soapStatus === 'reviewed';
    const planComplete = note.planStatus === 'complete';
    const soapComplete = note.soapStatus === 'complete';

    const btns = [];

    if (tab !== 'export') {
      btns.push(`<button class="btn btn-secondary" id="btn-soap-save">Save Draft</button>`);
    }

    if (tab === 'plan' && !planReviewed && !planComplete && note.planStatus !== 'submitted') {
      btns.push(`<button class="btn btn-primary" id="btn-submit-plan">Submit Plan for Review</button>`);
    }
    if (tab === 'soap' && !soapReviewed && !soapComplete && note.soapStatus !== 'submitted') {
      btns.push(`<button class="btn btn-primary" id="btn-submit-soap">Submit SOAP for Review</button>`);
    }
    if (tab === 'plan' && planReviewed) {
      btns.push(`<button class="btn btn-primary" id="btn-mark-complete">Mark Plan Complete</button>`);
    }
    if (tab === 'soap' && soapReviewed) {
      btns.push(`<button class="btn btn-primary" id="btn-mark-complete">Mark SOAP Complete</button>`);
    }

    return btns.join('');
  }

  // ── COMMENT SYSTEM ────────────────────────────────────────────────────────────

  function renderCommentEditor(tab, note) {
    const sections = tab === 'plan'
      ? [{id:'longTermGoal',label:'Long-Term Goal'},{id:'objectives',label:'Objectives'},{id:'methods',label:'Methods'},{id:'materials',label:'Materials'},{id:'dataCollectionPlan',label:'Data Plan'}]
      : [{id:'subjective',label:'Subjective'},{id:'objectiveNarrative',label:'Objective Narrative'},{id:'objectiveData',label:'Objective Data'},{id:'assessment',label:'Assessment'},{id:'soapPlan',label:'Plan'}];

    const existing = note.review.comments.filter((c) => sections.some((s) => s.id === c.section));

    return `
      <div class="comment-editor-panel">
        <div class="soap-section-divider">Comments for Student</div>
        ${existing.length > 0 ? `<div class="comment-list">${existing.map(renderCommentCard).join('')}</div>` : ''}
        <div class="comment-add-form">
          <select id="comment-section" class="soap-select">
            ${sections.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}
          </select>
          <select id="comment-tag" class="soap-select">
            ${COMMENT_TAGS.map((t) => `<option value="${t}">${TAG_LABELS[t]}</option>`).join('')}
          </select>
          <textarea id="comment-text" class="soap-textarea" rows="2" placeholder="Write a comment for the student…"></textarea>
          <button class="btn btn-secondary btn-sm" id="btn-add-comment">Add Comment</button>
        </div>
      </div>
    `;
  }

  function renderCommentCard(c) {
    return `
      <div class="comment-card comment-tag-${c.tag}" data-comment-id="${c.id}">
        <div class="comment-card-header">
          <span class="comment-tag-label">${TAG_LABELS[c.tag] || c.tag}</span>
          <span class="comment-section-label">${c.section}</span>
          <button class="comment-delete-btn" data-delete-comment="${c.id}" title="Remove">✕</button>
        </div>
        <div class="comment-text">${esc(c.text)}</div>
      </div>
    `;
  }

  function renderCommentDisplay(comments, tab) {
    if (comments.length === 0) return '';
    return `
      <div class="comment-display-panel">
        <div class="soap-section-divider">Supervisor Comments</div>
        ${comments.map((c) => `
          <div class="comment-card comment-tag-${c.tag} ${c.readByStudent ? 'comment-read' : 'comment-unread'}" data-comment-id="${c.id}">
            <div class="comment-card-header">
              <span class="comment-tag-label">${TAG_LABELS[c.tag] || c.tag}</span>
              <span class="comment-section-label">${c.section}</span>
              ${c.readByStudent
                ? `<span class="comment-ack-badge">Acknowledged ✓</span>`
                : `<button class="btn btn-sm btn-secondary comment-ack-btn" data-ack="${c.id}">Acknowledge</button>`}
            </div>
            <div class="comment-text">${esc(c.text)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ── FEEDBACK FIELD RENDER ─────────────────────────────────────────────────────

  function renderFeedbackField(label, field, fieldEdits, currentValue) {
    const fe = fieldEdits[field];
    if (!fe) {
      // No supervisor edits — show current text as-is
      return `
        <div class="form-group">
          <label class="soap-label">${label}</label>
          <div class="soap-readonly-field">${esc(currentValue) || '<span class="text-muted">—</span>'}</div>
        </div>`;
    }
    const ops = computeDiff(fe.originalText, fe.supervisorText);
    const pending = countPendingHunks(ops, fe.acceptedHunks);
    return `
      <div class="form-group soap-diff-field" data-field="${field}">
        <label class="soap-label">${label}
          ${pending > 0 ? `<span class="pending-badge">${pending} pending</span>` : `<span class="resolved-badge">Resolved ✓</span>`}
        </label>
        <div class="diff-view">${renderDiffInteractive(ops, fe.acceptedHunks)}</div>
      </div>`;
  }

  // ── OBJECTIVE FEEDBACK ────────────────────────────────────────────────────────

  function renderObjectiveFeedback(objectives, objectiveChanges) {
    if (objectives.length === 0 && Object.keys(objectiveChanges).length === 0) {
      return `<p class="text-muted text-sm">No objectives.</p>`;
    }
    let html = '<div class="objectives-feedback-list">';
    for (const obj of objectives) {
      const ch = objectiveChanges[obj.id];
      if (ch && ch.action === 'delete') {
        const accepted = ch.accepted;
        html += `
          <div class="obj-feedback-row obj-deleted ${accepted === true ? 'obj-change-accepted' : accepted === false ? 'obj-change-rejected' : ''}">
            <div class="obj-change-label">Supervisor: Remove this objective</div>
            <div class="obj-text">${esc(obj.objectiveText)} <span class="cueing-badge">${obj.cueingLevel}</span></div>
            ${accepted === null
              ? `<div class="obj-change-btns">
                   <button class="btn btn-sm diff-accept-btn" data-obj-action="accept" data-obj-id="${obj.id}">Accept (Remove)</button>
                   <button class="btn btn-sm diff-reject-btn" data-obj-action="reject" data-obj-id="${obj.id}">Reject (Keep)</button>
                 </div>`
              : `<span class="obj-decision">${accepted ? 'Accepted — will be removed' : 'Rejected — kept'}</span>`}
          </div>`;
      } else if (ch && ch.action === 'modify') {
        const accepted = ch.accepted;
        html += `
          <div class="obj-feedback-row obj-modified ${accepted === true ? 'obj-change-accepted' : accepted === false ? 'obj-change-rejected' : ''}">
            <div class="obj-change-label">Supervisor edit:</div>
            <div class="obj-text"><strong>Original:</strong> ${esc(obj.objectiveText)}</div>
            <div class="obj-text"><strong>Revised:</strong> ${esc(ch.supervisorVersion.objectiveText)}</div>
            ${accepted === null
              ? `<div class="obj-change-btns">
                   <button class="btn btn-sm diff-accept-btn" data-obj-action="accept" data-obj-id="${obj.id}">Accept</button>
                   <button class="btn btn-sm diff-reject-btn" data-obj-action="reject" data-obj-id="${obj.id}">Reject</button>
                 </div>`
              : `<span class="obj-decision">${accepted ? 'Accepted' : 'Rejected'}</span>`}
          </div>`;
      } else {
        html += `
          <div class="obj-feedback-row">
            <div class="obj-text">${esc(obj.objectiveText)} <span class="cueing-badge">${obj.cueingLevel}</span></div>
          </div>`;
      }
    }
    // New objectives added by supervisor
    for (const [id, ch] of Object.entries(objectiveChanges)) {
      if (ch.action !== 'add') continue;
      const accepted = ch.accepted;
      html += `
        <div class="obj-feedback-row obj-added ${accepted === true ? 'obj-change-accepted' : accepted === false ? 'obj-change-rejected' : ''}">
          <div class="obj-change-label">Supervisor: New objective</div>
          <div class="obj-text">${esc(ch.supervisorVersion.objectiveText)} <span class="cueing-badge">${ch.supervisorVersion.cueingLevel}</span></div>
          ${accepted === null
            ? `<div class="obj-change-btns">
                 <button class="btn btn-sm diff-accept-btn" data-obj-action="accept" data-obj-id="${id}">Accept (Add)</button>
                 <button class="btn btn-sm diff-reject-btn" data-obj-action="reject" data-obj-id="${id}">Reject</button>
               </div>`
            : `<span class="obj-decision">${accepted ? 'Accepted — added' : 'Rejected'}</span>`}
        </div>`;
    }
    html += '</div>';
    return html;
  }

  // ── DATA ROW FEEDBACK ─────────────────────────────────────────────────────────

  function renderDataRowFeedback(rows, dataRowChanges) {
    const hasChanges = Object.keys(dataRowChanges).length > 0;
    if (rows.length === 0 && !hasChanges) return `<p class="text-muted text-sm">No data rows.</p>`;

    let html = `<div class="data-rows-feedback">
      <table class="soap-data-table">
        <thead><tr><th>Target</th><th>Trials</th><th>Correct</th><th>Accuracy</th><th>Cueing</th><th></th></tr></thead>
        <tbody>`;

    for (const row of rows) {
      const ch = dataRowChanges[row.id];
      if (ch && ch.action === 'delete') {
        html += `<tr class="row-deleted ${ch.accepted === true ? 'row-accepted' : ch.accepted === false ? 'row-rejected' : ''}">
          <td colspan="5"><del>${esc(row.target)}</del></td>
          <td>${ch.accepted === null
            ? `<button class="btn btn-sm diff-accept-btn" data-row-action="accept" data-row-id="${row.id}">Accept</button>
               <button class="btn btn-sm diff-reject-btn" data-row-action="reject" data-row-id="${row.id}">Reject</button>`
            : (ch.accepted ? '✓ Removed' : '✗ Kept')}</td>
        </tr>`;
      } else if (ch && ch.action === 'modify') {
        html += `<tr class="row-modified ${ch.accepted === true ? 'row-accepted' : ch.accepted === false ? 'row-rejected' : ''}">
          <td>${esc(ch.supervisorVersion.target)}</td>
          <td>${ch.supervisorVersion.trials ?? '—'}</td>
          <td>${ch.supervisorVersion.correct ?? '—'}</td>
          <td>${ch.supervisorVersion.accuracy ?? '—'}%</td>
          <td>${ch.supervisorVersion.cueing}</td>
          <td>${ch.accepted === null
            ? `<button class="btn btn-sm diff-accept-btn" data-row-action="accept" data-row-id="${row.id}">Accept</button>
               <button class="btn btn-sm diff-reject-btn" data-row-action="reject" data-row-id="${row.id}">Reject</button>`
            : (ch.accepted ? '✓' : '✗')}</td>
        </tr>`;
      } else {
        html += `<tr>
          <td>${esc(row.target)}</td><td>${row.trials??'—'}</td><td>${row.correct??'—'}</td>
          <td>${row.accuracy??'—'}%</td><td>${row.cueing}</td><td></td>
        </tr>`;
      }
    }
    // New rows added by supervisor
    for (const [id, ch] of Object.entries(dataRowChanges)) {
      if (ch.action !== 'add') continue;
      html += `<tr class="row-added ${ch.accepted === true ? 'row-accepted' : ch.accepted === false ? 'row-rejected' : ''}">
        <td>${esc(ch.supervisorVersion.target)}</td>
        <td>${ch.supervisorVersion.trials??'—'}</td><td>${ch.supervisorVersion.correct??'—'}</td>
        <td>${ch.supervisorVersion.accuracy??'—'}%</td><td>${ch.supervisorVersion.cueing}</td>
        <td>${ch.accepted === null
          ? `<button class="btn btn-sm diff-accept-btn" data-row-action="accept" data-row-id="${id}">Accept</button>
             <button class="btn btn-sm diff-reject-btn" data-row-action="reject" data-row-id="${id}">Reject</button>`
          : (ch.accepted ? '✓ Added' : '✗')}</td>
      </tr>`;
    }

    html += '</tbody></table></div>';
    return html;
  }

  // ── PLAN TAB WIRING ───────────────────────────────────────────────────────────

  function wirePlanTab() {
    // Render objectives list
    renderObjectivesList();

    container.querySelector('#btn-add-objective')?.addEventListener('click', () => {
      n.plan.objectives.push({
        id: newUuid(), objectiveText: '', cueingLevel: 'mod',
        condition: '', criterion: '', notes: '',
      });
      renderObjectivesList();
    });

    // Feedback mode: hunk accept/reject, obj changes, comments, accept-all
    wireHunkButtons('plan');
    wireObjChangeButtons();
    wireCommentButtons('plan');
    container.querySelector('#btn-accept-all-plan')?.addEventListener('click', () => {
      acceptAllHunks(PLAN_TEXT_FIELDS);
      acceptAllObjChanges();
      acknowledgeAllComments('plan');
      render();
      checkAutoComplete('plan');
    });

    // ITP panel: "Add to Plan" buttons
    if (options.itp && options.itp.completed) {
      container.querySelectorAll('.itp-add-obj-to-plan-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const fog = options.itp.functionalOutcomeGoals[+btn.dataset.fogIdx];
          const obj = fog?.objectives[+btn.dataset.objIdx];
          if (!obj) return;
          const alreadyAdded = n.plan.objectives.some((o) => o.objectiveText === obj.text);
          if (alreadyAdded) { flash('Already in plan.'); return; }
          n.plan.objectives.push({
            id:            newUuid(),
            objectiveText: obj.text,
            cueingLevel:   obj.cueing || 'mod',
            condition:     '',
            criterion:     obj.accuracy || '',
            notes:         '',
          });
          renderObjectivesList();
          flash('Objective added to plan.');
        });
      });
    }

    // Supervisor: add comment button
    wireSupervisorComments();
  }

  function wireSoapTab() {
    renderDataRowsList();

    container.querySelector('#btn-add-data-row')?.addEventListener('click', () => {
      n.soap.objectiveData.push({
        id: newUuid(), target: '', trials: null, correct: null, accuracy: null, cueing: 'mod',
      });
      renderDataRowsList();
    });

    container.querySelector('#btn-gen-from-plan')?.addEventListener('click', () => {
      let added = 0;
      for (const obj of n.plan.objectives) {
        const alreadyExists = n.soap.objectiveData.some((r) => r.target === obj.objectiveText);
        if (alreadyExists || !obj.objectiveText) continue;
        n.soap.objectiveData.push({
          id:       newUuid(),
          target:   obj.objectiveText,
          trials:   null,
          correct:  null,
          accuracy: null,
          cueing:   obj.cueingLevel || 'mod',
        });
        added++;
      }
      renderDataRowsList();
      if (added > 0) flash(`${added} data row${added > 1 ? 's' : ''} generated from plan.`);
      else flash('All plan objectives already have data rows.');
    });

    wireHunkButtons('soap');
    wireRowChangeButtons();
    wireCommentButtons('soap');
    container.querySelector('#btn-accept-all-soap')?.addEventListener('click', () => {
      acceptAllHunks(SOAP_TEXT_FIELDS);
      acceptAllRowChanges();
      acknowledgeAllComments('soap');
      render();
      checkAutoComplete('soap');
    });

    wireSupervisorComments();
  }

  // ── OBJECTIVES LIST (edit mode) ───────────────────────────────────────────────

  function renderObjectivesList() {
    const list = container.querySelector('#objectives-list');
    if (!list) return;
    if (n.plan.objectives.length === 0) {
      list.innerHTML = `<p class="text-muted text-sm" style="padding:4px 0">No objectives yet.</p>`;
      return;
    }
    list.innerHTML = n.plan.objectives.map((obj, idx) => `
      <div class="objective-row" data-obj-idx="${idx}">
        <div class="objective-row-header">
          <span class="objective-num">Objective ${idx + 1}</span>
          <button class="btn btn-sm btn-danger" data-remove-obj="${idx}">Remove</button>
        </div>
        <div class="form-group">
          <label>Objective Text</label>
          <textarea class="soap-textarea obj-text" data-obj-idx="${idx}" rows="2">${esc(obj.objectiveText)}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Cueing Level</label>
            <select class="soap-select obj-cueing" data-obj-idx="${idx}">
              ${CUEING_LEVELS.map((l) => `<option value="${l}" ${obj.cueingLevel===l?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Condition (optional)</label>
            <input class="obj-condition" data-obj-idx="${idx}" value="${esc(obj.condition)}" placeholder="Given a picture…">
          </div>
          <div class="form-group">
            <label>Criterion (optional)</label>
            <input class="obj-criterion" data-obj-idx="${idx}" value="${esc(obj.criterion)}" placeholder="80% accuracy…">
          </div>
        </div>
      </div>
    `).join('');

    // Wire live updates
    list.querySelectorAll('.obj-text').forEach((el) => {
      el.addEventListener('input', () => { n.plan.objectives[+el.dataset.objIdx].objectiveText = el.value; });
    });
    list.querySelectorAll('.obj-cueing').forEach((el) => {
      el.addEventListener('change', () => { n.plan.objectives[+el.dataset.objIdx].cueingLevel = el.value; });
    });
    list.querySelectorAll('.obj-condition').forEach((el) => {
      el.addEventListener('input', () => { n.plan.objectives[+el.dataset.objIdx].condition = el.value; });
    });
    list.querySelectorAll('.obj-criterion').forEach((el) => {
      el.addEventListener('input', () => { n.plan.objectives[+el.dataset.objIdx].criterion = el.value; });
    });
    list.querySelectorAll('[data-remove-obj]').forEach((btn) => {
      btn.addEventListener('click', () => {
        n.plan.objectives.splice(+btn.dataset.removeObj, 1);
        renderObjectivesList();
      });
    });
  }

  // ── DATA ROWS LIST (edit mode) ────────────────────────────────────────────────

  function renderDataRowsList() {
    const list = container.querySelector('#data-rows-list');
    if (!list) return;
    if (n.soap.objectiveData.length === 0) {
      list.innerHTML = `<p class="text-muted text-sm" style="padding:4px 0">No data rows yet.</p>`;
      return;
    }
    list.innerHTML = `
      <table class="soap-data-table">
        <thead><tr><th>Target</th><th>Trials</th><th>Correct</th><th>Accuracy %</th><th>Cueing</th><th></th></tr></thead>
        <tbody>
          ${n.soap.objectiveData.map((row, idx) => `
            <tr data-row-idx="${idx}">
              <td><input class="row-target" data-idx="${idx}" value="${esc(row.target)}" placeholder="Target"></td>
              <td><input type="number" class="row-trials" data-idx="${idx}" value="${row.trials??''}" style="width:60px" min="0"></td>
              <td><input type="number" class="row-correct" data-idx="${idx}" value="${row.correct??''}" style="width:60px" min="0"></td>
              <td><span class="row-accuracy-display" id="acc-${idx}">${row.accuracy != null ? row.accuracy + '%' : '—'}</span></td>
              <td>
                <select class="row-cueing" data-idx="${idx}">
                  ${CUEING_LEVELS.map((l) => `<option value="${l}" ${row.cueing===l?'selected':''}>${l}</option>`).join('')}
                </select>
              </td>
              <td><button class="btn btn-sm btn-danger" data-remove-row="${idx}">✕</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;

    // Wire live updates + auto-calculate accuracy
    list.querySelectorAll('.row-target').forEach((el) => {
      el.addEventListener('input', () => { n.soap.objectiveData[+el.dataset.idx].target = el.value; });
    });
    list.querySelectorAll('.row-trials, .row-correct').forEach((el) => {
      el.addEventListener('input', () => {
        const idx = +el.dataset.idx;
        const row = n.soap.objectiveData[idx];
        if (el.classList.contains('row-trials'))  row.trials  = el.value !== '' ? +el.value : null;
        if (el.classList.contains('row-correct')) row.correct = el.value !== '' ? +el.value : null;
        if (row.trials && row.correct != null) {
          row.accuracy = Math.round((row.correct / row.trials) * 100);
        } else {
          row.accuracy = null;
        }
        const accEl = list.querySelector(`#acc-${idx}`);
        if (accEl) accEl.textContent = row.accuracy != null ? row.accuracy + '%' : '—';
      });
    });
    list.querySelectorAll('.row-cueing').forEach((el) => {
      el.addEventListener('change', () => { n.soap.objectiveData[+el.dataset.idx].cueing = el.value; });
    });
    list.querySelectorAll('[data-remove-row]').forEach((btn) => {
      btn.addEventListener('click', () => {
        n.soap.objectiveData.splice(+btn.dataset.removeRow, 1);
        renderDataRowsList();
      });
    });
  }

  // ── HUNK ACCEPT/REJECT ────────────────────────────────────────────────────────

  function wireHunkButtons(tab) {
    container.querySelectorAll('.diff-accept-btn[data-id], .diff-reject-btn[data-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id     = +btn.dataset.id;
        const action = btn.dataset.action; // 'accept' | 'reject'
        // Find which field this hunk belongs to
        const fieldEl = btn.closest('[data-field]');
        if (!fieldEl) return;
        const field = fieldEl.dataset.field;
        if (!n.review.fieldEdits[field]) return;
        n.review.fieldEdits[field].acceptedHunks[id] = action;
        // Apply accepted text back to note
        const fe  = n.review.fieldEdits[field];
        const ops = computeDiff(fe.originalText, fe.supervisorText);
        const resolved = applyAccepted(ops, fe.acceptedHunks);
        setFieldValue(n, field, resolved);
        await doSave();
        render();
        checkAutoComplete(tab);
      });
    });
  }

  function wireObjChangeButtons() {
    container.querySelectorAll('[data-obj-action][data-obj-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id     = btn.dataset.objId;
        const action = btn.dataset.objAction; // 'accept'|'reject'
        const ch     = n.review.objectiveChanges[id];
        if (!ch) return;
        ch.accepted = action === 'accept';
        if (action === 'accept') {
          if (ch.action === 'delete') {
            n.plan.objectives = n.plan.objectives.filter((o) => o.id !== id);
          } else if (ch.action === 'modify') {
            const obj = n.plan.objectives.find((o) => o.id === id);
            if (obj) Object.assign(obj, ch.supervisorVersion);
          } else if (ch.action === 'add') {
            n.plan.objectives.push({id, ...ch.supervisorVersion});
          }
        }
        await doSave();
        render();
        checkAutoComplete('plan');
      });
    });
  }

  function wireRowChangeButtons() {
    container.querySelectorAll('[data-row-action][data-row-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id     = btn.dataset.rowId;
        const action = btn.dataset.rowAction;
        const ch     = n.review.dataRowChanges[id];
        if (!ch) return;
        ch.accepted = action === 'accept';
        if (action === 'accept') {
          if (ch.action === 'delete') {
            n.soap.objectiveData = n.soap.objectiveData.filter((r) => r.id !== id);
          } else if (ch.action === 'modify') {
            const row = n.soap.objectiveData.find((r) => r.id === id);
            if (row) Object.assign(row, ch.supervisorVersion);
          } else if (ch.action === 'add') {
            n.soap.objectiveData.push({id, ...ch.supervisorVersion});
          }
        }
        await doSave();
        render();
        checkAutoComplete('soap');
      });
    });
  }

  // ── COMMENT WIRING ────────────────────────────────────────────────────────────

  function wireSupervisorComments() {
    container.querySelector('#btn-add-comment')?.addEventListener('click', () => {
      const text    = val('#comment-text');
      const section = val('#comment-section');
      const tag     = val('#comment-tag');
      if (!text.trim()) return;
      n.review.comments.push({
        id: newUuid(), section, tag, text,
        createdAt: new Date().toISOString(), readByStudent: false,
      });
      render(); // re-render to show the new comment
    });

    container.querySelectorAll('[data-delete-comment]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.deleteComment;
        n.review.comments = n.review.comments.filter((c) => c.id !== id);
        render();
      });
    });
  }

  function wireCommentButtons(tab) {
    container.querySelectorAll('[data-ack]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.ack;
        const c  = n.review.comments.find((x) => x.id === id);
        if (c) c.readByStudent = true;
        await doSave();
        render();
        checkAutoComplete(tab);
      });
    });
  }

  // ── ACCEPT ALL ────────────────────────────────────────────────────────────────

  function acceptAllHunks(fields) {
    for (const field of fields) {
      const fe = n.review.fieldEdits[field];
      if (!fe) continue;
      const ops = computeDiff(fe.originalText, fe.supervisorText);
      for (const op of ops) {
        if (op.type !== 'equal') fe.acceptedHunks[op.id] = 'accept';
      }
      setFieldValue(n, field, fe.supervisorText);
    }
  }

  function acceptAllObjChanges() {
    for (const [id, ch] of Object.entries(n.review.objectiveChanges)) {
      if (ch.accepted !== null) continue;
      ch.accepted = true;
      if (ch.action === 'delete') {
        n.plan.objectives = n.plan.objectives.filter((o) => o.id !== id);
      } else if (ch.action === 'modify') {
        const obj = n.plan.objectives.find((o) => o.id === id);
        if (obj) Object.assign(obj, ch.supervisorVersion);
      } else if (ch.action === 'add') {
        n.plan.objectives.push({id, ...ch.supervisorVersion});
      }
    }
  }

  function acceptAllRowChanges() {
    for (const [id, ch] of Object.entries(n.review.dataRowChanges)) {
      if (ch.accepted !== null) continue;
      ch.accepted = true;
      if (ch.action === 'delete') {
        n.soap.objectiveData = n.soap.objectiveData.filter((r) => r.id !== id);
      } else if (ch.action === 'modify') {
        const row = n.soap.objectiveData.find((r) => r.id === id);
        if (row) Object.assign(row, ch.supervisorVersion);
      } else if (ch.action === 'add') {
        n.soap.objectiveData.push({id, ...ch.supervisorVersion});
      }
    }
  }

  function acknowledgeAllComments(tab) {
    const planSecs = ['longTermGoal','objectives','methods','materials','dataCollectionPlan'];
    const soapSecs = ['subjective','objectiveNarrative','objectiveData','assessment','soapPlan'];
    const secs = tab === 'plan' ? planSecs : soapSecs;
    n.review.comments.forEach((c) => { if (secs.includes(c.section)) c.readByStudent = true; });
  }

  // ── UTILITIES ─────────────────────────────────────────────────────────────────

  function flash(msg) {
    const el = container.querySelector('#soap-flash');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 2500);
  }

  function val(selector) {
    return container.querySelector(selector)?.value || '';
  }

  function getFieldValue(note, field) {
    if (PLAN_TEXT_FIELDS.includes(field)) return note.plan[field] || '';
    if (field === 'soapPlan') return note.soap.soapPlan || '';
    return note.soap[field] || '';
  }

  function setFieldValue(note, field, value) {
    if (PLAN_TEXT_FIELDS.includes(field)) { note.plan[field] = value; return; }
    if (field === 'soapPlan') { note.soap.soapPlan = value; return; }
    note.soap[field] = value;
  }

  render();
}

// ── Snapshot / change detection helpers ─────────────────────────────────────

function captureTextSnapshot(note) {
  return {
    longTermGoal:      note.plan.longTermGoal      || '',
    methods:           note.plan.methods           || '',
    materials:         note.plan.materials         || '',
    dataCollectionPlan: note.plan.dataCollectionPlan || '',
    subjective:        note.soap.subjective        || '',
    objectiveNarrative: note.soap.objectiveNarrative || '',
    assessment:        note.soap.assessment        || '',
    soapPlan:          note.soap.soapPlan          || '',
    objectives:        JSON.parse(JSON.stringify(note.plan.objectives  || [])),
    objectiveData:     JSON.parse(JSON.stringify(note.soap.objectiveData || [])),
  };
}

function collectObjectiveChanges(originalObjs, currentObjs) {
  const changes = {};
  const origMap = Object.fromEntries(originalObjs.map((o) => [o.id, o]));
  const currMap = Object.fromEntries(currentObjs.map((o) => [o.id, o]));

  for (const [id, orig] of Object.entries(origMap)) {
    if (!currMap[id]) {
      changes[id] = {action: 'delete', supervisorVersion: orig, accepted: null};
    } else if (JSON.stringify(orig) !== JSON.stringify(currMap[id])) {
      changes[id] = {action: 'modify', supervisorVersion: currMap[id], accepted: null};
    }
  }
  for (const [id, curr] of Object.entries(currMap)) {
    if (!origMap[id]) {
      changes[id] = {action: 'add', supervisorVersion: curr, accepted: null};
    }
  }
  return changes;
}

function collectDataRowChanges(originalRows, currentRows) {
  const changes = {};
  const origMap = Object.fromEntries(originalRows.map((r) => [r.id, r]));
  const currMap = Object.fromEntries(currentRows.map((r) => [r.id, r]));

  for (const [id, orig] of Object.entries(origMap)) {
    if (!currMap[id]) {
      changes[id] = {action: 'delete', supervisorVersion: orig, accepted: null};
    } else if (JSON.stringify(orig) !== JSON.stringify(currMap[id])) {
      changes[id] = {action: 'modify', supervisorVersion: currMap[id], accepted: null};
    }
  }
  for (const [id, curr] of Object.entries(currMap)) {
    if (!origMap[id]) {
      changes[id] = {action: 'add', supervisorVersion: curr, accepted: null};
    }
  }
  return changes;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
