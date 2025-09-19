document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("dexSelector").value = "Ballsdex";
    updateTitleWithBallCount();
    
    const loadingModal = new bootstrap.Modal(document.getElementById('loadingModal'));
    const resultModal = new bootstrap.Modal(document.getElementById('resultModal'));
    const changelogOffcanvas = new bootstrap.Offcanvas(document.getElementById('changelogOffcanvas'));
    
    window.loadingModal = loadingModal;
    window.resultModal = resultModal;
    window.changelogOffcanvas = changelogOffcanvas;
    
    document.getElementById('loadingModal').addEventListener('hidden.bs.modal', function () {
        console.log('Loading modal fully hidden');
        this.style.display = 'none';
    });
    
    document.getElementById('resultModal').addEventListener('hidden.bs.modal', function () {
        console.log('Result modal fully hidden');
        document.getElementById("resultImage").src = "";
    });
    
    document.getElementById('loadingModal').addEventListener('shown.bs.modal', function () {
        console.log('Loading modal fully shown');
    });
});

document.getElementById("toggleNotes").addEventListener("click", function() {
    const notesContainer = document.getElementById("notesContainer");
    const collapse = new bootstrap.Collapse(notesContainer);
});

document.getElementById("notesContainer").addEventListener("shown.bs.collapse", function() {
    document.getElementById("arrow").textContent = "▲";
});

document.getElementById("notesContainer").addEventListener("hidden.bs.collapse", function() {
    document.getElementById("arrow").textContent = "▼";
});

document.getElementById("fileInput").addEventListener("change", function () {
    const file = this.files[0];
    console.log(file);
    if (file) {
        showLoadingModal("Comparing...");
        checkFileSize(file);
    }
});

document.addEventListener("paste", function (event) {
    const loadingModalElement = document.getElementById("loadingModal");
    const resultModalElement = document.getElementById("resultModal");

    if (loadingModalElement.classList.contains("show") || resultModalElement.classList.contains("show")) {
        console.log("Paste action blocked: Loading or result modal is active.");
        return;
    }

    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            console.log(file);
            if (file) {
                showLoadingModal("Comparing...");
                checkFileSize(file);
            }
        } else if (items[i].type === "text/plain") {
            items[i].getAsString(function (text) {
                const discordImageUrlPattern =
                    /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/\d+\/\d+\/[^?]+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/;
                if (discordImageUrlPattern.test(text)) {
                    showLoadingModal("Fetching...");
                    downloadImage(text);
                }
            });
        }
    }
});

document.getElementById("pasteButton").addEventListener("click", function () {
    navigator.clipboard
        .read()
        .then((items) => {
            for (let item of items) {
                if (item.types.includes("image/png") || item.types.includes("image/jpeg")) {
                    item.getType("image/png").then((blob) => {
                        const file = new File([blob], "pasted_image.png", { type: blob.type });
                        showLoadingModal("Comparing...");
                        checkFileSize(file);
                    });
                } else if (item.types.includes("text/plain")) {
                    item.getType("text/plain").then((blob) => {
                        blob.text().then((text) => {
                            const discordImageUrlPattern =
                                /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/\d+\/\d+\/[^?]+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/;
                            if (discordImageUrlPattern.test(text)) {
                                showLoadingModal("Fetching...");
                                downloadImage(text);
                            }
                        });
                    });
                }
            }
        })
        .catch((error) => {
            console.error("Error reading clipboard contents:", error);
        });
});

function downloadImage(url) {
    const body = document.body;
    const dragOverlay = document.querySelector(".drag-overlay");
    body.classList.remove("dragging");
    dragOverlay.classList.remove("visible");
    dragOverlay.style.display = "none";
    
    fetch(".netlify/functions/downloadImage", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: url }),
    })
        .then((response) => response.blob())
        .then((blob) => {
            const file = new File([blob], "downloaded_image.png", { type: blob.type });
            showLoadingModal("Comparing...");
            checkFileSize(file);
        })
        .catch((error) => {
            console.error("Error downloading the image:", error);
            hideLoadingModal();
            showAlert("Error downloading image. Please try again.", "danger");
        });
}

function checkFileSize(file) {
    const maxSize = 5.5 * 1024 * 1024;

    if (file.size >= maxSize) {
        console.log("File is larger than or equal to 6MB. Compressing...");

        const img = new Image();
        const reader = new FileReader();

        reader.onload = function (event) {
            img.src = event.target.result;
        };

        img.onload = function () {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            canvas.width = 1000;
            canvas.height = 1000 * (img.height / img.width);

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
                function (blob) {
                    uploadFile(blob);
                    console.log(`New Size: ${blob.size / 1024 / 1024}MB`);
                    console.log("File compressed successfully.");
                },
                file.type,
                1
            );
        };

        reader.readAsDataURL(file);
    } else {
        uploadFile(file);
    }
}

function uploadFile(file) {
    const selectedDex = document.getElementById("dexSelector").value;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("dex", selectedDex);

    fetch("/.netlify/functions/compareImage", {
        method: "POST",
        body: formData,
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            return response.text();
        })
        .then((text) => {
            const data = JSON.parse(text);
            console.log("Response data:", data);
            transitionToResult(data.country, data.diff);
        })
        .catch((error) => {
            console.error("Error:", error);
            hideLoadingModal();
            showAlert("Error processing image. Please try again.", "danger");
        });
}

function showLoadingModal(text) {
    const body = document.body;
    const dragOverlay = document.querySelector(".drag-overlay");
    if (dragOverlay) {
        body.classList.remove("dragging");
        dragOverlay.classList.remove("visible");
        dragOverlay.style.display = "none";
    }
    
    const loadingText = document.getElementById("loading-text");
    loadingText.textContent = text;
    
    if (window.resultModal) {
        window.resultModal.hide();
    }
    
    const loadingModalElement = document.getElementById('loadingModal');
    loadingModalElement.style.display = '';
    
    if (window.loadingModal) {
        window.loadingModal.show();
    }
}

function hideLoadingModal() {
    if (window.loadingModal) {
        const loadingModalElement = document.getElementById('loadingModal');
        loadingModalElement.classList.remove('show');
        
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.remove();
        }
        
        window.loadingModal.hide();
        
        setTimeout(() => {
            loadingModalElement.style.display = 'none';
        }, 50);
    }
}

function transitionToResult(country, diff) {
    hideLoadingModal();
    
    setTimeout(() => {
        showResultModal(country, diff);
    }, 200);
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
    
    let borderColor, headerClass, titleClass;
    
    if (similarity >= 90) {
        borderColor = "var(--bs-success)";
        headerClass = "border-success";
        titleClass = "text-success";
    } else if (similarity >= 80) {
        borderColor = "#ffc107";
        headerClass = "border-warning";
        titleClass = "text-warning";
    } else if (similarity >= 75) {
        borderColor = "#fd7e14";
        headerClass = "border-warning";
        titleClass = "text-warning";
        borderColor = "#fd7e14";
    } else {
        borderColor = "#dc3545";
        headerClass = "border-danger";
        titleClass = "text-danger";
    }
    
    resultModalContent.style.borderColor = borderColor;
    resultModalContent.className = `modal-content bg-dark border-2`;
    resultModalContent.style.borderWidth = "2px";
    resultModalContent.style.borderStyle = "solid";
    
    resultModalHeader.className = `modal-header ${headerClass}`;
    resultTitle.className = `modal-title ${titleClass}`;

    resultTitle.textContent = `${country}`;
    resultSubtitle.textContent = `Similarity: ${similarity}%`;
    resultImage.src = `assets/${dex}/${country}.png`;

    fetch(`assets/jsons/${dex}.json`)
        .then((response) => response.json())
        .then((data) => {
            const ball = data[country];
            if (ball) {
                resultCredits.textContent = `Rarity: #${ball.rarity} | Artist: ${
                    ball.artist || "Unknown"
                }`;
            } else {
                resultCredits.textContent = "";
            }
        })
        .catch((error) => console.error("Error fetching ball data:", error));

    const modalDialog = document.querySelector('#resultModal .modal-dialog');
    modalDialog.classList.add('modal-transition-grow');
    
    if (window.resultModal) {
        window.resultModal.show();
    }
    
    setTimeout(() => {
        modalDialog.classList.remove('modal-transition-grow');
    }, 350);
}

document.getElementById("dexSelector").addEventListener("change", function () {
    const selectedDex = this.value;
    updateLogo(selectedDex);
    updateTitleWithBallCount();
});

function updateTitleWithBallCount() {
    const dex = document.getElementById("dexSelector").value;
    fetch(`assets/jsons/${dex}Hashes.json`)
        .then((response) => response.json())
        .then((data) => {
            document.getElementById("title").textContent = `(${
                Object.keys(data).length
            } balls)`;
        })
        .catch((error) => console.error("Error fetching ball data:", error));
}

function updateLogo(dex) {
    const logo = document.querySelector(".logo");
    logo.src = `assets/icons/${dex}.png`;
}

document.getElementById("changelogButton").addEventListener("click", function () {
    fetch("changelog.json")
        .then((response) => response.json())
        .then((data) => {
            const changelogList = document.getElementById("changelogList");
            changelogList.innerHTML = "";
            data.changes.forEach((change) => {
                const changeItem = document.createElement("div");
                changeItem.classList.add("changelog-item");
                const date = new Date(change.timestamp * 1000);
                const formattedDate = date.toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
                changeItem.innerHTML = `<strong>${formattedDate}</strong><ul>${change.changes
                    .map((c) => `<li>${c}</li>`)
                    .join("")}</ul>`;
                changelogList.appendChild(changeItem);
            });
            
            if (window.changelogOffcanvas) {
                window.changelogOffcanvas.show();
            }
        })
        .catch((error) => console.error("Error fetching changelog:", error));
});

document.getElementById("copyButton").addEventListener("click", function () {
    const resultTitle = document.getElementById("resultTitle").textContent;
    
    navigator.clipboard.writeText(resultTitle).then(() => {
        const copyButton = document.getElementById("copyButton");
        const originalText = copyButton.innerHTML;
        
        copyButton.classList.add("btn-success-copied");
        copyButton.innerHTML = '<i class="bi bi-check-circle me-2"></i>Copied!';
        copyButton.disabled = true;

        setTimeout(function () {
            copyButton.classList.remove("btn-success-copied");
            copyButton.innerHTML = originalText;
            copyButton.disabled = false;
        }, 1500);
    }).catch(() => {
        const textarea = document.createElement("textarea");
        textarea.value = resultTitle;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);

        const copyButton = document.getElementById("copyButton");
        const originalText = copyButton.innerHTML;
        
        copyButton.classList.add("btn-success-copied");
        copyButton.innerHTML = '<i class="bi bi-check-circle me-2"></i>Copied!';
        copyButton.disabled = true;

        setTimeout(function () {
            copyButton.classList.remove("btn-success-copied");
            copyButton.innerHTML = originalText;
            copyButton.disabled = false;
        }, 1500);
    });
});

function forcehideDragOverlay() {
    const body = document.body;
    const dragOverlay = document.querySelector(".drag-overlay");
    if (dragOverlay) {
        body.classList.remove("dragging");
        dragOverlay.classList.remove("visible");
        dragOverlay.style.display = "none";
        dragOverlay.style.visibility = "hidden";
        dragOverlay.style.opacity = "0";
    }
}

const body = document.body;
const dragOverlay = document.querySelector(".drag-overlay");

document.addEventListener("dragover", (event) => {
    event.preventDefault();
    body.classList.add("dragging");
    dragOverlay.classList.add("visible");
    dragOverlay.style.display = "flex";
});

document.addEventListener("dragleave", (event) => {
    if (event.target === document || event.target === body) {
        body.classList.remove("dragging");
        dragOverlay.classList.remove("visible");
        setTimeout(() => {
            if (!dragOverlay.classList.contains("visible")) {
                dragOverlay.style.display = "none";
            }
        }, 300);
    }
});

document.addEventListener("drop", (event) => {
    event.preventDefault();
    
    forcehideDragOverlay();
    
    setTimeout(() => {
        forcehideDragOverlay();
    }, 100);

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
        const discordImageUrlPattern =
            /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/\d+\/\d+\/[^?]+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/;
        if (discordImageUrlPattern.test(text)) {
            showLoadingModal("Fetching...");
            downloadImage(text);
        } else {
            showAlert("Please drop a valid Discord image URL.", "warning");
        }
    }
});

function handleFileUpload(file) {
    forcehideDragOverlay();
    showLoadingModal("Uploading...");
    checkFileSize(file);
}

function showAlert(message, type = "primary") {
    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = "top: 80px; left: 50%; transform: translateX(-50%); z-index: 1060; min-width: 300px;";
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 3000);
}

document.getElementById("spawnArtsButton").addEventListener("click", function () {
    window.open(`https://ballidentifier.xyz/list`, "_blank");
});

document.getElementById("discordBotButton").addEventListener("click", function () {
    window.open(`https://ballidentifier.xyz/bot`, "_blank");
});

document.querySelectorAll('.btn, .form-select').forEach(element => {
    element.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-2px)';
    });
    
    element.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
    });
});