document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("dexSelector").value = "Ballsdex";
    updateTitleWithBallCount();
});

document.getElementById("toggleNotes").addEventListener("click", function() {
    const notesContainer = document.getElementById("notesContainer");
    const arrow = document.getElementById("arrow");
    if (notesContainer.classList.contains("visible")) {
        notesContainer.classList.remove("visible");
        arrow.textContent = "▼";
    } else {
        notesContainer.classList.add("visible");
        arrow.textContent = "▲";
    }
});

document.getElementById("fileInput").addEventListener("change", function () {
    const file = this.files[0];
    console.log(file);
    if (file) {
        showLoadingPopup("Comparing...");
        checkFileSize(file);
    }
});

document.addEventListener("paste", function (event) {
    const loadingPopup = document.getElementById("loadingPopup");
    const resultPopup = document.getElementById("resultPopup");

    if (loadingPopup.style.display === "flex" || resultPopup.style.display === "block") {
        console.log("Paste action blocked: Loading or result popup is active.");
        return;
    }

    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            console.log(file);
            if (file) {
                showLoadingPopup("Comparing...");
                checkFileSize(file);
            }
        } else if (items[i].type === "text/plain") {
            items[i].getAsString(function (text) {
                const discordImageUrlPattern =
                    /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/\d+\/\d+\/[^?]+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/;
                if (discordImageUrlPattern.test(text)) {
                    showLoadingPopup("Fetching...");
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
                        showLoadingPopup("Comparing...");
                        checkFileSize(file);
                    });
                } else if (item.types.includes("text/plain")) {
                    item.getType("text/plain").then((blob) => {
                        blob.text().then((text) => {
                            const discordImageUrlPattern =
                                /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/\d+\/\d+\/[^?]+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/;
                            if (discordImageUrlPattern.test(text)) {
                                showLoadingPopup("Fetching...");
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
            showLoadingPopup("Comparing...");
            checkFileSize(file);
        })
        .catch((error) => {
            console.error("Error downloading the image:", error);
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
            hideLoadingPopup();
            showResultPopup(data.country, data.diff);
        })
        .catch((error) => {
            console.error("Error:", error);
            hideLoadingPopup();
        });
}

function showLoadingPopup(text) {
    const loadingPopup = document.getElementById("loadingPopup");
    const loadingText = document.getElementById("loading-text");
    loadingText.textContent = text;
    const overlay = document.getElementById("overlay");
    loadingPopup.style.display = "flex";
    overlay.style.display = "block";
    loadingPopup.style.animation = "fadeIn 0.5s";
}

function hideLoadingPopup() {
    const loadingPopup = document.getElementById("loadingPopup");
    const overlay = document.getElementById("overlay");
    loadingPopup.style.animation = "fadeOut 0.5s";
    setTimeout(() => {
        loadingPopup.style.display = "none";
        overlay.style.display = "none";
    }, 500);
}

function showResultPopup(country, diff) {
    const resultPopup = document.getElementById("resultPopup");
    const resultTitle = document.getElementById("resultTitle");
    const resultSubtitle = document.getElementById("resultSubtitle");
    const resultImage = document.getElementById("resultImage");
    const resultCredits = document.getElementById("resultCredits");
    const overlay = document.getElementById("overlay");
    const dex = document.getElementById("dexSelector").value;

    resultTitle.textContent = `${country}`;
    resultSubtitle.textContent = `Similarity: ${100 - diff}%`;
    resultImage.src = `assets/${dex}/${country}.png`;

    fetch(`assets/jsons/${dex}.json`)
        .then((response) => response.json())
        .then((data) => {
            const ball = data[country];
            if (ball) {
                resultCredits.textContent = `Rarity: #${ball.rarity} | Artist: ${
                    ball.artist || "Unknown"
                }`;
            } else resultCredits.textContent = "";
        })
        .catch((error) => console.error("Error fetching ball data:", error));

    resultPopup.style.display = "block";
    overlay.style.display = "block";
    resultPopup.style.animation = "fadeIn 0.5s";
}

document.getElementById("closeResultPopup").addEventListener("click", hideResultPopup);

function hideResultPopup() {
    const resultPopup = document.getElementById("resultPopup");
    const resultImage = document.getElementById("resultImage");
    const overlay = document.getElementById("overlay");
    resultPopup.style.animation = "fadeOut 0.5s";
    setTimeout(() => {
        resultPopup.style.display = "none";
        overlay.style.display = "none";
        resultImage.src = "";
    }, 460);
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
            document.getElementById("title").textContent = `Identifier (${
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
            const changelogModal = document.getElementById("changelogModal");
            changelogModal.style.display = "block";
            setTimeout(() => {
                changelogModal.classList.add("show");
                changelogModal.classList.remove("hide");
            }, 10);
        })
        .catch((error) => console.error("Error fetching changelog:", error));
});

document.getElementById("closeChangelog").addEventListener("click", function () {
    const changelogModal = document.getElementById("changelogModal");
    changelogModal.classList.add("hide");
    setTimeout(() => {
        changelogModal.classList.remove("show");
        changelogModal.style.display = "none";
    }, 300);
});

document.getElementById("copyButton").addEventListener("click", function () {
    const resultTitle = document.getElementById("resultTitle").textContent;
    const textarea = document.createElement("textarea");
    textarea.value = resultTitle;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);

    const copyButton = document.getElementById("copyButton");
    copyButton.style.backgroundColor = "#00ff00";
    copyButton.textContent = "Copied!";
    copyButton.disabled = true;

    setTimeout(function () {
        copyButton.style.backgroundColor = "";
        copyButton.textContent = "Copy to clipboard";
        copyButton.disabled = false;
    }, 800);
});

const body = document.body;
const dragOverlay = document.createElement("div");
dragOverlay.className = "drag-overlay";
dragOverlay.textContent = "Drop your image/discord URL here";
document.body.appendChild(dragOverlay);

document.addEventListener("dragover", (event) => {
    event.preventDefault();
    body.classList.add("dragging");
    dragOverlay.classList.add("visible");
});

document.addEventListener("dragleave", (event) => {
    if (event.target === document || event.target === body) {
        body.classList.remove("dragging");
        dragOverlay.classList.remove("visible");
    }
});

document.addEventListener("drop", (event) => {
    event.preventDefault();
    body.classList.remove("dragging");
    dragOverlay.classList.remove("visible");

    const files = event.dataTransfer.files;
    const text = event.dataTransfer.getData("text/plain");

    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith("image/")) {
            handleFileUpload(file);
        } else {
            alert("Please drop a valid image file.");
        }
    } else if (text) {
        const discordImageUrlPattern =
            /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/\d+\/\d+\/[^?]+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/;
        if (discordImageUrlPattern.test(text)) {
            showLoadingPopup("Fetching...");
            downloadImage(text);
        } else {
            alert("Please drop a valid Discord image URL.");
        }
    }
});

function handleFileUpload(file) {
    showLoadingPopup("Uploading...");
    checkFileSize(file);
}