// chat-component.js

// Fonction principale pour charger la page de chat
window.loadChatPage = async function() {
    try {
        // Vérifier l'authentification
        const authResponse = await fetch('/api/check-auth/');
        const authData = await authResponse.json();
        
        if (!authData.is_authenticated) {
            router.navigate('/login');
            return;
        }
        
        // Afficher un indicateur de chargement
        document.querySelector('#app').innerHTML = '<div class="loading">Chargement du chat...</div>';
        
        // Charger les données des utilisateurs (avec cache-busting)
        const timestamp = new Date().getTime(); // Ajouter un timestamp pour éviter la mise en cache
        const response = await fetch(`/chat/api/users/?t=${timestamp}`);
        const data = await response.json();
        
        // Générer le HTML de l'interface de chat
        document.querySelector('#app').innerHTML = generateChatInterface(data);
        
        // Initialiser le chat
        initChatFunctionality();
    } catch (error) {
        console.error('Erreur lors du chargement du chat:', error);
        document.querySelector('#app').innerHTML = 
            '<div class="alert alert-danger">Erreur lors du chargement du chat</div>';
    }
};

// Générer l'interface HTML du chat
function generateChatInterface(data) {
    const { users, blocked_users, blocked_by_users } = data;
    
    return `
    <div class="chat-interface">
        <!-- Liste des utilisateurs à gauche -->
        <div class="users-sidebar">
            <h3>Utilisateurs</h3>
            <div class="users-list">
                ${users.map(user => `
                <div class="user-item" data-user-id="${user.id}" 
                    data-blocked-by="${blocked_by_users.includes(user.id) ? 'true' : 'false'}">
                    <div class="user-info" onclick="startChat(${user.id}, '${user.username}')">
                        <span class="username">${user.username}</span>
                    </div>
                    <div class="user-actions">
                        ${!blocked_by_users.includes(user.id) ? `
                            <button type="button" class="btn btn-primary btn-sm btn-invite" 
                                    onclick="sendGameInvite(${user.id}, event)">Inviter</button>
                            <button type="button" class="btn btn-danger btn-sm btn-block" 
                                    onclick="blockUser(${user.id}, event)">Bloquer</button>
                        ` : `
                            <span class="blocked-status">Vous êtes bloqué</span>
                        `}
                    </div>
                </div>
                `).join('')}
            </div>
            
            <div class="blocked-section">
                <h3>Utilisateurs bloqués</h3>
                <div class="blocked-list">
                    ${blocked_users.map(user => `
                    <div class="user-item" data-user-id="${user.id}">
                        <div class="user-info">
                            <span class="username">${user.username}</span>
                        </div>
                        <div class="user-actions">
                            <button type="button" class="btn btn-secondary btn-sm btn-unblock" onclick="unblockUser(${user.id}, event)">Débloquer</button>
                        </div>
                    </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <!-- Zone de chat -->
        <div class="chat-area">
            <div id="no-chat-selected" class="no-chat-message">
                Cliquez sur un utilisateur pour commencer une conversation
            </div>

            <div id="chat-container" class="chat-container" style="display: none;">
                <div class="chat-header">
                    <span id="chat-recipient-name"></span>
                </div>
                
                <div class="messages-container">
                </div>

                <form id="message-form" class="message-form">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${getCookie('csrftoken')}">
                    <input type="text" name="content" class="form-control" placeholder="Écrivez votre message..." required>
                    <input type="hidden" name="recipient_id" id="recipient_id">
                    <button type="submit" class="btn btn-primary">Envoyer</button>
                </form>
            </div>
        </div>
    </div>
    `;
}

// Initialisation des fonctionnalités du chat
function initChatFunctionality() {
    // État global pour le chat
    window.chatState = {
        socket: null,
        currentUser: null,
        currentRecipient: null,
        isConnecting: false,
        reconnectAttempts: 0,
        maxReconnectAttempts: 3,
        serverOffline: false
    };

    // Récupérer le nom d'utilisateur actuel
    fetch('/api/profile/')
        .then(response => response.json())
        .then(data => {
            window.chatState.currentUser = data.username;
            initWebSocket();
        });

    // Demander la permission pour les notifications si pas encore décidé
    if ("Notification" in window && Notification.permission === "default") {
        const notificationBtn = document.createElement('button');
        notificationBtn.textContent = "Activer les notifications";
        notificationBtn.classList.add('btn', 'btn-sm', 'btn-primary', 'notification-btn');
        notificationBtn.style.position = 'fixed';
        notificationBtn.style.bottom = '20px';
        notificationBtn.style.right = '20px';
        notificationBtn.style.zIndex = '999';
        notificationBtn.onclick = () => {
            Notification.requestPermission();
            notificationBtn.remove();
        };
        document.body.appendChild(notificationBtn);
    }

    // Ajouter gestionnaire d'événements pour le formulaire de message
    document.getElementById('message-form').addEventListener('submit', handleMessageSubmit);
    
    // Exposer les fonctions au niveau global pour être accessibles depuis le HTML
    window.startChat = startChat;
    window.blockUser = blockUser;
    window.unblockUser = unblockUser;
    window.sendGameInvite = sendGameInvite;
    window.acceptGameInvite = acceptGameInvite;
    window.rejectGameInvite = rejectGameInvite;
    window.createGameInviteModal = createGameInviteModal;
}

// Initialisation WebSocket
function initWebSocket() {
    const chatState = window.chatState;
    
    if (chatState.serverOffline) {
        showSystemMessage('Le serveur semble être arrêté. Veuillez rafraîchir la page quand le serveur sera disponible.');
        return;
    }

    if (chatState.socket && chatState.socket.readyState === WebSocket.OPEN) {
        return;
    }
    
    if (chatState.isConnecting) {
        return;
    }

    chatState.isConnecting = true;
    chatState.socket = new WebSocket('ws://' + window.location.host + '/ws/chat/');
    
    chatState.socket.onopen = function() {
        console.log('WebSocket connecté');
        chatState.isConnecting = false;
        chatState.reconnectAttempts = 0; 
        showSystemMessage('Connecté au chat');
    };

    chatState.socket.onclose = function(e) {
        console.log('WebSocket déconnecté, code:', e.code);
        chatState.isConnecting = false;
        
        chatState.reconnectAttempts++;
        
        if (chatState.reconnectAttempts >= chatState.maxReconnectAttempts) {
            chatState.serverOffline = true;
            showSystemMessage('Le serveur semble être arrêté. Les tentatives de reconnexion ont été interrompues.');
            showServerOfflineAlert();
            return;
        }
        
        showSystemMessage('Déconnecté du chat, tentative de reconnexion...');
        setTimeout(initWebSocket, 1000);
    };

    chatState.socket.onmessage = function(e) {
        const data = JSON.parse(e.data);
        console.log('Message WebSocket reçu:', data);
        
        if (data.type === 'game_invite') {
            console.log('Invitation de jeu reçue:', data);
            createGameInviteModal(data.sender, data.sender_id);
        } else if (data.type === 'chat_message') {
            // Vérifier si le message concerne la conversation actuellement affichée
            const isRelevantMessage = (
                // C'est un message envoyé par nous à la personne que nous avons ouverte
                (data.is_sent === true && parseInt(data.recipient_id) === chatState.currentRecipient?.id) ||
                // OU c'est un message reçu de la personne avec qui nous discutons
                (data.is_sent !== true && parseInt(data.sender_id) === chatState.currentRecipient?.id)
            );
            
            if (isRelevantMessage) {
                // Ajouter le message à la conversation active
                addMessageToChat(data);
            } else {
                // Notification pour un message d'une autre conversation
                notifyNewMessage(data);
            }
        }
    };

    chatState.socket.onerror = function(error) {
        console.error('Erreur WebSocket:', error);
        chatState.isConnecting = false;
    };
}

// Afficher des messages système
function showSystemMessage(message) {
    const messagesContainer = document.querySelector('.messages-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = message;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Charger les messages pour un utilisateur spécifique
async function loadUserMessages(userId) {
    try {
        const response = await fetch(`/chat/messages/${userId}/`);
        if (!response.ok) throw new Error('Erreur lors du chargement des messages');
        const messages = await response.json();
        
        const messagesContainer = document.querySelector('.messages-container');
        messagesContainer.innerHTML = '';
        messages.forEach(addMessageToChat);
    } catch (error) {
        console.error('Erreur:', error);
        showSystemMessage('Erreur lors du chargement des messages');
    }
}

// Démarrer une conversation avec un utilisateur
async function startChat(userId, username) {
    // Vérifier si l'utilisateur est bloqué
    const isBlocked = document.querySelector(`.blocked-list [data-user-id="${userId}"]`) !== null;
    if (isBlocked) {
        showSystemMessage('Impossible de démarrer une conversation avec un utilisateur bloqué');
        return;
    }
    
    window.chatState.currentRecipient = { id: userId, username: username };
    document.getElementById('recipient_id').value = userId;
    
    // Mise à jour de l'interface
    document.getElementById('no-chat-selected').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
    document.getElementById('chat-recipient-name').textContent = username;
    
    // Mise à jour visuelle de la sélection
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const userItem = document.querySelector(`.user-item[data-user-id="${userId}"]`);
    if (userItem) {
        userItem.classList.add('active');

        // Supprimer l'indicateur de nouveau message quand on ouvre la conversation
        userItem.classList.remove('has-new-message');

        // Supprimer le compteur de messages
        const counter = userItem.querySelector('.unread-count');
        if (counter) {
            counter.remove();
        }
    }
    
    // Activer/désactiver le formulaire de message selon le statut de blocage
    const messageForm = document.getElementById('message-form');
    const messageInput = messageForm.querySelector('input[name="content"]');
    const sendButton = messageForm.querySelector('button[type="submit"]');
    
    // Vérifier si l'utilisateur nous a bloqués
    const isBlockedByUser = Array.from(document.querySelectorAll('.user-item'))
        .some(item => item.dataset.userId === userId && item.dataset.blockedBy === 'true');
    
    if (isBlockedByUser) {
        messageInput.disabled = true;
        sendButton.disabled = true;
        showSystemMessage('Cet utilisateur vous a bloqué');
    } else {
        messageInput.disabled = false;
        sendButton.disabled = false;
    }
    
    // Chargement des messages
    await loadUserMessages(userId);
    
    // Focus sur le champ de message si non désactivé
    if (!messageInput.disabled) {
        messageInput.focus();
    }
}

// Ajouter un message au chat
function addMessageToChat(messageData) {
    const messagesContainer = document.querySelector('.messages-container');
    const messageDiv = document.createElement('div');
    
    // Identifier si c'est un message envoyé par nous (is_sent=true) ou reçu
    const isSent = messageData.is_sent === true || messageData.sender === window.chatState.currentUser;
    
    // Formatage de la date
    let timestamp;
    if (messageData.timestamp) {
        // Si c'est une chaîne ISO, on la parse
        if (typeof messageData.timestamp === 'string') {
            timestamp = new Date(messageData.timestamp);
        } 
        // Si c'est déjà un objet Date
        else if (messageData.timestamp instanceof Date) {
            timestamp = messageData.timestamp;
        }
    } else {
        // Si pas de timestamp, on utilise la date actuelle
        timestamp = new Date();
    }

    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    
    // Utiliser textContent au lieu d'innerHTML pour éviter les attaques XSS
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = messageData.message || messageData.content;
    
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'message-timestamp';
    timestampSpan.textContent = timestamp.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timestampSpan);
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Notification de nouveaux messages
function notifyNewMessage(data) {
    // Identifiez l'expéditeur du message
    const senderId = parseInt(data.sender_id);
    const senderName = data.sender;
    
    // Éviter de notifier pour nos propres messages
    if (data.is_sent === true) {
        return;
    }
    
    // Trouver l'élément utilisateur dans la liste
    const userElement = document.querySelector(`.user-item[data-user-id="${senderId}"]`);
    
    if (userElement) {
        // Ajouter une classe pour indiquer un nouveau message
        userElement.classList.add('has-new-message');

        // Ajouter ou incrémenter un compteur de messages
        let counter = userElement.querySelector('.unread-count');
        if (!counter) {
            counter = document.createElement('span');
            counter.className = 'unread-count';
            counter.textContent = '1';
            userElement.querySelector('.user-info').appendChild(counter);
        } else {
            counter.textContent = parseInt(counter.textContent) + 1;
        }
        
        // Optionnellement, demander la permission et afficher une notification système
        if ("Notification" in window) {
            if (Notification.permission === "granted") {
                const notification = new Notification(`Nouveau message de ${senderName}`, {
                    body: data.message.substring(0, 60) + (data.message.length > 60 ? '...' : ''),
                    icon: '/static/images/chat-icon.png', // Ajoutez une icône si disponible
                });
                
                // Fermer la notification après quelques secondes
                setTimeout(() => notification.close(), 5000);
                
                // Rediriger vers la conversation quand on clique sur la notification
                notification.onclick = function() {
                    window.focus();
                    startChat(senderId, senderName);
                    this.close();
                };
            } else if (Notification.permission !== "denied") {
                Notification.requestPermission();
            }
        }
    }
}

// Gérer l'envoi de message
async function handleMessageSubmit(e) {
    e.preventDefault();
    
    if (!window.chatState.currentRecipient) {
        showSystemMessage('Veuillez sélectionner un destinataire');
        return;
    }

    const content = this.querySelector('input[name="content"]').value.trim();
    if (!content) return;

    try {
        const response = await fetch('/chat/send_message/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCookie('csrftoken'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: content,
                recipient_id: window.chatState.currentRecipient.id
            })
        });

        if (response.ok) {
            const timestamp = new Date();
            window.chatState.socket.send(JSON.stringify({
                type: 'chat_message',
                message: content,
                sender: window.chatState.currentUser,
                recipient_id: window.chatState.currentRecipient.id,
                timestamp: timestamp.toISOString()
            }));
            
            this.reset();
            document.querySelector('input[name="content"]').focus();
        } else {
            showSystemMessage('Erreur lors de l\'envoi du message');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showSystemMessage('Erreur de connexion');
    }
}

// Fonction pour inviter à jouer
function sendGameInvite(userId, event) {
    const button = event.target;
    button.disabled = true;
    
    const recipientName = document.querySelector(`[data-user-id="${userId}"] .username`).textContent;
    
    fetch(`/chat/send_game_invite/${userId}/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCookie('csrftoken'),
        },
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showSystemMessage(`Invitation au jeu envoyée à ${recipientName}`);
            button.textContent = 'Invité';
            setTimeout(() => {
                button.textContent = 'Inviter';
                button.disabled = false;
            }, 3000);
        } else {
            showSystemMessage(data.message || 'Erreur lors de l\'envoi de l\'invitation');
            button.disabled = false;
            button.textContent = 'Inviter';
        }
    })
    .catch(error => {
        console.error('Erreur:', error);
        button.disabled = false;
        showSystemMessage('Erreur lors de l\'envoi de l\'invitation');
    });
}

// Créer une modal d'invitation à jouer
function createGameInviteModal(sender, senderId) {
    // Supprimer tout modal existant pour éviter les doublons
    const existingModal = document.getElementById('gameInviteModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modalHtml = `
    <div id="gameInviteModal">
        <div class="modal-content">
            <h3>Invitation à jouer</h3>
            <p>${sender} vous invite à jouer !</p>
            <div style="display: flex; justify-content: space-between; margin-top: 20px;">
                <button id="acceptInviteBtn" class="btn btn-success">Accepter</button>
                <button id="rejectInviteBtn" class="btn btn-danger">Refuser</button>
            </div>
        </div>
    </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Ajouter les gestionnaires d'événements aux boutons
    document.getElementById('acceptInviteBtn').addEventListener('click', () => acceptGameInvite(senderId));
    document.getElementById('rejectInviteBtn').addEventListener('click', () => rejectGameInvite(senderId));
}

// Accepter une invitation à jouer
async function acceptGameInvite(senderId) {
    try {
        const response = await fetch(`/chat/accept_game_invite/${senderId}/`, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCookie('csrftoken'),
            }
        });
        const data = await response.json();
        if (data.status === 'success') {
            window.location.href = `/chat/game/start/${senderId}/`;
        }
    } catch (error) {
        console.error('Erreur:', error);
        showSystemMessage('Erreur lors de l\'acceptation de l\'invitation');
    } finally {
        document.getElementById('gameInviteModal').remove();
    }
}

// Refuser une invitation à jouer
async function rejectGameInvite(senderId) {
    try {
        const response = await fetch(`/chat/reject_game_invite/${senderId}/`, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCookie('csrftoken'),
            }
        });
        const data = await response.json();
        if (data.status === 'success') {
            showSystemMessage('Invitation refusée');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showSystemMessage('Erreur lors du refus de l\'invitation');
    } finally {
        document.getElementById('gameInviteModal').remove();
    }
}

function blockUser(userId, event) {
    if (!confirm('Voulez-vous vraiment bloquer cet utilisateur ?')) return;
    
    const button = event.target;
    button.disabled = true;
    
    fetch(`/chat/block_user/${userId}/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCookie('csrftoken'),
        },
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showSystemMessage('Utilisateur bloqué');
            
            // Trouver l'élément de l'utilisateur dans la liste des utilisateurs
            const userItem = document.querySelector(`.users-list .user-item[data-user-id="${userId}"]`);
            
            if (userItem) {
                // Récupérer le nom d'utilisateur
                const username = userItem.querySelector('.username').textContent;
                
                // Supprimer l'élément de la liste des utilisateurs
                userItem.remove();
                
                // Créer un nouvel élément pour la liste des utilisateurs bloqués
                const blockedListItem = document.createElement('div');
                blockedListItem.className = 'user-item';
                blockedListItem.setAttribute('data-user-id', userId);
                blockedListItem.innerHTML = `
                    <div class="user-info">
                        <span class="username">${username}</span>
                    </div>
                    <div class="user-actions">
                        <button type="button" class="btn btn-secondary btn-sm btn-unblock" onclick="unblockUser(${userId}, event)">Débloquer</button>
                    </div>
                `;
                
                // Ajouter l'élément à la liste des utilisateurs bloqués
                const blockedList = document.querySelector('.blocked-list');
                blockedList.appendChild(blockedListItem);
                
                // Si l'utilisateur bloqué était le destinataire actuel, fermer la conversation
                if (window.chatState?.currentRecipient?.id === parseInt(userId)) {
                    document.getElementById('no-chat-selected').style.display = 'flex';
                    document.getElementById('chat-container').style.display = 'none';
                    window.chatState.currentRecipient = null;
                }
            }
        }
    })
    .catch(error => {
        console.error('Erreur:', error);
        button.disabled = false;
        showSystemMessage('Erreur lors du blocage de l\'utilisateur');
    });
}

function unblockUser(userId, event) {
    if (!confirm('Voulez-vous vraiment débloquer cet utilisateur ?')) return;
    
    const button = event.target;
    button.disabled = true;
    
    fetch(`/chat/unblock_user/${userId}/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCookie('csrftoken'),
        },
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showSystemMessage('Utilisateur débloqué');
            
            // Trouver l'élément de l'utilisateur dans la liste des utilisateurs bloqués
            const blockedUserItem = document.querySelector(`.blocked-list .user-item[data-user-id="${userId}"]`);
            
            if (blockedUserItem) {
                // Récupérer le nom d'utilisateur
                const username = blockedUserItem.querySelector('.username').textContent;
                
                // Supprimer l'élément de la liste des utilisateurs bloqués
                blockedUserItem.remove();
                
                // Créer un nouvel élément pour la liste principale des utilisateurs
                const userListItem = document.createElement('div');
                userListItem.className = 'user-item';
                userListItem.setAttribute('data-user-id', userId);
                userListItem.setAttribute('data-blocked-by', 'false');
                userListItem.innerHTML = `
                    <div class="user-info" onclick="startChat(${userId}, '${username}')">
                        <span class="username">${username}</span>
                    </div>
                    <div class="user-actions">
                        <button type="button" class="btn btn-primary btn-sm btn-invite" 
                                onclick="sendGameInvite(${userId}, event)">Inviter</button>
                        <button type="button" class="btn btn-danger btn-sm btn-block" 
                                onclick="blockUser(${userId}, event)">Bloquer</button>
                    </div>
                `;
                
                // Ajouter l'élément à la liste principale des utilisateurs
                const usersList = document.querySelector('.users-list');
                usersList.appendChild(userListItem);
            }
        }
    })
    .catch(error => {
        console.error('Erreur:', error);
        button.disabled = false;
        showSystemMessage('Erreur lors du déblocage de l\'utilisateur');
    });
}

// Afficher une alerte de serveur hors ligne
function showServerOfflineAlert() {
    const offlineAlert = document.createElement('div');
    offlineAlert.innerHTML = `
        <div class="server-offline-alert">
            Le serveur est actuellement indisponible. Veuillez rafraîchir la page quand le serveur sera de nouveau opérationnel.
            <button onclick="window.location.reload()">
                Rafraîchir
            </button>
        </div>
    `;
    document.body.prepend(offlineAlert);
}

// Fonction pour récupérer un cookie par son nom
function getCookie(name) {
    return document.cookie.split('; ')
        .find(row => row.startsWith(name + '='))
        ?.split('=')[1] || null;
}

document.addEventListener('visibilitychange', function() {
    // Si l'utilisateur revient sur l'onglet et que le serveur était considéré comme hors ligne
    if (!document.hidden && window.chatState && window.chatState.serverOffline) {
        // Tester si le serveur est de nouveau disponible
        fetch(window.location.href, { method: 'HEAD' })
            .then(() => {
                // Le serveur répond, on peut réinitialiser et tenter de se reconnecter
                window.chatState.serverOffline = false;
                window.chatState.reconnectAttempts = 0;
                initWebSocket();
                // Supprimer la bannière d'alerte si elle existe
                const alert = document.querySelector('[style*="position: fixed; top: 0;"]');
                if (alert) alert.remove();
            })
            .catch(() => {
                // Le serveur est toujours indisponible
                console.log("Le serveur est toujours indisponible");
            });
    }
});