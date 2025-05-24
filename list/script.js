document.addEventListener("DOMContentLoaded", function () {
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
                        };
                        const waveColor = waveColors[details.wave] || "#808080";

                        if (dexName === "Ballsdex") {
                            const waveElement = document.createElement("div");
                            waveElement.className = "wave-indicator";
                            waveElement.textContent = details.wave;
                            waveElement.title = `Wave: ${details.wave}`;
                            waveElement.style.backgroundColor = waveColor;
                            ballDiv.appendChild(waveElement);

                            const idElement = document.createElement("div");
                            idElement.className = "id-indicator";
                            idElement.textContent = details.id;
                            idElement.title = `ID: ${details.id}`;
                            ballDiv.appendChild(idElement);
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
                            if (dexName == "Ballsdex") checkArtsExist(name);
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
        const h2 = document.querySelector("h2");
        const toggleWave = document.getElementById("toggle-wave");
        const toggleID = document.getElementById("toggle-id");

        if (selectedDex === "Ballsdex") {
            waveOption.style.display = "block";
            idOption.style.display = "block";
            h2.style.display = "block";
            toggleWave.style.display = "block";
            toggleID.style.display = "block";
        } else {
            waveOption.style.display = "none";
            idOption.style.display = "none";
            h2.style.display = "none";
            toggleWave.style.display = "none";
            toggleID.style.display = "none";

            if (sortOptions.value === "wave" || sortOptions.value === "id") {
                sortOptions.value = "rarity";
            }
        }
        loadDexData(selectedDex);
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

document.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    document.getElementById("sort-options").value = "rarity";
    document.getElementById("search-bar").value = "";

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
        document.getElementById("toggle-wave").dispatchEvent(new Event("change"));
        document.getElementById("toggle-rarity").dispatchEvent(new Event("change"));
        document.getElementById("toggle-artist").dispatchEvent(new Event("change"));
        document.getElementById("toggle-id").dispatchEvent(new Event("change"));
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

document.getElementById("back-button").addEventListener("click", function () {
    window.location.href = "../index.html";
});