
// i18n

// Probleme connexion ~ connexion comportement page, rechargement profile au lieu de home
let currentGame = null;
export let bombover = true;
export let pongadvover = true;
export let pongover = true;

const i18n = i18next.createInstance();

i18n
  .use(i18nextHttpBackend)
  .use(i18nextBrowserLanguageDetector)
  .init({
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false
    },
    backend: {
      loadPath: '/static/locales/{{lng}}/{{ns}}.json'
    }
  });

function updateTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    element.innerHTML = i18n.t(key);
  });
}

i18n.on('languageChanged', (lng) => {
    if (lng !== currentLanguage) {
        currentLanguage = lng;
    updateTranslations();
    router.routes[window.location.pathname]?.();
    }
});

let currentLanguage = i18n.language;
// app.js

function normalizePath(path) {
    if (path === '/') return '/';
    return path.endsWith('/') ? path.slice(0, -1) : path;
  }

function checkAvatar(input) {
    const file = input.files[0];
    if (file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (!validTypes.includes(file.type)) {
            alert(i18n.t('Veuillez télécharger une image valide (JPEG, PNG, GIF).'));
            input.value = '';
        } else {
            console.log('Image sélectionnée :', file.name);
        }
    }
}

// ROUTEUR SPA
const router = {
    routes: {},

    on(path, handler) {
        const normalizedPath = normalizePath(path);
        this.routes[normalizedPath] = handler;
    },

    navigate(path) {
        const normalizedPath = normalizePath(path);
        if (this.routes[normalizedPath]) {
            window.history.pushState({}, '', path);
            this.routes[normalizedPath]();
            updateTranslations();
        } else {
            console.warn(`Aucune route trouvée pour ${path}`);
        }
    },

    start() {
        window.addEventListener('popstate', () => {
            const currentPath = normalizePath(window.location.pathname);
            const normalizedPath = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
            
            if (this.routes[normalizedPath]) {
                this.routes[normalizedPath]();
                updateTranslations();
            } else {
                this.navigate('/');
            }
        });
    
        const initialPath = normalizePath(window.location.pathname);
        const normalizedInitialPath = initialPath.endsWith('/') ? initialPath.slice(0, -1) : initialPath;
        
        if (this.routes[normalizedInitialPath]) {
            this.routes[normalizedInitialPath]();
        } else {
            this.navigate('/');
        }
    }
};

document.addEventListener('click', function(event) {
    const link = event.target.closest('a[data-link]');
    if (link) {
        event.preventDefault();
        const path = link.getAttribute('href');
        navigateTo(path);
    }
});

function navigateTo(path) {
    router.navigate(path);
}

// LOGIN VIA AJAX
function handleLogin(event) {
    event.preventDefault();

    const username = document.querySelector('#id_username').value;
    const password = document.querySelector('#id_password').value;
    const csrftoken = getCookie('csrftoken');

    fetch('/api/login/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrftoken
        },
        body: JSON.stringify({ username, password }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.location.href = '/';
            loadHomePage();                                                          
        } else {
            alert(i18n.t('Identifiants incorrects'));
        }
    })
    .catch(error => console.error('Erreur lors du login:', error));
}

async function updateNavbar() {
    try {
        const response = await fetch('/api/check-auth/', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            const navbar = document.getElementById('navbar-auth');

            if (data.is_authenticated) {
                navbar.innerHTML = `
                    <li class="nav-item">
                        <a class="nav-link" href="/" data-link data-i18n="nav.home"></a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/chat" data-link>Chat</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" id="logout-link" data-i18n="nav.logout"></a>
                    </li>
                `;
                document.getElementById('logout-link').addEventListener('click', handleLogout);
            } else {
                navbar.innerHTML = `
                    <li class="nav-item">
                        <a class="nav-link" href="/" data-link data-i18n="nav.home"></a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/login" data-link data-i18n="nav.login"></a>
                    </li>
                `;
            }

            // Gestion du changement de langue
            document.getElementById('language-toggle').addEventListener('click', () => {
                const newLang = i18n.language === 'en' ? 'fr' : 'en';
                i18n.changeLanguage(newLang);
            });
            
            updateTranslations();
        }
    } catch (error) {
        console.error('Erreur lors de la mise à jour de la navbar:', error.message);
    }
}

// LOGOUT VIA AJAX
async function handleLogout(event) {
    if (event && event.preventDefault) {
        event.preventDefault();
    }
    
    try {
        const csrftoken = getCookie('csrftoken');
        const response = await fetch('/logout/', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            }
        });

        if (!response.ok) {
            throw new Error(`Erreur lors du logout : ${response.statusText}`);
        }

        await updateNavbar();
        window.location.href = '/';
    } catch (error) {
        console.error('Erreur lors du logout:', error.message);
    }
}

document.addEventListener('DOMContentLoaded', updateNavbar);

// RÉCUPÉRER LE COOKIE CSRF
function getCookie(name) {
    return document.cookie.split('; ')
        .find(row => row.startsWith(name + '='))
        ?.split('=')[1] || null;
}

// CHARGER DYNAMIQUEMENT LA PAGE D'ACCUEIL
function loadHomePage() {
    bombover = true;
    pongadvover = true;
    pongover = true;
    fetch('/api/home/')
    .then(response => response.json())
    .then(data => {
        document.querySelector('#app').innerHTML = generateHomePageContent(data);
        updateTranslations();
    })
    .catch(error => console.error('Erreur lors du fetch:', error));
}

function loadSignUpPage() {
    bombover = true;
    pongadvover = true;
    pongover = true;
    const csrfToken = getCookie('csrftoken');

    const signUpHTML = `
    <div class="signup-section">
        <h2 data-i18n="signup.title"></h2>
        <div id="error-messages" class="alert alert-danger" style="display: none;"></div>
        <form id="signup-form" enctype="multipart/form-data">
            <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken}">
            <div class="form-group">
                <label for="id_username" data-i18n="signup.username"></label>
                <input type="text" name="username" id="id_username" class="form-control" 
                    placeholder=" " required>
            </div>
            <div class="form-group">
                <label for="id_email" data-i18n="signup.email"></label>
                <input type="email" name="email" id="id_email" class="form-control" 
                    placeholder=" " required>
            </div>
            <div class="form-group">
                <label for="id_profile_photo" data-i18n="signup.profile_photo"></label>
                <input type="file" id="id_profile_photo" name="profile_photo" 
                    class="form-control" accept="image/*" required>
            </div>
            <div class="form-group">
                <label for="id_first_name" data-i18n="signup.first_name"></label>
                <input type="text" name="first_name" id="id_first_name" 
                    class="form-control" required>
            </div>
            <div class="form-group">
                <label for="id_last_name" data-i18n="signup.last_name"></label>
                <input type="text" name="last_name" id="id_last_name" 
                    class="form-control" required>
            </div>
            <div class="form-group">
                <label for="id_password" data-i18n="signup.password"></label>
                <input type="password" name="password" id="id_password" 
                    class="form-control" required>
            </div>
            <div class="form-group">
                <label for="id_confirm_password" data-i18n="signup.confirm_password"></label>
                <input type="password" name="confirm_password" id="id_confirm_password" 
                    class="form-control" required>
            </div>
            <button type="submit" class="btn btn-primary" data-i18n="signup.submit"></button>
        </form>
        <p data-i18n="signup.have_account"></p>
        <a href="/login" data-link="/login" data-i18n="signup.login_link"></a>
    </div>
    `;

    document.querySelector('#app').innerHTML = signUpHTML;
    document.querySelector('#signup-form').addEventListener('submit', handleSignUp);
    
    const avatarInput = document.querySelector('#id_profile_photo');
    if (avatarInput) {
        avatarInput.addEventListener('change', function() {
            checkAvatar(avatarInput);
        });
    }
    
    updateTranslations();
}

async function handleSignUp(event) {
    event.preventDefault();

    const form = document.querySelector('#signup-form');
    const formData = new FormData(form);

    try {
        const response = await fetch('/api/signup/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            alert('Inscription réussie !');
            window.location.href = ('/');
        } else {
            const errorData = await response.json();
            document.getElementById('error-messages').style.display = 'block';
            document.getElementById('error-messages').innerText = errorData.detail || 'Erreur inconnue';
        }
    } catch (error) {
        console.error("Erreur lors de l'inscription :", error);
        alert('Une erreur est survenue lors de l\'inscription.');
    }
}

async function loadProfilePage() {
    bombover = true;
    pongadvover = true;
    pongover = true;
    try {
        const response = await fetch('/api/profile/');
        if (!response.ok) throw new Error('Failed to fetch profile data');

        const data = await response.json();

        if (data.is_authenticated) {
            document.querySelector('#app').innerHTML = generateProfileContent(data);
            updateTranslations();
        } else {
            document.querySelector('#app').innerHTML = '<h2>Please log in to view your profile</h2>';
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    fetch('/api/profile/')
        .then(response => response.json())
        .then(data => {
            if (data.is_authenticated) {
                document.querySelector('#app').innerHTML = generateProfileContent(data);
            } else {
                document.querySelector('#app').innerHTML = '<h2>Please log in to view your profile</h2>';
            }
        })
        .catch(error => console.error('Error fetching profile data:', error));
});

function generateProfileContent(data) {
    const profilePhotoUrl = data.profile_photo || '/static/images/default_avatar.jpg';
    
    const html = `
    <div class="container mt-5">
        <div class="profile-background">
            <div class="notification-center" id="notificationCenter">
                <div class="notification-header">
                    <h3 data-i18n="profile.notifications"></h3>
                    <span class="notification-count" id="notificationCount">${data.notifications.length}</span>
                </div>
                <div class="notification-list" id="notificationList">
                    ${data.notifications.map(notification => `
                        <div class="notification-item ${notification.type}">
                            <i class="fas ${notification.type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
                            <span>${notification.message}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Profile Header Section -->
            <div class="profile-header" style="background: linear-gradient(to right, ${data.profile_gradient_start}, ${data.profile_gradient_end});">
                <div class="profile-summary">
                    <div class="avatar-section">
                        <img src="${profilePhotoUrl}" 
                            alt="Avatar" 
                            class="profile-avatar"
                            onerror="this.src='/static/images/default_avatar.jpg'">
                    </div>
                    <div class="profile-details">
                        <h1>${data.username}</h1>
                        <div class="player-level">
                            <span class="level-icon">${data.level}</span>
                            <div class="level-progress">
                                <div class="progress">
                                    <div class="progress-bar" role="progressbar" style="width: ${data.win_rate}%">${data.win_rate}%</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Profile Content -->
            <div class="profile-content">
                <!-- Sidebar Section -->
                <div class="sidebar">
                    <div class="profile-card">
                        <div class="recent-activity">
                            <h3 data-i18n="profile.recent_activity"></h3>
                            <p><span data-i18n="profile.last_played"></span>: <span class="data">${data.last_played_game || 'N/A'}</span></p>
                            <p><span data-i18n="profile.time_played"></span>: <span class="data">${data.time_played} hrs</span></p>
                        </div>
                    </div>
                    <button id="customizeProfile" class="profile-link custom-change-password-btn" style="margin-top: 10px;">
                        <i class="fas fa-palette"></i> <span data-i18n="profile.customize_colors"></span>
                    </button>

                    <div class="profile-links">
                        ${!data.is_42_user ? `
                        <a href="/change-password" class="profile-link custom-change-password-btn" data-link>
                            <i class="fas fa-key"></i> <span data-i18n="profile.change_password"></span>
                        </a>
                        <a href="/auth/update_user/" class="profile-link custom-change-password-btn" data-link>
                            <i class="fas fa-user-edit"></i> <span data-i18n="profile.change_profile"></span>
                        </a>
                        ` : ''}
                        <a href="/auth/delete_user/" class="profile-link danger" data-link>
                            <i class="fas fa-user-slash"></i> Delete Account
                        </a>
                        <button class="profile-link danger" id="logoutButton">
                            <i class="fas fa-sign-out-alt"></i> <span data-i18n="nav.logout"></span>
                        </button>
                    </div>
                </div>

                <!-- Main Content Section -->
                <div class="main-content">
                    <div class="stats-showcase">
                        <div class="stat-card"><h4 data-i18n="profile.games_played"></h4><span class="stat-value">${data.games_played}</span></div>
                        <div class="stat-card"><h4 data-i18n="profile.win_rate"></h4><span class="stat-value">${data.win_rate}%</span></div>
                        <div class="stat-card"><h4 data-i18n="profile.total_score"></h4><span class="stat-value">${data.total_score}</span></div>
                    </div>

                    <div class="achievements">
                        <h3><span data-i18n="profile.recent_achievements"></span> (<span class="stat-value">${data.achievements.length}</span>)</h3>
                        <div class="achievement-grid">
                            ${data.achievements.map(ach => `
                                <div class="achievement">
                                    <i class="${ach.icon}"></i>
                                    <span>${ach.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="friends-section">
                        <h3><span data-i18n="profile.my_friends"></span> (<span class="stat-value">${data.friends.length}</span>)</h3>
                        <div class="friends-grid">
                            ${data.friends.map(friend => `
                                <div class="friend-card">
                                    <div class="friend-avatar">
                                        <img src="${friend.profile_photo || '/static/images/default_avatar.jpg'}" alt="${friend.username}">
                                    </div>
                                    <div class="friend-info">
                                        <span class="friend-name">${friend.username}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div id="colorPickerModal" class="color-picker-modal">
                        <div class="color-picker-container">
                            <h3 style="color: #fcfcec; margin-bottom: 15px;" data-i18n="profile.customize_colors"></h3>
                            <div class="color-input-group">
                                <label style="color: #fcfcec" data-i18n="profile.start_color"></label>
                                <input type="color" id="startColor" class="color-input" value="#1b2838">
                            </div>
                            <div class="color-input-group">
                                <label style="color: #fcfcec" data-i18n="profile.end_color"></label>
                                <input type="color" id="endColor" class="color-input" value="#2a475e">
                            </div>
                            <div class="preview-gradient" id="gradientPreview"></div>
                           <div class="modal-buttons">
                                <button id="applyGradientBtn" class="profile-link custom-apply-btn" data-i18n="profile.apply"></button>
                                <button id="cancelColorPickerBtn" class="profile-link danger" data-i18n="profile.cancel"></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    document.addEventListener('click', (event) => {
        if (event.target.closest('#customizeProfile')) {
            const modal = document.getElementById('colorPickerModal');
            modal.style.display = 'block';
            
            const startColorInput = document.getElementById('startColor');
            const endColorInput = document.getElementById('endColor');
            
            if (startColorInput && endColorInput) {
                const updatePreview = () => {
                    const startColor = startColorInput.value;
                    const endColor = endColorInput.value;
                    document.getElementById('gradientPreview').style.background = 
                        `linear-gradient(to right, ${startColor}, ${endColor})`;
                };
                
                updatePreview();
                
                startColorInput.addEventListener('input', updatePreview);
                endColorInput.addEventListener('input', updatePreview);
                
                document.querySelector('.custom-apply-btn')?.addEventListener('click', () => {
                    const startColor = startColorInput.value;
                    const endColor = endColorInput.value;
                    
                    const profileHeader = document.querySelector('.profile-header');
                    profileHeader.style.background = `linear-gradient(to right, ${startColor}, ${endColor})`;
                    
                    saveProfileColors(startColor, endColor);
                    modal.style.display = 'none';
                });
                
                document.querySelector('.modal-buttons .danger')?.addEventListener('click', () => {
                    modal.style.display = 'none';
                });
            }
        }
    });

    setTimeout(() => {
        // Ajouter l'écouteur d'événement au bouton de logout dans le profil
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', handleLogout);
        }
    }, 0);
    updateTranslations();

    return html;
}

function updatePreview() {
    const startColor = document.getElementById('startColor').value;
    const endColor = document.getElementById('endColor').value;
    document.getElementById('gradientPreview').style.background = `linear-gradient(to right, ${startColor}, ${endColor})`;
}

function closeColorPicker() {
    document.getElementById('colorPickerModal').style.display = 'none';
}

function applyGradient() {
    const startColor = document.getElementById('startColor').value;
    const endColor = document.getElementById('endColor').value;

    const profileHeader = document.querySelector('.profile-header');
    profileHeader.style.background = `linear-gradient(to right, ${startColor}, ${endColor})`;

    saveProfileColors(startColor, endColor);
    closeColorPicker();
}

function saveProfileColors(startColor, endColor) {
    const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]')?.value;
    fetch('/api/profile/colors/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrftoken
        },
        body: JSON.stringify({ startColor, endColor })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('Colors updated successfully');
        }
    })
    .catch(error => console.error('Error saving colors:', error));
}

function loadLoginPage() {
    bombover = true;
    pongadvover = true;
    pongover = true;
    const csrfToken = getCookie('csrftoken');
    
    const loginHTML = `
        <div class="login-section">
            <h2 data-i18n="login.title"></h2>
            <form id="login-form" method="POST">
                <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken}">
                <div class="form-group">
                    <label for="id_username" data-i18n="login.username"></label>
                    <input type="text" name="username" id="id_username" class="form-control" required>
                </div>
                <div class="form-group">
                    <label for="id_password" data-i18n="login.password"></label>
                    <input type="password" name="password" id="id_password" class="form-control" required>
                </div>
                <button type="submit" class="btn btn-primary" data-i18n="login.submit"></button>
            </form>    
            <p data-i18n="login.no_account"></p>
            <a href="/signup" data-link data-i18n="login.signup_link"></a>
            <p data-i18n="login.connect_42"></p>
            <a href="/api/42/" id="connect-42-link" data-i18n="login.connect_here"></a>
        </div>
    `;

    document.querySelector('#app').innerHTML = loginHTML;
    
    document.addEventListener('click', function (event) {
        const link = event.target.closest('#connect-42-link');
        if (link) {
            event.preventDefault();
            window.location.href = '/api/42/';
        }
    });
    
    document.querySelector('#login-form').addEventListener('submit', handleLogin);
    updateTranslations();
}

function loadChangePasswordPage() {
    bombover = true;
    pongadvover = true;
    pongover = true;
    const csrfToken = getCookie('csrftoken');

    const changePasswordHTML = `
        <div class="login-section">
            <h2 data-i18n="password_change.title"></h2>
            <div id="password-change-errors" class="error-message"></div>
            <form id="password-change-form" method="post" class="fade-in">
                <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken}">
                
                <div class="form-group">
                    <label for="old_password" data-i18n="password_change.old_password"></label>
                    <input type="password" 
                           name="old_password" 
                           id="old_password" 
                           class="form-control" 
                           placeholder="Enter your current password" 
                           data-i18n-placeholder="password_change.old_placeholder"
                           required>
                </div>

                <div class="form-group">
                    <label for="new_password1" data-i18n="password_change.new_password"></label>
                    <input type="password" 
                           name="new_password1" 
                           id="new_password1" 
                           class="form-control" 
                           placeholder="Enter a new password"
                           data-i18n-placeholder="password_change.new_placeholder" 
                           required>
                </div>

                <div class="form-group">
                    <label for="new_password2" data-i18n="password_change.confirm_password"></label>
                    <input type="password" 
                           name="new_password2" 
                           id="new_password2" 
                           class="form-control" 
                           placeholder="Confirm new password"
                           data-i18n-placeholder="password_change.confirm_placeholder" 
                           required>
                </div>

                <button type="submit" class="btn animated-btn" data-i18n="password_change.submit"></button>
            </form>
        </div>
    `;

    document.querySelector('#app').innerHTML = changePasswordHTML;
    document.getElementById('password-change-form').addEventListener('submit', handlePasswordChange);
    updateTranslations();
}

function loadPasswordChangeSuccessPage() {
    bombover = true;
    pongadvover = true;
    pongover = true;
    const successHTML = `
        <div class="success-section">
            <h2 data-i18n="password_change.success.title"></h2>
            <p data-i18n="password_change.success.message"></p>
            <a href="/profile" data-link data-i18n="password_change.success.return_link"></a>
        </div>
    `;

    document.querySelector('#app').innerHTML = successHTML;
    updateTranslations();
}

async function loadUpdateUserPage() {
    const csrfToken = getCookie('csrftoken');

    try {
        // Récupérer les données de l'utilisateur via la nouvelle API
        const response = await fetch('/api/user-data/');
        const userData = await response.json();

        document.querySelector('#app').innerHTML = `
            <div class="signup-section">
                <h2 data-i18n="update.update_profile"></h2>
                <div id="error-messages" class="alert alert-danger" style="display: none;"></div>
                <form id="signup-form" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken}">
                    <div class="form-group">
                        <label for="id_username" data-i18n="update.username"></label>
                        <input type="text" name="username" id="id_username" class="form-control"
                            value="${userData.username}" required>
                    </div>
                    <div class="form-group">
                        <label for="id_email" data-i18n="update.email"></label>
                        <input type="email" name="email" id="id_email" class="form-control"
                            value="${userData.email}" required>
                    </div>
                    <div class="form-group">
                        <label for="id_profile_photo" data-i18n="update.photo"></label>
                        <input type="file" id="id_profile_photo" name="profile_photo"
                            class="form-control" accept="image/*">
                        ${userData.profile_photo ?
                            `<img src="${userData.profile_photo}" alt="Current profile photo"
                                style="max-width: 100px; margin-top: 10px;">` : ''}
                    </div>
                    <div class="form-group">
                        <label for="id_first_name" data-i18n="update.first_name"></label>
                        <input type="text" name="first_name" id="id_first_name" class="form-control"
                            value="${userData.first_name}" required>
                    </div>
                    <div class="form-group">
                        <label for="id_last_name" data-i18n="update.last_name">:</label>
                        <input type="text" name="last_name" id="id_last_name" class="form-control"
                            value="${userData.last_name}" required>
                    </div>
                    <button type="submit" class="btn btn-primary" data-i18n="update.updated"></button>
                </form>
            </div>
        `;

        // Ajouter les écouteurs d'événements
        document.querySelector('#signup-form').addEventListener('submit', handleUpdateUser);

        const avatarInput = document.querySelector('#id_profile_photo');
        if (avatarInput) {
            avatarInput.addEventListener('change', function() {
                checkAvatar(avatarInput);
            });
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        showMessage('Error loading user data', 'error');
    }
    updateTranslations();
}


async function handleUpdateUser(event) {
    event.preventDefault();

    const form = document.querySelector('#signup-form');
    const formData = new FormData(form);

    try {
        const response = await fetch('/auth/update_user/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: formData
        });

        if (response.ok) {
            alert('Mis à jour du profil réussi !');
            router.navigate('/profile');
        } else {
            const errorData = await response.json();
            document.getElementById('error-messages').style.display = 'block';
            document.getElementById('error-messages').innerText = errorData.detail || 'Erreur inconnue';
        }
    } catch (error) {
        console.error("Erreur lors de la mis à jour du profil utilisaateur :", error);
        alert('Une erreur est survenue lors de la mis à jour du profil utilisaateur.');
    }
}

async function handleDeleteUser(event) {
    event.preventDefault();

    if (!confirm('Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.')) {
        return;
    }

    try {
        const response = await fetch('/auth/delete_user/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCookie('csrftoken'),
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            alert('Compte supprimé avec succès !');
            window.location.href = '/login';  // Redirection directe
        } else {
            const errorData = await response.json();
            document.getElementById('error-messages').style.display = 'block';
            document.getElementById('error-messages').innerText = errorData.detail || 'Erreur inconnue';
        }
    } catch (error) {
        console.error("Erreur lors de la suppression du compte :", error);
        alert('Une erreur est survenue lors de la suppression du compte.');
    }
}

async function loadDeleteUserPage() {
    const csrfToken = getCookie('csrftoken');

    try {
        // Récupérer les données de l'utilisateur via la nouvelle API
        const response = await fetch('/api/user-data/');
        const userData = await response.json();

        document.querySelector('#app').innerHTML = `
            <div class="signup-section">
                <h2>Delete your account</h2>
                <div id="error-messages" class="alert alert-danger" style="display: none;"></div>
                    <a href="/profile" class="profile-link custom-change-password-btn" data-link>
                        <i class="fas fa-arrow-left"></i> Cancel
                    </a>
                <form id="signup-form" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken}">
                    <button type="submit" class="btn btn-primary">Delete</button>
                </form>
            </div>
        `;

        // Ajouter les écouteurs d'événements
        document.querySelector('#signup-form').addEventListener('submit', handleDeleteUser);

    } catch (error) {
        console.error('Error loading user data:', error);
        showMessage('Error loading user data', 'error');
    }
}


async function handlePasswordChange(event) {
    event.preventDefault();

    const form = document.getElementById('password-change-form');
    const formData = new FormData(form);

    try {
        const response = await fetch('/auth/password_change/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCookie('csrftoken'),
            },
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            router.navigate('/password-change-success');
        } else {
            displayPasswordChangeErrors(result.errors || { error: ['An unexpected error occurred.'] });
        }
    } catch (error) {
        console.error('Erreur lors du changement de mot de passe:', error);
    }
}

function displayPasswordChangeErrors(errors) {
    const errorDiv = document.getElementById('password-change-errors');
    errorDiv.innerHTML = '';

    for (const field in errors) {
        errors[field].forEach(error => {
            const p = document.createElement('p');
            p.textContent = `${field}: ${error}`;
            p.style.color = 'var(--danger-color)';
            p.style.margin = '5px 0';
            errorDiv.appendChild(p);
        });
    }
}

function generateHomePageContent(data) {
    if (data.is_authenticated) {
        return `
            <div class="mb-5"></div>
            <div class="container mt-7">
                <!-- Section Utilisateur Connecté -->
                <div class="user-info card mb-4 shadow">
                    <div class="card-body text-center">
                        <h2 class="card-title" data-i18n="home.welcome"><h2 class="card-title">${data.username} !</h2></h2>
                        <p class="card-text">
                            <span data-i18n="home.games_played"></span> <strong>${data.user_profile.games_played}</strong>
                            <span data-i18n="home.games_achieved"></span> <strong>${data.user_profile.win_rate}%</strong>.
                        </p>
                        <a href="/profile" class="btn btn-primary" data-link data-i18n="home.view_profile"></a>
                    </div>
                </div>

                <!-- Section Jeux Populaires -->
                <div class="featured-games card mb-4 shadow">
                    <div class="card-body">
                        <h2 class="card-title text-center mb-4" data-i18n="home.featured_games"></h2>
                        <div class="row">
                            ${data.featured_games.map(game => `
                                <div class="col-md-4 mb-4">
                                    <div class="card h-100 shadow-sm game-card">
                                        <img src="${game.image}" class="card-img-top" alt="${game.title}">
                                        <div class="card-body d-flex flex-column">
                                            <h5 class="card-title">${game.title}</h5>
                                            <div class="mt-auto">
                                                <a href="${game.url}" class="btn btn-primary btn-block" data-link>
                                                    <span data-i18n="home.play_now">Play Now</span>
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
        `;
    } else {
        return `
            <div class="login-prompt card mb-4 shadow">
                <div class="card-body text-center">
                    <h2 class="card-title" data-i18n="home.login_prompt"></h2>
                    <a class="nav-link btn btn-primary" href="/login" data-link data-i18n="nav.login"></a>
                    <a href="/signup" data-link class="nav-link btn btn-secondary" data-i18n="nav.signup"></a>
                </div>
            </div>
        `;
    }
}

// DÉFINIR LES ROUTES
router.on('/', loadHomePage);
router.on('/login', loadLoginPage);
router.on('/signup', loadSignUpPage);
router.on('/profile', loadProfilePage);
router.on('/change-password', loadChangePasswordPage);
router.on('/password-change-success', loadPasswordChangeSuccessPage);
router.on('/auth/delete_user', loadDeleteUserPage);
router.on('/auth/update_user', loadUpdateUserPage);
router.on('/chat', loadChatPage);
router.on('/pong', async () => {
    try {
        bombover = true;
        pongadvover = true;
        pongover = false;
        // if (currentGame && typeof currentGame.destroy === 'function') {
        //     currentGame.destroy();
        // }
        const html = `<body>

        <div id="content">
        <header>
        <h1 id="title" class="titlePong">PONG<br />CLASSIC</h1>
    </header>

    <main>
        <div class="boxInsert">
            <button id="menuLink" class="insertCoin" aria-pressed="false">INSERT COIN</button>
            <footer>
                <p class="controlMenu" id="firstInstruct">Press button to Start</p>
            </footer>
        </div>

        <nav id="menu" aria-label="Main Menu">
            <ul>
                <li><button id="pButton" class="button">PLAY</button></li>
                <li><button id="iButton" class="button">INFO</button></li>
                <li><button id="qButton" class="button">QUIT</button></li>
            </ul>
        </nav>
        
        <footer>
            <p class="controlMenu" id="secondInstruct" style="display: none;">Use ↑ and ↓ to navigate, press Space to select</p>
        </footer>

        <nav id="menuMode" aria-label="Mode Menu" style="display: none;">
            <ul>
                <li><button id="siButton" class="button">SINGLE</button></li>
                <li><button id="muButton" class="button">MULTI</button></li>
                <li><button id="qmButton" class="button">QUIT</button></li>
            </ul>
        </nav>

         <nav id="menuDifficulty" aria-label="Difficulty Menu" style="display: none;">
            <ul>
                <li><button id="esButton" class="button">EASY</button></li>
                <li><button id="mdButton" class="button">MEDIUM</button></li>
                <li><button id="hdButton" class="button">HARD</button></li>
                <li><button id="qdButton" class="button">QUIT</button></li>
            </ul>
        </nav>

        <nav id="menuInfo" aria-label="Info Bubble" style="display: none;">
            <p><strong>PONG - 1972</strong></p>
            <p id="info1"></p>
            <ul>
                <li><button id="moreBubble" class="button">More Info</button></li>
                <li><button id="closeBubble" class="button">Close</button></li>
            </ul>
        </nav>


        <div id="game">
            <canvas id="canvas" width="640" height="420"></canvas>
        </div>
        <div id="gameStats">
            <h2>Statistiques du jeu</h2>
            <p>Parties jouées : <span id="totalGames">0</span></p>
            <p>Taux de victoires : <span id="winRatio">0%</span></p>
            <p>Score total : <span id="playerLabel">Joueur</span> <span id="totalPlayerScore">0</span> - <span id="opponentLabel">Ordinateur</span> <span id="totalComputerScore">0</span></p>
            <p>Parties parfaites : <span id="perfectPlayerLabel">Joueur</span> <span id="perfectPlayer">0</span> - <span id="perfectOpponentLabel">Ordinateur</span> <span id="perfectComputer">0</span></p>
            <p>Dernières parties :</p>
            <ul id="lastGames"></ul>
        </div>
        <canvas id="backgroundCanvas" style="display: none;"></canvas>
    </main>
</div>`
        document.querySelector('#app').innerHTML = html;
        await new Promise(resolve => setTimeout(resolve, 50));

        // Charger les scripts nécessaires
        // currentGame = initPong();
        // Conserver la référence au module pour pouvoir le détruire lors d'un prochain changement de route
        // currentGame = pongModule;
        const pongModule = await import('/static/js/pong.js');
        pongModule.init();
        currentGame = pongModule;
    } catch (error) {
        console.error("Erreur lors du chargement de Pong:", error);
    }

});
router.on('/pong-ameliore', async () => {
    try {
        // if (currentGame && typeof currentGame.destroy === 'function') {
        //     currentGame.destroy();
        // }
        bombover = true;
        pongover = true;
        pongadvover = false;
        const html = `<body>

        <div id="content">
        <header>
        <h1 id="title" class="titlePong">PONG<br />SPECIAL</h1>
    </header>

    <main>
        <div class="boxInsert">
            <button id="menuLink" class="insertCoin" aria-pressed="false">INSERT COIN</button>
            <footer>
                <p class="controlMenu" id="firstInstruct">Press button to Start</p>
            </footer>
        </div>

        <nav id="menu" aria-label="Main Menu">
            <ul>
                <li><button id="pButton" class="button">PLAY</button></li>
                <li><button id="iButton" class="button">INFO</button></li>
                <li><button id="qButton" class="button">QUIT</button></li>
            </ul>
        </nav>
        
        <footer>
            <p class="controlMenu" id="secondInstruct" style="display: none;">Use ↑ and ↓ to navigate, press Space to select</p>
        </footer>

        <nav id="menuMode" aria-label="Mode Menu" style="display: none;">
            <ul>
                <li><button id="siButton" class="button">SINGLE</button></li>
                <li><button id="muButton" class="button">MULTI</button></li>
                <li><button id="qmButton" class="button">QUIT</button></li>
            </ul>
        </nav>

         <nav id="menuDifficulty" aria-label="Difficulty Menu" style="display: none;">
            <ul>
                <li><button id="esButton" class="button">EASY</button></li>
                <li><button id="mdButton" class="button">MEDIUM</button></li>
                <li><button id="hdButton" class="button">HARD</button></li>
                <li><button id="qdButton" class="button">QUIT</button></li>
            </ul>
        </nav>

        <nav id="menuInfo" aria-label="Info Bubble" style="display: none;">
            <p><strong>PONG - 1972</strong></p>
            <p id="info1"></p>
            <ul>
                <li><button id="moreBubble" class="button">More Info</button></li>
                <li><button id="closeBubble" class="button">Close</button></li>
            </ul>
        </nav>


        <div id="game">
            <canvas id="canvas" width="640" height="420"></canvas>
        </div>
        <div id="powerUpDisplay" style="position: absolute; top: 20px; left: 20px; color: white; font-family: 'Press Start 2P', cursive; font-size: 16px; display: none">
            Power-up actif : <span id="activePowerUpName">Aucun</span>
        </div>
        <div id="gameStats">
            <h2>Statistiques du jeu</h2>
            <p>Parties jouées : <span id="totalGames">0</span></p>
            <p>Taux de victoires : <span id="winRatio">0%</span></p>
            <p>Score total : <span id="playerLabel">Joueur</span> <span id="totalPlayerScore">0</span> - <span id="opponentLabel">Ordinateur</span> <span id="totalComputerScore">0</span></p>
            <p>Parties parfaites : <span id="perfectPlayerLabel">Joueur</span> <span id="perfectPlayer">0</span> - <span id="perfectOpponentLabel">Ordinateur</span> <span id="perfectComputer">0</span></p>
            <p>Dernières parties :</p>
            <ul id="lastGames"></ul>
        </div>
        <canvas id="backgroundCanvas" style="display: none;"></canvas>
    </main>
</div>`
        document.querySelector('#app').innerHTML = html;
        await new Promise(resolve => setTimeout(resolve, 50));

        // Charger les scripts nécessaires
        // const pong_improved = document.createElement('script');
        // pong_improved.src = "/static/js/pong-ameliore.js";
        // pong_improved.defer = true;
        // document.body.appendChild(pong_improved);

        // currentGame = initPongImproved();
        const pongImproveModule = await import('/static/js/pong-ameliore.js');
        pongImproveModule.init();
        currentGame = pongImproveModule;
    } catch (error) {
        console.error("Erreur lors du chargement de Pong Ameliore:", error);
    }

});
router.on('/Bomberman', async () => {
    try {
        // if (currentGame && typeof currentGame.destroy === 'function') {
        //     currentGame.destroy();
        // }
        pongover = true;
        pongadvover = true;
        bombover = false;
        const html = `<div id="content">
        <header>
        <h1 id="title" class="titleBomb">Bomberman<br/></h1>
    </header>

    <main>
        <div class="boxInsert">
            <button id="menuLink" class="insertCoin" aria-pressed="false">INSERT COIN</button>
            <footer>
                <p class="controlMenu" id="firstInstruct">Press button to Start</p>
            </footer>
        </div>

        <nav id="menu" aria-label="Main Menu">
            <ul>
                <li><button id="pButton" class="button">PLAY</button></li>
                <!-- <li><button id="sButton" class="button">SETTING</button></li> -->
                <li><button id="iButton" class="button">INFO</button></li>
                <li><button id="qButton" class="button">QUIT</button></li>
            </ul>
        </nav>
        
        <footer>
            <p class="controlMenu" id="secondInstruct" style="display: none;">Use ↑ and ↓ to navigate, press Space to select</p>
        </footer>

        <nav id="menuMode" aria-label="Mode Menu" style="display: none;">
            <ul>
                <li><button id="siButton" class="button">SINGLE</button></li>
                <!-- <li><button id="muButton" class="button">MULTI</button></li> -->
                <li><button id="qmButton" class="button">QUIT</button></li>
            </ul>
        </nav>

         <nav id="menuDifficulty" aria-label="Difficulty Menu" style="display: none;">
            <ul>
                <li><button id="esButton" class="button">EASY</button></li>
                <li><button id="mdButton" class="button">MEDIUM</button></li>
                <li><button id="hdButton" class="button">HARD</button></li>
                <li><button id="qdButton" class="button">QUIT</button></li>
            </ul>
        </nav>

        <nav id="menuInfo" aria-label="Info Bubble" style="display: none;">
            <p><strong>Bomberman - 1983</strong></p>
            <p id="info1"></p>
            <ul>
                <li><button id="moreBubble" class="button">More Info</button></li>
                <li><button id="closeBubble" class="button">Close</button></li>
            </ul>
        </nav>


        <div id="game">
            <canvas id="canvas" width="600" height="600"></canvas>
        </div>
        
         <div id="gameStats">
            <h2>Statistiques</h2>
            <p>Parties jouées : <span id="totalGames">0</span></p>
            <p>Bombes placées : <span id="totalBombs">0</span></p>
            <p>Blocs détruits : <span id="blocksDestroyed">0</span></p>
            <p>Ennemis tués : <span id="enemiesKilled">0</span></p>
        </div>
        
        <div id="gameHistory">
            <ul id="lastGames" class="button"></ul>
        </div>
        <div id="endGameMenu" style="display: none;">
            <h2 id="gameOverText"></h2>
            <div class="endGameButtons">
                <button id="replayButton" class="button">REJOUER</button>
                <button id="quitEndButton" class="button">QUITTER</button>
            </div>
        </div>
    </main>
</div>`
        document.querySelector('#app').innerHTML = html;
        await new Promise(resolve => setTimeout(resolve, 50));

        // Charger les scripts nécessaires
        // const Bomberman = document.createElement('script');
        // Bomberman.src = "/static/js/Bomberman.js";
        // Bomberman.defer = true;
        // document.body.appendChild(Bomberman);
        // currentGame = initBomberman();
        const bombermanModule = await import('/static/js/Bomberman.js');
        bombermanModule.init();
        currentGame = bombermanModule;
    } catch (error) {
        console.error("Erreur lors du chargement de Bomberman:", error);
    }

});


// DÉMARRER LE ROUTEUR
router.start();

// Gestion du thème sombre
function toggleDarkMode() {
    const body = document.documentElement;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? '' : 'dark';
    
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Initialiser le thème au chargement
function initDarkMode() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initDarkMode();
    
    const darkModeBtn = document.querySelector('#theme-toggle');
    if (darkModeBtn) {
        darkModeBtn.addEventListener('click', toggleDarkMode);
    }
});