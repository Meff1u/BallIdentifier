/**
 * ============================================================================
 * BALL IDENTIFIER TRAINER - Interactive Discord-like Simulation
 * ============================================================================
 * 
 * This file manages the complete trainer interface including:
 * - Spawn simulation with catch mechanics
 * - Chat message scheduling
 * - Simulated user catches
 * - Statistics tracking
 * - UI/UX interactions
 * 
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', function() {

// ============================================================================
// 1. DOM ELEMENT SELECTION & INITIALIZATION
// ============================================================================

    // Get trainer tab reference
    const trainerTab = document.getElementById('trainer-tab');
    
    // Get elements for functionality
    const spawnChannelBtn = document.getElementById('spawn-channel');
    const configurationChannelBtn = document.getElementById('configuration-channel');
    const trainerMessagesContainer = document.getElementById('trainer-messages');
    const trainerMessageInput = document.getElementById('trainer-message-input');
    const trainerMessageButtons = document.querySelectorAll('.trainer-input-area button');
    const footer = document.querySelector('.main-footer');
    const trainerContent = document.getElementById('trainer-content');
    
    let activeChannel = 'spawn-channel';

// ============================================================================
// 2. UI STATE MANAGEMENT - Footer, Sidebar, Channel Switching
// ============================================================================

    // Hide footer when Trainer tab is active
    function updateFooterVisibility() {
        const body = document.body;
        if (trainerContent && trainerContent.classList.contains('active')) {
            if (footer) footer.style.display = 'none';
            document.body.style.overflow = 'hidden';
            body.style.height = '100vh';
            body.style.maxHeight = '100vh';
        } else {
            if (footer) footer.style.display = '';
            document.body.style.overflow = '';
            body.style.height = '';
            body.style.maxHeight = '';
        }
    }

    // Listen for tab changes
    if (trainerTab) {
        trainerTab.addEventListener('shown.bs.tab', function() {
            updateFooterVisibility();
        });
    }

    // Also watch for other tabs being clicked
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', updateFooterVisibility);
    });

    // Initial check
    setTimeout(updateFooterVisibility, 100);
    
    // Helper function to scroll to bottom
    function scrollChatToBottom() {
        if (!trainerMessagesContainer) {
            return;
        }
        setTimeout(() => {
            const scrollHeight = trainerMessagesContainer.scrollHeight;
            trainerMessagesContainer.scrollTop = scrollHeight;
        }, 50);
    }
    
    // Mobile sidebar toggle
    const sidebarToggleBtn = document.getElementById('trainer-sidebar-toggle');
    const sidebarToggleHeader = document.getElementById('sidebar-toggle-header');
    const trainerSidebar = document.querySelector('.trainer-sidebar');
    const trainerContainer = document.querySelector('.trainer-container');
    
    if (sidebarToggleBtn && trainerSidebar) {
        // Toggle sidebar on button click
        sidebarToggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            trainerSidebar.classList.toggle('mobile-open');
            trainerContainer.classList.toggle('sidebar-open');
        });
        
        // Close sidebar when clicking overlay
        const overlay = document.querySelector('.trainer-sidebar-overlay');
        if (overlay) {
            overlay.addEventListener('click', function() {
                trainerSidebar.classList.remove('mobile-open');
                trainerContainer.classList.remove('sidebar-open');
            });
        }
    }

    // Hashtag button for mobile sidebar toggle (in chat header)
    if (sidebarToggleHeader && trainerSidebar) {
        sidebarToggleHeader.addEventListener('click', function(e) {
            e.stopPropagation();
            trainerSidebar.classList.toggle('mobile-open');
        });
        
        // Show/hide hashtag button based on viewport
        function updateSidebarToggleButton() {
            if (window.innerWidth <= 768) {
                sidebarToggleHeader.style.display = 'block';
            } else {
                sidebarToggleHeader.style.display = 'none';
            }
        }
        
        updateSidebarToggleButton();
        window.addEventListener('resize', updateSidebarToggleButton);
    }

    // Setup channel click handlers with switchChannel
    document.querySelectorAll('.trainer-channel').forEach(channel => {
        channel.addEventListener('click', function() {
            const channelId = this.id;
            let channelName = 'spawn-channel';
            
            if (channelId === 'configuration-channel') {
                channelName = 'configuration';
                // Prevent switching to configuration channel while simulation is running
                if (simulationRunning) {
                    return;
                }
            }
            
            switchChannel(channelId, channelName);
            
            // Close sidebar on mobile
            if (window.innerWidth <= 768 && trainerSidebar) {
                trainerSidebar.classList.remove('mobile-open');
                if (trainerContainer) trainerContainer.classList.remove('sidebar-open');
            }
        });
    });
    
    // Initialize default view (spawn-channel is active by default)
    // This will be called again after setupSidebarToggle is ready
    setTimeout(function() {
        switchChannel('spawn-channel', 'spawn-channel');
    }, 200);

// ============================================================================
// 3. CHANNEL SWITCHING & MESSAGE DISPLAY
// ============================================================================

    function switchChannel(channelId, channelName) {
        // Update active channel styling
        document.querySelectorAll('.trainer-channel').forEach(ch => {
            ch.classList.remove('active');
        });
        document.getElementById(channelId).classList.add('active');

        // Update header
        const header = document.querySelector('.trainer-header h6');
        const subheader = document.querySelector('.trainer-header small');
        if (header) header.textContent = channelName;
        if (subheader) {
            if (channelName === 'spawn-channel') {
                subheader.textContent = 'Discord chat and spawns simulation';
            } else {
                subheader.textContent = 'Configure trainer settings';
            }
        }

        // Show/hide input areas and panels based on channel
        const spawnInput = document.getElementById('spawn-channel-input');
        const configInput = document.getElementById('configuration-channel-input');
        const trainerMessages = document.getElementById('trainer-messages');
        const configPanel = document.getElementById('configuration-panel');
        
        if (channelName === 'spawn-channel') {
            if (spawnInput) spawnInput.style.display = 'block';
            if (configInput) configInput.style.display = 'none';
            if (trainerMessages) trainerMessages.style.display = 'flex';
            if (configPanel) {
                configPanel.classList.remove('active');
            }
        } else if (channelName === 'configuration') {
            if (spawnInput) spawnInput.style.display = 'none';
            if (configInput) configInput.style.display = 'block';
            if (trainerMessages) trainerMessages.style.display = 'none';
            if (configPanel) {
                configPanel.classList.add('active');
            }
        }

        activeChannel = channelId;

        // Optionally clear or load channel-specific messages
        if (channelName === 'spawn-channel') {
            clearMessagesView();
        }
    }

    function clearMessagesView() {
        // Clear current messages while keeping the empty state for demo
        if (trainerMessagesContainer) {
            trainerMessagesContainer.innerHTML = `
                <div class="text-center text-secondary mt-auto" style="font-size: 0.95rem;">
                    <i class="bi bi-chat-dots" style="font-size: 2.5rem; display: block; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <p>Welcome to #${activeChannel}!</p>
                    <small>Messages will appear here<br>That feature is still in development and may have some bugs!</small>
                </div>
            `;
        }
    }

    function addMessageToChat(author, content, side, type) {
        if (!trainerMessagesContainer) return;

        // Remove empty state if exists
        const emptyState = trainerMessagesContainer.querySelector('.text-center');
        if (emptyState && trainerMessagesContainer.children.length === 1) {
            emptyState.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'trainer-message';

        const avatarColor = type === 'bot' 
            ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
            : 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)';

        const initials = author.split(' ').map(n => n[0]).join('').toUpperCase();

        messageDiv.innerHTML = `
            <div class="trainer-message-avatar" style="background: ${avatarColor};">
                ${initials}
            </div>
            <div class="trainer-message-content">
                <div class="trainer-message-header">
                    <span class="trainer-message-author">${author}</span>
                    <span class="trainer-message-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="trainer-message-text">${escapeHtml(content)}</div>
            </div>
        `;

        trainerMessagesContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        scrollChatToBottom();
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

// ============================================================================
// 4. CONFIGURATION SYSTEM - Settings & Local Storage
// ============================================================================
    
    const CONFIG_KEY = 'trainerConfig';
    const DEFAULT_CONFIG = {
        spawnFreqMin: 5,
        spawnFreqMax: 20,
        chatFreq: 'medium',
        userCatching: 'off',
        bot: 'ballsdex'
    };

    // Load configuration from localStorage
    function loadConfig() {
        const saved = localStorage.getItem(CONFIG_KEY);
        return saved ? Object.assign({}, DEFAULT_CONFIG, JSON.parse(saved)) : DEFAULT_CONFIG;
    }

    // Save configuration to localStorage
    function saveConfig(config) {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    }

    // Initialize configuration
    let currentConfig = loadConfig();
    
    // Get config elements
    const spawnFreqMinInput = document.getElementById('spawn-freq-min');
    const spawnFreqMaxInput = document.getElementById('spawn-freq-max');
    const spawnFreqError = document.getElementById('spawn-freq-error');
    const chatFreqRadios = document.querySelectorAll('input[name="chat-freq"]');
    const userCatchingRadios = document.querySelectorAll('input[name="user-catching"]');
    const botSelect = document.getElementById('bot-select');

    // Load and populate bot options from dexes.json
    async function loadBotOptions() {
        try {
            const response = await fetch('assets/jsons/dexes.json');
            const data = await response.json();
            
            if (data.dexes && Array.isArray(data.dexes) && botSelect) {
                // Clear existing options
                botSelect.innerHTML = '';
                
                // Populate options from dexes.json
                data.dexes.forEach((dex, index) => {
                    const option = document.createElement('option');
                    option.value = dex.toLowerCase();
                    option.textContent = dex;
                    if (index === 0) option.selected = true;
                    botSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('❌ Error loading dexes.json:', error);
        }
    }

    // Set initial values
    function initializeConfig() {
        if (spawnFreqMinInput) spawnFreqMinInput.value = currentConfig.spawnFreqMin;
        if (spawnFreqMaxInput) spawnFreqMaxInput.value = currentConfig.spawnFreqMax;
        
        chatFreqRadios.forEach(radio => {
            if (radio.value === currentConfig.chatFreq) {
                radio.checked = true;
                radio.parentElement.classList.add('active');
            } else {
                radio.parentElement.classList.remove('active');
            }
        });
        
        userCatchingRadios.forEach(radio => {
            if (radio.value === currentConfig.userCatching) {
                radio.checked = true;
                radio.parentElement.classList.add('active');
            } else {
                radio.parentElement.classList.remove('active');
            }
        });
        
        if (botSelect) {
            botSelect.value = currentConfig.bot;
            const historydexWarning = document.getElementById('historydex-warning');
            if (historydexWarning && currentConfig.bot.toLowerCase() === 'historydex') {
                historydexWarning.style.display = 'block';
            }
        }
    }

    // Validate spawn frequency
    function validateSpawnFreq() {
        const min = parseInt(spawnFreqMinInput?.value) || 10;
        const max = parseInt(spawnFreqMaxInput?.value) || 60;
        let error = '';

        if (min < 5) error = 'Minimum must be at least 5 seconds';
        else if (max > 60) error = 'Maximum cannot exceed 60 seconds';
        else if (max < min) error = 'Maximum must be greater than or equal to minimum';

        if (spawnFreqError) {
            if (error) {
                spawnFreqError.textContent = '⚠️ ' + error;
                spawnFreqError.style.display = 'block';
                return false;
            } else {
                spawnFreqError.style.display = 'none';
            }
        }
        return !error;
    }

    // Spawn frequency inputs
    if (spawnFreqMinInput) {
        spawnFreqMinInput.addEventListener('change', function() {
            if (validateSpawnFreq()) {
                currentConfig.spawnFreqMin = parseInt(this.value);
                saveConfig(currentConfig);
            }
        });
    }

    if (spawnFreqMaxInput) {
        spawnFreqMaxInput.addEventListener('change', function() {
            if (validateSpawnFreq()) {
                currentConfig.spawnFreqMax = parseInt(this.value);
                saveConfig(currentConfig);
            }
        });
    }

    // Chat frequency radios
    chatFreqRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.checked) {
                chatFreqRadios.forEach(r => r.parentElement.classList.remove('active'));
                this.parentElement.classList.add('active');
                currentConfig.chatFreq = this.value;
                saveConfig(currentConfig);
            }
        });
    });

    // User catching radios
    userCatchingRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.checked) {
                userCatchingRadios.forEach(r => r.parentElement.classList.remove('active'));
                this.parentElement.classList.add('active');
                currentConfig.userCatching = this.value;
                saveConfig(currentConfig);
            }
        });
    });

    // Bot select
    if (botSelect) {
        botSelect.addEventListener('change', function() {
            currentConfig.bot = this.value;
            saveConfig(currentConfig);
            
            const historydexWarning = document.getElementById('historydex-warning');
            if (historydexWarning) {
                if (this.value.toLowerCase() === 'historydex') {
                    historydexWarning.style.display = 'block';
                } else {
                    historydexWarning.style.display = 'none';
                }
            }
        });
    }

    // Initialize on load - load bot options first, then config
    (async function() {
        await loadBotOptions();
        initializeConfig();
    })();

// ============================================================================
// 5. DATA LOADING - Balls, Chat Data, Bot Configurations
// ============================================================================
    
    // ==================== SPAWN SIMULATION LOGIC ====================
    
    let simulationRunning = false;
    let simulationTimeout = null;
    let currentSpawnedBall = null;
    let currentBallCaught = false; // Track if current ball is already caught
    let ballsList = [];
    let simulationStartTime = null;
    let spawnedBalls = []; // Track spawned balls with timestamps
    let chatData = null; // Chat messages data
    let chatTimeout = null; // Chat message scheduling timeout
    let chatTimeouts = []; // Track all chat timeouts for cleanup
    let userCatchTimeouts = []; // Track timeouts for simulated user catching
    let currentSpawnIndex = null; // Track current spawn index for proper statistics
    
    const startSimulationBtn = document.getElementById('start-simulation-btn');
    const simBtnIcon = document.getElementById('simBtnIcon');
    const simBtnText = document.getElementById('simBtnText');
    const catchModal = document.getElementById('catchModal');
    const catchGuessInput = document.getElementById('catchGuessInput');
    const catchCancelBtn = document.getElementById('catchCancelBtn');
    const catchSubmitBtn = document.getElementById('catchSubmitBtn');
    
// ============================================================================
// 6. UTILITY FUNCTIONS
// ============================================================================
    
    // Generate random number between min and max (inclusive)
    function rn(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

// ============================================================================
// 7. BALL DATA MANAGEMENT
// ============================================================================
    
    // Load balls list from selected dex
    async function loadBallsList() {
        const bot = currentConfig.bot.toLowerCase();
        const jsonNames = {
            'ballsdex': 'Ballsdex',
            'fooddex': 'FoodDex',
            'historydex': 'HistoryDex',
        };
        const jsonName = jsonNames[bot] || 'Ballsdex';
        
        try {
            const response = await fetch(`assets/jsons/${jsonName}.json`);
            if (response.ok) {
                const data = await response.json();
                ballsList = Object.keys(data).filter(key => key !== 'hashes');
            } else {
                throw new Error('JSON not found');
            }
        } catch (error) {
            console.error('❌ Error loading balls list:', error);
            ballsList = [];
        }
    }
    
    // Get random ball
    function getRandomBall() {
        if (ballsList.length === 0) return null;
        return ballsList[rn(0, ballsList.length - 1)];
    }
    
    // Get random interval between min and max
    function getRandomInterval() {
        const min = currentConfig.spawnFreqMin || 5;
        const max = currentConfig.spawnFreqMax || 20;
        return rn(min, max) * 1000;
    }
    
    // Get bot config with name and icon path
    function getBotConfig() {
        const bot = currentConfig.bot.toLowerCase();
        const configs = {
            'ballsdex': { 
                name: 'Ballsdex', 
                icon: 'assets/icons/Ballsdex.png'
            },
            'fooddex': { 
                name: 'FoodDex', 
                icon: 'assets/icons/FoodDex.png'
            },
            'historydex': {
                name: 'HistoryDex',
                icon: 'assets/icons/HistoryDex.png'
            }
        };
        return configs[bot] || configs['ballsdex'];
    }
    
// ============================================================================
// 8. CHAT SIMULATION - Random Messages & Scheduling
// ============================================================================
    
    // Load chat messages data from data.json
    async function loadChatData() {
        try {
            const response = await fetch('assets/trainer/data.json');
            chatData = await response.json();
        } catch (error) {
            console.error('❌ Error loading chat data:', error);
            chatData = null;
        }
    }

    // Check if guess matches the ball name or any of its abbreviations
    function isValidCatch(guess, ballName) {
        const normalizedGuess = guess.toLowerCase().trim();
        
        // Check exact match with ball name
        if (normalizedGuess === ballName.toLowerCase()) {
            return true;
        }
        
        // Check against abbreviations if they exist
        if (chatData?.abbreviations) {
            const botName = currentConfig.bot.toLowerCase();
            const botAbbreviations = chatData.abbreviations[botName];
            
            if (botAbbreviations && botAbbreviations[ballName]) {
                const abbreviations = botAbbreviations[ballName];
                for (const abbrev of abbreviations) {
                    if (normalizedGuess === abbrev) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    // Preload compressed images
    async function preloadCompressedImages() {
        if (ballsList.length === 0) return;
        
        const botConfig = getBotConfig();
        const botName = botConfig.name;
        const imageCache = [];
        
        console.log(`⏳ Preloading ${ballsList.length} compressed images...`);
        
        for (const ball of ballsList) {
            const img = new Image();
            img.src = `assets/dexes/${botName}/compressed/${ball}.png`;
            imageCache.push(img);
        }
        
        // Wait for all images to be preloaded
        const promises = imageCache.map(img => {
            return new Promise((resolve) => {
                if (img.complete) {
                    resolve();
                } else {
                    img.onload = () => resolve();
                    img.onerror = () => resolve(); // Still resolve on error to not block
                }
            });
        });
        
        try {
            await Promise.all(promises);
            console.log('✅ All compressed images preloaded successfully!');
        } catch (error) {
            console.error('❌ Error preloading images:', error);
        }
    }

    // Get random username from chat data
    function getRandomUsername() {
        if (!chatData?.usernames || chatData.usernames.length === 0) {
            return 'User ' + rn(0, 999);
        }
        return chatData.usernames[rn(0, chatData.usernames.length - 1)];
    }

    // Get random message from chat data
    function getRandomMessage() {
        if (!chatData?.messages || chatData.messages.length === 0) {
            return 'Hey there!';
        }
        return chatData.messages[rn(0, chatData.messages.length - 1)];
    }

    // Post a random chat message
    function postRandomChatMessage() {
        const username = getRandomUsername();
        const message = getRandomMessage();
        addMessageToChat(username, message, 'left', 'user');
    }

    // Get random chat frequency interval in ms based on setting
    function getChatFrequencyInterval() {
        const freq = currentConfig.chatFreq;
        const ranges = {
            'low': [8000, 14000],       // 8-14 seconds
            'medium': [5000, 10000],    // 5-10 seconds
            'high': [3000, 5000]        // 3-5 seconds
        };
        
        const range = ranges[freq] || [5000, 10000];
        const [min, max] = range;
        return rn(min, max);
    }

    // Schedule chat messages during simulation
    function scheduleChatMessages() {
        if (currentConfig.chatFreq === 'off') {
            return;
        }

        const interval = getChatFrequencyInterval();

        function scheduleNextMessage() {
            if (!simulationRunning) return;

            chatTimeout = setTimeout(() => {
                postRandomChatMessage();
                scheduleNextMessage();
            }, interval);

            chatTimeouts.push(chatTimeout);
        }

        scheduleNextMessage();
    }

    // Stop all chat message scheduling
    function stopChatMessages() {
        chatTimeouts.forEach(timeout => clearTimeout(timeout));
        chatTimeouts = [];
        if (chatTimeout) {
            clearTimeout(chatTimeout);
            chatTimeout = null;
        }
    }

// ============================================================================
// 9. USER CATCH SIMULATION - Simulated user attempts & timing
// ============================================================================
    
    // Get difficulty level for user catching
    function getUserCatchDifficulty() {
        return currentConfig.userCatching;
    }

    // Get reaction time ranges based on difficulty (when users start attempting)
    function getUserCatchIntervals() {
        const difficulty = getUserCatchDifficulty();
        const ranges = {
            'easy': [5000, 10000],      // 5-10 seconds
            'medium': [3000, 5000],     // 3-5 seconds
            'hard': [2000, 3000]        // 2-3 seconds
        };
        return ranges[difficulty] || [5000, 10000];
    }

    // Get random reaction time based on difficulty
    function getRandomCatchTime() {
        const [min, max] = getUserCatchIntervals();
        return rn(min, max);
    }

    // Get random button click time (0.5-0.8 seconds)
    function getRandomClickTime() {
        return rn(500, 800); // 500-800ms
    }

    // Get typing time based on ball name length (length ms * random 90-130)
    function getTypingTime(ballName) {
        const randomMultiplier = rn(90, 130);
        return ballName.length * randomMultiplier;
    }

    // Schedule simulated user catches
    function scheduleSimulatedUserCatch(ballName) {
        if (!chatData || getUserCatchDifficulty() === 'off') {
            return;
        }

        // Clear previous user catch timeouts
        userCatchTimeouts.forEach(timeout => clearTimeout(timeout));
        userCatchTimeouts = [];
        
        // Store current spawn index for statistics
        currentSpawnIndex = spawnedBalls.length - 1;

        // Pick 1-5 random users
        const numUsers = rn(1, 5);
        const shuffledUsers = [...chatData.usernames].sort(() => rn(-1, 1));
        const selectedUsers = shuffledUsers.slice(0, numUsers);

        // Schedule each user to attempt a catch
        selectedUsers.forEach(username => {
            // Calculate total delay from multiple components:
            // 1. Reaction time (when user realizes ball appeared)
            const reactionTime = getRandomCatchTime();
            // 2. Click time (0.5-0.8 seconds)
            const clickTime = getRandomClickTime();
            // 3. Typing time (chars * 90-130 ms)
            const typingTime = getTypingTime(ballName);
            // Total delay
            const totalDelay = reactionTime + clickTime + typingTime;

            const timeoutId = setTimeout(() => {
                simulateUserCatch(username, ballName, totalDelay, reactionTime + clickTime + typingTime);
            }, totalDelay);
            userCatchTimeouts.push({ id: timeoutId, endTime: Date.now() + totalDelay });
        });
    }

    // Simulate a user catch attempt
    function simulateUserCatch(username, ballName, totalDelay, displayTime) {
        if (!simulationRunning) return;
        
        const catchTime = Date.now();
        const spawnTime = spawnedBalls[currentSpawnIndex]?.spawnTime || catchTime;
        const catchTimeDiff = displayTime / 1000;

        // Check if ball already caught
        if (currentBallCaught) {
            setTimeout(() => {
                addBotReplyForSimulatedAlreadyCaught(username, ballName);
            }, 100);
            return;
        }

        // Mark ball as caught and send message immediately
        currentBallCaught = true;
        
        // Mark ball as caught by simulated user
        if (currentSpawnIndex >= 0) {
            spawnedBalls[currentSpawnIndex].caught = true;
            spawnedBalls[currentSpawnIndex].catchTime = catchTime;
            spawnedBalls[currentSpawnIndex].caughtBy = 'simulated';
        }
        
        // Add bot reply for simulated user catch
        addBotReplyForSimulatedCatch(username, ballName, catchTimeDiff);
    }

    // Add bot reply for simulated user already caught message
    function addBotReplyForSimulatedAlreadyCaught(username, ballName) {
        if (!trainerMessagesContainer) return;

        const spawnMessages = Array.from(trainerMessagesContainer.querySelectorAll('[data-spawn-message="true"]'));
        const spawnMessage = spawnMessages[spawnMessages.length - 1];
        if (!spawnMessage) return;

        const botConfig = getBotConfig();
        const spawnMessageId = spawnMessage.id;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'trainer-message';

        const resultText = `<span style="color: #5865f2; font-weight: 500;">@${username}</span> I was caught already!`;

        messageDiv.innerHTML = `
            <div class="trainer-message-avatar">
                <img src="${botConfig.icon}" alt="${botConfig.name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
            </div>
            <div class="trainer-message-content">
                <div class="trainer-message-reference" style="font-size: 0.85em; color: rgba(255, 255, 255, 0.6); margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); cursor: pointer;" onclick="document.getElementById('${spawnMessageId}').scrollIntoView({ behavior: 'smooth', block: 'center' });" title="Click to view original message">
                    ↳ Replying to: A wild countryball appeared!
                </div>
                <div class="trainer-message-header">
                    <span class="trainer-message-author">${botConfig.name}</span>
                    <span class="trainer-message-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="trainer-message-text">${resultText}</div>
            </div>
        `;

        trainerMessagesContainer.appendChild(messageDiv);
        scrollChatToBottom();
    }

    // Add bot reply for simulated user catch
    function addBotReplyForSimulatedCatch(username, ballName, catchTime) {
        if (!trainerMessagesContainer) return;

        const spawnMessages = Array.from(trainerMessagesContainer.querySelectorAll('[data-spawn-message="true"]'));
        const spawnMessage = spawnMessages[spawnMessages.length - 1];
        if (!spawnMessage) return;

        const botConfig = getBotConfig();
        const spawnMessageId = spawnMessage.id;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'trainer-message';

        const resultText = `<span style="color: #5865f2; font-weight: 500;">@${username}</span> You caught <strong>${ballName}</strong>! (${catchTime.toFixed(2)}s)`;

        messageDiv.innerHTML = `
            <div class="trainer-message-avatar">
                <img src="${botConfig.icon}" alt="${botConfig.name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
            </div>
            <div class="trainer-message-content">
                <div class="trainer-message-reference" style="font-size: 0.85em; color: rgba(255, 255, 255, 0.6); margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); cursor: pointer;" onclick="document.getElementById('${spawnMessageId}').scrollIntoView({ behavior: 'smooth', block: 'center' });" title="Click to view original message">
                    ↳ Replying to: A wild countryball appeared!
                </div>
                <div class="trainer-message-header">
                    <span class="trainer-message-author">${botConfig.name}</span>
                    <span class="trainer-message-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="trainer-message-text">${resultText}</div>
            </div>
        `;

        trainerMessagesContainer.appendChild(messageDiv);
        scrollChatToBottom();
        
        // Disable the catch button and update it visually
        const catchBtn = spawnMessage.querySelector('.catch-me-btn');
        if (catchBtn) {
            catchBtn.disabled = true;
            catchBtn.textContent = 'Catch me';
        }
        
        // Schedule next spawn
        scheduleNextSpawn();
    }
    
    // Add spawn message with catch button
    function addSpawnMessage(ballName) {
        if (!trainerMessagesContainer) return;
        
        // Reset catch status and submit time tracking
        currentBallCaught = false;

        
        // Remove empty state if exists
        const emptyState = trainerMessagesContainer.querySelector('.text-center');
        if (emptyState && trainerMessagesContainer.children.length === 1) {
            emptyState.remove();
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'trainer-message';
        
        const botConfig = getBotConfig();
        const botName = botConfig.name;
        
        // Format ball name for file path (use compressed version)
        const imagePath = `assets/dexes/${botName}/compressed/${ballName}.webp`;
        
        messageDiv.innerHTML = `
            <div class="trainer-message-avatar">
                <img src="${botConfig.icon}" alt="${botName}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
            </div>
            <div class="trainer-message-content">
                <div class="trainer-message-header">
                    <span class="trainer-message-author">${botName}</span>
                    <span class="trainer-message-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="trainer-message-text mb-2">A wild countryball appeared!</div>
                <div style="margin-top: 10px; margin-bottom: 10px;">
                    <img src="${imagePath}" alt="${ballName}" class="img-fluid rounded" style="max-height: 250px;">
                </div>
                <button class="btn btn-primary btn-sm catch-me-btn" data-ball="${ballName}" style="margin-top: 10px;">
                    Catch me
                </button>
            </div>
        `;
        messageDiv.setAttribute('data-spawn-message', 'true');
        messageDiv.id = 'spawn-msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        // Track spawn time for statistics
        const spawnTime = Date.now();
        spawnedBalls.push({
            ballName: ballName,
            spawnTime: spawnTime,
            messageId: messageDiv.id,
            caught: false,
            catchTime: null,
            caughtBy: null
        });
        messageDiv.setAttribute('data-spawn-index', spawnedBalls.length - 1);
        
        trainerMessagesContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        scrollChatToBottom();
        
        // Wait for image to load, then scroll again (in case image size changed)
        const ballImage = messageDiv.querySelector('img[src*="dexes"]');
        if (ballImage) {
            ballImage.addEventListener('load', () => {
                scrollChatToBottom();
                setTimeout(scrollChatToBottom, 100);
            });
        }
        
        // Reset catch status for new ball and schedule user catching
        currentBallCaught = false;
        scheduleSimulatedUserCatch(ballName);
        
        // Add event listener to catch button
        const catchBtn = messageDiv.querySelector('.catch-me-btn');
        if (catchBtn) {
            catchBtn.addEventListener('click', function() {
                handleCatchMeButtonClick(this);
            });
        }
    }
    
    let catchTimeoutId = null; // Track current catch timeout
    
    // Handle catch me button click with loading animation
    function handleCatchMeButtonClick(button) {
        const ballName = button.getAttribute('data-ball');
        const originalText = button.textContent;
        
        // Clear any previous pending catch timeout
        if (catchTimeoutId !== null) {
            clearTimeout(catchTimeoutId);
        }
        
        // Disable button and show loading
        button.disabled = true;
        button.innerHTML = '<img src="assets/trainer/loading.webp" alt="Loading" style="height: 10px; width: 100%; object-fit: contain;">';
        
        // Random delay between 500-1300 milliseconds
        const delay = rn(500, 1300);
        
        catchTimeoutId = setTimeout(() => {
            currentSpawnedBall = ballName;
            showCatchModal(currentSpawnedBall);
            
            // Restore button after modal is shown
            button.disabled = false;
            button.textContent = originalText;
            catchTimeoutId = null;
        }, delay);
    }
    
    // Show catch modal
    function showCatchModal(ballName) {
        catchGuessInput.value = '';
        
        // Check if mobile device
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        
        const modalOptions = {
            animation: false,
            backdrop: isMobile ? false : 'static',
            keyboard: false
        };
        
        const modal = bootstrap.Modal.getOrCreateInstance(catchModal, modalOptions);
        
        // For mobile, add backdrop styling to body
        if (isMobile) {
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
        }
        
        modal.show();
        
        // Focus input after modal is shown - only on mobile
        if (isMobile) {
            setTimeout(() => {
                catchGuessInput.focus();
                // Force scroll to show keyboard
                catchGuessInput.scrollIntoView({ behavior: 'instant', block: 'end' });
            }, 100);
        }
    }
    
    // Handle catch submit
    function handleCatchSubmit() {
        const guess = catchGuessInput.value.trim();
        const submitTime = Date.now();
        
        // Validate catch using abbreviations if available
        const isCorrect = isValidCatch(guess, currentSpawnedBall);
        
        // Track catch time
        const spawnMessages = Array.from(trainerMessagesContainer.querySelectorAll('[data-spawn-message="true"]'));
        const spawnMessage = spawnMessages[spawnMessages.length - 1];
        const spawnIndex = spawnMessage ? parseInt(spawnMessage.getAttribute('data-spawn-index')) : -1;
        
        // Check if ball is already caught
        if (currentBallCaught && spawnIndex >= 0) {
            addBotReplyToSpawn(false, currentSpawnedBall, true);
        } else if (spawnIndex >= 0 && isCorrect) {
            // Ball caught by real user for first time
            spawnedBalls[spawnIndex].caught = true;
            spawnedBalls[spawnIndex].catchTime = submitTime;
            spawnedBalls[spawnIndex].caughtBy = 'real';
            const catchTimeDiff = submitTime - spawnedBalls[spawnIndex].spawnTime;
            currentBallCaught = true;
            
            // Clear any pending user catch timeouts that have more than 2 seconds remaining
            const now = Date.now();
            userCatchTimeouts.forEach(catchInfo => {
                const remainingTime = catchInfo.endTime - now;
                if (remainingTime > 2000) {
                    clearTimeout(catchInfo.id);
                }
            });
            userCatchTimeouts = [];
            
            // Add bot reply to the spawn message
            addBotReplyToSpawn(isCorrect, currentSpawnedBall);
        } else {
            // Wrong answer
            addBotReplyToSpawn(isCorrect, currentSpawnedBall);
        }
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(catchModal);
        if (modal) {
            // Restore body styles on mobile
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (isMobile) {
                document.body.style.overflow = '';
                document.body.style.position = '';
                document.body.style.width = '';
            }
            modal.hide();
        }
        
        if (isCorrect && currentBallCaught) {
            scheduleNextSpawn();
        }
    }
    
    // Add bot reply to the last spawn message
    function addBotReplyToSpawn(isCorrect, actualBall, isAlreadyCaught = false) {
        if (!trainerMessagesContainer) return;
        
        // Find the last spawn message - use querySelectorAll and get last one
        const spawnMessages = Array.from(trainerMessagesContainer.querySelectorAll('[data-spawn-message="true"]'));
        const spawnMessage = spawnMessages[spawnMessages.length - 1];
        if (!spawnMessage) {
            return;
        }
        
        const spawnMessageId = spawnMessage.id;
        const botConfig = getBotConfig();
        const spawnIndex = spawnMessage ? parseInt(spawnMessage.getAttribute('data-spawn-index')) : -1;
        
        let resultText;
        
        if (isAlreadyCaught) {
            // Ball was already caught by simulated user
            resultText = `<span style="color: #5865f2; font-weight: 500;">@amazing sniper</span> I was caught already!`;
        } else if (isCorrect) {
            // Get catch time in seconds with 2 decimal places
            const catchTimeDiff = spawnIndex >= 0 ? (spawnedBalls[spawnIndex].catchTime - spawnedBalls[spawnIndex].spawnTime) / 1000 : 0;
            resultText = `<span style="color: #5865f2; font-weight: 500;">@amazing sniper</span> You caught <strong>${actualBall}</strong>! (${catchTimeDiff.toFixed(2)}s)`;
        } else {
            resultText = `<span style="color: #5865f2; font-weight: 500;">@amazing sniper</span> Wrong name!`;
        }
        
        // Create a normal message with reference to spawn
        const messageDiv = document.createElement('div');
        messageDiv.className = 'trainer-message';
        
        messageDiv.innerHTML = `
            <div class="trainer-message-avatar">
                <img src="${botConfig.icon}" alt="${botConfig.name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
            </div>
            <div class="trainer-message-content">
                <div class="trainer-message-reference" style="font-size: 0.85em; color: rgba(255, 255, 255, 0.6); margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); cursor: pointer;" onclick="document.getElementById('${spawnMessageId}').scrollIntoView({ behavior: 'smooth', block: 'center' });" title="Click to view original message">
                    ↳ Replying to: A wild countryball appeared!
                </div>
                <div class="trainer-message-header">
                    <span class="trainer-message-author">${botConfig.name}</span>
                    <span class="trainer-message-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="trainer-message-text">${resultText}</div>
            </div>
        `;
        
        trainerMessagesContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        scrollChatToBottom();
        
        // If correct, disable the catch button and update it visually
        if (isCorrect) {
            const catchBtn = spawnMessage.querySelector('.catch-me-btn');
            if (catchBtn) {
                catchBtn.disabled = true;
                catchBtn.textContent = 'Catch me';
            }
        }
        
        // Scroll to bottom
        scrollChatToBottom();
    }
    
    // Schedule next spawn
    function scheduleNextSpawn() {
        if (!simulationRunning) return;
        
        if (simulationTimeout) {
            clearTimeout(simulationTimeout);
        }
        
        const interval = getRandomInterval();
        
        simulationTimeout = setTimeout(() => {
            if (simulationRunning) {
                const ball = getRandomBall();
                if (ball) {
                    addSpawnMessage(ball);
                }
            }
        }, interval);
    }
    
// ============================================================================
// 10. SIMULATION CONTROL - Start/Stop, State Management
// ============================================================================
    
    // Start simulation
    async function startSimulation() {
        simulationRunning = true;
        simulationStartTime = Date.now();
        spawnedBalls = [];
        
        // Disable start button during loading
        if (startSimulationBtn) {
            startSimulationBtn.disabled = true;
            simBtnText.textContent = 'Loading...';
        }
        
        // Disable configuration channel
        if (configurationChannelBtn) {
            configurationChannelBtn.classList.add('disabled');
            configurationChannelBtn.style.pointerEvents = 'none';
            configurationChannelBtn.style.opacity = '0.5';
            configurationChannelBtn.title = 'Configuration is locked during simulation';
        }
        
        // Load balls list
        await loadBallsList();
        
        // Preload all compressed images before starting
        await preloadCompressedImages();
        
        // Re-enable start button after images are preloaded
        if (startSimulationBtn) {
            startSimulationBtn.disabled = false;
        }
        
        // Load chat data and schedule chat messages
        await loadChatData();
        scheduleChatMessages();
        
        // Start first spawn
        const ball = getRandomBall();
        if (ball) {
            addSpawnMessage(ball);
        }
        
        // Update button to show pause icon and "Stop Simulation" text
        if (startSimulationBtn && simBtnIcon && simBtnText) {
            startSimulationBtn.disabled = false;
            simBtnIcon.className = 'bi bi-pause-fill me-2';
            simBtnText.textContent = 'Stop Simulation';
        }
    }
    
    // Stop simulation
    function stopSimulation() {
        simulationRunning = false;
        
        // Enable start button
        if (startSimulationBtn) {
            startSimulationBtn.disabled = false;
        }
        
        // Enable configuration channel
        if (configurationChannelBtn) {
            configurationChannelBtn.classList.remove('disabled');
            configurationChannelBtn.style.pointerEvents = 'auto';
            configurationChannelBtn.style.opacity = '1';
            configurationChannelBtn.title = '';
        }
        
        if (simulationTimeout) {
            clearTimeout(simulationTimeout);
        }
        
        // Stop chat messages
        stopChatMessages();
        
        // Stop user catching timeouts
        userCatchTimeouts.forEach(catchInfo => clearTimeout(catchInfo.id));
        userCatchTimeouts = [];
        
        // Calculate statistics
        const totalSpawned = spawnedBalls.length;
        const totalCaught = spawnedBalls.filter(b => b.caught && b.caughtBy === 'real').length;
        const simulationDuration = simulationStartTime ? Date.now() - simulationStartTime : 0;
        
        let fastestCatch = null;
        let fastestTime = Infinity;
        let totalCatchTime = 0;
        let catchCount = 0;
        for (const spawn of spawnedBalls) {
            if (spawn.caught && spawn.catchTime && spawn.caughtBy === 'real') {
                const catchDiff = spawn.catchTime - spawn.spawnTime;
                if (catchDiff < fastestTime) {
                    fastestTime = catchDiff;
                    fastestCatch = { ballName: spawn.ballName, time: catchDiff };
                }
                totalCatchTime += catchDiff;
                catchCount++;
            }
        }
        
        // Calculate average catch time
        const averageCatchTime = catchCount > 0 ? totalCatchTime / catchCount : 0;
        
        // Clear chat
        if (trainerMessagesContainer) {
            trainerMessagesContainer.innerHTML = `
                <div class="text-center text-secondary mt-auto" style="font-size: 0.95rem;">
                    <i class="bi bi-chat-dots" style="font-size: 2.5rem; display: block; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <p>Welcome to #spawn!</p>
                    <small>Messages will appear here</small>
                </div>
            `;
        }
        
        // Show statistics modal
        showStatisticsModal({
            totalSpawned,
            totalCaught,
            fastestCatch,
            averageCatchTime,
            simulationDuration
        });
        
        if (startSimulationBtn && simBtnIcon && simBtnText) {
            startSimulationBtn.disabled = false;
            simBtnIcon.className = 'bi bi-play-fill me-2';
            simBtnText.textContent = 'Start Simulation';
        }
    }
    
// ============================================================================
// 11. STATISTICS - Tracking and Display
// ============================================================================
    
    // Show statistics modal
    function showStatisticsModal(stats) {
        const { totalSpawned, totalCaught, fastestCatch, averageCatchTime, simulationDuration } = stats;
        
        // Format duration as Xm Ys if >= 60s, otherwise just Xs
        let durationText;
        const totalSeconds = Math.floor(simulationDuration / 1000);
        if (totalSeconds >= 60) {
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            durationText = `${minutes}m ${seconds}s`;
        } else {
            durationText = `${totalSeconds}s`;
        }
        
        // Format fastest catch time in seconds with 2 decimal places
        let fastestCatchText = fastestCatch 
            ? `${fastestCatch.ballName} - ${(fastestCatch.time / 1000).toFixed(2)}s`
            : 'No catches';
        
        const modalHtml = `
            <div class="modal fade" id="statisticsModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content bg-dark border-primary">
                        <div class="modal-header border-primary">
                            <h5 class="modal-title text-primary">Simulation Statistics 📊</h5>
                        </div>
                        <div class="modal-body">
                            <div class="stat-item mb-3">
                                <div class="stat-label text-secondary">Catches</div>
                                <div class="stat-value text-light" style="font-size: 1.8em; font-weight: bold;">
                                    ${totalCaught}<span style="font-size: 0.6em;">/${totalSpawned}</span>
                                </div>
                            </div>
                            
                            <div class="stat-item mb-3">
                                <div class="stat-label text-secondary">Fastest Catch</div>
                                <div class="stat-value text-light" style="font-size: 1.2em;">
                                    ${fastestCatchText}
                                </div>
                            </div>
                            
                            <div class="stat-item mb-3">
                                <div class="stat-label text-secondary">Average Catch Time</div>
                                <div class="stat-value text-light" style="font-size: 1.2em;">
                                    ${totalCaught > 0 ? (averageCatchTime / 1000).toFixed(2) + 's' : 'N/A'}
                                </div>
                            </div>
                            
                            <div class="stat-item">
                                <div class="stat-label text-secondary">Duration</div>
                                <div class="stat-value text-light" style="font-size: 1.2em;">
                                    ${durationText}
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer border-primary d-flex gap-2">
                            <button type="button" class="btn btn-primary flex-grow-1" id="statsCloseBtn">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('statisticsModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add new modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('statisticsModal'));
        modal.show();
        
        // Close button handler
        const closeBtn = document.getElementById('statsCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.hide();
            });
        }
    }
    
    // Add event listeners
    if (startSimulationBtn) {
        startSimulationBtn.addEventListener('click', function() {
            if (!simulationRunning) {
                startSimulation();
            } else {
                stopSimulation();
            }
        });
    }
    
    if (catchCancelBtn) {
        catchCancelBtn.addEventListener('click', function() {
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (isMobile) {
                document.body.style.overflow = '';
                document.body.style.position = '';
                document.body.style.width = '';
            }
            const modal = bootstrap.Modal.getInstance(catchModal);
            if (modal) modal.hide();
        });
    }
    
    if (catchSubmitBtn) {
        catchSubmitBtn.addEventListener('click', handleCatchSubmit);
    }

    // Restore body styles when modal is hidden on mobile
    if (catchModal) {
        catchModal.addEventListener('hidden.bs.modal', function() {
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (isMobile) {
                document.body.style.overflow = '';
                document.body.style.position = '';
                document.body.style.width = '';
            }
        });
    }
    
    // Also handle Enter key in guess input
    if (catchGuessInput) {
        catchGuessInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleCatchSubmit();
            }
        });
    }
});
