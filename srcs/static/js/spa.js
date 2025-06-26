// i18n

// Probleme connexion ~ connexion comportement page, rechargement profile au lieu de home
let currentGame = null;
export let bombover = true;
export let pongadvover = true;
export let pongover = true;

import { init, stopPong } from './pong.js';

window.addEventListener('beforeunload', function(event) {
    // Nettoyer les ressources et les intervalles
    if (window.friendsStatusInterval) {
        clearInterval(window.friendsStatusInterval);
        window.friendsStatusInterval = null;
    }
    
    // Nettoyer les jeux en cours si nécessaire
    if (currentGame && typeof currentGame.destroy === 'function') {
        currentGame.destroy();
    }
    
    // Réinitialiser l'état des jeux
    bombover = true;
    pongadvover = true;
    pongover = true;
});

window.addEventListener('load', function() {
    // Initialiser les variables d'état
    bombover = true;
    pongadvover = true;
    pongover = true;
    
    // Vérifier si le routeur a été initialisé correctement
    if (!router || !router.routes) {
        console.error("Erreur: le routeur n'est pas initialisé correctement");
        // Réinitialiser la page si nécessaire
        setTimeout(() => window.location.href = '/', 100);
        return;
    }
    
    // Vérifier l'authentification et mettre à jour la navbar
    updateNavbar().catch(err => console.error("Erreur lors de la mise à jour de la navbar:", err));
});

const i18n = i18next.createInstance();

i18n
  .use(i18nextHttpBackend)
  .use(i18nextBrowserLanguageDetector)
  .init({
    fallbackLng: 'en-US',
    debug: false,
    interpolation: {
      escapeValue: false
    },
    backend: {
      loadPath: '/static/locales/{{lng}}/{{ns}}.json'
    }
  }).then(() => {
    // Only setup the language selector after i18n has been initialized
    setupLanguageSelector();
    
    // Also update any translations that may be in the DOM already
    updateTranslations();
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

function setupLanguageSelector() {
    const languageOptions = document.querySelectorAll('.language-option');
    
    // Mettre à jour l'option active
    const setActiveLanguage = (lang) => {
        languageOptions.forEach(option => {
            if (option.dataset.lang === lang) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    };
    
    // Initialiser avec la langue actuelle - added safety check
    const currentLang = i18n.language ? i18n.language.split('-')[0] : 'en';
    setActiveLanguage(currentLang);
    
    // Ajouter les écouteurs d'événements
    languageOptions.forEach(option => {
        option.addEventListener('click', function() {
            const lang = this.dataset.lang;
            i18n.changeLanguage(lang);
            setActiveLanguage(lang);
        });
    });
}

// app.js

function normalizePath(path) {
    if (path === '/') return '/';
    
    // Enlever les paramètres d'URL (tout ce qui suit ?)
    let cleanPath = path;
    if (cleanPath.includes('?')) {
        cleanPath = cleanPath.split('?')[0];
    }
    
    // Enlever les slashs de fin
    return cleanPath.endsWith('/') ? cleanPath.slice(0, -1) : cleanPath;
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
    routeParams: {},

    on(path, handler) {
        const normalizedPath = normalizePath(path);
        
        if (normalizedPath.includes(':')) {
            const routePattern = normalizedPath.replace(/:[^\/]+/g, '([^\/]+)');
            this.routeParams[routePattern] = {
                handler: handler,
                paramNames: normalizedPath.match(/:[^\/]+/g).map(p => p.substring(1))
            };
        } else {
            this.routes[normalizedPath] = handler;
        }
    },

    navigate(path) {
        const normalizedPath = normalizePath(path);
        const currentPath = normalizePath(window.location.pathname);
    
    // Vérifier si on quitte une page de jeu
        if (currentPath === '/pong' && normalizedPath !== '/pong') {
            console.log("Quitter la page Pong - nettoyage des ressources");
            // stopPong();
            pongover = true;
        }
        
        // Vérifier si on quitte la page de profil
        if (window.location.pathname === '/profile' && normalizedPath !== '/profile') {
            cleanupProfilePage();
        }
        
        if (this.routes[normalizedPath]) {
            window.history.pushState({}, '', path);
            this.routes[normalizedPath]();
            updateTranslations();
        } else {
            // Essayer de faire correspondre une route avec paramètres
            let match = false;
            for (const pattern in this.routeParams) {
                const regex = new RegExp(`^${pattern}$`);
                const matches = normalizedPath.match(regex);
                
                if (matches) {
                    match = true;
                    const params = {};
                    this.routeParams[pattern].paramNames.forEach((name, index) => {
                        params[name] = matches[index + 1]; // +1 car le premier match est la chaîne complète
                    });
                    
                    window.history.pushState({}, '', path);
                    this.routeParams[pattern].handler(params);
                    updateTranslations();
                    break;
                }
            }
            
            if (!match) {
                console.warn(`Aucune route trouvée pour ${path}`);
            }
        }
    },

    start() {
        window.addEventListener('popstate', () => {
            try {
                const currentPath = normalizePath(window.location.pathname);
                const previousPath = sessionStorage.getItem('lastPath');
                
                if (this.routes[currentPath]) {
                    this.routes[currentPath]();
                    updateTranslations();
                } 
            
                // Vérifier si on quitte une page de jeu
                if (previousPath === '/pong' && currentPath !== '/pong') {
                    console.log("Retour depuis la page Pong - nettoyage des ressources");
                    // stopPong();
                    pongover = true;
                }
                else {
                    // Essayer de faire correspondre une route avec paramètres
                    let match = false;
                    for (const pattern in this.routeParams) {
                        const regex = new RegExp(`^${pattern}$`);
                        const matches = currentPath.match(regex);
                        
                        if (matches) {
                            match = true;
                            const params = {};
                            this.routeParams[pattern].paramNames.forEach((name, index) => {
                                params[name] = matches[index + 1];
                            });
                            
                            this.routeParams[pattern].handler(params);
                            updateTranslations();
                            break;
                        }
                    }
                    
                    if (!match) {
                        console.warn(`Route non trouvée: ${currentPath}, redirection vers l'accueil`);
                        this.navigate('/');
                    }
                }
            } catch (error) {
                console.error("Erreur dans la gestion de l'événement popstate:", error);
                this.navigate('/');
            }
        });
    
        try {
            const initialPath = normalizePath(window.location.pathname);
            
            if (this.routes[initialPath]) {
                this.routes[initialPath]();
            } else {
                // Essayer de faire correspondre une route avec paramètres
                let match = false;
                for (const pattern in this.routeParams) {
                    const regex = new RegExp(`^${pattern}$`);
                    const matches = initialPath.match(regex);
                    
                    if (matches) {
                        match = true;
                        const params = {};
                        this.routeParams[pattern].paramNames.forEach((name, index) => {
                            params[name] = matches[index + 1];
                        });
                        
                        this.routeParams[pattern].handler(params);
                        break;
                    }
                }
                
                if (!match) {
                    console.warn(`Route initiale non trouvée: ${initialPath}, redirection vers l'accueil`);
                    this.navigate('/');
                }
            }
        } catch (error) {
            console.error("Erreur lors du démarrage du routeur:", error);
            // En cas d'erreur, essayez de charger la page d'accueil
            loadHomePage();
        }
    }
};

sessionStorage.setItem('lastPath', normalizePath(window.location.pathname));

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
            const languageSelector = document.getElementById('language-selector');
            if (languageSelector) {
                // Définir la valeur actuelle dans le sélecteur
                languageSelector.value = i18n.language.split('-')[0];
                
                // Ajouter l'écouteur d'événement pour le changement de langue
                languageSelector.addEventListener('change', function() {
                    i18n.changeLanguage(this.value);
                });
            }
            
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
                    class="form-control" accept="image/*">
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
        // Vérifier d'abord si l'utilisateur est authentifié
        const authCheck = await fetch('/api/check-auth/', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const authData = await authCheck.json();
        
        if (!authData.is_authenticated) {
            document.querySelector('#app').innerHTML = '<h2>Veuillez vous connecter pour voir votre profil</h2>';
            setTimeout(() => router.navigate('/login'), 2000);
            return;
        }
        
        // Maintenant, récupérer les données du profil
        const response = await fetch('/api/profile/', {
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Échec de la récupération des données du profil: ${response.status}`);
        }
        
        // Vérifier le type de contenu
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Le serveur n\'a pas renvoyé de JSON');
        }

        const text = await response.text();
        let data;
        
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('Réponse non-JSON reçue:', text.substring(0, 100));
            throw new Error('Impossible d\'analyser la réponse JSON');
        }

        document.querySelector('#app').innerHTML = generateProfileContent(data);
        initAddFriendForm();
        initRemoveFriendForms();
        updateTranslations();
        
        if (window.friendsStatusInterval) {
            clearInterval(window.friendsStatusInterval);
            window.friendsStatusInterval = null;
        }
        
        // Initialiser le polling immédiatement avec un petit délai pour laisser le DOM se mettre à jour
        setTimeout(initFriendsStatusRefresh, 100);

    } catch (error) {
        console.error('Erreur lors du chargement du profil:', error);
        document.querySelector('#app').innerHTML = `
            <h2>Erreur lors du chargement des données du profil</h2>
            <p>${error.message}</p>
            <a href="/login" data-link class="btn btn-primary">Se connecter</a>
        `;
    }
}

async function loadFriendProfilePage(username) {
    bombover = true;
    pongadvover = true;
    pongover = true;
    try {
        // Vérifier d'abord si l'utilisateur est authentifié
        const authCheck = await fetch('/api/check-auth/');
        const authData = await authCheck.json();
        
        if (!authData.is_authenticated) {
            window.location.href = '/login';
            return;
        }
        
        // Récupérer les données du profil de l'ami
        const response = await fetch(`/api/friend-profile/${encodeURIComponent(username)}/`, {
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            document.querySelector('#app').innerHTML = `
                <div class="alert alert-danger">
                    <h3>Erreur</h3>
                    <p>${errorData.error || 'Impossible de charger le profil de cet ami'}</p>
                    <a href="/profile" class="btn btn-primary" data-link>Retour à mon profil</a>
                </div>
            `;
            return;
        }
        
        const data = await response.json();
        
        // Générer le contenu HTML pour le profil de l'ami
        document.querySelector('#app').innerHTML = generateFriendProfileContent(data);
        updateTranslations();
        
    } catch (error) {
        console.error('Erreur lors du chargement du profil ami:', error);
        document.querySelector('#app').innerHTML = `
            <div class="alert alert-danger">
                <h3>Erreur</h3>
                <p>${error.message}</p>
                <a href="/profile" class="btn btn-primary" data-link>Retour à mon profil</a>
            </div>
        `;
    }
}

// Fonction pour générer le HTML du profil ami
function generateFriendProfileContent(data) {
    const profilePhotoUrl = (data.profile_photo && !data.profile_photo.includes('default_avatar.jpg')) ? 
        data.profile_photo.replace('http://localhost/', 'https://localhost:8443/') : 
        '/static/images/default_avatar.jpg';
    
    return `
    <div class="container mt-5">
        <div class="profile-background">
            <div class="back-button">
                <a href="/profile" class="btn btn-primary" data-link>
                    <i class="fas fa-arrow-left"></i> Retour à mon profil
                </a>
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
                                    <div class="progress-bar" role="progressbar" style="width: ${data.win_rate}%">${Number(data.win_rate).toFixed(2)}%</div>
                                </div>
                            </div>
                        </div>
                        <span class="online-status ${data.online ? 'online' : 'offline'}">
                            ${data.online ? 'En ligne' : 'Hors ligne'}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Profile Content -->
            <div class="profile-content">
                <!-- Sidebar Section -->
                <div class="sidebar">
                    <div class="profile-card">
                        <div class="recent-activity">
                            <h3 data-i18n="profile.recent_activity">Activité récente</h3>
                            <p><span data-i18n="profile.last_played">Dernier jeu</span>: <span class="data">${data.last_played_game || 'N/A'}</span></p>
                            <p><span data-i18n="profile.time_played">Temps de jeu</span>: <span class="data">
                            ${data.time_played >= 60 
                            ? `${Math.floor(data.time_played / 60)}h ${Math.floor(data.time_played % 60)}min` 
                            : `${Math.floor(data.time_played)} min`}
                            </span></p>
                        </div>
                    </div>
                </div>

                <!-- Main Content Section -->
                <div class="main-content">
                    <div class="stats-showcase">
                        <div class="stat-card"><h4 data-i18n="profile.games_played">Parties jouées</h4><span class="stat-value">${data.games_played}</span></div>
                        <div class="stat-card"><h4 data-i18n="profile.win_rate">Taux de victoire</h4><span class="stat-value">${Number(data.win_rate).toFixed(2)}%</span></div>
                        <div class="stat-card"><h4 data-i18n="profile.total_score">Score total</h4><span class="stat-value">${data.total_score}</span></div>
                    </div>

                    <div class="achievements">
                        <h3><span data-i18n="profile.recent_achievements">Succès récents</span> (<span class="stat-value">${data.achievements.length}</span>)</h3>
                        <div class="achievement-grid">
                            ${data.achievements.map(ach => `
                                <div class="achievement">
                                    <i class="${ach.icon}"></i>
                                    <span>${ach.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="game-history">
        <h3><span data-i18n="profile.last_games"></span></h3>
        ${renderGameHistory(data.last_games)}
</div>`;
    
}

function initFriendsStatusRefresh() {
    console.log("Initialisation du polling des amis");
    
    if (window.friendsStatusInterval) {
        clearInterval(window.friendsStatusInterval);
        window.friendsStatusInterval = null;
    }
    
    // Vérifier immédiatement au chargement de la page
    fetchFriendsStatus();
    
    // Puis vérifier périodiquement
    window.friendsStatusInterval = setInterval(fetchFriendsStatus, 3000); // Réduit à 3 secondes pour une meilleure réactivité
}

function addNewFriendsToUI(newFriends) {
    console.log("Ajout de nouveaux amis:", newFriends);
    
    const friendsGrid = document.querySelector('.friends-grid');
    if (!friendsGrid) {
        console.error("Impossible de trouver la grille d'amis");
        return;
    }
    
    // Supprimer l'état vide s'il existe et qu'on ajoute des amis
    const emptyState = friendsGrid.querySelector('.empty-state');
    if (emptyState && newFriends.length > 0) {
        emptyState.remove();
    }
    
    // Mettre à jour le compteur d'amis
    const countEl = document.querySelector('.friends-section h3 .stat-value');
    if (countEl) {
        const currentCount = parseInt(countEl.textContent);
        countEl.textContent = currentCount + newFriends.length;
    }
    
    // Ajouter chaque nouvel ami avec une animation
    newFriends.forEach(friend => {
        const friendCard = document.createElement('div');
        friendCard.className = 'friend-card';
        friendCard.style.opacity = '0';
        friendCard.style.transform = 'translateY(20px)';
        
        friendCard.innerHTML = `
            <div class="friend-avatar">
                <img src="${friend.profile_photo || '/static/images/default_avatar.jpg'}" 
                     alt="${friend.username}"
                     onerror="this.src='/static/images/default_avatar.jpg'">
            </div>
            <div class="friend-info">
                <span class="friend-name">${friend.username}</span>
                <span class="friend-status ${friend.online ? 'online' : 'offline'}">
                    ${friend.online ? 'Online' : 'Offline'}
                </span>
                <div class="friend-buttons">
                    <button class="view-profile-btn" data-username="${friend.username}">
                        <i class="fas fa-user"></i> Voir profil
                    </button>
                    <form class="remove-friend-form" data-username="${friend.username}">
                        <button class="remove-friend-btn" type="submit">Supprimer</button>
                    </form>
                </div>
                <div id="removeFriendStatus-${friend.username}" class="friend-form-message"></div>
            </div>
        `;
        
        friendsGrid.appendChild(friendCard);
        
        // Ajouter un écouteur d'événement pour le bouton "Voir profil"
        const viewProfileBtn = friendCard.querySelector('.view-profile-btn');
        if (viewProfileBtn) {
            viewProfileBtn.addEventListener('click', () => {
                const username = viewProfileBtn.dataset.username;
                console.log(`Affichage du profil de ${username}`);
                history.pushState({}, '', `/friend-profile/${username}`);
                loadFriendProfilePage(username);
            });
        }
        
        // Ajouter un écouteur d'événement pour le bouton de suppression
        const form = friendCard.querySelector('.remove-friend-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = form.dataset.username;
            const statusDiv = friendCard.querySelector('.friend-form-message');
            
            try {
                const response = await fetch(`/remove_friend/${encodeURIComponent(username)}`, {
                    method: 'POST',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRFToken': getCookie('csrftoken'),
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (data.status === 'success') {
                    friendCard.classList.add('fade-out');
                    setTimeout(() => {
                        friendCard.remove();
                        
                        // Mettre à jour le compteur
                        const countEl = document.querySelector('.friends-section h3 .stat-value');
                        if (countEl) {
                            const count = parseInt(countEl.textContent);
                            countEl.textContent = count - 1;
                        }
                    }, 500);
                }
                
                statusDiv.textContent = data.message;
                statusDiv.className = `friend-form-message ${data.status}`;
                
            } catch (error) {
                console.error("Erreur lors de la suppression:", error);
                statusDiv.textContent = "Une erreur s'est produite";
                statusDiv.className = 'friend-form-message error';
            }
        });
        
        // Animer l'apparition
        setTimeout(() => {
            friendCard.style.transition = 'opacity 0.5s, transform 0.5s';
            friendCard.style.opacity = '1';
            friendCard.style.transform = 'translateY(0)';
            
            // Afficher une notification
            showNewFriendNotification(friend.username);
        }, 100);
    });
}

// Fonction pour afficher une notification d'ajout d'ami
function showNewFriendNotification(username) {
    const notification = document.createElement('div');
    notification.className = 'new-friend-notification';
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.backgroundColor = 'rgba(46, 125, 50, 0.9)';
    notification.style.color = 'white';
    notification.style.padding = '10px 15px';
    notification.style.borderRadius = '4px';
    notification.style.zIndex = '1000';
    notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    notification.style.display = 'flex';
    notification.style.justifyContent = 'space-between';
    notification.style.alignItems = 'center';
    notification.style.minWidth = '250px';
    
    // Message container
    const messageSpan = document.createElement('span');
    messageSpan.textContent = `${username} vous a ajouté comme ami`;
    
    // Close button avec style amélioré
    const closeButton = document.createElement('button');
    closeButton.textContent = 'X'; // Utiliser 'X' au lieu de &times;
    closeButton.style.background = 'rgba(255, 255, 255, 0.3)';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '50%';
    closeButton.style.color = 'white';
    closeButton.style.fontSize = '16px';
    closeButton.style.fontWeight = 'bold';
    closeButton.style.marginLeft = '15px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.width = '24px';
    closeButton.style.height = '24px';
    closeButton.style.display = 'flex';
    closeButton.style.justifyContent = 'center';
    closeButton.style.alignItems = 'center';
    closeButton.style.padding = '0';
    closeButton.style.lineHeight = '1';
    closeButton.title = 'Fermer';
    
    closeButton.addEventListener('click', () => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(20px)';
        
        setTimeout(() => {
            notification.remove();
        }, 300);
    });
    
    notification.appendChild(messageSpan);
    notification.appendChild(closeButton);
    
    document.body.appendChild(notification);
    
    // Auto-close after 5 seconds
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.style.transition = 'opacity 0.5s, transform 0.5s';
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(20px)';
            
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    notification.remove();
                }
            }, 500);
        }
    }, 5000);
}

async function fetchFriendsStatus() {
    // Vérifier qu'on est bien sur la page de profil
    if (window.location.pathname === '/profile') {
        try {
            // 1. Vérifier d'abord les statuts des amis existants
            const statusResponse = await fetch('/api/friends-status/', {
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                console.log("Données d'amis reçues:", statusData);
                updateFriendsStatusUI(statusData.friends);
                
                // 2. Ensuite, vérifier s'il y a de nouveaux amis
                const friendCards = document.querySelectorAll('.friend-card');
                const knownFriends = Array.from(friendCards).map(card => 
                    card.querySelector('.friend-name')?.textContent
                ).filter(Boolean);
                
                const checkNewResponse = await fetch('/api/check-new-friends/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken'),
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({ known_friends: knownFriends })
                });
                
                if (checkNewResponse.ok) {
                    const newFriendsData = await checkNewResponse.json();
                    if (newFriendsData.new_friends && newFriendsData.new_friends.length > 0) {
                        addNewFriendsToUI(newFriendsData.new_friends);
                    }
                }
            } else if (statusResponse.status === 401) {
                console.log("Non authentifié, redirection vers login");
                window.location.href = '/login/';
            } else {
                console.error('Erreur lors de la récupération des statuts:', statusResponse.status);
            }
        } catch (error) {
            console.error('Erreur lors de l\'actualisation des statuts des amis:', error);
        }
    } else {
        console.log("N'est pas sur la page de profil, le polling est ignoré");
    }
}

function updateFriendsStatusUI(friends) {
    console.log("Mise à jour de l'UI avec", friends.length, "amis");
    
    const friendCards = document.querySelectorAll('.friend-card');
    if (friendCards.length === 0) {
        console.log("Aucune carte d'ami trouvée dans le DOM");
        return;
    }
    
    // Récupérer tous les noms d'utilisateurs actuellement affichés
    const displayedUsernames = Array.from(friendCards).map(card => 
        card.querySelector('.friend-name')?.textContent
    ).filter(Boolean); // Filtre les valeurs null/undefined
    
    console.log("Usernames affichés 123:", displayedUsernames);
    
    // Récupérer tous les noms d'utilisateurs reçus du serveur
    const serverUsernames = friends.map(f => f.username);
    console.log("Usernames du serveur 321:", serverUsernames);
    
    // Identifier les utilisateurs qui ont été supprimés
    const deletedUsernames = displayedUsernames.filter(username => 
        !serverUsernames.includes(username)
    );
    console.log("Usernames supprimés:", deletedUsernames);
    
    // Si des amis ont été supprimés, mettre à jour l'interface
    if (deletedUsernames.length > 0) {
        deletedUsernames.forEach(username => {
            console.log(`Suppression de la carte pour ${username}`);
            const cardToRemove = Array.from(friendCards).find(card => 
                card.querySelector('.friend-name')?.textContent === username
            );
            
            if (cardToRemove) {
                // Corriger la duplication et appliquer l'animation une seule fois
                cardToRemove.style.opacity = "0";
                cardToRemove.style.transform = "translateX(-20px)";
                cardToRemove.classList.add('fade-out'); // Une seule fois ici
                setTimeout(() => {
                    cardToRemove.remove();
                    
                    const countEl = document.querySelector('.friends-section h3 .stat-value');
                    if (countEl) {
                        const currentCount = parseInt(countEl.textContent);
                        countEl.textContent = currentCount - 1;
                    }

                    showDeletedFriendNotification(username);
                }, 500);
            } else {
                console.log(`Carte non trouvée pour ${username}`);
            }
        });
    }
    
    // Mise à jour des statuts des amis restants (code existant)
    friendCards.forEach(card => {
        const nameElement = card.querySelector('.friend-name');
        const statusElement = card.querySelector('.friend-status');
        
        if (nameElement && statusElement) {
            const username = nameElement.textContent;
            const friend = friends.find(f => f.username === username);
            
            if (friend) {
                const currentStatus = statusElement.classList.contains('online');
                
                if (currentStatus !== friend.online) {
                    // Le statut a changé, ajouter l'animation
                    statusElement.classList.add('status-changed');
                    
                    setTimeout(() => {
                        statusElement.classList.remove('status-changed');
                    }, 500);
                }
                
                statusElement.className = `friend-status ${friend.online ? 'online' : 'offline'}`;
                statusElement.textContent = friend.online ? 'Online' : 'Offline';
            }
        }
    });
}

function showDeletedFriendNotification(username) {
    console.log(`Notification: ${username} a supprimé son compte`); // Pour déboguer
    
    // Créer une notification fixe en haut de l'écran
    const notification = document.createElement('div');
    notification.className = 'deleted-friend-notification';
    notification.textContent = `${username} a supprimé son compte`;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    notification.style.color = 'white';
    notification.style.padding = '10px 15px';
    notification.style.borderRadius = '4px';
    notification.style.zIndex = '1000';
    notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.transition = 'opacity 0.5s, transform 0.5s';
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(20px)';
        
        setTimeout(() => {
            notification.remove();
        }, 500);
    }, 3000);
}

function cleanupProfilePage() {
    if (window.friendsStatusInterval) {
        clearInterval(window.friendsStatusInterval);
        window.friendsStatusInterval = null;
        console.log('Polling des amis arrêté');
    }
}

function generateProfileContent(data) {
    const profilePhotoUrl = (data.profile_photo && !data.profile_photo.includes('default_avatar.jpg')) ? 
        data.profile_photo.replace('http://localhost/', 'https://localhost:8443/') : 
        '/static/images/default_avatar.jpg';
    
    const tournamentSection = `
        <div class="tournaments-section">
            <h3>Tournois <span class="stat-value">🏆</span></h3>
            <div class="tournament-actions">
                <a href="/tournaments" data-link class="btn btn-primary">
                    <i class="fas fa-trophy"></i> Voir tous les tournois
                </a>
                <button id="create-tournament-btn" class="btn btn-success">
                    <i class="fas fa-plus"></i> Créer un tournoi
                </button>
            </div>
        </div>`;
    
    const html = `
    <div style="height: 500px; width: 100%;"></div>
    
    <div class="container" style="margin-top: 550px !important; padding-top: 30px !important; position: relative; z-index: 1;">
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
                                    <div class="progress-bar" role="progressbar" style="width: ${data.win_rate}%">${Number(data.win_rate).toFixed(2)}%</div>
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
                            <p><span data-i18n="profile.time_played"></span>: <span class="data">
                            ${data.time_played >= 60 
                            ? `${Math.floor(data.time_played / 60)}h ${Math.floor(data.time_played % 60)}min` 
                            : `${Math.floor(data.time_played)} min`}
                            </span></p>
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
                        <div class="stat-card"><h4 data-i18n="profile.win_rate"></h4><span class="stat-value">${Number(data.win_rate).toFixed(2)}%</span></div>
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
                   <div class="game-history">
                        <h3><span data-i18n="profile.last_games"></span></h3>
                        ${renderGameHistory(data.last_games)}
                    </div>

                    <div class="friends-section">
                        <h3><span data-i18n="profile.my_friends"></span> (<span class="stat-value">${data.friends.length}</span>)</h3>
                        <div class="friend-form-container">
                            <h4>Ajouter un ami</h4>
                            <form id="addFriendForm" class="friend-form">
                                <input
                                    type="text"
                                    name="username"
                                    id="friendUsername"
                                    placeholder="Nom d'utilisateur"
                                    required
                                    pattern="[A-Za-z0-9_]{3,}"
                                    title="Le nom d'utilisateur doit contenir au moins 3 caractères (lettres, chiffres ou underscore)"
                                >
                                <button type="submit">Envoyer la demande</button>
                            </form>
                            <div id="friendRequestStatus" class="friend-form-message"></div>
                        </div>
                        <div class="friends-grid">
                            ${generateFriendsList(data.friends)}
                        </div>
                    </div>
                    ${tournamentSection}
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

    document.querySelector('#app').innerHTML = html;
    document.getElementById('create-tournament-btn').addEventListener('click', showCreateTournamentModal);
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
        const createTournamentBtn = document.getElementById('create-tournament-btn');
        if (createTournamentBtn) {
            createTournamentBtn.addEventListener('click', showCreateTournamentModal);
        }
    }, 0);
    updateTranslations();

    return html;
}

function saveProfileColors(startColor, endColor) {
    const csrftoken = getCookie('csrftoken');
    
    if (!csrftoken) {
        console.error('CSRF token not found');
        alert('Erreur de sécurité. Veuillez rafraîchir la page.');
        return;
    }
    
    fetch('/api/profile/colors/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrftoken
        },
        body: JSON.stringify({ startColor, endColor })
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            console.error('Server responded with error:', response.status, response.statusText);
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
    })
    .then(data => {
        if (data.success) {
            console.log('Colors updated successfully');
        } else {
            console.error('Error saving colors:', data.message);
        }
    })
    .catch(error => {
        console.error('Error saving colors:', error);
    });
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
            window.location.href = 'https://localhost:8443/api/42/';
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

        const profilePhotoUrl = userData.profile_photo ? 
            userData.profile_photo.replace('http://localhost/', 'https://localhost:8443/') : 
            '';

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
                        ${profilePhotoUrl ?
                            `<img src="${profilePhotoUrl}" alt="Current profile photo"
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
            window.location.href = '/'; 
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
                            <span data-i18n="home.games_achieved"></span> <strong>${Number(data.user_profile.win_rate).toFixed(2)}%</strong>
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

// Fonction pour charger les tournois
async function loadTournaments() {
    try {
        const response = await fetch('/api/tournaments/');
        const data = await response.json();
        
        renderTournamentList('active-tournaments', data.active_tournaments);
        renderTournamentList('my-tournaments', data.my_tournaments);
        renderTournamentList('completed-tournaments', data.completed_tournaments);
    } catch (error) {
        console.error("Erreur lors du chargement des tournois:", error);
    }
}

// Fonction pour afficher la liste des tournois
function renderTournamentList(containerId, tournaments) {
    const container = document.getElementById(containerId);
    

    if (!tournaments || tournaments.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-trophy-alt"></i>
                <p>Aucun tournoi disponible</p>
            </div>`;
        return;
    }
    
    container.innerHTML = tournaments.map(t => `
        <div class="tournament-card ${t.is_completed ? 'completed' : ''} ${t.am_i_participant ? 'participating' : ''}">
            <div class="tournament-header">
                <h3 class="tournament-title">${t.name}</h3>
                ${t.is_completed ? 
                    `<span class="tournament-badge completed">Terminé</span>` : 
                    `<span class="tournament-badge active">Tour ${t.current_round}</span>`
                }
            </div>
            <div class="tournament-info">
                <div class="info-row">
                    <i class="fas fa-user-circle"></i>
                    <span>Créateur: ${t.creator}</span>
                </div>
                <div class="info-row">
                    <i class="fas fa-users"></i>
                    <span>Participants: ${t.participants_count}/${t.max_participants}</span>
                </div>
                ${t.is_completed ? 
                    `<div class="info-row winner">
                        <i class="fas fa-crown"></i>
                        <span>Vainqueur: ${t.winner || 'Non déterminé'}</span>
                    </div>` : ''
                }
            </div>
            <a href="/tournament/${t.id}" class="tournament-link" data-link>
                Voir les détails <i class="fas fa-arrow-right"></i>
            </a>
        </div>
    `).join('');
}

function renderTournamentMatches(matches, currentRound) {
    if (matches.length === 0) {
        return '';
    }

    // Grouper les matchs par tour
    const matchesByRound = {};
    matches.forEach(match => {
        if (!matchesByRound[match.round]) {
            matchesByRound[match.round] = [];
        }
        matchesByRound[match.round].push(match);
    });

    let html = '';
    Object.keys(matchesByRound).sort().forEach(round => {
        html += `
            <div class="round-section">
                <h3>Tour ${round}</h3>
                <div class="matches-container">
        `;

        matchesByRound[round].forEach(match => {
            const p1IsBot = match.player1.is_bot;
            const p2IsBot = match.player2.is_bot;
            const isBotMatch = p1IsBot && p2IsBot;
            const isHumanVsBotMatch = (p1IsBot || p2IsBot) && !(p1IsBot && p2IsBot);
            const isHumanVsHumanMatch = !p1IsBot && !p2IsBot;

            // Déterminer qui est le joueur humain et qui est le bot
            let humanPlayer, botPlayer;
            if (isHumanVsBotMatch) {
                // if (p1IsBot) {
                //     humanPlayer = match.player2;
                //     botPlayer = match.player1;
                // } else {
                    humanPlayer = match.player1;
                    botPlayer = match.player2;
                // }
            }

            const player1DisplayName = isHumanVsBotMatch ? 
                (humanPlayer.display_name || humanPlayer.username) : 
                (match.player1.display_name || match.player1.username);
            const player2DisplayName = isHumanVsBotMatch ? 
                (botPlayer.display_name || botPlayer.username) : 
                (match.player2.display_name || match.player2.username);

            // Déterminer qui est le gagnant
            const player1IsWinner = match.winner === (isHumanVsBotMatch ? humanPlayer.username : match.player1.username);
            const player2IsWinner = match.winner === (isHumanVsBotMatch ? botPlayer.username : match.player2.username);
            
            html += `
                <div class="match-card ${match.is_completed ? 'completed' : 'pending'} 
                     ${isBotMatch ? 'bot-match' : ''} 
                     ${isHumanVsBotMatch ? 'human-bot-match' : ''}
                     ${isHumanVsHumanMatch ? 'human-match' : ''}">
                    
                    ${isHumanVsBotMatch ? 
                        '<div class="match-type-badge">Humain vs Bot</div>' : ''}
                    ${isBotMatch ? 
                        '<div class="match-type-badge bot-badge">Match de bots</div>' : ''}
                    ${isHumanVsHumanMatch && !match.is_completed ? 
                        '<div class="match-type-badge human-badge">Match humain</div>' : ''}
                    
                    <div class="match-content">
                        <div class="player ${player1IsWinner ? 'winner' : ''} 
                              ${isHumanVsBotMatch ? '' : (p1IsBot ? 'bot-player' : '')}">
                            <div class="player-avatar">
                                <img src="${isHumanVsBotMatch ? humanPlayer.profile_photo : match.player1.profile_photo}" 
                                     alt="${player1DisplayName}" 
                                     onerror="this.src='/static/images/default_avatar.jpg'">
                                ${isHumanVsBotMatch ? '' : (p1IsBot ? '<i class="fas fa-robot bot-icon"></i>' : '')}
                            </div>
                            <div class="player-info">
                                <span class="player-name">${player1DisplayName}</span>
                                <span class="player-score">${match.is_completed ? 
                                    (isHumanVsBotMatch ? 
                                        (p1IsBot ? match.player2_score : match.player1_score) : 
                                        match.player1_score) : '-'}</span>
                            </div>
                        </div>
                        
                        <div class="vs-divider">
                            <span class="vs-text">VS</span>
                        </div>
                        
                        <div class="player ${player2IsWinner ? 'winner' : ''} 
                              ${isHumanVsBotMatch ? 'bot-player' : (p2IsBot ? 'bot-player' : '')}">
                            <div class="player-avatar">
                                <img src="${isHumanVsBotMatch ? botPlayer.profile_photo : match.player2.profile_photo}" 
                                     alt="${player2DisplayName}" 
                                     onerror="this.src='/static/images/default_avatar.jpg'">
                                ${isHumanVsBotMatch ? '<i class="fas fa-robot bot-icon"></i>' : 
                                    (p2IsBot ? '<i class="fas fa-robot bot-icon"></i>' : '')}
                            </div>
                            <div class="player-info">
                                <span class="player-name">${player2DisplayName}</span>
                                <span class="player-score">${match.is_completed ? 
                                    (isHumanVsBotMatch ? 
                                        (p1IsBot ? match.player1_score : match.player2_score) : 
                                        match.player2_score) : '-'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="match-footer">
                        ${match.can_play ? `
                            <button class="play-match-btn ${isHumanVsBotMatch ? 'bot-match-btn' : ''}" data-match-id="${match.id}">
                                <i class="fas fa-gamepad"></i> ${isHumanVsBotMatch ? 'Jouer contre le bot' : 'Jouer ce match'}
                            </button>
                        ` : match.is_completed ? `
                            <div class="match-result">
                                <i class="fas fa-check-circle"></i> Match terminé
                            </div>
                        ` : isBotMatch ? `
                            <div class="match-status bot-match-status">
                                <i class="fas fa-cog fa-spin"></i> Match automatique (bots)
                            </div>
                        ` : `
                            <div class="match-status">
                                <i class="fas fa-hourglass-half"></i> En attente
                            </div>
                        `}
                    </div>
                </div>
            </div>`;
        });
        html += `</div></div>`;
    });
    
    return html;
}

function showCreateTournamentModal() {
    // Créer la modal
    const modalContainer = document.createElement('div');
    modalContainer.className = 'modal-container';
    modalContainer.style.position = 'fixed';
    modalContainer.style.top = '0';
    modalContainer.style.left = '0';
    modalContainer.style.width = '100%';
    modalContainer.style.height = '100%';
    modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    modalContainer.style.display = 'flex';
    modalContainer.style.justifyContent = 'center';
    modalContainer.style.alignItems = 'center';
    modalContainer.style.zIndex = '1000';
    
    // Contenu de la modal
    modalContainer.innerHTML = `
        <div class="modal-content" style="background-color: var(--primary-bg); padding: 20px; border-radius: 10px; width: 90%; max-width: 500px;">
            <h2 style="margin-top: 0;">Créer un nouveau tournoi</h2>
            <form id="create-tournament-form">
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="tournament-name" style="display: block; margin-bottom: 5px;">Nom du tournoi</label>
                    <input type="text" id="tournament-name" required style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-color);">
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="max-participants" style="display: block; margin-bottom: 5px;">Nombre maximum de participants</label>
                    <select id="max-participants" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-color);">
                        <option value="4">4</option>
                        <option value="8" selected>8</option>
                        <option value="16">16</option>
                        <option value="32">32</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="creator-alias" style="display: block; margin-bottom: 5px;">Votre alias dans ce tournoi</label>
                    <input type="text" id="creator-alias" placeholder="Choisissez un alias pour ce tournoi" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-color);" required>
                </div>
                <div class="modal-buttons" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                    <button type="button" id="cancel-tournament-btn" style="padding: 8px 15px; border-radius: 4px; border: none; background-color: var(--danger-color); color: white; cursor: pointer;">Annuler</button>
                    <button type="submit" style="padding: 8px 15px; border-radius: 4px; border: none; background-color: var(--success-color); color: white; cursor: pointer;">Créer</button>
                </div>
            </form>
        </div>
    `;
    
    // Ajouter la modal au body
    document.body.appendChild(modalContainer);
    
    // Gérer la fermeture de la modal
    document.getElementById('cancel-tournament-btn').addEventListener('click', () => {
        modalContainer.remove();
    });
    
    // Gérer la soumission du formulaire
    document.getElementById('create-tournament-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('tournament-name').value;
        const maxParticipants = document.getElementById('max-participants').value;
        const creatorAlias = document.getElementById('creator-alias').value.trim();
        
        try {
            const response = await fetch('/api/tournaments/create/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({
                    name: name,
                    max_participants: maxParticipants,
                    creator_alias: creatorAlias
                })
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                // Fermer la modal
                modalContainer.remove();
                
                // Afficher un message de succès
                alert(data.message);
                
                // Recharger la liste des tournois
                await loadTournaments();
            } else {
                alert(data.message || 'Une erreur est survenue');
            }
        } catch (error) {
            console.error('Erreur lors de la création du tournoi:', error);
            alert('Une erreur est survenue lors de la création du tournoi');
        }
    });
}

// Fonction pour configurer les événements sur la page de détail d'un tournoi
function setupTournamentDetailEvents(tournamentId) {
    // Gérer le bouton "Rejoindre le tournoi"
    const joinButton = document.getElementById('join-tournament-btn');
    if (joinButton) {
        joinButton.addEventListener('click', async () => {
            try {
                let tournamentName = "Tournoi";
                const headerElement = document.querySelector('.tournament-header h2');
                if (headerElement) {
                    tournamentName = headerElement.textContent;
                }
                showJoinTournamentModal(tournamentId, tournamentName);
            } catch (error) {
                console.error('Erreur lors de la rejointe du tournoi:', error);
                alert('Une erreur est survenue');
            }
        });
    }
    else {
        console.log("Bouton de rejointe non trouvé, vous êtes probablement déjà inscrit ou le tournoi est fermé");
    }
    // Gérer le bouton "Quitter le tournoi"
    const leaveButton = document.getElementById('leave-tournament-btn');
    if (leaveButton) {
        leaveButton.addEventListener('click', async () => {
            if (confirm('Êtes-vous sûr de vouloir quitter ce tournoi?')) {
                try {
                    const response = await fetch(`/api/tournaments/${tournamentId}/leave/`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCookie('csrftoken')
                        }
                    });
                    
                    const data = await response.json();
                    
                    if (data.status === 'success') {
                        alert(data.message);
                        window.location.reload();
                    } else {
                        alert(data.message || 'Une erreur est survenue');
                    }
                } catch (error) {
                    console.error('Erreur lors du départ du tournoi:', error);
                    alert('Une erreur est survenue');
                }
            }
        });
    }
    
    // Gérer le bouton "Démarrer le tournoi"
    const startButton = document.getElementById('start-tournament-btn');
    if (startButton) {
        startButton.addEventListener('click', async () => {
            if (confirm('Êtes-vous sûr de vouloir démarrer ce tournoi? Les inscriptions seront fermées.')) {
                try {
                    const response = await fetch(`/api/tournaments/${tournamentId}/start/`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCookie('csrftoken')
                        }
                    });
                    
                    const data = await response.json();
                    
                    if (data.status === 'success') {
                        alert(data.message);
                        window.location.reload();
                    } else {
                        alert(data.message || 'Une erreur est survenue');
                    }
                } catch (error) {
                    console.error('Erreur lors du démarrage du tournoi:', error);
                    alert('Une erreur est survenue');
                }
            }
        });
    }
    
    // Gérer les boutons "Jouer ce match"
    const playButtons = document.querySelectorAll('.play-match-btn');
    playButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const matchId = button.dataset.matchId;
            
            try {
                button.textContent = "Chargement...";
                button.disabled = true;
                
                console.log(`Tentative de lancer le match ${matchId}`);
                const response = await fetch(`/api/tournament-matches/${matchId}/play/`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (data.status === 'success') {
                    console.log("Redirection vers:", data.redirect_url);
                    window.location.href = data.redirect_url;
                } else {
                    alert(data.message || 'Une erreur est survenue');
                    button.textContent = "Jouer ce match";
                    button.disabled = false;
                }
            } catch (error) {
                console.error('Erreur lors du lancement du match:', error);
                alert('Une erreur est survenue lors de la connexion au serveur');
                button.textContent = "Jouer ce match";
                button.disabled = false;
            }
        });
    });
}

// Fonction pour afficher la modal de jointure de tournoi
function showJoinTournamentModal(tournamentId, tournamentName) {
    // Créer la modal
    const modalContainer = document.createElement('div');
    modalContainer.className = 'modal-container';
    modalContainer.style.position = 'fixed';
    modalContainer.style.top = '0';
    modalContainer.style.left = '0';
    modalContainer.style.width = '100%';
    modalContainer.style.height = '100%';
    modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    modalContainer.style.display = 'flex';
    modalContainer.style.justifyContent = 'center';
    modalContainer.style.alignItems = 'center';
    modalContainer.style.zIndex = '1000';
    
    // Contenu de la modal
    modalContainer.innerHTML = `
        <div class="modal-content" style="background-color: var(--primary-bg); padding: 20px; border-radius: 10px; width: 90%; max-width: 500px;">
            <h2 style="margin-top: 0;">Rejoindre le tournoi: ${tournamentName}</h2>
            <form id="join-tournament-form">
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="tournament-alias" style="display: block; margin-bottom: 5px;">Alias (nom affiché pendant le tournoi)</label>
                    <input type="text" id="tournament-alias" placeholder="Choisissez un alias pour ce tournoi" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-color);" required>
                </div>
                <div class="modal-buttons" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                    <button type="button" id="cancel-join-btn" style="padding: 8px 15px; border-radius: 4px; border: none; background-color: var(--danger-color); color: white; cursor: pointer;">Annuler</button>
                    <button type="submit" style="padding: 8px 15px; border-radius: 4px; border: none; background-color: var(--success-color); color: white; cursor: pointer;">Rejoindre</button>
                </div>
            </form>
        </div>
    `;
    
    // Ajouter la modal au body
    document.body.appendChild(modalContainer);
    
    // Gérer la fermeture de la modal
    document.getElementById('cancel-join-btn').addEventListener('click', () => {
        document.body.removeChild(modalContainer);
    });
    
    // Gérer la soumission du formulaire
    document.getElementById('join-tournament-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const alias = document.getElementById('tournament-alias').value.trim();
        const csrftoken = getCookie('csrftoken');
        
        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/join/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken
                },
                body: JSON.stringify({ alias })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Succès, fermer la modal et recharger la page
                document.body.removeChild(modalContainer);
                router.navigate(`/tournament/${tournamentId}`);
            } else {
                // Afficher l'erreur
                alert(`Erreur: ${data.message}`);
            }
        } catch (error) {
            console.error('Erreur lors de la jointure du tournoi:', error);
            alert('Une erreur s\'est produite lors de la tentative de rejoindre le tournoi.');
        }
    });
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
router.on('/tournaments', async () => {
    try {
        const html = `
            <div class="container mt-5">
                <div class="tournaments-page">
                    <div class="page-header">
                        <h1 class="page-title"><i class="fas fa-trophy"></i> Tournois Pong</h1>
                        <button id="create-tournament-btn" class="btn btn-create">
                            <i class="fas fa-plus"></i> Créer un tournoi
                        </button>
                    </div>
                    
                    <div class="tournaments-container">
                        <div class="tournament-section">
                            <h2 class="section-title">Tournois actifs</h2>
                            <div id="active-tournaments" class="tournament-list">
                                <div class="loading-spinner"><div class="spinner"></div></div>
                            </div>
                        </div>
                        
                        <div class="tournament-section">
                            <h2 class="section-title">Mes tournois</h2>
                            <div id="my-tournaments" class="tournament-list">
                                <div class="loading-spinner"><div class="spinner"></div></div>
                            </div>
                        </div>
                        
                        <div class="tournament-section">
                            <h2 class="section-title">Tournois terminés</h2>
                            <div id="completed-tournaments" class="tournament-list">
                                <div class="loading-spinner"><div class="spinner"></div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.querySelector('#app').innerHTML = html;
        
        // Charger les tournois
        loadTournaments();
        
        // Ajouter les gestionnaires d'événements
        document.getElementById('create-tournament-btn').addEventListener('click', showCreateTournamentModal);
    } catch (error) {
        console.error("Erreur lors du chargement de la page des tournois:", error);
    }
});
router.on('/tournament/:id', async (params) => {
    try {

        if (window.location.pathname === '/pong') {
            console.log("Navigation depuis Pong vers le tournoi - nettoyage des ressources");
            // stopPong();
            pongover = true;
        }
        const tournamentId = params.id;
        // Afficher un indicateur de chargement
        document.querySelector('#app').innerHTML = '<div class="loading-spinner">Chargement du tournoi...</div>';
        
        const response = await fetch(`/api/tournaments/${tournamentId}/`);
        console.log("Réponse du serveur:", response);
        
        // Vérifier si la réponse est OK
        if (!response.ok) {
            // Gestion spécifique selon le code d'erreur
            if (response.status === 404) {
                document.querySelector('#app').innerHTML = `
                    <div class="error-container">
                        <h2>Tournoi non trouvé</h2>
                        <p>Le tournoi que vous recherchez n'existe pas ou a été supprimé.</p>
                        <a href="/tournaments" class="btn" data-link>Retour aux tournois</a>
                    </div>
                `;
            } else {
                document.querySelector('#app').innerHTML = `
                    <div class="error-container">
                        <h2>Erreur lors du chargement du tournoi</h2>
                        <p>Code d'erreur: ${response.status}</p>
                        <a href="/tournaments" class="btn" data-link>Retour aux tournois</a>
                    </div>
                `;
            }
            return;
        }
        
        // Vérifier que le contenu est bien de type JSON
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            document.querySelector('#app').innerHTML = `
                <div class="error-container">
                    <h2>Réponse invalide du serveur</h2>
                    <p>Le serveur n'a pas renvoyé de données JSON.</p>
                    <a href="/tournaments" class="btn" data-link>Retour aux tournois</a>
                </div>
            `;
            return;
        }
        const data = await response.json();
        
        const tournament = data.tournament;
        const participants = data.participants;
        const matches = data.matches;

        
        const html = `
            <div class="container mt-5">
                <div class="back-button">
                    <a href="/tournaments" class="btn btn-back" data-link>
                        <i class="fas fa-arrow-left"></i> Retour aux tournois
                    </a>
                </div>
                
                <div class="tournament-detail-page">
                    <div class="tournament-header" style="background: linear-gradient(to right, #1b2838, #2a475e)">
                        <h1 class="tournament-title">${tournament.name}</h1>
                        
                        <div class="tournament-meta">
                            <div class="meta-item">
                                <i class="fas fa-user-circle"></i>
                                <span>Créé par: ${tournament.creator.username}</span>
                            </div>
                            <div class="meta-item">
                                <i class="fas fa-calendar"></i>
                                <span>Date: ${new Date(tournament.start_date).toLocaleDateString()}</span>
                            </div>
                            <div class="meta-item">
                                <i class="fas fa-users"></i>
                                <span>Participants: ${participants.length}/${tournament.max_participants}</span>
                            </div>
                            <div class="meta-item">
                                <i class="fas fa-gamepad"></i>
                                <span>État: ${tournament.is_completed ? 
                                    `<span class="status completed">Terminé</span>` : 
                                    `<span class="status active">Tour ${tournament.current_round}</span>`}
                                </span>
                            </div>
                            ${tournament.is_completed && tournament.winner ? 
                                `<div class="meta-item winner">
                                    <i class="fas fa-crown"></i>
                                    <span>Vainqueur: ${tournament.winner}</span>
                                </div>` : ''
                            }
                        </div>
                    </div>
                    
                    <div class="tournament-actions">
                        ${tournament.is_registration_open && !tournament.am_i_participant ? 
                            `<button id="join-tournament-btn" class="btn btn-join">
                                <i class="fas fa-sign-in-alt"></i> Rejoindre le tournoi
                            </button>` : ''
                        }
                        ${tournament.is_registration_open && tournament.am_i_participant ? 
                            `<button id="leave-tournament-btn" class="btn btn-leave">
                                <i class="fas fa-sign-out-alt"></i> Quitter le tournoi
                            </button>` : ''
                        }
                        ${tournament.am_i_creator && tournament.is_registration_open && participants.length >= 2 ? 
                            `<button id="start-tournament-btn" class="btn btn-start">
                                <i class="fas fa-play"></i> Démarrer le tournoi
                            </button>` : ''
                        }
                    </div>
                    
                    <div class="tournament-content">
                        <div class="participants-section">
                            <h2 class="section-title">
                                Participants <span class="count-badge">${participants.length}/${tournament.max_participants}</span>
                            </h2>
                            <div class="participants-list">
                                ${participants.map(p => `
                                    <div class="participant ${p.is_bot ? 'bot' : ''}">
                                        <div class="participant-avatar">
                                            <img src="${p.profile_photo}" alt="${p.alias}" 
                                                onerror="this.src='/static/images/default_avatar.jpg'">
                                            ${p.is_bot ? '<div class="bot-badge"><i class="fas fa-robot"></i></div>' : ''}
                                        </div>
                                        <span class="participant-name">${p.alias}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="matches-section">
                            <h2 class="section-title">Matchs du tournoi</h2>
                            <div class="tournament-matches">
                                ${renderTournamentMatches(matches, tournament.current_round)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.querySelector('#app').innerHTML = html;
        
        // Ajouter les gestionnaires d'événements
        setupTournamentDetailEvents(tournamentId);
    } catch (error) {
        console.error("Erreur lors du chargement du détail du tournoi:", error);
    }
});
router.on('/callback', async () => {
    // Récupérer les paramètres d'URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    console.log("Traitement du callback OAuth, code:", code ? "présent" : "absent");
    
    if (!code) {
        console.warn("Callback sans code OAuth, redirection vers l'accueil");
        router.navigate('/');
        return;
    }
    
    try {
        console.log("Vérification de l'authentification...");
        // Faire une requête directe au callback au lieu de vérifier l'authentification
        const response = await fetch(`/callback/?code=${code}&state=${state}`, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.is_authenticated) {
            console.log("Authentification OAuth réussie, redirection vers le profil");
            
            // Mettre à jour la navbar puis naviguer
            await updateNavbar();
            router.navigate('/profile');
        } else {
            console.error("Erreur d'authentification:", data.error);
            router.navigate('/');
        }
    } catch (error) {
        console.error("Erreur lors de la vérification d'authentification:", error);
        router.navigate('/');
    }
});
router.on('/friend-profile/:username', (params) => {
    const username = params.username;
    loadFriendProfilePage(username);
});
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

// Fonction pour afficher l'historique des parties avec une distinction pour les matchs de tournoi
function renderGameHistory(games) {
    if (!games || games.length === 0) {
        return `<p class="empty-list">Aucune partie récente</p>`;
    }

    let html = `<ul class="game-history-list">`;
    
    games.forEach(game => {
        let gameClass = game.win ? 'win' : 'loss';
        let perfectTag = game.is_perfect ? '<span class="perfect-tag">Parfait !</span>' : '';
        let modeTag = '';
        
        // Vérifier si c'est un match de tournoi
        if (game.is_tournament) {
            // Style spécial pour les matchs de tournoi
            modeTag = `<span class="tournament-tag">Tournoi ${game.tournament_name || ''} - Tour ${game.tournament_round || '?'}</span>`;
            gameClass += ' tournament-game';
        } else {
            // Style standard pour les matchs classiques
            modeTag = `<span class="mode-tag">${game.mode || 'Solo'}</span>`;
        }
        
        html += `
            <li class="game-item ${gameClass}">
                <div class="game-header">
                    ${modeTag}
                    <span class="game-date">${new Date(game.date).toLocaleDateString()}</span>
                </div>
                <div class="game-details">
                    <span class="score">${game.player_score} - ${game.opponent_score}</span>
                    <span class="opponent">vs. ${game.opponent_name}</span>
                    ${perfectTag}
                    <span class="duration">${Math.round(game.duration)}s</span>
                </div>
            </li>
        `;
    });
    
    html += `</ul>`;
    return html;
}

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

function initAddFriendForm() {
    const form = document.getElementById('addFriendForm');
    const statusDiv = document.getElementById('friendRequestStatus');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('friendUsername').value;

            try {
                const response = await fetch(`/add-friend/${username}/`, {
                    method: 'POST',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRFToken': getCookie('csrftoken')
                    }
                });

                const data = await response.json();

                // Afficher le message de statut
                statusDiv.innerHTML = '';
                const messageText = document.createElement('span');
                messageText.textContent = data.message;

                statusDiv.appendChild(messageText);
                statusDiv.className = `friend-form-message ${data.status}`;
                statusDiv.style.display = 'flex';
                statusDiv.style.justifyContent = 'space-between';
                statusDiv.style.alignItems = 'center';

                // AJOUTEZ CECI : Auto-close après 3.5 secondes
                setTimeout(() => {
                    if (document.body.contains(statusDiv)) {
                        statusDiv.style.transition = 'opacity 0.5s';
                        statusDiv.style.opacity = '0';
                        
                        setTimeout(() => {
                            if (document.body.contains(statusDiv)) {
                                statusDiv.style.display = 'none';
                                statusDiv.style.opacity = '1'; // Réinitialiser l'opacité pour la prochaine fois
                            }
                        }, 500);
                    }
                }, 3500); // 3.5 secondes

                // Si l'ajout est réussi, vider le champ et mettre à jour l'interface
                if (data.status === 'success') {
                    document.getElementById('friendUsername').value = '';
                    
                    // Vérifier si l'état vide est présent et le supprimer
                    const friendsGrid = document.querySelector('.friends-grid');
                    const emptyState = friendsGrid.querySelector('.empty-state');
                    
                    if (emptyState) {
                        emptyState.remove();
                    }
                    
                    // Ajouter le nouvel ami à l'interface sans recharger la page
                    if (data.friend) {
                        addNewFriendsToUI([data.friend]);
                    } else {
                        // Si le serveur ne renvoie pas les données de l'ami, actualiser la liste
                        fetchFriendsStatus();
                    }
                }
            } catch (error) {
                statusDiv.textContent = "Une erreur s'est produite";
                statusDiv.className = 'friend-form-message error';
            }
        });
    }
}

function initRemoveFriendForms() {
    // Gérer les formulaires de suppression d'amis
    const forms = document.querySelectorAll('.remove-friend-form');
    forms.forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = form.dataset.username;
            const statusDiv = document.getElementById(`removeFriendStatus-${username}`);
            
            try {
                const response = await fetch(`/remove_friend/${encodeURIComponent(username)}`, {
                    method: 'POST',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRFToken': getCookie('csrftoken'),
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (data.status === 'success') {
                    const friendCard = form.closest('.friend-card');
                    
                    // Ajouter un message visible avant de supprimer la carte
                    statusDiv.textContent = data.message;
                    statusDiv.className = `friend-form-message ${data.status}`;
                    statusDiv.style.display = 'block'; // S'assurer qu'il est visible
                    statusDiv.style.padding = '10px';  // Ajouter du padding
                    statusDiv.style.margin = '10px 0'; // Ajouter de la marge
                    statusDiv.style.background = data.status === 'success' ? 'rgba(46, 125, 50, 0.9)' : 'rgba(198, 40, 40, 0.9)';
                    statusDiv.style.color = 'white';
                    statusDiv.style.borderRadius = '4px';
                    statusDiv.style.opacity = '1';
                    
                    // Afficher aussi une notification globale
                    showDeletedFriendNotification(username);
                    
                    // Puis supprimer la carte après un court délai
                    setTimeout(() => {
                        friendCard.classList.add('fade-out');
                        setTimeout(() => {
                            friendCard.remove();
                            
                            const countEl = document.querySelector('.friends-section h3 .stat-value');
                            if (countEl) {
                                const count = parseInt(countEl.textContent);
                                countEl.textContent = count - 1;
                            }
                        }, 500);
                    }, 1000); // Attendre 1 seconde pour que l'utilisateur puisse voir le message
                }
                
                statusDiv.textContent = data.message;
                statusDiv.className = `friend-form-message ${data.status}`;

                setTimeout(() => {
                    if (document.body.contains(statusDiv)) {
                        statusDiv.style.transition = 'opacity 0.5s';
                        statusDiv.style.opacity = '0';
                        
                        setTimeout(() => {
                            if (document.body.contains(statusDiv)) {
                                statusDiv.style.display = 'none';
                                statusDiv.style.opacity = '1';
                            }
                        }, 500);
                    }
                }, 3500); 
                
            } catch (error) {
                console.error("Erreur lors de la suppression:", error);
                statusDiv.textContent = "Une erreur s'est produite";
                statusDiv.className = 'friend-form-message error';
            }
        });
    });
    
    // Gérer les boutons "Voir profil"
    const viewProfileButtons = document.querySelectorAll('.view-profile-btn');
    console.log("Initialisation de", viewProfileButtons.length, "boutons de profil");

    viewProfileButtons.forEach(button => {
        button.addEventListener('click', () => {
            const username = button.dataset.username;

            console.log("Clic sur le bouton Voir profil pour", username);
            // Sauvegarder l'état actuel pour l'historique
            history.pushState({}, '', `/friend-profile/${username}`);
            // Charger le profil de l'ami
            loadFriendProfilePage(username);
        });
    });
}

function generateFriendsList(friends) {
    if (friends.length === 0) {
        return `<div class="empty-state">
            <i class="fas fa-user-friends"></i>
            <p>Vous n'avez pas encore d'amis.</p>
        </div>`;
    }

    return friends.map(friend => `
        <div class="friend-card">
            <div class="friend-avatar">
                <img src="${friend.profile_photo || '/static/images/default_avatar.jpg'}" 
                     alt="${friend.username}"
                     onerror="this.src='/static/images/default_avatar.jpg'">
            </div>
            <div class="friend-info">
                <span class="friend-name">${friend.username}</span>
                <span class="friend-status ${friend.online ? 'online' : 'offline'}">
                    ${friend.online ? 'Online' : 'Offline'}
                </span>
                <div class="friend-buttons">
                    <button class="view-profile-btn" data-username="${friend.username}">
                        <i class="fas fa-user"></i> Voir profil
                    </button>
                    <form class="remove-friend-form" data-username="${friend.username}">
                        <button class="remove-friend-btn" type="submit">Supprimer</button>
                    </form>
                </div>
                <div id="removeFriendStatus-${friend.username}" class="friend-form-message"></div>
            </div>
        </div>
    `).join('');
}
