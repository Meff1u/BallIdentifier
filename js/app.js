/**
 * Main | Global state and initialization
 */

const AppState = {
    spawnArtsLoaded: false,
    activeLoadingModal: null,
    currentListDex: "Ballsdex",
    availableDexes: [],
    modals: { loading: null, result: null },
    offcanvas: { changelog: null }
};

document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
});

async function initializeApp() {
    await loadAvailableDexes();
    populateDexSelectors();
    initializeBootstrapComponents();
    initializeTabs();
    initializeBotFeatureTabs();
    initializeTooltips();
    initializeSpawnArtsSettings();
    initializeIdentifier();
    initializeDragDrop();
    syncMobileSelectors();
    updateTitleWithBallCount();
    setupKeyboardShortcuts();
}

async function loadAvailableDexes() {
    try {
        const response = await fetch('assets/jsons/dexes.json');
        const data = await response.json();
        AppState.availableDexes = data.dexes || [];
    } catch (error) {
        console.error('Error loading dexes list:', error);
        AppState.availableDexes = ['Ballsdex', 'FoodDex', 'HistoryDex', 'JoJoDex', "Empireballs Reboot"];
    }
}

function populateDexSelectors() {
    const dexSelector = document.getElementById('dexSelector');
    const listDexSelector = document.getElementById('listDexSelector');
    const listDexSelectorMobile = document.getElementById('listDexSelector-mobile');
    
    const dexes = AppState.availableDexes;
    
    [dexSelector, listDexSelector, listDexSelectorMobile].forEach(select => {
        if (!select) return;
        select.innerHTML = '';
        dexes.forEach((dex, index) => {
            const option = document.createElement('option');
            option.value = dex;
            option.textContent = dex;
            if (index === 0) option.selected = true;
            select.appendChild(option);
        });
    });
    
    if (dexes.length > 0) {
        AppState.currentListDex = dexes[0];
    }
}

function initializeBootstrapComponents() {
    const loadingModalEl = document.getElementById('loadingModal');
    const resultModalEl = document.getElementById('resultModal');
    const changelogEl = document.getElementById('changelogOffcanvas');
    
    AppState.modals.loading = new bootstrap.Modal(loadingModalEl);
    AppState.modals.result = new bootstrap.Modal(resultModalEl);
    AppState.offcanvas.changelog = new bootstrap.Offcanvas(changelogEl);
    
    window.loadingModal = AppState.modals.loading;
    window.resultModal = AppState.modals.result;
    window.changelogOffcanvas = AppState.offcanvas.changelog;
    
    loadingModalEl.addEventListener('hidden.bs.modal', function() {
        this.style.display = 'none';
        document.getElementById('loading-progress').style.display = 'none';
    });
    
    resultModalEl.addEventListener('hidden.bs.modal', function() {
        document.getElementById("resultImage").src = "";
    });
}

function initializeTooltips() {
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
}

function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (event) => {
        if (event.shiftKey && !event.ctrlKey && event.key.toLowerCase() === "f") {
            const spawnArtsTab = document.getElementById('spawn-arts-content');
            if (spawnArtsTab?.classList.contains('show')) {
                event.preventDefault();
                const searchBar = document.getElementById("search-bar");
                searchBar?.focus();
                searchBar?.select();
            }
        }
    });
}

function initializeTabs() {
    const searchBarContainer = document.querySelector('.spawn-arts-search');
    const mobileSettingsButton = document.getElementById('mobileSettingsButton');
    
    document.querySelectorAll('#mainTabs button[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', (event) => {
            const targetId = event.target.getAttribute('data-bs-target');
            
            localStorage.setItem('activeTab', event.target.id);
            
            if (targetId === '#spawn-arts-content') {
                searchBarContainer && (searchBarContainer.style.display = 'block');
                mobileSettingsButton?.classList.remove('d-none');
                
                if (!AppState.spawnArtsLoaded) {
                    loadSpawnArtsData("Ballsdex");
                    AppState.spawnArtsLoaded = true;
                }
            } else if (targetId === '#bot-content') {
                searchBarContainer && (searchBarContainer.style.display = 'none');
                mobileSettingsButton?.classList.add('d-none');
                loadBotStatistics();
            } else {
                searchBarContainer && (searchBarContainer.style.display = 'none');
                mobileSettingsButton?.classList.add('d-none');
            }
        });
    });
    
    const savedTab = localStorage.getItem('activeTab');
    if (savedTab) {
        const tabButton = document.getElementById(savedTab);
        if (tabButton) {
            const tab = new bootstrap.Tab(tabButton);
            tab.show();
        }
    }
    
    const activeTab = document.querySelector('#mainTabs .nav-link.active');
    const isSpawnArtsActive = activeTab?.getAttribute('data-bs-target') === '#spawn-arts-content';
    
    if (!isSpawnArtsActive) {
        searchBarContainer && (searchBarContainer.style.display = 'none');
        mobileSettingsButton?.classList.add('d-none');
    }
}

async function loadBotStatistics() {
    try {
        const response = await fetch('/.netlify/functions/get-bot-stats');
        
        if (!response.ok) {
            console.warn('Bot stats endpoint not available');
            return;
        }
        
        const result = await response.json();
        
        if (!result.success || !result.data) {
            console.warn('Bot stats response invalid');
            return;
        }
        
        const data = result.data;
        const guildsElement = document.getElementById('bot-guilds-count');
        const usersElement = document.getElementById('bot-users-count');
        const ballsElement = document.getElementById('bot-identified-balls');
        
        if (guildsElement) guildsElement.textContent = data.guilds?.toLocaleString() || '0';
        if (usersElement) usersElement.textContent = data.users?.toLocaleString() || '0';
        if (ballsElement) ballsElement.textContent = data.identifiedBalls?.toLocaleString() || '0';
    } catch (error) {
        console.error('Error loading bot statistics:', error);
        // Silently fail - stats are optional
    }
}

function isIdentifierTabActive() {
    const identifierTab = document.getElementById('identifier-content');
    return identifierTab?.classList.contains('show') ?? false;
}

function showAlert(message, type = "primary") {
    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = "top: 80px; left: 50%; transform: translateX(-50%); z-index: 1060; min-width: 300px;";
    alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    document.body.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 5000);
}

function showLoadingModal(text) {
    const loadingText = document.getElementById("loading-text");
    loadingText.textContent = text;
    window.resultModal?.hide();
    const loadingModalElement = document.getElementById('loadingModal');
    loadingModalElement.style.display = '';
    window.loadingModal?.show();
}

function hideLoadingModal() {
    if (!window.loadingModal) return;
    const loadingModalElement = document.getElementById('loadingModal');
    loadingModalElement.classList.remove('show');
    document.querySelector('.modal-backdrop')?.remove();
    window.loadingModal.hide();
    setTimeout(() => { loadingModalElement.style.display = 'none'; }, 50);
}

function forceCleanupAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    
    document.querySelectorAll('.modal').forEach(modal => {
        if (modal.id === 'loadingModal' || modal.id === 'resultModal') {
            modal.style.display = 'none';
            modal.classList.remove('show');
            return;
        }
        const instance = bootstrap.Modal.getInstance(modal);
        instance?.dispose();
        modal.style.display = 'none';
        modal.classList.remove('show');
    });
    
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('padding-right');
    document.body.style.removeProperty('overflow');
    AppState.activeLoadingModal = null;
    
    const loadingModalEl = document.getElementById('loadingModal');
    const resultModalEl = document.getElementById('resultModal');
    
    if (loadingModalEl && !bootstrap.Modal.getInstance(loadingModalEl)) {
        window.loadingModal = new bootstrap.Modal(loadingModalEl);
    }
    if (resultModalEl && !bootstrap.Modal.getInstance(resultModalEl)) {
        window.resultModal = new bootstrap.Modal(resultModalEl);
    }
}

function initializeBotFeatureTabs() {
    const botFeatureContent = document.getElementById('botFeatureTabsContent');
    const botFeaturePanes = document.querySelectorAll('#botFeatureTabsContent .tab-pane');
    const botFeatureTabs = document.querySelectorAll('#botFeatureTabs button[data-bs-toggle="pill"]');
    if (!botFeatureContent || !botFeaturePanes.length || !botFeatureTabs.length) return;

    // Remove fade only in Bot feature panes to avoid temporary height collapse during transitions.
    botFeaturePanes.forEach((pane) => pane.classList.remove('fade'));

    let maxSeenHeight = 0;
    const syncFeatureContainerHeight = () => {
        const activePane = botFeatureContent.querySelector('.tab-pane.active');
        if (!activePane) return;

        const activeHeight = activePane.offsetHeight;
        if (activeHeight > maxSeenHeight) {
            maxSeenHeight = activeHeight;
            botFeatureContent.style.minHeight = `${maxSeenHeight}px`;
        }
    };

    let savedScrollY = 0;
    botFeatureTabs.forEach((tab) => {
        tab.addEventListener('show.bs.tab', () => {
            savedScrollY = window.scrollY;
        });

        tab.addEventListener('shown.bs.tab', () => {
            syncFeatureContainerHeight();
            window.scrollTo({ top: savedScrollY, behavior: 'instant' });
        });
    });

    requestAnimationFrame(syncFeatureContainerHeight);
}