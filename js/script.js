document.addEventListener("DOMContentLoaded", updateTitleWithBallCount);

document.getElementById("fileInput").addEventListener("change", function () {
    const file = this.files[0];
    console.log(file);
    if (file) {
        showLoadingPopup();
        resizeFile(file);
    }
});

function resizeFile(file) {
    const reader = new FileReader();
    reader.onloadend = () => {
        const img = new Image();
        img.src = reader.result;
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            canvas.width = 100;
            canvas.height = 100;
            ctx.drawImage(img, 0, 0, 100, 100);
            canvas.toBlob((blob) => {
                const resizedFile = new File([blob], file.name, {
                    type: "image/png",
                    lastModified: Date.now(),
                });
                showLoadingPopup();
                uploadFile(resizedFile);
            });
        };
    };
    reader.readAsDataURL(file);
}

function showLoadingPopup() {
    const loadingPopup = document.getElementById("loadingPopup");
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
    const overlay = document.getElementById("overlay");
    const selectedDex = document.getElementById("dexSelector").value;

    resultTitle.textContent = `${country}`;
    const similarity = ((10000 - diff) / 10000) * 100;
    resultSubtitle.textContent = `Similarity: ${similarity.toFixed(2)}%`;

    const folder = selectedDex === "Dynastydex" ? "ballsDD" : "balls";
    resultImage.src = `assets/${folder}/${country}.png`;

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
    resultImage.src = "";
    setTimeout(() => {
        resultPopup.style.display = "none";
        overlay.style.display = "none";
    }, 500);
}

function uploadFile(file) {
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64data = reader.result.split(",")[1];
        const selectedDex = document.getElementById("dexSelector").value;
        fetch("/.netlify/functions/compareImage", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ file: base64data, dex: selectedDex }),
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Network response was not ok");
                }
                return response.json();
            })
            .then((data) => {
                console.log("Response data:", data);
                hideLoadingPopup();
                showResultPopup(data.country, data.diff);
            })
            .catch((error) => {
                console.error("Error:", error);
                hideLoadingPopup();
            });
    };
    reader.readAsDataURL(file);
}

document.addEventListener("paste", function (event) {
    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            console.log(file);
            if (file) {
                showLoadingPopup();
                resizeFile(file);
            }
        }
    }
});

document.getElementById("dexSelector").addEventListener("change", function () {
    const selectedDex = this.value;
    updateLogo(selectedDex);
    updateTitleWithBallCount();
});

function updateTitleWithBallCount() {
    const selectedDex = document.getElementById("dexSelector").value;
    fetch("/.netlify/functions/countFiles", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ dex: selectedDex }),
    })
        .then((response) => response.json())
        .then((data) => {
            const titleElement = document.querySelector(".title");
            titleElement.textContent = `Identifier (${data.count} balls)`;
        })
        .catch((error) => console.error("Error fetching ball count:", error));
}

function updateLogo(dex) {
    const logo = document.querySelector(".logo");
    if (dex === "Ballsdex") {
        logo.src = "assets/logo.png";
    } else if (dex === "Dynastydex") {
        logo.src = "assets/logoDD.png";
    }
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
                changeItem.innerHTML = `<strong>${new Date(
                    change.timestamp * 1000
                ).toLocaleString()}</strong><ul>${change.changes
                    .map((c) => `<li>${c}</li>`)
                    .join("")}</ul>`;
                changelogList.appendChild(changeItem);
            });
            document.getElementById("changelogModal").classList.add("show");
        })
        .catch((error) => console.error("Error fetching changelog:", error));
});

document.getElementById("closeChangelog").addEventListener("click", function () {
    document.getElementById("changelogModal").classList.remove("show");
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
