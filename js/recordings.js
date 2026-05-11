const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const recordingsGrid = document.getElementById('recordings-grid');
const settingsButton = document.getElementById('settings-button');
const selectModeButton = document.getElementById('select-mode-button');
const selectModeLabel = document.getElementById('select-mode-label');
const recordingCardTemplate = document.getElementById('recording-card-template');
const bulkBar = document.getElementById('bulk-bar');
const bulkCount = document.getElementById('bulk-count');
const bulkSelectAll = document.getElementById('bulk-select-all');
const bulkDelete = document.getElementById('bulk-delete');

let recordings = [];
let selectMode = false;
let selected = new Set();

document.addEventListener('DOMContentLoaded', () => {
  settingsButton.addEventListener('click', openSettingsModal);
  selectModeButton.addEventListener('click', toggleSelectMode);
  bulkSelectAll.addEventListener('click', toggleSelectAll);
  bulkDelete.addEventListener('click', () => openDeleteModal(Array.from(selected)));
  loadRecordings();
});

function toggleSelectMode() {
  selectMode = !selectMode;
  selected.clear();
  recordingsGrid.classList.toggle('select-mode', selectMode);
  selectModeLabel.textContent = selectMode ? 'Cancel' : 'Select';
  updateBulkBar();
  // Clear visual selection state on cards
  recordingsGrid.querySelectorAll('.recording-card.selected').forEach(c => c.classList.remove('selected'));
}

function toggleSelectAll() {
  if (selected.size === recordings.length) {
    selected.clear();
    recordingsGrid.querySelectorAll('.recording-card').forEach(c => c.classList.remove('selected'));
  } else {
    recordings.forEach(r => selected.add(r.filename));
    recordingsGrid.querySelectorAll('.recording-card').forEach(c => c.classList.add('selected'));
  }
  updateBulkBar();
}

function updateBulkBar() {
  if (selectMode && selected.size > 0) {
    bulkBar.style.display = 'flex';
    bulkCount.textContent = `${selected.size} selected`;
    bulkSelectAll.textContent = selected.size === recordings.length ? 'Clear' : 'Select all';
  } else {
    bulkBar.style.display = 'none';
  }
}

function loadRecordings() {
  showLoading(true);

  if (!chrome.runtime || !chrome.runtime.sendMessage) {
    showEmpty(true);
    showLoading(false);
    return;
  }

  chrome.runtime.sendMessage({ action: "getRecordings" }, (response) => {
    if (chrome.runtime.lastError) {
      showEmpty(true);
      showLoading(false);
      return;
    }

    if (response && response.recordings) {
      recordings = response.recordings.sort((a, b) => new Date(b.date) - new Date(a.date));
      renderRecordings();
    } else {
      showEmpty(true);
    }
    showLoading(false);
  });

  setTimeout(() => {
    if (loadingState && loadingState.style.display === 'block') {
      showEmpty(true);
      showLoading(false);
    }
  }, 5000);
}

function renderRecordings() {
  recordingsGrid.innerHTML = '';

  if (recordings.length === 0) {
    showEmpty(true);
    return;
  }
  showEmpty(false);

  recordings.forEach((recording) => {
    const card = createRecordingCard(recording);
    recordingsGrid.appendChild(card);
  });
}

function createRecordingCard(recording) {
  const card = recordingCardTemplate.content.cloneNode(true);
  const cardElement = card.querySelector('.recording-card');
  cardElement.setAttribute('data-filename', recording.filename);

  card.querySelector('.recording-title').textContent = recording.title || 'Untitled Recording';
  card.querySelector('.recording-date').textContent = formatDate(recording.date);

  if (recording.slideCount && recording.slideCount > 0) {
    card.querySelector('.slide-count').textContent = `${recording.slideCount} slide${recording.slideCount > 1 ? 's' : ''}`;
  } else {
    card.querySelector('.slide-count').style.display = 'none';
  }

  cardElement.addEventListener('click', () => {
    if (selectMode) {
      toggleCardSelection(cardElement, recording.filename);
    } else {
      viewRecording(recording.filename);
    }
  });

  card.querySelector('.edit-tooltips').addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectMode) return;
    editRecordingTooltips(recording.filename);
  });

  card.querySelector('.export-html').addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectMode) return;
    exportToHtml(recording.filename);
  });

  card.querySelector('.delete-recording').addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectMode) return;
    openDeleteModal([recording.filename]);
  });

  return card;
}

function toggleCardSelection(cardElement, filename) {
  if (selected.has(filename)) {
    selected.delete(filename);
    cardElement.classList.remove('selected');
  } else {
    selected.add(filename);
    cardElement.classList.add('selected');
  }
  updateBulkBar();
}

function formatDate(dateString) {
  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return 'Unknown date';
  }
}

function showLoading(show) {
  if (loadingState) loadingState.style.display = show ? 'block' : 'none';
  if (recordingsGrid) recordingsGrid.style.display = show ? 'none' : 'grid';
}

function showEmpty(show) {
  if (emptyState) emptyState.style.display = show ? 'block' : 'none';
  if (recordingsGrid) recordingsGrid.style.display = show ? 'none' : 'grid';
}

// Settings modal
const DEFAULT_CONFIG = { CAPTURE_SHORTCUT: 'shift+c', SHOW_RECORDING_INDICATOR: false, DEBUG_MODE: false };
const settingsModal = document.getElementById('settings-modal');
const shortcutInput = document.getElementById('shortcut-input');
const showIndicatorCheckbox = document.getElementById('show-indicator');
const saveSettingsBtn = document.getElementById('save-settings');
const resetSettingsBtn = document.getElementById('reset-settings');
const modalCloseBtn = document.getElementById('modal-close');
const settingsStatus = document.getElementById('settings-status');

function openSettingsModal() {
  chrome.storage.sync.get('sirConfig', (data) => {
    const config = data.sirConfig || DEFAULT_CONFIG;
    shortcutInput.value = config.CAPTURE_SHORTCUT;
    showIndicatorCheckbox.checked = config.SHOW_RECORDING_INDICATOR;
  });
  settingsModal.style.display = 'flex';
}

function closeSettingsModal() {
  settingsModal.style.display = 'none';
  settingsStatus.style.display = 'none';
}

modalCloseBtn.addEventListener('click', closeSettingsModal);
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettingsModal(); });

saveSettingsBtn.addEventListener('click', () => {
  const shortcut = shortcutInput.value.trim().toLowerCase();
  if (!shortcut) return showSettingsStatus('Shortcut cannot be empty.', 'error');
  const config = { CAPTURE_SHORTCUT: shortcut, SHOW_RECORDING_INDICATOR: showIndicatorCheckbox.checked, DEBUG_MODE: false };
  chrome.storage.sync.set({ sirConfig: config }, () => showSettingsStatus('Settings saved!', 'success'));
});

resetSettingsBtn.addEventListener('click', () => {
  chrome.storage.sync.set({ sirConfig: DEFAULT_CONFIG }, () => {
    shortcutInput.value = DEFAULT_CONFIG.CAPTURE_SHORTCUT;
    showIndicatorCheckbox.checked = DEFAULT_CONFIG.SHOW_RECORDING_INDICATOR;
    showSettingsStatus('Reset to defaults.', 'success');
  });
});

function showSettingsStatus(message, type) {
  settingsStatus.textContent = message;
  settingsStatus.className = 'status-message ' + type;
  settingsStatus.style.display = 'block';
  setTimeout(() => { settingsStatus.style.display = 'none'; }, 2500);
}

function viewRecording(filename) {
  window.location.href = chrome.runtime.getURL(`viewer.html?recording=${filename}`);
}

function editRecordingTooltips(filename) {
  window.location.href = chrome.runtime.getURL(`tooltip-editor.html?recording=${filename}`);
}

function exportToHtml(filename) {
  chrome.runtime.sendMessage({ action: "getRecordingSlides", filename }, (response) => {
    if (chrome.runtime.lastError) {
      alert(`Error exporting HTML: ${chrome.runtime.lastError.message}`);
      return;
    }

    if (response && response.slides && response.slides.length > 0) {
      const recording = recordings.find(r => r.filename === filename);
      if (!recording) { alert('Recording not found'); return; }

      chrome.runtime.sendMessage({ action: "exportHtml", recording, slides: response.slides }, (exportResponse) => {
        if (chrome.runtime.lastError) alert(`Error exporting HTML: ${chrome.runtime.lastError.message}`);
      });
    } else {
      alert('No slides found for this recording');
    }
  });
}

// Delete confirmation modal
const deleteModal = document.getElementById('delete-modal');
const deleteModalMessage = document.getElementById('delete-modal-message');
const deleteModalClose = document.getElementById('delete-modal-close');
const deleteCancel = document.getElementById('delete-cancel');
const deleteConfirm = document.getElementById('delete-confirm');
let pendingDelete = [];

function openDeleteModal(filenames) {
  if (!filenames || filenames.length === 0) return;
  pendingDelete = filenames;
  const count = filenames.length;
  deleteModalMessage.textContent = count === 1
    ? 'This recording will be permanently deleted. This action cannot be undone.'
    : `${count} recordings will be permanently deleted. This action cannot be undone.`;
  deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
  deleteModal.style.display = 'none';
  pendingDelete = [];
}

deleteModalClose.addEventListener('click', closeDeleteModal);
deleteCancel.addEventListener('click', closeDeleteModal);
deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) closeDeleteModal(); });

deleteConfirm.addEventListener('click', () => {
  const targets = [...pendingDelete];
  closeDeleteModal();
  deleteRecordings(targets);
});

function deleteRecordings(filenames) {
  filenames.forEach(filename => {
    const cardElement = document.querySelector(`.recording-card[data-filename="${filename}"]`);
    if (cardElement) {
      cardElement.style.opacity = '0.5';
      cardElement.querySelectorAll('button').forEach(b => b.disabled = true);
    }
  });

  const action = filenames.length === 1 ? 'deleteRecording' : 'deleteRecordings';
  const payload = filenames.length === 1
    ? { action, filename: filenames[0] }
    : { action, filenames };

  chrome.runtime.sendMessage(payload, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) {
      alert('Failed to delete recording(s). Please try again.');
      filenames.forEach(filename => {
        const cardElement = document.querySelector(`.recording-card[data-filename="${filename}"]`);
        if (cardElement) {
          cardElement.style.opacity = '1';
          cardElement.querySelectorAll('button').forEach(b => b.disabled = false);
        }
      });
      return;
    }

    const removed = new Set(filenames);
    recordings = recordings.filter(r => !removed.has(r.filename));
    filenames.forEach(f => selected.delete(f));

    if (selectMode) {
      selectMode = false;
      selected.clear();
      recordingsGrid.classList.remove('select-mode');
      selectModeLabel.textContent = 'Select';
    }
    renderRecordings();
    updateBulkBar();
  });
}
