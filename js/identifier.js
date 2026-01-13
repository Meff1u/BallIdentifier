/**
 * Identifier | Image upload, comparison and results
 */

const DISCORD_IMAGE_PATTERN = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/\d+\/\d+\/[^?]+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_DIMENSION = 800;

function initializeIdentifier() {
    setupNotesToggle();
    setupFileInput();
    setupPasteHandlers();
    setupDexSelector();
    setupChangelog();
    setupCopyButton();
}

function setupNotesToggle() {
    const toggleNotes = document.getElementById("toggleNotes");
    const notesContainer = document.getElementById("notesContainer");
    
    toggleNotes?.addEventListener("click", () => {
        new bootstrap.Collapse(notesContainer);
    });
    
    notesContainer?.addEventListener("shown.bs.collapse", () => {
        document.getElementById("arrow").textContent = "▲";
    });
    
    notesContainer?.addEventListener("hidden.bs.collapse", () => {
        document.getElementById("arrow").textContent = "▼";
    });
}

function setupFileInput() {
    const fileInput = document.getElementById("fileInput");
    
    fileInput?.addEventListener("change", function() {
        const file = this.files[0];
        if (file) {
            showLoadingModal("Comparing...");
            checkFileSize(file);
        }
        this.value = '';
    });
}

function setupPasteHandlers() {
    document.addEventListener("paste", handlePasteEvent);
    document.getElementById("pasteButton")?.addEventListener("click", handlePasteButtonClick);
}

function handlePasteEvent(event) {
    const loadingModal = document.getElementById("loadingModal");
    const resultModal = document.getElementById("resultModal");
    
    if (loadingModal?.classList.contains("show") || resultModal?.classList.contains("show")) return;
    
    const items = event.clipboardData.items;
    
    for (const item of items) {
        if (item.type.includes("image")) {
            const file = item.getAsFile();
            if (file) {
                showLoadingModal("Comparing...");
                checkFileSize(file);
            }
            return;
        }
        
        if (item.type === "text/plain") {
            item.getAsString(text => {
                if (isValidDiscordImageUrl(text)) {
                    showLoadingModal("Fetching...");
                    downloadImage(text);
                }
            });
        }
    }
}

async function handlePasteButtonClick() {
    try {
        const items = await navigator.clipboard.read();
        
        for (const item of items) {
            if (item.types.includes("image/png") || item.types.includes("image/jpeg")) {
                const blob = await item.getType("image/png");
                const file = new File([blob], "pasted_image.png", { type: blob.type });
                showLoadingModal("Comparing...");
                checkFileSize(file);
                return;
            }
            
            if (item.types.includes("text/plain")) {
                const blob = await item.getType("text/plain");
                const text = await blob.text();
                
                if (isValidDiscordImageUrl(text)) {
                    showLoadingModal("Fetching...");
                    downloadImage(text);
                }
            }
        }
    } catch (error) {
        console.error("Error reading clipboard:", error);
    }
}

function isValidDiscordImageUrl(url) {
    return DISCORD_IMAGE_PATTERN.test(url);
}

async function downloadImage(url) {
    try {
        const response = await fetch(".netlify/functions/downloadImage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url })
        });
        
        if (!response.ok) {
            const text = await response.text();
            let errorData;
            try { errorData = JSON.parse(text); } catch { errorData = { error: text }; }
            throw new Error(JSON.stringify(errorData));
        }
        
        const blob = await response.blob();
        const file = new File([blob], "downloaded_image.png", { type: blob.type });
        showLoadingModal("Comparing...");
        checkFileSize(file);
        
    } catch (error) {
        console.error("Error downloading image:", error);
        hideLoadingModal();
        showAlert(getDownloadErrorMessage(error), "danger");
    }
}

function getDownloadErrorMessage(error) {
    try {
        const errorData = JSON.parse(error.message);
        if (errorData.errorType === 'Function.ResponseSizeTooLarge') return "Image is too large to download. Maximum size is 6MB.";
        if (errorData.errorMessage) return errorData.errorMessage;
    } catch {
        const msg = error.message;
        if (msg.includes('Invalid content type')) return "The link doesn't point to a valid image file.";
        if (msg.includes('403') || msg.includes('Forbidden')) return "Access denied. The image link may have expired.";
        if (msg.includes('404') || msg.includes('Not Found')) return "Image not found. The link may be broken.";
        if (msg.includes('too large') || msg.includes('ResponseSizeTooLarge')) return "Image is too large. Maximum size is 6MB.";
        if (msg.includes('timeout')) return "Request timed out. Please try again.";
    }
    return "Error downloading image. Please try again.";
}

function checkFileSize(file) {
    if (file.size >= MAX_FILE_SIZE) {
        compressImage(file);
    } else {
        uploadFile(file);
    }
}

function compressImage(file) {
    const img = new Image();
    const reader = new FileReader();
    
    reader.onload = (e) => { img.src = e.target.result; };
    
    img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        let { width, height } = img;
        
        if (width > height && width > MAX_DIMENSION) {
            height = (height * MAX_DIMENSION) / width;
            width = MAX_DIMENSION;
        } else if (height > MAX_DIMENSION) {
            width = (width * MAX_DIMENSION) / height;
            height = MAX_DIMENSION;
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(blob => uploadFile(blob), "image/jpeg", 0.8);
    };
    
    reader.readAsDataURL(file);
}

async function uploadFile(file) {
    const selectedDex = document.getElementById("dexSelector").value;
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("dex", selectedDex);
    
    try {
        const response = await fetch("/.netlify/functions/compareImage", {
            method: "POST",
            body: formData
        });
        
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Server error (${response.status}): ${text}`);
        }
        
        const data = JSON.parse(await response.text());
        transitionToResult(data.country, data.diff);
        
    } catch (error) {
        console.error("Error:", error);
        hideLoadingModal();
        showAlert(getUploadErrorMessage(error), "danger");
    }
}

function getUploadErrorMessage(error) {
    const msg = error.message;
    if (msg.includes('413')) return "Image file is too large. Please try a smaller image.";
    if (msg.includes('504') || msg.includes('timeout')) return "Request timed out. Please try again.";
    if (msg.includes('500')) return "Server error. Please try again.";
    if (msg.includes('Unsupported image format') || msg.includes('Invalid image file')) return "Invalid image format. Please upload a JPEG, PNG, WebP, or GIF.";
    if (msg.includes('Magic bytes check failed')) return "The file is not a valid image or may be corrupted.";
    if (msg.includes('Empty or invalid file buffer')) return "The uploaded file appears to be empty or corrupted.";
    if (msg.includes('File too small')) return "The file is too small to be a valid image.";
    return "Error processing image. Please ensure you're uploading a valid image file.";
}

function transitionToResult(country, diff) {
    hideLoadingModal();
    setTimeout(() => showResultModal(country, diff), 200);
}

function showResultModal(country, diff) {
    const resultTitle = document.getElementById("resultTitle");
    const resultSubtitle = document.getElementById("resultSubtitle");
    const resultImage = document.getElementById("resultImage");
    const resultCredits = document.getElementById("resultCredits");
    const resultModalContent = document.querySelector("#resultModal .modal-content");
    const resultModalHeader = document.querySelector("#resultModal .modal-header");
    const dex = document.getElementById("dexSelector").value;
    
    const similarity = 100 - diff;
    const { borderColor, headerClass, titleClass } = getSimilarityStyles(similarity);
    
    resultModalContent.style.borderColor = borderColor;
    resultModalContent.className = "modal-content bg-dark border-2";
    resultModalContent.style.borderWidth = "2px";
    resultModalContent.style.borderStyle = "solid";
    
    resultModalHeader.className = `modal-header ${headerClass}`;
    resultTitle.className = `modal-title ${titleClass}`;
    
    resultTitle.textContent = country;
    resultSubtitle.textContent = `Similarity: ${similarity}%`;
    resultImage.src = `assets/${dex}/${country}.png`;
    
    fetchBallData(dex, country, resultCredits);
    
    const modalDialog = document.querySelector('#resultModal .modal-dialog');
    modalDialog.classList.add('modal-transition-grow');
    
    window.resultModal?.show();
    
    setTimeout(() => { modalDialog.classList.remove('modal-transition-grow'); }, 350);
}

function getSimilarityStyles(similarity) {
    if (similarity >= 90) return { borderColor: "var(--bs-success)", headerClass: "border-success", titleClass: "text-success" };
    if (similarity >= 80) return { borderColor: "#ffc107", headerClass: "border-warning", titleClass: "text-warning" };
    if (similarity >= 75) return { borderColor: "#fd7e14", headerClass: "border-warning", titleClass: "text-warning" };
    return { borderColor: "#dc3545", headerClass: "border-danger", titleClass: "text-danger" };
}

async function fetchBallData(dex, country, resultCredits) {
    try {
        const response = await fetch(`assets/jsons/${dex}.json`);
        const data = await response.json();
        const ball = data[country];
        resultCredits.textContent = ball ? `Rarity: #${ball.rarity} | Artist: ${ball.artist || "Unknown"}` : "";
    } catch (error) {
        console.error("Error fetching ball data:", error);
    }
}

function setupDexSelector() {
    const dexSelector = document.getElementById("dexSelector");
    
    dexSelector?.addEventListener("change", function() {
        updateLogo(this.value);
        updateTitleWithBallCount();
    });
}

function updateLogo(dex) {
    const logo = document.querySelector(".logo");
    if (logo) logo.src = `assets/icons/${dex}.png`;
}

async function updateTitleWithBallCount() {
    const dex = document.getElementById("dexSelector").value;
    
    try {
        const response = await fetch(`assets/jsons/${dex}Hashes.json`);
        const data = await response.json();
        document.getElementById("title").textContent = `(${Object.keys(data).length} entries)`;
    } catch (error) {
        console.error("Error fetching ball data:", error);
    }
}

function setupChangelog() {
    document.getElementById("changelogButton")?.addEventListener("click", loadChangelog);
}

async function loadChangelog() {
    try {
        const response = await fetch("changelog.json");
        const data = await response.json();
        
        const changelogList = document.getElementById("changelogList");
        changelogList.innerHTML = "";
        
        data.changes.forEach(change => {
            const changeItem = document.createElement("div");
            changeItem.className = "changelog-item";
            
            const date = new Date(change.timestamp * 1000);
            const formattedDate = date.toLocaleString("en-GB", {
                day: "2-digit", month: "long", year: "numeric",
                hour: "2-digit", minute: "2-digit", hour12: false
            });
            
            changeItem.innerHTML = `<strong>${formattedDate}</strong><ul>${change.changes.map(c => `<li>${c}</li>`).join("")}</ul>`;
            changelogList.appendChild(changeItem);
        });
        
        window.changelogOffcanvas?.show();
    } catch (error) {
        console.error("Error fetching changelog:", error);
    }
}

function setupCopyButton() {
    document.getElementById("copyButton")?.addEventListener("click", copyResultTitle);
}

async function copyResultTitle() {
    const resultTitle = document.getElementById("resultTitle").textContent;
    const copyButton = document.getElementById("copyButton");
    const originalText = copyButton.innerHTML;
    
    try {
        await navigator.clipboard.writeText(resultTitle);
    } catch {
        const textarea = document.createElement("textarea");
        textarea.value = resultTitle;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
    }
    
    copyButton.classList.add("btn-success-copied");
    copyButton.innerHTML = '<i class="bi bi-check-circle me-2"></i>Copied!';
    copyButton.disabled = true;
    
    setTimeout(() => {
        copyButton.classList.remove("btn-success-copied");
        copyButton.innerHTML = originalText;
        copyButton.disabled = false;
    }, 1500);
}
