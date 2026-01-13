/**
 * Spawn Arts | Gallery, filtering and popups
 */

const WAVE_COLORS = {
    1: "#FF7769", 1.1: "#424242", 2: "#F56300", 3: "#824300",
    4: "#219540", 4.1: "#333333", 5: "#006D83", 5.1: "#666666",
    5.2: "#999999", 6: "#4386F5", 7: "#B299F2", 7.1: "#484848",
    7.2: "#484848", 8: "#FFBEBE", 8.1: "#666666"
};

const DEX_WITH_WAVES = ["Ballsdex", "DynastyDex", "FoodDex"];
const DEX_WITH_PREVIOUS_ARTS = ["Ballsdex"];

function loadSpawnArtsData(dexName) {
    const jsonFile = `assets/jsons/${dexName}.json`;
    AppState.currentListDex = dexName;
    
    forceCleanupAllModals();
    
    setTimeout(() => {
        showSpawnArtsLoadingModal();
        
        const safetyTimeout = setTimeout(() => {
            console.warn('Loading timeout reached, forcing modal cleanup');
            safeHideSpawnArtsLoadingModal();
        }, 30000);
        
        fetch(jsonFile)
            .then(response => response.json())
            .then(data => processSpawnArtsData(data, dexName, safetyTimeout))
            .catch(error => {
                clearTimeout(safetyTimeout);
                console.error(`Error loading ${dexName}.json:`, error);
                safeHideSpawnArtsLoadingModal();
            });
    }, 50);
}

function showSpawnArtsLoadingModal() {
    const loadingModalElement = document.getElementById('loadingModal');
    const loadingProgress = document.getElementById("loading-progress");
    const loadingText = document.getElementById("loading-text");
    
    loadingText.textContent = "Loading Spawn Arts";
    loadingProgress.style.display = "none";
    
    AppState.activeLoadingModal = new bootstrap.Modal(loadingModalElement, {
        backdrop: 'static',
        keyboard: false
    });
    AppState.activeLoadingModal.show();
}

function processSpawnArtsData(data, dexName, safetyTimeout) {
    const ballsList = document.getElementById("balls-list");
    const sortOptions = document.getElementById("sort-options");
    
    let ballsData = Object.entries(data);
    
    function renderBalls() {
        ballsList.innerHTML = "";
        const fragment = document.createDocumentFragment();
        
        ballsData.forEach(([name, details]) => {
            const card = createBallCard(name, details, dexName);
            fragment.appendChild(card);
        });
        
        ballsList.appendChild(fragment);
        applyVisibilitySettings();
        showSpecificBalls(document.getElementById("search-bar")?.value.toLowerCase() || "");
    }
    
    sortOptions.onchange = () => {
        sortBallsData(ballsData, sortOptions.value);
        renderBalls();
    };
    
    renderBalls();
    clearTimeout(safetyTimeout);
    safeHideSpawnArtsLoadingModal();
}

function createBallCard(name, details, dexName) {
    const colDiv = document.createElement("div");
    colDiv.className = "col-6 col-md-4 col-lg-3 col-xl-2 mb-4";
    
    const cardDiv = document.createElement("div");
    cardDiv.className = "card ball-card h-100";
    
    const idElement = document.createElement("div");
    idElement.className = "id-indicator";
    idElement.textContent = details.id;
    idElement.title = `ID: ${details.id}`;
    cardDiv.appendChild(idElement);
    
    if (DEX_WITH_WAVES.includes(dexName)) {
        const waveElement = document.createElement("div");
        waveElement.className = "wave-indicator";
        waveElement.textContent = details.wave;
        waveElement.title = `Wave: ${details.wave}`;
        waveElement.style.backgroundColor = WAVE_COLORS[details.wave] || "#808080";
        cardDiv.appendChild(waveElement);
    }
    
    const imgElement = document.createElement("img");
    imgElement.src = `assets/compressed/${dexName}/${name}.webp`;
    imgElement.alt = name;
    imgElement.className = "card-img-top";
    imgElement.loading = "lazy";
    cardDiv.appendChild(imgElement);
    
    const cardBody = document.createElement("div");
    cardBody.className = "card-body p-2 text-center";
    cardBody.innerHTML = `
        <h6 class="card-title">${name}</h6>
        <div class="rarity-container card-text small mb-1">
            <span class="text-muted">Rarity:</span> <span class="rarity-value">#${details.rarity}</span>
        </div>
        <div class="artist-container card-text small">
            <span class="text-muted">Artist:</span> <span class="artist-value">${details.artist}</span>
        </div>
    `;
    
    cardDiv.appendChild(cardBody);
    cardDiv.addEventListener("click", () => handleBallCardClick(name, dexName));
    colDiv.appendChild(cardDiv);
    return colDiv;
}

function sortBallsData(ballsData, sortBy) {
    switch (sortBy) {
        case "rarity":
            ballsData.sort((a, b) => a[1].rarity === b[1].rarity ? a[0].localeCompare(b[0]) : a[1].rarity - b[1].rarity);
            break;
        case "a-z":
            ballsData.sort((a, b) => a[0].localeCompare(b[0]));
            break;
        case "wave":
            ballsData.sort((a, b) => a[1].wave === b[1].wave ? a[0].localeCompare(b[0]) : a[1].wave - b[1].wave);
            break;
        case "id":
            ballsData.sort((a, b) => a[1].id - b[1].id);
            break;
    }
}

function handleBallCardClick(name, dexName) {
    const onClickAction = document.getElementById("on-click-action").value;
    
    switch (onClickAction) {
        case "previous-arts": checkArtsExist(name); break;
        case "enlarge-art": showEnlargedArt(name, dexName); break;
    }
}

async function checkArtsExist(ballName) {
    try {
        const response = await fetch("assets/bd-previous-arts/arts.json");
        const artsData = await response.json();
        
        if (artsData[ballName]) {
            showSpawnArtsPopup(ballName, artsData[ballName]);
        } else {
            showNotification();
        }
    } catch (error) {
        console.error("Error loading arts.json:", error);
    }
}

function showSpawnArtsPopup(ballName, arts) {
    const modal = document.getElementById('spawnArtsResultModal');
    const modalTitle = document.getElementById('popup-header');
    const modalBody = document.getElementById('popup-content');
    
    modalBody.innerHTML = "";
    modalTitle.textContent = `Previous Arts for ${ballName}`;
    
    const row = document.createElement("div");
    row.className = "row g-3 justify-content-center";
    
    arts.forEach((art, index) => {
        const col = createArtCard(ballName, art, index);
        row.appendChild(col);
    });
    
    modalBody.appendChild(row);
    
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
    
    modalBody.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));
}

function createArtCard(ballName, art, index) {
    const col = document.createElement("div");
    col.className = "col-12 col-sm-6 col-md-4 col-lg-3 col-xl-2";
    
    const artContainer = document.createElement("div");
    artContainer.className = "popup-art-container card bg-dark border-secondary h-100";
    
    if (art.alt) {
        artContainer.setAttribute("data-bs-toggle", "tooltip");
        artContainer.setAttribute("data-bs-placement", "top");
        artContainer.setAttribute("title", art.alt);
    }
    
    const webpSrc = `assets/bd-previous-arts/${ballName}/${index + 1}.webp`;
    const gifSrc = `assets/bd-previous-arts/${ballName}/${index + 1}.gif`;
    
    artContainer.innerHTML = `
        <img src="${webpSrc}" alt="${ballName} art" class="card-img-top" loading="lazy" 
             style="height: 220px; object-fit: contain; padding: 8px;"
             onerror="this.src='${gifSrc}'">
        <div class="card-body p-3">
            <p class="card-text small text-light mb-2">
                <strong class="text-warning">Artist:</strong> <span class="text-info">${art.artist}</span>
            </p>
            <p class="card-text small text-light mb-0">
                <strong class="text-warning">Until:</strong> <span class="text-success">${art.until}</span>
            </p>
        </div>
    `;
    
    col.appendChild(artContainer);
    return col;
}

function showEnlargedArt(ballName, dexName) {
    const modal = document.getElementById('spawnArtsResultModal');
    const modalTitle = document.getElementById('popup-header');
    const modalBody = document.getElementById('popup-content');
    
    modalBody.innerHTML = "";
    modalTitle.textContent = ballName;
    
    modalBody.innerHTML = `
        <div class="popup-enlarged-art-container text-center">
            <img src="assets/${dexName}/${ballName}.png" alt="${ballName} art" class="img-fluid" loading="lazy">
        </div>
    `;
    
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
    ballCards.forEach(col => {
        const ballName = col.querySelector(".card-title").textContent.toLowerCase();
        col.style.display = ballName.includes(query) ? "block" : "none";
    });
}

function applyVisibilitySettings() {
    ["toggle-wave", "toggle-rarity", "toggle-artist", "toggle-id"].forEach(id => {
        const toggle = document.getElementById(id);
        toggle?.dispatchEvent(new Event("change"));
    });
}

function initializeSpawnArtsSettings() {
    loadSpawnArtsSettings();
    setupSpawnArtsDexSelector();
    setupSortOptions();
    setupToggleSettings();
    setupSearchBar();
}

function setupSpawnArtsDexSelector() {
    const listDexSelector = document.getElementById("listDexSelector");
    const listDexSelectorMobile = document.getElementById("listDexSelector-mobile");
    
    listDexSelector?.addEventListener("change", function() { handleDexChange(this.value); });
    
    listDexSelectorMobile?.addEventListener("change", function() {
        document.getElementById("listDexSelector").value = this.value;
        document.getElementById("listDexSelector").dispatchEvent(new Event("change"));
    });
}

function handleDexChange(selectedDex) {
    const sortOptions = document.getElementById("sort-options");
    const waveOption = sortOptions.querySelector('option[value="wave"]');
    const idOption = sortOptions.querySelector('option[value="id"]');
    const onClickAction = document.getElementById("on-click-action");
    
    document.getElementById("listDexSelector-mobile").value = selectedDex;
    
    const hasPreviousArts = DEX_WITH_PREVIOUS_ARTS.includes(selectedDex);
    const hasWaves = DEX_WITH_WAVES.includes(selectedDex);
    
    onClickAction.querySelector('option[value="previous-arts"]').disabled = !hasPreviousArts;
    if (!hasPreviousArts) onClickAction.value = "enlarge-art";
    
    waveOption.style.display = hasWaves ? "block" : "none";
    idOption.style.display = "block";
    
    if (!hasWaves && sortOptions.value === "wave") sortOptions.value = "rarity";
    
    forceCleanupAllModals();
    loadSpawnArtsData(selectedDex);
}

function setupSortOptions() {
    const sortOptionsMobile = document.getElementById("sort-options-mobile");
    
    sortOptionsMobile?.addEventListener("change", function() {
        document.getElementById("sort-options").value = this.value;
        document.getElementById("sort-options").dispatchEvent(new Event("change"));
    });
}

function setupToggleSettings() {
    const toggles = [
        { desktop: "toggle-wave", mobile: "toggle-wave-mobile", selector: ".wave-indicator" },
        { desktop: "toggle-rarity", mobile: "toggle-rarity-mobile", selector: ".rarity-container" },
        { desktop: "toggle-artist", mobile: "toggle-artist-mobile", selector: ".artist-container" },
        { desktop: "toggle-id", mobile: "toggle-id-mobile", selector: ".id-indicator" }
    ];
    
    toggles.forEach(({ desktop, mobile, selector }) => {
        setupToggleSync(desktop, mobile);
        setupToggleListener(desktop, selector);
    });
    
    const onClickAction = document.getElementById("on-click-action");
    const onClickActionMobile = document.getElementById("on-click-action-mobile");
    
    onClickAction?.addEventListener("change", saveSpawnArtsSettings);
    
    onClickActionMobile?.addEventListener("change", function() {
        document.getElementById("on-click-action").value = this.value;
        document.getElementById("on-click-action").dispatchEvent(new Event("change"));
    });
}

function setupToggleSync(desktopId, mobileId) {
    const mobileEl = document.getElementById(mobileId);
    
    mobileEl?.addEventListener("change", function() {
        document.getElementById(desktopId).checked = this.checked;
        document.getElementById(desktopId).dispatchEvent(new Event("change"));
    });
}

function setupToggleListener(toggleId, selector) {
    const toggle = document.getElementById(toggleId);
    
    toggle?.addEventListener("change", function() {
        document.querySelectorAll(selector).forEach(el => {
            el.style.display = this.checked ? "block" : "none";
        });
        saveSpawnArtsSettings();
    });
}

function setupSearchBar() {
    const searchBar = document.getElementById("search-bar");
    searchBar?.addEventListener("input", function() { showSpecificBalls(this.value.toLowerCase()); });
}

function syncMobileSelectors() {
    const selectors = [
        { desktop: "listDexSelector", mobile: "listDexSelector-mobile" },
        { desktop: "sort-options", mobile: "sort-options-mobile" },
        { desktop: "on-click-action", mobile: "on-click-action-mobile" }
    ];
    
    selectors.forEach(({ desktop, mobile }) => {
        const desktopEl = document.getElementById(desktop);
        const mobileEl = document.getElementById(mobile);
        if (desktopEl && mobileEl) mobileEl.value = desktopEl.value;
    });
    
    ["toggle-wave", "toggle-rarity", "toggle-artist", "toggle-id"].forEach(id => {
        const desktop = document.getElementById(id);
        const mobile = document.getElementById(id + "-mobile");
        if (desktop && mobile) mobile.checked = desktop.checked;
    });
}

function saveSpawnArtsSettings() {
    const settings = {
        showWave: document.getElementById("toggle-wave")?.checked ?? true,
        showRarity: document.getElementById("toggle-rarity")?.checked ?? true,
        showArtist: document.getElementById("toggle-artist")?.checked ?? true,
        showID: document.getElementById("toggle-id")?.checked ?? false,
        onClick: document.getElementById("on-click-action")?.value ?? "previous-arts"
    };
    localStorage.setItem("displaySettings", JSON.stringify(settings));
}

function loadSpawnArtsSettings() {
    const settings = JSON.parse(localStorage.getItem("displaySettings"));
    
    if (settings) {
        const elements = {
            "toggle-wave": settings.showWave ?? true,
            "toggle-rarity": settings.showRarity ?? true,
            "toggle-artist": settings.showArtist ?? true,
            "toggle-id": settings.showID ?? false
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.checked = value;
        });
        
        const onClickAction = document.getElementById("on-click-action");
        if (onClickAction) onClickAction.value = settings.onClick ?? "previous-arts";
    }
}

function safeHideSpawnArtsLoadingModal() {
    try {
        if (AppState.activeLoadingModal) {
            AppState.activeLoadingModal.hide();
            AppState.activeLoadingModal = null;
        }
        setTimeout(forceCleanupAllModals, 150);
    } catch (error) {
        console.warn('Error hiding modal, forcing cleanup:', error);
        forceCleanupAllModals();
    }
}
