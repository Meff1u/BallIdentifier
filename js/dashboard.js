// Dashboard - Discord OAuth Login

const DISCORD_CLIENT_ID = '510775326310268930';
const SCOPES = ['identify', 'guilds'];
const BOT_ID = '510775326310268930';

// Determine environment and generate redirect URI
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const OAUTH_REDIRECT_URI = isLocalhost 
  ? 'http://localhost:8888/.netlify/functions/discord-oauth-callback'
  : 'https://ballidentifier.xyz/.netlify/functions/discord-oauth-callback';

const loginScreen = document.getElementById('loginScreen');
const guildsScreen = document.getElementById('guildsScreen');
const discordLoginBtn = document.getElementById('discordLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');

const navbarUserProfile = document.getElementById('navbarUserProfile');
const navbarUserAvatar = document.getElementById('navbarUserAvatar');
const dropdownUserName = document.getElementById('dropdownUserName');
const navbarLogoutBtn = document.getElementById('navbarLogoutBtn');

const guildsGrid = document.getElementById('guildsGrid');
const guildsLoading = document.getElementById('guildsLoading');
const guildsError = document.getElementById('guildsError');
const noAdminServers = document.getElementById('noAdminServers');

const configScreen = document.getElementById('configScreen');
const configLoading = document.getElementById('configLoading');
const configContent = document.getElementById('configContent');
const configError = document.getElementById('configError');
const noBotNotification = document.getElementById('noBotNotification');
const configGuildName = document.getElementById('configGuildName');
const configForm = document.getElementById('configForm');
const botsSelect = document.getElementById('botsSelect');
const roleSelect = document.getElementById('roleSelect');
const customMessage = document.getElementById('customMessage');
const messageValidation = document.getElementById('messageValidation');
const lastUpdateInfo = document.getElementById('lastUpdateInfo');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const deleteConfigBtn = document.getElementById('deleteConfigBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const backToGuildsBtn = document.getElementById('backToGuildsBtn');

let currentAccessToken = null;
let currentGuildId = null;
let currentGuildData = null;

// Helper function to validate custom message
function validateCustomMessage(message) {
    if (!message.includes('{role}')) {
        return {
            valid: false,
            error: '⚠️ {role} placeholder is required'
        };
    }
    
    // Check for potentially dangerous characters
    const dangerousPatterns = /<script|<iframe|javascript:|on\w+\s*=/gi;
    if (dangerousPatterns.test(message)) {
        return {
            valid: false,
            error: '❌ Message contains invalid or potentially dangerous content'
        };
    }
    
    return { valid: true, error: null };
}

// Display custom message validation
function updateMessageValidation(message) {
    if (!message) {
        messageValidation.textContent = '';
        return;
    }
    
    const validation = validateCustomMessage(message);
    if (validation.valid) {
        messageValidation.innerHTML = '<small class="text-success"><i class="bi bi-check-circle me-1"></i>Valid message</small>';
    } else {
        messageValidation.innerHTML = `<small class="text-danger">${validation.error}</small>`;
    }
}

// Helper function to handle rate limit responses
function handleRateLimitHeaders(response) {
    const limit = response.headers.get('X-RateLimit-Limit');
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');

    if (limit && remaining && reset) {
        const remainingCount = parseInt(remaining, 10);
        const resetTime = new Date(reset).toLocaleTimeString();
        
        // Warn if close to rate limit (10% or less remaining)
        if (remainingCount > 0 && remainingCount <= Math.ceil(parseInt(limit, 10) * 0.1)) {
            console.warn(`⚠️ Rate limit warning: ${remainingCount}/${limit} requests remaining. Resets at ${resetTime}`);
        }
        
        // Log rate limit info for debugging
        console.debug(`Requests left: ${remainingCount}/${limit} remaining (resets at ${resetTime})`);
    }
}

// Check if user is already logged in
function checkAuth() {
    const token = localStorage.getItem('discord_access_token');
    
    if (token) {
        loginScreen.style.display = 'none';
        guildsScreen.style.display = 'block';
        document.body.style.overflow = 'auto';
        loadUserAndGuilds(token);
    } else {
        // Check if returning from Discord auth
        const hash = window.location.hash;
        if (hash) {
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get('access_token');
            
            if (accessToken) {
                localStorage.setItem('discord_access_token', accessToken);
                window.location.hash = '';
                loginScreen.style.display = 'none';
                guildsScreen.style.display = 'block';
                document.body.style.overflow = 'auto';
                loadUserAndGuilds(accessToken);
            }
        }
    }
}

function getDiscordAuthUrl() {
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: OAUTH_REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES.join(' ')
    });
    
    const authUrl = `https://discord.com/oauth2/authorize?${params.toString()}`;
    console.log('Discord Auth URL:', authUrl);
    console.log('Redirect URI being used:', OAUTH_REDIRECT_URI);
    return authUrl;
}

discordLoginBtn.addEventListener('click', () => {
    window.location.href = getDiscordAuthUrl();
});

navbarLogoutBtn.addEventListener('click', () => {
    localStorage.removeItem('discord_access_token');
    loginScreen.style.display = 'block';
    guildsScreen.style.display = 'none';
    configScreen.style.display = 'none';
    navbarUserProfile.style.display = 'none';
    document.body.style.overflow = 'hidden';
    window.location.hash = '';
});

backToGuildsBtn.addEventListener('click', () => {
    guildsScreen.style.display = 'block';
    configScreen.style.display = 'none';
    document.body.style.overflow = 'auto';
});

async function loadUserAndGuilds(token) {
    try {
        // Fetch user info
        const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        // Handle rate limiting
        if (userResponse.status === 429) {
            guildsLoading.style.display = 'none';
            guildsError.textContent = 'Too many requests. Please try again in a minute.';
            guildsError.style.display = 'block';
            return;
        }
        
        // Handle authorization errors
        if (userResponse.status === 401) {
            localStorage.removeItem('discord_access_token');
            loginScreen.style.display = 'block';
            guildsScreen.style.display = 'none';
            navbarUserProfile.style.display = 'none';
            document.body.style.overflow = 'hidden';
            guildsLoading.style.display = 'none';
            guildsError.textContent = 'Your Discord session has expired. Please login again.';
            guildsError.style.display = 'block';
            return;
        }
        
        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('Discord API Error:', userResponse.status, errorText);
            throw new Error(`Failed to fetch user info (${userResponse.status}: ${userResponse.statusText})`);
        }
        
        const user = await userResponse.json();
        
        // Store access token for later use
        currentAccessToken = token;
        
        // Update navbar profile
        dropdownUserName.textContent = user.username;
        
        const avatarUrl = user.avatar 
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`;
        navbarUserAvatar.src = avatarUrl;
        navbarUserProfile.style.display = 'block';
        
        // Fetch guilds
        const guildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        // Handle rate limiting
        if (guildsResponse.status === 429) {
            guildsLoading.style.display = 'none';
            guildsError.textContent = 'Too many requests. Please try again in a minute.';
            guildsError.style.display = 'block';
            return;
        }
        
        // Handle authorization errors
        if (guildsResponse.status === 401) {
            localStorage.removeItem('discord_access_token');
            loginScreen.style.display = 'block';
            guildsScreen.style.display = 'none';
            navbarUserProfile.style.display = 'none';
            document.body.style.overflow = 'hidden';
            guildsLoading.style.display = 'none';
            guildsError.textContent = 'Your Discord session has expired. Please login again.';
            guildsError.style.display = 'block';
            return;
        }
        
        if (!guildsResponse.ok) {
            const errorText = await guildsResponse.text();
            console.error('Discord API Error:', guildsResponse.status, errorText);
            throw new Error(`Failed to fetch guilds (${guildsResponse.status}: ${guildsResponse.statusText})`);
        }
        
        const guilds = await guildsResponse.json();
        
        // Fetch list of guilds where bot is present
        let botGuildIds = new Set();
        try {
            const botGuildsResp = await fetch('/.netlify/functions/get-bot-guilds', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            // Handle rate limiting
            if (botGuildsResp.status === 429) {
                guildsLoading.style.display = 'none';
                guildsError.textContent = 'Too many requests. Please try again in a few minutes.';
                guildsError.style.display = 'block';
                return;
            }
            
            handleRateLimitHeaders(botGuildsResp);
            
            if (botGuildsResp.ok) {
                const botGuildsData = await botGuildsResp.json();
                if (botGuildsData.guilds && Array.isArray(botGuildsData.guilds)) {
                    botGuildIds = new Set(botGuildsData.guilds.map(g => g.id || g));
                }
            }
        } catch (error) {
            console.warn('Could not fetch bot guilds list:', error);
        }
        
        // Filter guilds where user has admin permissions AND bot is present
        const adminGuilds = guilds.filter(guild => {
            // Check if user has ADMINISTRATOR permission (bit 3 = value 8)
            const permissions = BigInt(guild.permissions);
            const ADMINISTRATOR = BigInt(8);
            const hasAdmin = (permissions & ADMINISTRATOR) === ADMINISTRATOR;
            
            // Check if bot is on this server
            const hasBotOnServer = botGuildIds.size === 0 || botGuildIds.has(guild.id);
            
            return hasAdmin && hasBotOnServer;
        });
        
        // Display filtered guilds
        if (adminGuilds.length === 0) {
            guildsLoading.style.display = 'none';
            noAdminServers.style.display = 'block';
            return;
        }
        
        guildsGrid.innerHTML = adminGuilds.map(guild => `
            <div>
                <div class="card guild-card h-100" role="button" tabindex="0">
                    <div class="card-body d-flex flex-column align-items-center text-center gap-3">
                        <img 
                            src="${getGuildIconUrl(guild)}" 
                            alt="${guild.name}" 
                            class="guild-icon"
                        >
                        <div class="flex-grow-1 w-100">
                            <h6 class="card-title mb-2">${guild.name}</h6>
                            <small class="card-text d-block">ID: ${guild.id}</small>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        
        guildsLoading.style.display = 'none';
        guildsGrid.style.display = 'block';
        guildsError.style.display = 'none';
        
        // Add click handlers to guild cards
        document.querySelectorAll('#guildsGrid > div').forEach((wrapper, index) => {
            const guildCard = wrapper.querySelector('.guild-card');
            const guild = adminGuilds[index];
            
            guildCard.addEventListener('click', () => {
                loadGuildConfig(currentAccessToken, guild.id);
            });
        });
        
    } catch (error) {
        console.error('Error loading user and guilds:', error);
        guildsLoading.style.display = 'none';
        guildsError.textContent = `Error: ${error.message}`;
        guildsError.style.display = 'block';
    }
}

function getGuildIconUrl(guild) {
    if (guild.icon) {
        return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256`;
    }
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
}

async function loadGuildConfig(token, guildId) {
    try {
        configLoading.style.display = 'block';
        configContent.style.display = 'none';
        noBotNotification.style.display = 'none';
        configError.style.display = 'none';
        
        guildsScreen.style.display = 'none';
        configScreen.style.display = 'block';
        document.body.style.overflow = 'auto';
        
        currentGuildId = guildId;
        
        const response = await fetch(`/.netlify/functions/get-guild-config?guildId=${guildId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        // Handle rate limiting
        if (response.status === 429) {
            configLoading.style.display = 'none';
            configError.className = 'alert alert-danger';
            configError.textContent = 'Too many requests. Please try again in a few minutes.';
            configError.style.display = 'block';
            return;
        }
        
        // Handle authorization errors
        if (response.status === 401) {
            configLoading.style.display = 'none';
            configError.textContent = 'Your Discord session has expired. Please refresh the page and login again.';
            configError.style.display = 'block';
            return;
        }
        
        if (response.status === 403) {
            const errorData = await response.json();
            configLoading.style.display = 'none';
            configError.textContent = errorData.error || 'You do not have permission to access this guild.';
            configError.style.display = 'block';
            return;
        }
        
        // Handle rate limit headers on successful responses
        handleRateLimitHeaders(response);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch config: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Guild Config Data:', data);
        
        // Check if supported bots list is empty
        if (!data.supportedBots || data.supportedBots.length === 0) {
            configLoading.style.display = 'none';
            noBotNotification.style.display = 'block';
            return;
        }
        
        // Display guild name
        configGuildName.textContent = data.guildName;
        currentGuildData = data;
        
        // Populate bots select (toggle buttons)
        botsSelect.innerHTML = data.supportedBots.map(bot => `
            <button 
                type="button"
                class="bot-toggle btn btn-outline-primary" 
                data-bot-id="${bot.id}"
                data-bot-name="${bot.name}"
            >
                <img 
                    src="assets/icons/${bot.name.replace(/\s+/g, '')}.png" 
                    alt="${bot.name}" 
                    class="me-2"
                    style="width: 24px; height: 24px; border-radius: 50%;"
                    onerror="this.style.display='none'"
                >
                ${bot.name}
            </button>
        `).join('');
        
        // Add click handlers for bot buttons
        document.querySelectorAll('.bot-toggle').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                button.classList.toggle('active');
                button.classList.toggle('btn-outline-primary');
                button.classList.toggle('btn-primary');
            });
        });
        
        // Populate role select
        roleSelect.innerHTML = '<option value="">Choose a role...</option>' + 
            (data.availableRoles && data.availableRoles.length > 0
                ? data.availableRoles.map(role => `
                    <option value="${role.id}" data-role-name="${role.name}">
                        ${role.name} (Position: ${role.position})
                    </option>
                `).join('')
                : '<option disabled>No available roles</option>'
            );
        
        // Load current configuration if it exists
        if (data.configuration && data.configuration.notifier) {
            const config = data.configuration.notifier;
            
            // Check the appropriate bots (activate buttons)
            if (Array.isArray(config.selectedBots)) {
                config.selectedBots.forEach(botId => {
                    const botButton = document.querySelector(`[data-bot-id="${botId}"]`);
                    if (botButton) {
                        botButton.classList.add('active');
                        botButton.classList.remove('btn-outline-primary');
                        botButton.classList.add('btn-primary');
                    }
                });
            }
            
            // Select the role
            if (config.selectedRole) {
                roleSelect.value = config.selectedRole;
            }
            
            // Set custom message
            if (config.customMessage) {
                customMessage.value = config.customMessage;
                updateMessageValidation(config.customMessage);
                // Update character count
                const charCount = document.getElementById('charCount');
                if (charCount) {
                    charCount.textContent = config.customMessage.length;
                }
            }
            
            // Display last update info
            if (config.setupAt) {
                const updateDate = new Date(config.setupAt).toLocaleString();
                lastUpdateInfo.textContent = `Last update: ${updateDate} by ${config.setupBy || 'Unknown'}`;
            }
        }
        
        configLoading.style.display = 'none';
        configContent.style.display = 'block';
        
    } catch (error) {
        console.error('Error loading guild config:', error);
        configLoading.style.display = 'none';
        configError.textContent = `Error: ${error.message}`;
        configError.style.display = 'block';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    
    // Custom message validation on input
    customMessage.addEventListener('input', (e) => {
        updateMessageValidation(e.target.value);
        // Update character count
        const charCount = document.getElementById('charCount');
        if (charCount) {
            charCount.textContent = e.target.value.length;
        }
    });
    
    // Cancel button - replaced with Delete button in navigation
    backToGuildsBtn.addEventListener('click', () => {
        guildsScreen.style.display = 'block';
        configScreen.style.display = 'none';
        document.body.style.overflow = 'auto';
    });
    
    // Delete configuration button
    deleteConfigBtn.addEventListener('click', () => {
        const deleteModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
        deleteModal.show();
    });
    
    // Confirm delete button
    confirmDeleteBtn.addEventListener('click', async () => {
        if (!currentGuildId || !currentAccessToken) {
            configError.textContent = 'Session error. Please refresh the page.';
            configError.style.display = 'block';
            return;
        }
        
        deleteConfigBtn.disabled = true;
        deleteConfigBtn.textContent = 'Deleting...';
        configError.style.display = 'none';
        
        try {
            const response = await fetch(`/.netlify/functions/save-guild-config`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    guildId: currentGuildId,
                    selectedBots: [],
                    selectedRole: '',
                    customMessage: '',
                    isDelete: true
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete configuration');
            }
            
            // Close modal and show success
            const modalElement = document.getElementById('deleteConfirmModal');
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            if (modalInstance) {
                modalInstance.hide();
            }
            configError.style.display = 'block';
            configError.className = 'alert alert-success';
            configError.textContent = '✓ Configuration deleted successfully!';
            
            // Reload guild list after 2 seconds
            setTimeout(() => {
                guildsScreen.style.display = 'block';
                configScreen.style.display = 'none';
                document.body.style.overflow = 'auto';
            }, 2000);
            
        } catch (error) {
            console.error('Error deleting configuration:', error);
            configError.textContent = `Error: ${error.message}`;
            configError.className = 'alert alert-danger';
            configError.style.display = 'block';
        } finally {
            deleteConfigBtn.disabled = false;
            deleteConfigBtn.innerHTML = '<i class="bi bi-trash me-2"></i>Delete Configuration';
            confirmDeleteBtn.disabled = false;
        }
    });
    
    // Form submit
    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentGuildId || !currentAccessToken) {
            configError.textContent = 'Session error. Please refresh the page.';
            configError.style.display = 'block';
            return;
        }
        
        // Validate custom message
        const customMsgValue = customMessage.value.trim();
        const validation = validateCustomMessage(customMsgValue);
        
        if (!validation.valid) {
            messageValidation.innerHTML = `<small class="text-danger">${validation.error}</small>`;
            return;
        }
        
        // Get selected bots
        const selectedBots = Array.from(document.querySelectorAll('.bot-toggle.active'))
            .map(button => button.dataset.botId);
        
        if (selectedBots.length === 0) {
            configError.textContent = 'Please select at least one bot.';
            configError.style.display = 'block';
            return;
        }
        
        // Get selected role
        const selectedRole = roleSelect.value;
        
        if (!selectedRole) {
            configError.textContent = 'Please select a role.';
            configError.style.display = 'block';
            return;
        }
        
        // Disable button during submission
        saveConfigBtn.disabled = true;
        saveConfigBtn.textContent = 'Saving...';
        configError.style.display = 'none';
        
        try {
            const response = await fetch(`/.netlify/functions/save-guild-config`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    guildId: currentGuildId,
                    selectedBots: selectedBots,
                    selectedRole: selectedRole,
                    customMessage: customMsgValue
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to save configuration`);
            }
            
            const result = await response.json();
            
            // Show success message
            configError.style.display = 'block';
            configError.className = 'alert alert-success';
            configError.textContent = '✓ Configuration saved successfully!';
            
            // Reload configuration after 2 seconds
            setTimeout(() => {
                loadGuildConfig(currentAccessToken, currentGuildId);
            }, 2000);
            
        } catch (error) {
            console.error('Error saving configuration:', error);
            configError.textContent = `Error: ${error.message}`;
            configError.className = 'alert alert-danger';
            configError.style.display = 'block';
        } finally {
            saveConfigBtn.disabled = false;
            saveConfigBtn.textContent = 'Save Configuration';
        }
    });
});
