let ballsData = [];
let currentDex = "Ballsdex";
let activeLoadingModal = null;

document.addEventListener("DOMContentLoaded", function () {
    initializeBootstrapComponents();
    
    loadSettings();
    document.getElementById("sort-options").value = "rarity";
    document.getElementById("search-bar").value = "";
    document.getElementById("dexSelector").value = "Ballsdex";
    
    syncMobileSelectors();
    
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
        
        forceCleanupAllModals();
        
        setTimeout(() => {
            const loadingModalElement = document.getElementById('loadingModal');
            activeLoadingModal = new bootstrap.Modal(loadingModalElement, {
                backdrop: 'static',
                keyboard: false
            });
            
            const loadingProgress = document.getElementById("loading-progress");
            loadingProgress.textContent = "0%";
            
            activeLoadingModal.show();

            const safetyTimeout = setTimeout(() => {
                console.warn('Loading timeout reached, forcing modal cleanup');
                safeHideLoadingModal();
            }, 30000);

            fetch(jsonFile)
                .then((response) => response.json())
                .then((data) => {
                const ballsList = document.getElementById("balls-list");
                const loadingProgress = document.getElementById("loading-progress");
                const sortOptions = document.getElementById("sort-options");
                const imagePromises = [];
                const totalImages = Object.keys(data).length;
                let loadedImages = 0;

                let ballsData = Object.entries(data);

                function renderBalls() {
                    ballsList.innerHTML = "";
                    ballsData.forEach(([name, details], index) => {
                        const colDiv = document.createElement("div");
                        colDiv.className = "col-6 col-md-4 col-lg-3 col-xl-2 mb-4";

                        const cardDiv = document.createElement("div");
                        cardDiv.className = "card ball-card h-100";

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
                        cardDiv.appendChild(idElement);

                        if (["Ballsdex", "DynastyDex"].includes(dexName)) {
                            const waveElement = document.createElement("div");
                            waveElement.className = "wave-indicator";
                            waveElement.textContent = details.wave;
                            waveElement.title = `Wave: ${details.wave}`;
                            waveElement.style.backgroundColor = waveColor;
                            cardDiv.appendChild(waveElement);
                        }

                        const imgElement = document.createElement("img");
                        imgElement.src = `../assets/compressed/${dexName}/${name}.webp`;
                        imgElement.alt = name;
                        imgElement.className = "card-img-top";

                        const imgPromise = new Promise((resolve, reject) => {
                            const timeout = setTimeout(() => {
                                console.warn(`Image timeout for: ${name}`);
                                loadedImages++;
                                const progress = Math.round((loadedImages / totalImages) * 100);
                                loadingProgress.textContent = `${progress}%`;
                                resolve();
                            }, 10000);
                            
                            imgElement.onload = () => {
                                clearTimeout(timeout);
                                loadedImages++;
                                const progress = Math.round((loadedImages / totalImages) * 100);
                                loadingProgress.textContent = `${progress}%`;
                                resolve();
                            };
                            
                            imgElement.onerror = () => {
                                clearTimeout(timeout);
                                console.warn(`Failed to load image: ${name}`);
                                loadedImages++;
                                const progress = Math.round((loadedImages / totalImages) * 100);
                                loadingProgress.textContent = `${progress}%`;
                                resolve();
                            };
                        });
                        imagePromises.push(imgPromise);

                        cardDiv.appendChild(imgElement);

                        const cardBody = document.createElement("div");
                        cardBody.className = "card-body p-2 text-center";

                        const nameElement = document.createElement("h6");
                        nameElement.className = "card-title";
                        nameElement.textContent = name;
                        cardBody.appendChild(nameElement);

                        const rarityElement = document.createElement("div");
                        rarityElement.className = "rarity-container card-text small mb-1";
                        rarityElement.innerHTML = `<span class="text-muted">Rarity:</span> <span class="rarity-value">#${details.rarity}</span>`;
                        cardBody.appendChild(rarityElement);

                        const artistElement = document.createElement("div");
                        artistElement.className = "artist-container card-text small";
                        artistElement.innerHTML = `<span class="text-muted">Artist:</span> <span class="artist-value">${details.artist}</span>`;
                        cardBody.appendChild(artistElement);

                        cardDiv.appendChild(cardBody);

                        cardDiv.addEventListener("click", () => {
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

                        colDiv.appendChild(cardDiv);
                        ballsList.appendChild(colDiv);
                    });
                    
                    applyVisibilitySettings();
                    
                    showSpecificBalls(document.getElementById("search-bar").value.toLowerCase());
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
                        clearTimeout(safetyTimeout);
                        safeHideLoadingModal();
                        renderBalls();
                    })
                    .catch((error) => {
                        clearTimeout(safetyTimeout);
                        console.error("Error loading images:", error);
                        safeHideLoadingModal();
                    });
            })
            .catch((error) => {
                clearTimeout(safetyTimeout);
                console.error(`Error loading ${dexName}.json:`, error);
                safeHideLoadingModal();
            });
        }, 50);
    }

    dexSelector.addEventListener("change", function () {
        const selectedDex = dexSelector.value;
        const sortOptions = document.getElementById("sort-options");
        const waveOption = sortOptions.querySelector('option[value="wave"]');
        const idOption = sortOptions.querySelector('option[value="id"]');
        const onClickAction = document.getElementById("on-click-action");

        document.getElementById("dexSelector-mobile").value = selectedDex;

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

        forceCleanupAllModals();
        
        loadDexData(selectedDex);
    });

    document.getElementById("dexSelector-mobile").addEventListener("change", function() {
        document.getElementById("dexSelector").value = this.value;
        document.getElementById("dexSelector").dispatchEvent(new Event("change"));
    });

    document.getElementById("sort-options-mobile").addEventListener("change", function() {
        document.getElementById("sort-options").value = this.value;
        document.getElementById("sort-options").dispatchEvent(new Event("change"));
    });

    document.getElementById("search-bar").addEventListener("input", function () {
        showSpecificBalls(this.value.toLowerCase());
    });

    document.getElementById("back-button").addEventListener("click", function () {
        window.location.href = "../index.html";
    });
});

function forceHideLoadingModal(loadingModal) {
    if (loadingModal) {
        loadingModal.hide();
        setTimeout(() => {
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.remove();
            }
            const modalElement = document.getElementById('loadingModal');
            if (modalElement) {
                modalElement.style.display = 'none';
                modalElement.classList.remove('show');
            }
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
            document.body.style.removeProperty('overflow');
        }, 100);
    }
}

function forceCleanupAllModals() {
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => backdrop.remove());
    
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        const modalInstance = bootstrap.Modal.getInstance(modal);
        if (modalInstance) {
            modalInstance.dispose();
        }
        modal.style.display = 'none';
        modal.classList.remove('show');
    });
    
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('padding-right');
    document.body.style.removeProperty('overflow');
    
    activeLoadingModal = null;
}

function safeHideLoadingModal() {
    try {
        if (activeLoadingModal) {
            activeLoadingModal.hide();
            activeLoadingModal = null;
        }
        
        setTimeout(() => {
            forceCleanupAllModals();
        }, 150);
    } catch (error) {
        console.warn('Error hiding modal, forcing cleanup:', error);
        forceCleanupAllModals();
    }
}

function initializeBootstrapComponents() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

function syncMobileSelectors() {
    document.getElementById("dexSelector-mobile").value = document.getElementById("dexSelector").value;
    document.getElementById("sort-options-mobile").value = document.getElementById("sort-options").value;
}

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
    const modal = document.getElementById('resultModal');
    const modalTitle = document.getElementById('popup-header');
    const modalBody = document.getElementById('popup-content');

    modalBody.innerHTML = "";
    modalTitle.textContent = `Previous Arts for ${ballName}`;

    const row = document.createElement("div");
    row.className = "row g-3 justify-content-center";

    arts.forEach((art, index) => {
        const col = document.createElement("div");
        col.className = "col-12 col-sm-6 col-md-4 col-lg-3 col-xl-2";

        const artContainer = document.createElement("div");
        artContainer.className = "popup-art-container card bg-dark border-secondary h-100";

        const artImage = document.createElement("img");
        artImage.src = `../assets/bd-previous-arts/${ballName}/${index + 1}.webp`;
        artImage.alt = `${ballName} art`;
        artImage.className = "card-img-top";
        artImage.loading = "lazy";
        artImage.style.height = "220px";
        artImage.style.objectFit = "contain";
        artImage.style.padding = "8px";

        const cardBody = document.createElement("div");
        cardBody.className = "card-body p-3";

        const artistInfo = document.createElement("p");
        artistInfo.className = "card-text small text-light mb-2";
        artistInfo.innerHTML = `<strong class="text-warning">Artist:</strong> <span class="text-info">${art.artist}</span>`;

        const untilInfo = document.createElement("p");
        untilInfo.className = "card-text small text-light mb-0";
        untilInfo.innerHTML = `<strong class="text-warning">Until:</strong> <span class="text-success">${art.until}</span>`;

        cardBody.appendChild(artistInfo);
        cardBody.appendChild(untilInfo);
        artContainer.appendChild(artImage);
        artContainer.appendChild(cardBody);
        col.appendChild(artContainer);
        row.appendChild(col);
    });

    modalBody.appendChild(row);

    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
}

function showEnlargedArt(ballName, dexName) {
    const modal = document.getElementById('resultModal');
    const modalTitle = document.getElementById('popup-header');
    const modalBody = document.getElementById('popup-content');

    modalBody.innerHTML = "";
    modalTitle.textContent = ballName;

    const artContainer = document.createElement("div");
    artContainer.className = "popup-enlarged-art-container text-center";

    const artImage = document.createElement("img");
    artImage.src = `../assets/${dexName}/${ballName}.png`;
    artImage.alt = `${ballName} art`;
    artImage.className = "img-fluid";
    artImage.loading = "lazy";

    artContainer.appendChild(artImage);
    modalBody.appendChild(artContainer);

    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
}

function showNotification() {
    const toastElement = document.getElementById('notification');
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
}

function showSpecificBalls(query) {
    const ballCards = document.querySelectorAll("#balls-list .col-6");

    ballCards.forEach((col) => {
        const ballName = col.querySelector(".card-title").textContent.toLowerCase();
        if (ballName.includes(query)) {
            col.style.display = "block";
        } else {
            col.style.display = "none";
        }
    });
}

function applyVisibilitySettings() {
    document.getElementById("toggle-wave").dispatchEvent(new Event("change"));
    document.getElementById("toggle-rarity").dispatchEvent(new Event("change"));
    document.getElementById("toggle-artist").dispatchEvent(new Event("change"));
    document.getElementById("toggle-id").dispatchEvent(new Event("change"));
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
        document.getElementById("toggle-wave").checked = settings.showWave ?? true;
        document.getElementById("toggle-rarity").checked = settings.showRarity ?? true;
        document.getElementById("toggle-artist").checked = settings.showArtist ?? true;
        document.getElementById("toggle-id").checked = settings.showID ?? false;
        document.getElementById("on-click-action").value = settings.onClick ?? "previous-arts";
    }
}

document.addEventListener("DOMContentLoaded", function() {
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
});