// ITP Editor — Initial Treatment Plan for student and supervisor.
// Handles header, Functional Outcome Goals, Semester Objectives, and EBP articles.
//
// renderItpEditor(container, itp, options, onBack)
//   options: { viewMode: 'student'|'supervisor', clinician, supervisorId, semesterId }
import { saveItp, saveItpAsStudent } from './itp-storage.js';
import { exportItpDocx }             from './itp-export.js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../config/firebase-config.js';

const MAX_OBJECTIVES_PER_FOG = 3;
const MAX_EBP_ARTICLES       = 4;

function _newId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function renderItpEditor(container, itp, options, onBack) {
  const { viewMode, clinician, supervisorId, semesterId } = options;
  let n = JSON.parse(JSON.stringify(itp)); // working copy

  // 'header' | 'fogs' | 'ebp'
  let activeSection = 'header';

  // ── Full render ────────────────────────────────────────────────────────────

  function render() {
    container.innerHTML = `
      <div class="itp-editor">

        <div class="soap-editor-topbar">
          <button class="btn btn-secondary btn-sm" id="btn-itp-back">← Back</button>
          <div class="soap-editor-title">
            <strong>${esc(clinician.name)}</strong> — Initial Treatment Plan
          </div>
          <span class="itp-status-pill ${n.completed ? 'itp-status-complete' : 'itp-status-draft'}">
            ${n.completed ? 'Complete ✓' : 'Draft'}
          </span>
        </div>

        ${n.completed && viewMode === 'student' ? `
          <div class="itp-completed-banner">
            ITP is marked complete — SOAP therapy plan notes will use your ITP objectives.
            Click <strong>Edit ITP</strong> below to make changes.
          </div>
        ` : ''}

        <div class="itp-section-tabs">
          <button class="itp-tab ${activeSection==='header'?'active':''}" data-section="header">Header</button>
          <button class="itp-tab ${activeSection==='fogs'?'active':''}" data-section="fogs">Goals &amp; Objectives</button>
          <button class="itp-tab ${activeSection==='ebp'?'active':''}" data-section="ebp">EBP Articles</button>
        </div>

        <div id="itp-section-body">
          ${activeSection === 'header' ? renderHeaderSection() : ''}
          ${activeSection === 'fogs'   ? renderFogsSection()   : ''}
          ${activeSection === 'ebp'    ? renderEbpSection()    : ''}
        </div>

        <div class="itp-editor-footer">
          <button class="btn btn-secondary" id="btn-itp-save">Save</button>
          ${n.completed
            ? `<button class="btn btn-secondary" id="btn-itp-unlock">Edit ITP</button>
               <span class="itp-complete-badge">ITP Complete ✓</span>`
            : `<button class="btn btn-primary" id="btn-itp-complete">Mark ITP Complete</button>`}
          <button class="btn btn-secondary" id="btn-itp-export" style="margin-left:auto">Export Word</button>
        </div>

        <div id="itp-flash" class="soap-flash" hidden></div>
      </div>
    `;
    wire();
  }

  // ── Header section ─────────────────────────────────────────────────────────

  function renderHeaderSection() {
    const h = n.header;
    const dis = isLocked() ? 'disabled' : '';
    return `
      <div class="card">
        <h3 class="section-header">Treatment Plan Header</h3>
        <div class="form-row-3">
          <div class="form-group">
            <label>Clinician Name</label>
            <input type="text" id="itp-h-clinician" value="${esc(h.clinicianName)}" ${dis}>
          </div>
          <div class="form-group">
            <label>Client (First Name / Initials)</label>
            <input type="text" id="itp-h-client" value="${esc(h.clientDisplay)}" ${dis}>
          </div>
          <div class="form-group">
            <label>Supervisor</label>
            <input type="text" id="itp-h-supervisor" value="${esc(h.supervisorName)}" ${dis}>
          </div>
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label>Semester</label>
            <input type="text" id="itp-h-semester" value="${esc(h.semester)}" ${dis}>
          </div>
          <div class="form-group">
            <label>Diagnosis</label>
            <input type="text" id="itp-h-diagnosis" value="${esc(h.diagnosis)}" placeholder="Primary diagnosis" ${dis}>
          </div>
          <div class="form-group">
            <label>Type of Service / Schedule</label>
            <input type="text" id="itp-h-service" value="${esc(h.serviceType)}" placeholder="e.g., Individual, 2×/week, 45 min" ${dis}>
          </div>
        </div>
      </div>
    `;
  }

  // ── FOG section ────────────────────────────────────────────────────────────

  function renderFogsSection() {
    return `
      <div id="itp-fogs-list">${renderFogsList()}</div>
      ${!isLocked() ? `
        <div style="padding:4px 0 12px">
          <button class="btn btn-secondary" id="btn-itp-add-fog">+ Add Functional Outcome Goal</button>
        </div>
      ` : ''}
    `;
  }

  function renderFogsList() {
    if (n.functionalOutcomeGoals.length === 0) {
      return '<p class="text-muted text-sm" style="padding:8px 0">No goals added yet.</p>';
    }
    return n.functionalOutcomeGoals.map((fog, fi) => renderFogCard(fog, fi)).join('');
  }

  function renderFogCard(fog, fi) {
    const dis = isLocked() ? 'disabled' : '';
    return `
      <div class="itp-fog-card card" data-fog-id="${fog.id}">
        <div class="itp-fog-card-header">
          <span class="itp-fog-num">Functional Outcome Goal ${fi + 1}</span>
          ${!isLocked() ? `
            <button class="btn btn-sm btn-danger" data-remove-fog="${fog.id}">Remove Goal</button>
          ` : ''}
        </div>
        <div class="form-group">
          <label>Goal Statement <span class="label-hint">(broad, long-term)</span></label>
          <textarea class="soap-textarea itp-fog-goal-ta" data-fog-id="${fog.id}" rows="3" ${dis}>${esc(fog.goal)}</textarea>
        </div>
        <div class="soap-section-divider">Semester Objectives</div>
        <div class="itp-obj-list" data-fog-id="${fog.id}">
          ${fog.objectives.map((obj, oi) => renderObjRow(obj, oi, fog.id, dis)).join('')}
        </div>
        ${!isLocked() ? `
          <button class="btn btn-sm btn-secondary itp-add-obj-btn" data-fog-id="${fog.id}" style="margin-top:8px">
            + Add Objective
          </button>
        ` : ''}
      </div>
    `;
  }

  function renderObjRow(obj, oi, fogId, dis) {
    return `
      <div class="itp-obj-row" data-obj-id="${obj.id}" data-fog-id="${fogId}">
        <div class="itp-obj-num-row">
          <span class="itp-obj-num">Objective ${oi + 1}</span>
          ${!dis ? `
            <button class="btn btn-sm btn-danger itp-remove-obj-btn"
              data-obj-id="${obj.id}" data-fog-id="${fogId}">Remove</button>
          ` : ''}
        </div>
        <div class="form-group">
          <label>Objective</label>
          <textarea class="soap-textarea itp-obj-text-ta" rows="2"
            data-obj-id="${obj.id}" data-fog-id="${fogId}" ${dis}>${esc(obj.text)}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Accuracy Level</label>
            <input type="text" class="itp-obj-accuracy-in"
              data-obj-id="${obj.id}" data-fog-id="${fogId}"
              value="${esc(obj.accuracy)}" placeholder="e.g., 80%" ${dis}>
          </div>
          <div class="form-group">
            <label>Cueing Level</label>
            <input type="text" class="itp-obj-cueing-in"
              data-obj-id="${obj.id}" data-fog-id="${fogId}"
              value="${esc(obj.cueing)}" placeholder="e.g., minimal cueing" ${dis}>
          </div>
        </div>
      </div>
    `;
  }

  // ── EBP section ────────────────────────────────────────────────────────────

  function renderEbpSection() {
    const articles = n.ebpArticles || [];
    return `
      <div class="card">
        <h3 class="section-header">Evidence-Based Practice Articles</h3>
        <p class="text-muted text-sm" style="margin-bottom:14px">
          Upload 2–4 research articles (PDF). The AI will generate a clinical summary, key findings,
          treatment rationale, and APA 7 citation for you to review and edit before saving.
          PDFs are <strong>not stored</strong> — only the AI-generated text.
        </p>
        <div id="itp-ebp-articles">
          ${articles.length === 0
            ? '<p class="text-muted text-sm">No articles added yet.</p>'
            : articles.map((a, ai) => renderEbpCard(a, ai)).join('')}
        </div>
        ${viewMode === 'student' && articles.length < MAX_EBP_ARTICLES ? `
          <div style="margin-top:12px">
            <button class="btn btn-secondary" id="btn-itp-add-ebp">+ Analyze Research Article (PDF)</button>
            <input type="file" id="itp-ebp-file-input" accept=".pdf" hidden>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderEbpCard(a, ai) {
    return `
      <div class="itp-ebp-card" data-ebp-idx="${ai}" data-ebp-id="${a.id}">
        <div class="itp-ebp-card-header">
          <span class="itp-fog-num">Article ${ai + 1}</span>
          ${viewMode === 'student' ? `
            <button class="btn btn-sm btn-danger itp-remove-ebp-btn" data-ebp-id="${a.id}">Remove</button>
          ` : ''}
        </div>
        <div class="form-group">
          <label>APA 7 Citation</label>
          <textarea class="soap-textarea itp-ebp-citation-ta" data-ebp-id="${a.id}" rows="3">${esc(a.citation)}</textarea>
        </div>
        <div class="form-group">
          <label>Clinical Summary</label>
          <textarea class="soap-textarea itp-ebp-summary-ta" data-ebp-id="${a.id}" rows="3">${esc(a.summary)}</textarea>
        </div>
        <div class="form-group">
          <label>Key Findings <span class="label-hint">(one per line)</span></label>
          <textarea class="soap-textarea itp-ebp-findings-ta" data-ebp-id="${a.id}" rows="3">${esc((a.keyFindings||[]).join('\n'))}</textarea>
        </div>
        <div class="form-group">
          <label>Treatment Rationale <span class="label-hint">(how this article supports your objectives)</span></label>
          <textarea class="soap-textarea itp-ebp-rationale-ta" data-ebp-id="${a.id}" rows="3">${esc(a.rationale)}</textarea>
        </div>
      </div>
    `;
  }

  // ── Wire all events ────────────────────────────────────────────────────────

  function wire() {
    // Back
    container.querySelector('#btn-itp-back')?.addEventListener('click', onBack);

    // Section tabs
    container.querySelectorAll('.itp-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        collectCurrentSection();
        activeSection = tab.dataset.section;
        render();
      });
    });

    // Save
    container.querySelector('#btn-itp-save')?.addEventListener('click', async () => {
      collectCurrentSection();
      await doSave();
      flash('Saved.');
    });

    // Mark complete / unlock
    container.querySelector('#btn-itp-complete')?.addEventListener('click', async () => {
      if (!confirm('Mark this ITP as complete?\nTherapy plan notes will use your ITP objectives.')) return;
      collectCurrentSection();
      n.completed = true;
      await doSave();
      render();
    });
    container.querySelector('#btn-itp-unlock')?.addEventListener('click', async () => {
      n.completed = false;
      await doSave();
      render();
    });

    // Export
    container.querySelector('#btn-itp-export')?.addEventListener('click', () => {
      collectCurrentSection();
      exportItpDocx(n, clinician, options.settings);
    });

    // Header live input
    if (activeSection === 'header') wireHeaderInputs();

    // FOGs
    if (activeSection === 'fogs') wireFogs();

    // EBP
    if (activeSection === 'ebp') wireEbp();
  }

  function wireHeaderInputs() {
    const map = {
      '#itp-h-clinician': 'clinicianName',
      '#itp-h-client':    'clientDisplay',
      '#itp-h-supervisor':'supervisorName',
      '#itp-h-semester':  'semester',
      '#itp-h-diagnosis': 'diagnosis',
      '#itp-h-service':   'serviceType',
    };
    for (const [sel, field] of Object.entries(map)) {
      container.querySelector(sel)?.addEventListener('input', (e) => {
        n.header[field] = e.target.value;
      });
    }
  }

  function wireFogs() {
    // Live updates — fog goal textareas
    container.querySelectorAll('.itp-fog-goal-ta').forEach((el) => {
      el.addEventListener('input', () => {
        const fog = findFog(el.dataset.fogId);
        if (fog) fog.goal = el.value;
      });
    });

    // Live updates — objective fields
    container.querySelectorAll('.itp-obj-text-ta').forEach((el) => {
      el.addEventListener('input', () => {
        const obj = findObj(el.dataset.fogId, el.dataset.objId);
        if (obj) obj.text = el.value;
      });
    });
    container.querySelectorAll('.itp-obj-accuracy-in').forEach((el) => {
      el.addEventListener('input', () => {
        const obj = findObj(el.dataset.fogId, el.dataset.objId);
        if (obj) obj.accuracy = el.value;
      });
    });
    container.querySelectorAll('.itp-obj-cueing-in').forEach((el) => {
      el.addEventListener('input', () => {
        const obj = findObj(el.dataset.fogId, el.dataset.objId);
        if (obj) obj.cueing = el.value;
      });
    });

    // Add FOG
    container.querySelector('#btn-itp-add-fog')?.addEventListener('click', () => {
      n.functionalOutcomeGoals.push({
        id:         _newId(),
        goal:       '',
        objectives: [{ id: _newId(), text: '', accuracy: '', cueing: '' }],
      });
      rerenderFogsList();
    });

    // Remove FOG (via event delegation)
    container.querySelectorAll('[data-remove-fog]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('Remove this functional outcome goal and all its objectives?')) return;
        n.functionalOutcomeGoals = n.functionalOutcomeGoals.filter((f) => f.id !== btn.dataset.removeFog);
        rerenderFogsList();
      });
    });

    // Add objective
    container.querySelectorAll('.itp-add-obj-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fog = findFog(btn.dataset.fogId);
        if (!fog) return;
        if (fog.objectives.length >= MAX_OBJECTIVES_PER_FOG) {
          alert(`Maximum ${MAX_OBJECTIVES_PER_FOG} objectives per goal.`);
          return;
        }
        fog.objectives.push({ id: _newId(), text: '', accuracy: '', cueing: '' });
        rerenderFogsList();
      });
    });

    // Remove objective
    container.querySelectorAll('.itp-remove-obj-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fog = findFog(btn.dataset.fogId);
        if (!fog) return;
        if (fog.objectives.length <= 1) {
          alert('Each goal must have at least one objective.');
          return;
        }
        fog.objectives = fog.objectives.filter((o) => o.id !== btn.dataset.objId);
        rerenderFogsList();
      });
    });
  }

  function rerenderFogsList() {
    const fogsListEl = container.querySelector('#itp-fogs-list');
    if (!fogsListEl) return;
    fogsListEl.innerHTML = renderFogsList();
    wireFogs();
  }

  function wireEbp() {
    // Live updates — article text fields
    container.querySelectorAll('.itp-ebp-citation-ta').forEach((el) => {
      el.addEventListener('input', () => {
        const a = findArticle(el.dataset.ebpId);
        if (a) a.citation = el.value;
      });
    });
    container.querySelectorAll('.itp-ebp-summary-ta').forEach((el) => {
      el.addEventListener('input', () => {
        const a = findArticle(el.dataset.ebpId);
        if (a) a.summary = el.value;
      });
    });
    container.querySelectorAll('.itp-ebp-findings-ta').forEach((el) => {
      el.addEventListener('input', () => {
        const a = findArticle(el.dataset.ebpId);
        if (a) a.keyFindings = el.value.split('\n').filter((l) => l.trim());
      });
    });
    container.querySelectorAll('.itp-ebp-rationale-ta').forEach((el) => {
      el.addEventListener('input', () => {
        const a = findArticle(el.dataset.ebpId);
        if (a) a.rationale = el.value;
      });
    });

    // Remove article
    container.querySelectorAll('.itp-remove-ebp-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        n.ebpArticles = n.ebpArticles.filter((a) => a.id !== btn.dataset.ebpId);
        await doSave();
        render();
      });
    });

    // Add article via PDF upload
    const addBtn   = container.querySelector('#btn-itp-add-ebp');
    const fileInput = container.querySelector('#itp-ebp-file-input');
    addBtn?.addEventListener('click', () => fileInput.click());
    fileInput?.addEventListener('change', (e) => handleEbpUpload(e.target.files[0]));
  }

  async function handleEbpUpload(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('PDF is too large. Please use a file under 8 MB.');
      return;
    }

    // Add a placeholder article
    const newArticle = {
      id:          _newId(),
      citation:    '',
      summary:     '',
      keyFindings: [],
      rationale:   '',
      addedAt:     new Date().toISOString(),
    };
    n.ebpArticles.push(newArticle);

    // Re-render EBP section to show the new card immediately with a loading state
    const ebpContainer = container.querySelector('#itp-ebp-articles');
    if (ebpContainer) {
      ebpContainer.innerHTML = (n.ebpArticles).map((a, ai) => renderEbpCard(a, ai)).join('');
      // Show loading indicator on the last (new) card
      const lastCard = ebpContainer.lastElementChild;
      if (lastCard) {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'itp-analyze-spinner';
        loadingDiv.id        = `ebp-loading-${newArticle.id}`;
        loadingDiv.textContent = '⏳ Analyzing article with AI…';
        lastCard.insertBefore(loadingDiv, lastCard.querySelector('.form-group'));
      }
      wireEbp();
    }

    // Convert PDF to base64
    let pdfBase64;
    try {
      pdfBase64 = await fileToBase64(file);
    } catch {
      alert('Failed to read the PDF file.');
      n.ebpArticles = n.ebpArticles.filter((a) => a.id !== newArticle.id);
      render();
      return;
    }

    // Collect all current ITP objectives for context
    const objectives = [];
    for (const fog of n.functionalOutcomeGoals) {
      for (const obj of fog.objectives) {
        if (obj.text.trim()) objectives.push(obj.text.trim());
      }
    }

    // Call the Cloud Function
    try {
      const functions      = getFunctions(app);
      const analyzeArticle = httpsCallable(functions, 'analyzeArticle');
      const result         = await analyzeArticle({ pdfBase64, objectives });
      const data           = result.data;

      // Update the article in working copy
      const idx = n.ebpArticles.findIndex((a) => a.id === newArticle.id);
      if (idx !== -1) {
        n.ebpArticles[idx].citation    = data.citation    || '';
        n.ebpArticles[idx].summary     = data.summary     || '';
        n.ebpArticles[idx].keyFindings = data.keyFindings || [];
        n.ebpArticles[idx].rationale   = data.rationale   || '';
      }

      await doSave();
      render(); // re-render to show populated fields
      flash('Article analyzed. Review and edit the text, then save.');
    } catch (err) {
      // Remove the placeholder on failure
      n.ebpArticles = n.ebpArticles.filter((a) => a.id !== newArticle.id);
      const msg = err.code === 'functions/not-found'
        ? 'The article analysis function is not deployed yet. See the SETUP.md for deployment instructions.'
        : `Analysis failed: ${err.message}`;
      alert(msg);
      render();
    }
  }

  // ── Collect form data before section switch or save ────────────────────────

  function collectCurrentSection() {
    if (activeSection === 'header') {
      const map = {
        '#itp-h-clinician': 'clinicianName',
        '#itp-h-client':    'clientDisplay',
        '#itp-h-supervisor':'supervisorName',
        '#itp-h-semester':  'semester',
        '#itp-h-diagnosis': 'diagnosis',
        '#itp-h-service':   'serviceType',
      };
      for (const [sel, field] of Object.entries(map)) {
        const el = container.querySelector(sel);
        if (el) n.header[field] = el.value;
      }
    }
    // FOG and EBP fields are collected live via input listeners — no extra collect needed
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function doSave() {
    if (viewMode === 'student') {
      await saveItpAsStudent(n, supervisorId);
    } else {
      await saveItp(n);
    }
  }

  function flash(msg) {
    const el = container.querySelector('#itp-flash');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 2500);
  }

  // ── Lookup helpers ─────────────────────────────────────────────────────────

  function findFog(fogId) {
    return n.functionalOutcomeGoals.find((f) => f.id === fogId);
  }

  function findObj(fogId, objId) {
    const fog = findFog(fogId);
    return fog ? fog.objectives.find((o) => o.id === objId) : null;
  }

  function findArticle(ebpId) {
    return (n.ebpArticles || []).find((a) => a.id === ebpId);
  }

  function isLocked() {
    return n.completed && viewMode === 'student';
  }

  // ── First render ───────────────────────────────────────────────────────────
  render();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      // Strip "data:application/pdf;base64," prefix
      const result = reader.result;
      const comma  = result.indexOf(',');
      resolve(comma !== -1 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
