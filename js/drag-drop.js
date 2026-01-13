/**
 * Drag & Drop | Image upload via drag and drop
 */

function initializeDragDrop() {
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop);
}

function handleDragOver(event) {
    event.preventDefault();
    if (isIdentifierTabActive()) {
        showDragOverlay();
    }
}

function handleDragLeave(event) {
    if (!isIdentifierTabActive()) return;
    
    if (!event.relatedTarget || 
        event.relatedTarget.nodeName === "HTML" || 
        event.clientX <= 0 || 
        event.clientY <= 0 || 
        event.clientX >= window.innerWidth || 
        event.clientY >= window.innerHeight) {
        forcehideDragOverlay();
        return;
    }
    
    if (!event.relatedTarget || event.relatedTarget.nodeName === "HTML") {
        setTimeout(() => {
            const dragOverlay = document.querySelector(".drag-overlay");
            if (dragOverlay && !dragOverlay.classList.contains("visible")) {
                resetDragOverlay();
            }
        }, 100);
        
        const dragOverlay = document.querySelector(".drag-overlay");
        document.body.classList.remove("dragging");
        dragOverlay?.classList.remove("visible");
    }
}

function handleDrop(event) {
    event.preventDefault();
    
    if (!isIdentifierTabActive()) return;
    
    forcehideDragOverlay();
    setTimeout(() => forcehideDragOverlay(), 100);
    
    const files = event.dataTransfer.files;
    const text = event.dataTransfer.getData("text/plain");
    
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith("image/")) {
            handleFileUpload(file);
        } else {
            showAlert("Please drop a valid image file.", "warning");
        }
    } else if (text) {
        if (isValidDiscordImageUrl(text)) {
            showLoadingModal("Fetching...");
            downloadImage(text);
        } else {
            showAlert("Please drop a valid Discord image URL.", "warning");
        }
    }
}

function handleFileUpload(file) {
    forcehideDragOverlay();
    showLoadingModal("Uploading...");
    checkFileSize(file);
}

function showDragOverlay() {
    const dragOverlay = document.querySelector(".drag-overlay");
    if (dragOverlay) {
        dragOverlay.style.visibility = "visible";
        dragOverlay.style.opacity = "1";
        dragOverlay.style.display = "flex";
        document.body.classList.add("dragging");
        dragOverlay.classList.add("visible");
    }
}

function resetDragOverlay() {
    const dragOverlay = document.querySelector(".drag-overlay");
    if (dragOverlay) {
        document.body.classList.remove("dragging");
        dragOverlay.classList.remove("visible");
        dragOverlay.style.display = "none";
        dragOverlay.style.visibility = "";
        dragOverlay.style.opacity = "";
    }
}

function forcehideDragOverlay() {
    const dragOverlay = document.querySelector(".drag-overlay");
    if (dragOverlay) {
        document.body.classList.remove("dragging");
        dragOverlay.classList.remove("visible");
        dragOverlay.style.display = "none";
        dragOverlay.style.visibility = "hidden";
        dragOverlay.style.opacity = "0";
    }
}
