// Shared navigation — clinician selector tab bar
// Used by both Observation Notes and Evaluations modules

export function renderClinicianSelector(state, onSelect, onReorder) {
  const container = document.getElementById('clinician-tabs');
  container.hidden = state.clinicians.length === 0;
  container.innerHTML = '';

  let dragSrcId = null;

  for (const c of state.clinicians) {
    const btn = document.createElement('button');
    btn.className = 'clinician-tab' + (c.id === state.selectedClinicianId ? ' active' : '');
    btn.textContent = c.name.split(' ')[0]; // First name only
    btn.dataset.id = c.id;
    btn.addEventListener('click', () => onSelect(c.id));

    if (onReorder) {
      btn.draggable = true;
      btn.title = 'Drag to reorder';

      btn.addEventListener('dragstart', (e) => {
        dragSrcId = c.id;
        btn.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      btn.addEventListener('dragend', () => {
        btn.classList.remove('dragging');
        container.querySelectorAll('.clinician-tab').forEach((b) => b.classList.remove('drag-over'));
      });

      btn.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.querySelectorAll('.clinician-tab').forEach((b) => b.classList.remove('drag-over'));
        if (c.id !== dragSrcId) btn.classList.add('drag-over');
      });

      btn.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragSrcId || dragSrcId === c.id) return;
        const ids = [...container.querySelectorAll('.clinician-tab')].map((b) => b.dataset.id);
        const srcIdx = ids.indexOf(dragSrcId);
        const dstIdx = ids.indexOf(c.id);
        ids.splice(srcIdx, 1);
        ids.splice(dstIdx, 0, dragSrcId);
        onReorder(ids);
      });
    }

    container.appendChild(btn);
  }
}
