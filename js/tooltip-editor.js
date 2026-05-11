// DOM elements
const editorTitleEl = document.getElementById('editor-title');
const loadingStateEditorEl = document.getElementById('loading-state-editor');
const editorMainEl = document.querySelector('.editor-main');
const slideImageEditorEl = document.getElementById('slide-image-editor');
const currentSlideNumberEditorEl = document.getElementById('current-slide-number-editor');
const totalSlidesEditorEl = document.getElementById('total-slides-editor');
const tooltipInputEditorEl = document.getElementById('tooltip-input-editor');
const prevSlideEditorBtn = document.getElementById('prev-slide-editor');
const nextSlideEditorBtn = document.getElementById('next-slide-editor');
const slideInfoEl = document.getElementById('slide-info');
const slideCounterDisplayEl = document.getElementById('slide-counter-display');
const saveAllTooltipsBtn = document.getElementById('save-all-tooltips');
const backToRecordingsEditorBtn = document.getElementById('back-to-recordings-editor');
const statusMessageEditorEl = document.getElementById('status-message-editor');

// Global state
let recordingFilename = null;
let originalSlidesData = [];
let editableSlidesData = [];
let currentSlideIndex = 0;
let recordingMetadata = null;

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    recordingFilename = params.get('recording');

    if (!recordingFilename) {
        showStatus('Error: No recording filename provided.', 'error', true);
        loadingStateEditorEl.style.display = 'none';
        return;
    }

    loadRecordingData();

    // Event listeners
    prevSlideEditorBtn.addEventListener('click', showPrevSlide);
    nextSlideEditorBtn.addEventListener('click', showNextSlide);
    saveAllTooltipsBtn.addEventListener('click', saveAllTooltipChanges);
    backToRecordingsEditorBtn.addEventListener('click', () => {
        window.location.href = 'recordings.html';
    });

    // Update tooltip data and live preview as user types
    tooltipInputEditorEl.addEventListener('input', () => {
        if (editableSlidesData[currentSlideIndex]) {
            editableSlidesData[currentSlideIndex].tooltipText = tooltipInputEditorEl.value;
        }
        updatePreviewBubble(tooltipInputEditorEl.value);
    });

    // Add keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            showPrevSlide();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            showNextSlide();
        } else if (e.key === 'Escape') {
            window.location.href = 'recordings.html';
        }
    });
});

function loadRecordingData() {
    showLoading(true);
    
    // First, get all recordings to find the specific one by filename
    chrome.runtime.sendMessage({ action: "getRecordings" }, (response) => {
        if (chrome.runtime.lastError) {
            showStatus(`Error loading recordings: ${chrome.runtime.lastError.message}`, 'error', true);
            showLoading(false);
            return;
        }
        
        if (response && response.recordings) {
            recordingMetadata = response.recordings.find(r => r.filename === recordingFilename);
            if (!recordingMetadata) {
                showStatus('Error: Recording metadata not found.', 'error', true);
                showLoading(false);
                return;
            }
            
            editorTitleEl.textContent = `Tooltip Editor: ${recordingMetadata.title || 'Untitled Recording'}`;

            // Now get the slides for this specific recording
            chrome.runtime.sendMessage({ 
                action: "getRecordingSlides", 
                filename: recordingFilename 
            }, (slidesResponse) => {
                if (chrome.runtime.lastError) {
                    showStatus(`Error loading slides: ${chrome.runtime.lastError.message}`, 'error', true);
                    showLoading(false);
                    return;
                }
                
                if (slidesResponse && slidesResponse.slides && slidesResponse.slides.length > 0) {
                    originalSlidesData = slidesResponse.slides;
                    // Create a deep copy for editing
                    editableSlidesData = JSON.parse(JSON.stringify(originalSlidesData));
                    
                    // Initialize the display
                    displaySlide(0);
                    showLoading(false);
                } else {
                    showStatus('No slides found in this recording or error loading slides.', 'error', true);
                    showLoading(false);
                }
            });
        } else {
            showStatus('Error: Could not retrieve recordings list.', 'error', true);
            showLoading(false);
        }
    });
}

function displaySlide(index) {
    if (index < 0 || index >= editableSlidesData.length) return;

    currentSlideIndex = index;
    const slide = editableSlidesData[index];

    // Update image
    slideImageEditorEl.src = slide.image || '';
    slideImageEditorEl.alt = `Slide ${index + 1}`;
    
    // Update tooltip input
    tooltipInputEditorEl.value = slide.tooltipText || '';

    // Update slide numbers and counters
    const slideNum = index + 1;
    const totalSlides = editableSlidesData.length;
    
    currentSlideNumberEditorEl.textContent = slideNum;
    totalSlidesEditorEl.textContent = totalSlides;
    slideInfoEl.textContent = `Slide ${slideNum}/${totalSlides}`;
    slideCounterDisplayEl.textContent = `Slide ${slideNum}/${totalSlides}`;

    // Update navigation buttons
    prevSlideEditorBtn.disabled = index === 0;
    nextSlideEditorBtn.disabled = index === totalSlides - 1;

    // Wait for image to load — position dot and render preview bubble
    slideImageEditorEl.onload = () => {
        const imgWidth = slideImageEditorEl.width;
        const imgHeight = slideImageEditorEl.height;

        let dotX, dotY;
        if (slide.clickXPercent !== undefined && slide.clickYPercent !== undefined) {
            dotX = (slide.clickXPercent / 100) * imgWidth;
            dotY = (slide.clickYPercent / 100) * imgHeight;
        } else if (slide.exactClickX !== undefined && slide.exactClickY !== undefined) {
            dotX = slide.exactClickX * imgWidth;
            dotY = slide.exactClickY * imgHeight;
        } else if (slide.clientX !== undefined && slide.viewportWidth !== undefined) {
            dotX = slide.clientX * (imgWidth / slide.viewportWidth);
            dotY = slide.clientY * (imgHeight / slide.viewportHeight);
        } else {
            dotX = imgWidth / 2;
            dotY = imgHeight / 2;
        }

        // Remove stale click indicators
        const existingIndicator = document.querySelector('.click-indicator');
        if (existingIndicator) existingIndicator.remove();

        // Create hidden click indicator (used for click-to-next-slide)
        const clickIndicator = document.createElement('div');
        clickIndicator.className = 'click-indicator';
        clickIndicator.style.cssText = `position:absolute;left:${dotX}px;top:${dotY}px;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:transparent;z-index:12;cursor:pointer;`;
        clickIndicator.title = currentSlideIndex < editableSlidesData.length - 1 ? 'Click to go to next slide' : 'Last slide';
        clickIndicator.addEventListener('click', () => {
            if (currentSlideIndex < editableSlidesData.length - 1) showNextSlide();
        });
        slideImageEditorEl.parentElement.appendChild(clickIndicator);

        // Render preview dot + bubble
        updatePreviewBubble(slide.tooltipText || '', dotX, dotY, imgWidth);
    };

    // Focus on textarea for better UX
    tooltipInputEditorEl.focus();
}

function updatePreviewBubble(text, dotX, dotY, containerWidth) {
    const container = slideImageEditorEl.parentElement;
    container.querySelectorAll('.preview-dot, .preview-bubble').forEach(el => el.remove());

    // Use stored dot position if not passed
    if (dotX === undefined) {
        const dot = container.querySelector('.click-indicator');
        if (!dot) return;
        dotX = parseFloat(dot.style.left);
        dotY = parseFloat(dot.style.top);
        containerWidth = container.offsetWidth || 600;
    }

    // Dot marker
    const dotEl = document.createElement('div');
    dotEl.className = 'preview-dot';
    dotEl.style.left = `${dotX}px`;
    dotEl.style.top  = `${dotY}px`;
    container.appendChild(dotEl);

    if (!text) return;

    const bubble = document.createElement('div');
    bubble.className = 'preview-bubble';
    bubble.textContent = text;

    const DOT_OFFSET = 14;
    const flipLeft = dotX > containerWidth * 0.55;

    if (flipLeft) {
        bubble.classList.add('flip');
        bubble.style.right = `${containerWidth - dotX + DOT_OFFSET}px`;
    } else {
        bubble.style.left = `${dotX + DOT_OFFSET}px`;
    }
    bubble.style.top = `${dotY}px`;

    container.appendChild(bubble);
}

function showPrevSlide() {
    // Save current tooltip text before navigating
    if (editableSlidesData[currentSlideIndex]) {
        editableSlidesData[currentSlideIndex].tooltipText = tooltipInputEditorEl.value;
    }
    
    if (currentSlideIndex > 0) {
        displaySlide(currentSlideIndex - 1);
    }
}

function showNextSlide() {
    // Save current tooltip text before navigating
    if (editableSlidesData[currentSlideIndex]) {
        editableSlidesData[currentSlideIndex].tooltipText = tooltipInputEditorEl.value;
    }
    
    if (currentSlideIndex < editableSlidesData.length - 1) {
        displaySlide(currentSlideIndex + 1);
    }
}

function saveAllTooltipChanges() {
    // Ensure the current tooltip is captured
    if (editableSlidesData[currentSlideIndex]) {
        editableSlidesData[currentSlideIndex].tooltipText = tooltipInputEditorEl.value;
    }

    showStatus('Saving changes...', 'info');
    saveAllTooltipsBtn.disabled = true;
    saveAllTooltipsBtn.textContent = 'Saving...';

    if (!recordingMetadata) {
        showStatus('Error: Recording metadata not found. Cannot save.', 'error');
        resetSaveButton();
        return;
    }

    // Update the recording data with edited tooltips
    const updatedInteractions = recordingMetadata.data.map((interaction, index) => {
        if (editableSlidesData[index]) {
            return {
                ...interaction,
                tooltipText: editableSlidesData[index].tooltipText
            };
        }
        return interaction;
    });

    const updatedRecording = {
        ...recordingMetadata,
        data: updatedInteractions
    };

    chrome.runtime.sendMessage({
        action: "updateRecording",
        updatedRecording: updatedRecording
    }, (response) => {
        if (chrome.runtime.lastError) {
            showStatus(`Error saving: ${chrome.runtime.lastError.message}`, 'error');
            resetSaveButton();
            return;
        }
        
        if (response && response.success) {
            showStatus('Changes saved successfully!', 'success');
            originalSlidesData = JSON.parse(JSON.stringify(editableSlidesData));
        } else {
            showStatus(`Failed to save changes. ${response ? response.error : ''}`, 'error');
        }
        
        resetSaveButton();
    });
}

function resetSaveButton() {
    saveAllTooltipsBtn.disabled = false;
    saveAllTooltipsBtn.textContent = 'Save All Changes';
}

function showLoading(isLoading) {
    loadingStateEditorEl.style.display = isLoading ? 'flex' : 'none';
    editorMainEl.style.display = isLoading ? 'none' : 'flex';
}

function showStatus(message, type, persistent = false) {
    statusMessageEditorEl.textContent = message;
    statusMessageEditorEl.className = `status-message ${type}`;
    statusMessageEditorEl.style.display = 'block';

    if (!persistent) {
        setTimeout(() => {
            statusMessageEditorEl.style.display = 'none';
        }, 3000);
    }
}