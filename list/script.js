document.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    document.getElementById("sort-options").value = "rarity";
    document.getElementById("search-bar").value = "";
    document.getElementById("dexSelector").value = "Ballsdex";
    loadDexData("Ballsdex");

    document.addEventListener("keydown", function (event) {
        if (event.shiftKey && !event.ctrlKey && event.key.toLowerCase() === "f") {
            event.preventDefault();
            const searchBar = document.getElementById("search-bar");
            if (searchBar) {
                searchBar.focus();
                searchBar.select();
            }
        }
    });

    const dexSelector = document.getElementById("dexSelector");

    function loadDexData(dexName) {
        const jsonFile = `../assets/jsons/${dexName}.json`;

        fetch(jsonFile)
            .then((response) => response.json())
            .then((data) => {
                const ballsList = document.getElementById("balls-list");
                const loading = document.getElementById("loading");
                const loadingProgress = document.getElementById("loading-progress");
                const sortOptions = document.getElementById("sort-options");
                const imagePromises = [];
                const totalImages = Object.keys(data).length;
                let loadedImages = 0;

                let ballsData = Object.entries(data);

                function renderBalls() {
                    ballsList.innerHTML = "";
                    ballsData.forEach(([name, details]) => {
                        const ballDiv = document.createElement("div");
                        ballDiv.className = "ball-container";

                        const waveColors = {
                            1: "#FF7769",
                            1.1: "#424242",
                            2: "#F56300",
                            3: "#824300",
                            4: "#219540",
                            4.1: "#333333",
                            5: "#006D83",
                            5.1: "#666666",
                            5.2: "#999999",
                            6: "#4386F5",
                            7: "#B299F2",
                            7.1: "#484848",
                            7.2: "#484848",
                            8: "#FFBEBE"
                        };
                        const waveColor = waveColors[details.wave] || "#808080";

                        const idElement = document.createElement("div");
                        idElement.className = "id-indicator";
                        idElement.textContent = details.id;
                        idElement.title = `ID: ${details.id}`;
                        ballDiv.appendChild(idElement);

                        if (["Ballsdex", "DynastyDex"].includes(dexName)) {
                            const waveElement = document.createElement("div");
                            waveElement.className = "wave-indicator";
                            waveElement.textContent = details.wave;
                            waveElement.title = `Wave: ${details.wave}`;
                            waveElement.style.backgroundColor = waveColor;
                            ballDiv.appendChild(waveElement);
                        }

                        const nameElement = document.createElement("h2");
                        nameElement.textContent = name;
                        ballDiv.appendChild(nameElement);

                        const imgElement = document.createElement("img");
                        imgElement.src = `../assets/compressed/${dexName}/${name}.webp`;
                        imgElement.alt = name;

                        const imgPromise = new Promise((resolve, reject) => {
                            imgElement.onload = () => {
                                loadedImages++;
                                const progress = Math.round((loadedImages / totalImages) * 100);
                                loadingProgress.textContent = `${progress}%`;
                                resolve();
                            };
                            imgElement.onerror = reject;
                        });
                        imagePromises.push(imgPromise);

                        ballDiv.appendChild(imgElement);

                        const rarityContainer = document.createElement("div");
                        rarityContainer.className = "rarity-container";
                        const rarityLabel = document.createElement("span");
                        rarityLabel.className = "rarity-label";
                        rarityLabel.textContent = "Rarity: ";
                        const rarityValue = document.createElement("span");
                        rarityValue.className = "rarity-value";
                        rarityValue.textContent = `#${details.rarity}`;
                        rarityContainer.appendChild(rarityLabel);
                        rarityContainer.appendChild(rarityValue);
                        ballDiv.appendChild(rarityContainer);

                        const artistContainer = document.createElement("div");
                        artistContainer.className = "artist-container";
                        const artistLabel = document.createElement("span");
                        artistLabel.className = "artist-label";
                        artistLabel.textContent = "Artist: ";
                        const artistValue = document.createElement("span");
                        artistValue.className = "artist-value";
                        artistValue.textContent = details.artist;
                        artistContainer.appendChild(artistLabel);
                        artistContainer.appendChild(artistValue);
                        ballDiv.appendChild(artistContainer);

                        ballDiv.addEventListener("click", () => {
                            const onClickAction = document.getElementById("on-click-action").value;
                            switch (onClickAction) {
                                case "previous-arts":
                                    checkArtsExist(name);
                                    break;
                                case "enlarge-art":
                                    showEnlargedArt(name, dexName);
                                    break;
                            } 
                        });

                        ballsList.appendChild(ballDiv);
                        showSpecificBalls(
                            document.getElementById("search-bar").value.toLowerCase()
                        );
                    });
                    document.getElementById("toggle-wave").dispatchEvent(new Event("change"));
                    document.getElementById("toggle-rarity").dispatchEvent(new Event("change"));
                    document.getElementById("toggle-artist").dispatchEvent(new Event("change"));
                    document.getElementById("toggle-id").dispatchEvent(new Event("change"));
                    document.getElementById("on-click-action").dispatchEvent(new Event("change"));
                }

                sortOptions.addEventListener("change", () => {
                    const sortBy = sortOptions.value;
                    if (sortBy === "rarity") {
                        ballsData.sort((a, b) => {
                            if (a[1].rarity === b[1].rarity) {
                                return a[0].localeCompare(b[0]);
                            }
                            return a[1].rarity - b[1].rarity;
                        });
                    } else if (sortBy === "a-z") {
                        ballsData.sort((a, b) => a[0].localeCompare(b[0]));
                    } else if (sortBy === "wave") {
                        ballsData.sort((a, b) => {
                            if (a[1].wave === b[1].wave) {
                                return a[0].localeCompare(b[0]);
                            }
                            return a[1].wave - b[1].wave;
                        });
                    } else if (sortBy === "id") {
                        ballsData.sort((a, b) => {
                            return a[1].id - b[1].id;
                        });
                    }
                    renderBalls();
                });

                Promise.all(imagePromises)
                    .then(() => {
                        loading.style.display = "none";
                        ballsList.style.display = "flex";
                        renderBalls();
                    })
                    .catch((error) => console.error("Error loading images:", error));
            })
            .catch((error) => console.error(`Error loading ${dexName}.json:`, error));
    }

    dexSelector.addEventListener("change", function () {
        const selectedDex = dexSelector.value;
        const sortOptions = document.getElementById("sort-options");
        const waveOption = sortOptions.querySelector('option[value="wave"]');
        const idOption = sortOptions.querySelector('option[value="id"]');
        const onClickAction = document.getElementById("on-click-action");

        switch (selectedDex) {
            case "Ballsdex":
                onClickAction.querySelector('option[value="previous-arts"]').disabled = false;
                waveOption.style.display = "block";
                idOption.style.display = "block";
                break;
            case "DynastyDex":
                onClickAction.querySelector('option[value="previous-arts"]').disabled = true;
                onClickAction.value = "enlarge-art";
                waveOption.style.display = "block";
                idOption.style.display = "block";
                break;
            default:
                onClickAction.querySelector('option[value="previous-arts"]').disabled = true;
                onClickAction.value = "enlarge-art";
                idOption.style.display = "block";
                waveOption.style.display = "none";
                if (sortOptions.value === "wave") {
                    sortOptions.value = "rarity";
                }
                break;
        }

        loadDexData(selectedDex);
    });

    const settingsMenu = document.getElementById("settings-menu");
    const settingsButton = document.getElementById("settings-button");
    document.addEventListener("click", function (e) {
        if (settingsButton.contains(e.target)) {
            settingsMenu.classList.toggle("open");
        } else if (!settingsMenu.contains(e.target)) {
            settingsMenu.classList.remove("open");
        }
    });

    loadDexData(dexSelector.value);
});

function checkArtsExist(ballName) {
    fetch("../assets/bd-previous-arts/arts.json")
        .then((response) => response.json())
        .then((artsData) => {
            if (artsData[ballName]) {
                showPopup(ballName, artsData[ballName]);
            } else {
                showNotification();
            }
        })
        .catch((error) => console.error("Error loading arts.json:", error));
}

function showPopup(ballName, arts) {
    const popup = document.getElementById("popup");
    const popupHeader = document.getElementById("popup-header");
    const popupContent = document.getElementById("popup-content");
    const overlay = document.getElementById("overlay");

    popupContent.innerHTML = "";
    popupHeader.textContent = `Previous Arts for ${ballName}`;

    arts.forEach((art, index) => {
        const artContainer = document.createElement("div");
        artContainer.className = "popup-art-container";

        const artImage = document.createElement("img");
        artImage.src = `../assets/bd-previous-arts/${ballName}/${index + 1}.webp`;
        artImage.alt = `${ballName} art`;
        artImage.loading = "lazy";

        const artistInfo = document.createElement("p");
        artistInfo.textContent = `Artist: ${art.artist}`;

        const untilInfo = document.createElement("p");
        untilInfo.textContent = `Until: ${art.until}`;

        artContainer.appendChild(artImage);
        artContainer.appendChild(artistInfo);
        artContainer.appendChild(untilInfo);
        popupContent.appendChild(artContainer);
    });

    overlay.style.display = "block";
    popup.style.display = "block";
    document.body.classList.add("no-scroll");
}

function showEnlargedArt(ballName, dexName) {
    const popup = document.getElementById("popup");
    const popupHeader = document.getElementById("popup-header");
    const popupContent = document.getElementById("popup-content");
    const overlay = document.getElementById("overlay");

    popupContent.innerHTML = "";
    popupHeader.textContent = ballName;

    const artContainer = document.createElement("div");
    artContainer.className = "popup-enlarged-art-container";

    const artImage = document.createElement("img");
    artImage.src = `../assets/${dexName}/${ballName}.png`;
    artImage.alt = `${ballName} art`;
    artImage.loading = "lazy";

    artContainer.appendChild(artImage);
    popupContent.appendChild(artContainer);

    overlay.style.display = "block";
    popup.style.display = "block";
    document.body.classList.add("no-scroll");

    setTimeout(() => {
        popup.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
}

document.getElementById("popup-close").addEventListener("click", function () {
    const popup = document.getElementById("popup");
    const overlay = document.getElementById("overlay");

    popup.style.display = "none";
    overlay.style.display = "none";
    document.body.classList.remove("no-scroll");
});

document.getElementById("overlay").addEventListener("click", function () {
    const popup = document.getElementById("popup");
    const overlay = document.getElementById("overlay");

    popup.style.display = "none";
    overlay.style.display = "none";
    document.body.classList.remove("no-scroll");
});

function showNotification() {
    const notification = document.getElementById("notification");
    notification.classList.add("show");
    setTimeout(() => {
        notification.classList.remove("show");
    }, 1800);
}

document.getElementById("search-bar").addEventListener("input", function () {
    showSpecificBalls(this.value.toLowerCase());
});

function showSpecificBalls(query) {
    const ballContainers = document.querySelectorAll(".ball-container");

    ballContainers.forEach((container) => {
        const ballName = container.querySelector("h2").textContent.toLowerCase();
        if (ballName.includes(query)) {
            container.style.display = "block";
        } else {
            container.style.display = "none";
        }
    });
}

function saveSettings() {
    const settings = {
        showWave: document.getElementById("toggle-wave").checked,
        showRarity: document.getElementById("toggle-rarity").checked,
        showArtist: document.getElementById("toggle-artist").checked,
        showID: document.getElementById("toggle-id").checked,
        onClick: document.getElementById("on-click-action").value
    };
    localStorage.setItem("displaySettings", JSON.stringify(settings));
}

function loadSettings() {
    const settings = JSON.parse(localStorage.getItem("displaySettings"));
    if (settings) {
        document.getElementById("toggle-wave").checked = settings.showWave;
        document.getElementById("toggle-rarity").checked = settings.showRarity;
        document.getElementById("toggle-artist").checked = settings.showArtist;
        document.getElementById("toggle-id").checked = settings.showID;
        document.getElementById("on-click-action").value = settings.onClick;
        document.getElementById("toggle-wave").dispatchEvent(new Event("change"));
        document.getElementById("toggle-rarity").dispatchEvent(new Event("change"));
        document.getElementById("toggle-artist").dispatchEvent(new Event("change"));
        document.getElementById("toggle-id").dispatchEvent(new Event("change"));
        document.getElementById("on-click-action").dispatchEvent(new Event("change"));
    }
}

document.getElementById("toggle-wave").addEventListener("change", function () {
    const waveIndicators = document.querySelectorAll(".wave-indicator");
    waveIndicators.forEach((wave) => {
        wave.style.display = this.checked ? "block" : "none";
    });
    saveSettings();
});

document.getElementById("toggle-rarity").addEventListener("change", function () {
    const rarityContainers = document.querySelectorAll(".rarity-container");
    rarityContainers.forEach((rarity) => {
        rarity.style.display = this.checked ? "block" : "none";
    });
    saveSettings();
});

document.getElementById("toggle-artist").addEventListener("change", function () {
    const artistContainers = document.querySelectorAll(".artist-container");
    artistContainers.forEach((artist) => {
        artist.style.display = this.checked ? "block" : "none";
    });
    saveSettings();
});

document.getElementById("toggle-id").addEventListener("change", function () {
    const idIndicators = document.querySelectorAll(".id-indicator");
    idIndicators.forEach((id) => {
        id.style.display = this.checked ? "block" : "none";
    });
    saveSettings();
});

document.getElementById("on-click-action").addEventListener("change", function () {
    saveSettings();
});

document.getElementById("back-button").addEventListener("click", function () {
    window.location.href = "../index.html";
});