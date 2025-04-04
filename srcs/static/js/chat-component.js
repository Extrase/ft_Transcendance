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
    if (!window.chatState) {
        window.chatState = {
            socket: null,
            currentUser: null,
            currentRecipient: null,
            isConnecting: false,
            reconnectAttempts: 0,
            maxReconnectAttempts: 3,
            serverOffline: false
        };
    }

    // Récupérer le nom d'utilisateur actuel
    fetch('/api/profile/')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Erreur de récupération du profil: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (window.chatState) {
                window.chatState.currentUser = data.username;
                // Initialiser WebSocket seulement après avoir défini currentUser
                checkServerAndConnect(); // MODIFICATION ICI: remplacer initWebSocket() par checkServerAndConnect()
            }
        })
        .catch(error => {
            console.error('Erreur lors du chargement des données utilisateur:', error);
            // Continuer avec un utilisateur anonyme
            if (window.chatState) {
                window.chatState.currentUser = 'Anonyme';
                checkServerAndConnect(); // MODIFICATION ICI: remplacer initWebSocket() par checkServerAndConnect()
            }
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

    setTimeout(function() {
        restoreActiveConversation();
    }, 500); 
}

function ensureChatState() {
    if (!window.chatState) {
        window.chatState = {
            socket: null,
            currentUser: null,
            currentRecipient: null,
            isConnecting: false,
            reconnectAttempts: 0,
            maxReconnectAttempts: 3,
            serverOffline: false
        };
    }
    return window.chatState;
}

// Initialisation WebSocket
function initWebSocket() {
    const chatState = ensureChatState();
    
    if (chatState.serverOffline) {
        showSystemMessage('Le serveur semble être arrêté. Veuillez rafraîchir la page quand le serveur sera disponible.');
        return;
    }

    if (chatState.socket && chatState.socket.readyState === WebSocket.OPEN) {
        console.log('WebSocket déjà connecté');
        return;
    }
    
    if (chatState.isConnecting) {
        console.log('WebSocket déjà en cours de connexion');
        return;
    }

    chatState.isConnecting = true;
    
    // IMPORTANT: Utiliser le même hôte que la page web au lieu d'une URL codée en dur
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host; // Utiliser l'hôte actuel plutôt que "localhost:port"
    const wsUrl = `${wsProtocol}//${wsHost}/ws/chat/`;
    
    console.log('Tentative de connexion WebSocket à:', wsUrl);
    chatState.socket = new WebSocket(wsUrl);
    
    chatState.socket.onopen = function() {
        console.log('WebSocket connecté avec succès');
        chatState.isConnecting = false;
        chatState.reconnectAttempts = 0; 
        chatState.serverOffline = false;
        showSystemMessage('Connecté au chat');
    };

    chatState.socket.onclose = function(e) {
        console.log('WebSocket déconnecté, code:', e.code);
        chatState.isConnecting = false;
        
        chatState.reconnectAttempts++;
        
        if (chatState.reconnectAttempts >= chatState.maxReconnectAttempts) {
            chatState.serverOffline = true;
            showServerOfflineAlert();
            showSystemMessage('Impossible de se connecter au serveur après plusieurs tentatives');
            return;
        }
        
        showSystemMessage('Déconnecté du chat, tentative de reconnexion...');
        console.log(`Tentative de reconnexion ${chatState.reconnectAttempts}/${chatState.maxReconnectAttempts}`);
        setTimeout(initWebSocket, 2000);
    };

    chatState.socket.onmessage = function(e) {
        try {
            console.log('Message WebSocket reçu (brut):', e.data);
            const data = JSON.parse(e.data);
            console.log('Message WebSocket parsé:', data);
            
            // S'assurer que chatState existe
            const chatState = ensureChatState();
            
            // Traiter différents types de messages
            if (data.type === 'chat_message') {
                console.log('Message de chat reçu:', data);
                
                // Vérifier si le message provient de la conversation actuellement affichée
                const isCurrentConversation = (
                    chatState.currentRecipient && 
                    parseInt(data.sender_id) === parseInt(chatState.currentRecipient.id)
                );
                
                // Si c'est la conversation actuelle, ajouter le message
                if (isCurrentConversation) {
                    addMessageToChat({
                        content: data.message,
                        sender: data.sender,
                        timestamp: data.timestamp,
                        is_sent: false
                    });
                } else {
                    // Sinon, notifier d'un nouveau message
                    notifyNewMessage(data);
                }
            } 
            else if (data.type === 'game_invite') {
                console.log('Invitation de jeu reçue via WebSocket:', data);
                // Forcer la fonction à être appelée dans le contexte global
                window.createGameInviteModal(data.sender, data.sender_id);
                
                // Notification système si autorisée
                if ("Notification" in window && Notification.permission === "granted") {
                    const notification = new Notification("Invitation à jouer", {
                        body: `${data.sender} vous invite à jouer !`,
                        icon: "/static/images/game-icon.png"
                    });
                    
                    notification.onclick = function() {
                        window.focus();
                        this.close();
                    };
                }
            }
            else if (data.type === 'connection_established') {
                console.log('Connexion WebSocket établie', data);
            }
            else if (data.type === 'message_sent') {
                console.log('Message envoyé avec succès:', data);
            }
            else if (data.type === 'error') {
                console.error('Erreur WebSocket:', data.message);
                showSystemMessage(`Erreur: ${data.message}`);
            }
            else if (data.type === 'connection_response') {
                console.log('Réponse de test de connexion:', data);
                showSystemMessage('Connexion au serveur de chat établie');
            }
            else {
                console.log('Type de message non géré:', data.type);
            }
        } catch (error) {
            console.error('Erreur lors du traitement du message WebSocket:', error);
            console.log('Message brut:', e.data);
        }
    };

    chatState.socket.onerror = function(error) {
        console.error('Erreur WebSocket:', error);
        chatState.isConnecting = false;
        showSystemMessage('Erreur de connexion au serveur de chat');
    };
}

async function checkServerAndConnect() {
    if (!window.chatState) {
        console.error('chatState n\'est pas défini');
        return;
    }
    
    try {
        // Vérifier si le serveur répond avant d'essayer WebSocket
        const response = await fetch('/api/chat/ping/', { 
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (response.ok) {
            // Le serveur répond, on peut essayer WebSocket
            initWebSocket();
        } else {
            console.error('Le serveur est disponible mais a répondu avec une erreur:', response.status);
            showSystemMessage('Erreur de connexion au serveur de chat.');
        }
    } catch (error) {
        console.error('Erreur lors de la vérification du serveur:', error);
        showSystemMessage('Le serveur de chat semble être indisponible. Veuillez réessayer plus tard.');
        
        if (window.chatState) {
            window.chatState.serverOffline = true;
            showServerOfflineAlert();
        }
    }
}

// Afficher des messages système
function showSystemMessage(message) {
    console.log("Message système:", message);
    
    // Vérifier si le conteneur de messages existe
    const messagesContainer = document.querySelector('.messages-container');
    if (!messagesContainer) {
        console.warn("Container de messages non trouvé, impossible d'afficher:", message);
        return; // Sortir de la fonction si le conteneur n'existe pas
    }
    
    // Créer le message système
    const systemMessage = document.createElement('div');
    systemMessage.className = 'message system';
    systemMessage.textContent = message;
    
    // Ajouter au conteneur et faire défiler vers le bas
    messagesContainer.appendChild(systemMessage);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Charger les messages pour un utilisateur spécifique
async function loadUserMessages(userId) {
    const messagesContainer = document.querySelector('.messages-container');
    if (messagesContainer) {
        // Ajouter un message de chargement
        const loadingMessage = document.createElement('div');
        loadingMessage.className = 'loading-message';
        loadingMessage.textContent = 'Chargement des messages...';
        messagesContainer.appendChild(loadingMessage);
    }
    if (!messagesContainer) {
        console.error('Container de messages non trouvé');
        return;
    }
    
    // Vider le conteneur de messages
    messagesContainer.innerHTML = '';
    
    try {
        // Essayer de charger les messages depuis le serveur
        const response = await fetch(`/chat/messages/${userId}/`);
        if (response.ok) {
            const messages = await response.json();
            
            // Si nous avons des messages du serveur, les afficher
            if (messages && messages.length > 0) {
                messages.forEach(msg => {
                    addMessageToChat({
                        content: msg.content,
                        sender: msg.sender_username,
                        timestamp: msg.timestamp,
                        is_sent: msg.sender === window.chatState.currentUser
                    });
                });
                
                // Sauvegarder ces messages dans localStorage
                saveMessagesToLocalStorage(userId, messages);
            } else {
                // Si aucun message du serveur, essayer de charger depuis localStorage
                const savedMessages = loadMessagesFromLocalStorage(userId);
                if (savedMessages && savedMessages.length > 0) {
                    savedMessages.forEach(msg => {
                        addMessageToChat(msg);
                    });
                }
            }
        } else {
            console.error('Erreur lors du chargement des messages');
            // En cas d'erreur, essayer de charger depuis localStorage
            const savedMessages = loadMessagesFromLocalStorage(userId);
            if (savedMessages && savedMessages.length > 0) {
                savedMessages.forEach(msg => {
                    addMessageToChat(msg);
                });
            }
        }
    } catch (error) {
        console.error('Erreur:', error);
        // En cas d'erreur, essayer de charger depuis localStorage
        const savedMessages = loadMessagesFromLocalStorage(userId);
        if (savedMessages && savedMessages.length > 0) {
            savedMessages.forEach(msg => {
                addMessageToChat(msg);
            });
        }
    }
}

// Démarrer une conversation avec un utilisateur
async function startChat(userId, username) {
    console.log(`Démarrage d'une conversation avec ${username} (ID: ${userId})`);
    
    // Mettre à jour l'utilisateur actuel
    const chatState = ensureChatState();
    chatState.currentRecipient = { id: userId, name: username };
    
    // Sauvegarder la conversation active
    saveActiveConversation(userId, username);
    
    // Mettre à jour l'interface utilisateur - CORRIGER LES SÉLECTEURS
    const chatRecipientName = document.getElementById('chat-recipient-name');
    if (chatRecipientName) {
        chatRecipientName.textContent = username;
    } else {
        console.error("Élément #chat-recipient-name non trouvé");
    }
    
    // Masquer le message "aucune conversation" et afficher le conteneur de chat
    const noChat = document.getElementById('no-chat-selected');
    const chatContainer = document.getElementById('chat-container');
    
    if (noChat && chatContainer) {
        noChat.style.display = 'none';
        chatContainer.style.display = 'block';
    } else {
        console.error("Éléments de chat non trouvés");
    }
    
    // Vider le conteneur de messages s'il existe
    const messagesContainer = document.querySelector('.messages-container');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
    }
    
    // Charger les messages depuis le serveur et/ou le localStorage
    await loadUserMessages(userId);
    
    // Rendre le formulaire actif si possible
    const contentInput = document.querySelector('input[name="content"]');
    if (contentInput) {
        contentInput.focus();
    }
    
    // Marquer cet utilisateur comme actif dans la liste
    const userItems = document.querySelectorAll('.user-item');
    userItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.userId == userId) {
            item.classList.add('active');
            
            // Réinitialiser l'indicateur de nouveau message et le compteur
            item.classList.remove('has-new-message');
            const counter = item.querySelector('.unread-count');
            if (counter) {
                counter.remove();
            }
        }
    });
}

// Ajouter un message au chat
function addMessageToChat(messageData) {
    const messagesContainer = document.querySelector('.messages-container');
    if (!messagesContainer) {
        console.error('Container de messages non trouvé');
        return;
    }
    
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
    
    // Le contenu peut être soit dans message soit dans content selon la source
    const messageContent = messageData.message || messageData.content;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = messageContent;
    
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'message-timestamp';
    timestampSpan.textContent = timestamp.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timestampSpan);
    
    messagesContainer.appendChild(messageDiv);
    
    // Faire défiler vers le bas
    setTimeout(() => {
        try {
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                console.log('Défilement vers le bas appliqué');
            }
        } catch (scrollError) {
            console.error('Erreur lors du défilement:', scrollError);
        }
    }, 100); 
    
    // Sauvegarder le message dans localStorage si nous avons un destinataire actif
    if (window.chatState && window.chatState.currentRecipient) {
        const recipientId = window.chatState.currentRecipient.id;
        const messages = loadMessagesFromLocalStorage(recipientId) || [];
        
        // Ajouter le nouveau message
        messages.push({
            content: messageContent,
            sender: isSent ? window.chatState.currentUser : messageData.sender,
            timestamp: timestamp.toISOString(),
            is_sent: isSent
        });
        
        // Limiter le nombre de messages sauvegardés (optionnel)
        if (messages.length > 100) {
            messages.shift(); // Supprimer le plus ancien message
        }
        
        // Sauvegarder dans localStorage
        saveMessagesToLocalStorage(recipientId, messages);
    }
}

// Sauvegarder les messages dans le localStorage
function saveMessagesToLocalStorage(recipientId, messages) {
    try {
        const chatKey = `chat_messages_${recipientId}`;
        localStorage.setItem(chatKey, JSON.stringify(messages));
        console.log(`Messages sauvegardés pour l'utilisateur ${recipientId}`);
    } catch (error) {
        console.error("Erreur lors de la sauvegarde des messages:", error);
    }
}

// Charger les messages depuis le localStorage
function loadMessagesFromLocalStorage(recipientId) {
    try {
        const chatKey = `chat_messages_${recipientId}`;
        const savedMessages = localStorage.getItem(chatKey);
        if (savedMessages) {
            return JSON.parse(savedMessages);
        }
    } catch (error) {
        console.error("Erreur lors du chargement des messages:", error);
    }
    return [];
}

// Sauvegarder la conversation active
function saveActiveConversation(recipientId, recipientName) {
    try {
        localStorage.setItem('active_conversation', JSON.stringify({
            id: recipientId,
            name: recipientName
        }));
    } catch (error) {
        console.error("Erreur lors de la sauvegarde de la conversation active:", error);
    }
}

// Restaurer la conversation active au chargement de la page
function restoreActiveConversation() {
    try {
        const activeConv = localStorage.getItem('active_conversation');
        if (activeConv) {
            const { id, name } = JSON.parse(activeConv);
            if (id && name) {
                console.log(`Restauration de la conversation avec ${name} (${id})`);
                startChat(id, name);
                return true;
            }
        }
    } catch (error) {
        console.error("Erreur lors de la restauration de la conversation active:", error);
    }
    return false;
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
    
    if (!window.chatState || !window.chatState.currentRecipient) {
        showSystemMessage('Veuillez sélectionner un destinataire');
        return;
    }

    const content = this.querySelector('input[name="content"]').value.trim();
    if (!content) return;
    
    // Réinitialiser l'input immédiatement pour une meilleure UX
    this.querySelector('input[name="content"]').value = '';

    try {
        // Si WebSocket est disponible et connecté, l'utiliser en priorité
        if (window.chatState.socket && window.chatState.socket.readyState === WebSocket.OPEN) {
            console.log('Envoi du message via WebSocket');
            
            const messageData = {
                type: 'chat_message',
                message: content,
                recipient_id: window.chatState.currentRecipient.id,
                timestamp: new Date().toISOString()
            };
            
            // Envoyer le message via WebSocket
            window.chatState.socket.send(JSON.stringify(messageData));
            
            // Afficher immédiatement le message dans notre interface
            addMessageToChat({
                content: content,
                sender: window.chatState.currentUser,
                timestamp: new Date().toISOString(),
                is_sent: true
            });
            
            return; // Sortir de la fonction après envoi WebSocket
        }
        
        // Fallback vers l'API REST si WebSocket n'est pas disponible
        console.log('WebSocket non disponible, utilisation de l\'API REST');
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
            const data = await response.json();
            
            if (data.status === 'success') {
                // Ajouter le message à l'interface
                addMessageToChat({
                    content: content,
                    sender: window.chatState.currentUser,
                    timestamp: new Date().toISOString(),
                    is_sent: true
                });
            } else {
                showSystemMessage(data.message || 'Erreur lors de l\'envoi du message');
            }
        } else {
            const errorData = await response.json();
            showSystemMessage(errorData.message || `Erreur (${response.status})`);
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
    // Jouer un son pour notifier (optionnel)
    try {
        const audio = new Audio('/static/sounds/notification.mp3');
        audio.play().catch(err => console.log('Son de notification non pris en charge'));
    } catch (e) {
        console.log('Son de notification non pris en charge');
    }
    
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
    
    // Ajouter les gestionnaires d'événements aux boutons avec des fonctions anonymes
    document.getElementById('acceptInviteBtn').addEventListener('click', function() {
        console.log(`Acceptation de l'invitation de ${sender} (ID: ${senderId})`);
        acceptGameInvite(senderId);
    });
    
    document.getElementById('rejectInviteBtn').addEventListener('click', function() {
        console.log(`Refus de l'invitation de ${sender} (ID: ${senderId})`);
        rejectGameInvite(senderId);
    });
    
    // Auto-fermeture après 30 secondes
    setTimeout(function() {
        const modal = document.getElementById('gameInviteModal');
        if (modal) {
            modal.remove();
            // Notifier le serveur que l'invitation a expiré
            rejectGameInvite(senderId);
        }
    }, 30000);
}

// Accepter une invitation à jouer
async function acceptGameInvite(senderId) {
    try {
        console.log(`Tentative d'acceptation de l'invitation de ${senderId}`);
        
        // Afficher un message de chargement dans la modal
        const modalContent = document.querySelector('#gameInviteModal .modal-content');
        if (modalContent) {
            modalContent.innerHTML = '<p>Préparation du jeu...</p><div style="text-align:center;margin-top:20px;">Chargement...</div>';
        }
        
        const response = await fetch(`/chat/accept_game_invite/${senderId}/`, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCookie('csrftoken'),
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        console.log('Réponse du serveur:', data);
        
        if (data.status === 'success') {
            console.log('Redirection vers le jeu');
            window.location.href = `/chat/game/start/${senderId}/`;
        } else {
            throw new Error(data.message || 'Erreur lors de l\'acceptation');
        }
    } catch (error) {
        console.error('Erreur lors de l\'acceptation:', error);
        showSystemMessage('Erreur lors de l\'acceptation: ' + error.message);
        
        // Fermer la modal en cas d'erreur
        const modal = document.getElementById('gameInviteModal');
        if (modal) modal.remove();
    }
}

// Refuser une invitation à jouer
async function rejectGameInvite(senderId) {
    try {
        console.log(`Refus de l'invitation de ${senderId}`);
        
        const response = await fetch(`/chat/reject_game_invite/${senderId}/`, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCookie('csrftoken'),
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        console.log('Réponse du serveur:', data);
        
        if (data.status === 'success') {
            showSystemMessage('Invitation refusée');
        } else {
            console.error('Erreur lors du refus:', data.message);
        }
    } catch (error) {
        console.error('Erreur lors du refus:', error);
    } finally {
        // Toujours fermer la modal
        const modal = document.getElementById('gameInviteModal');
        if (modal) modal.remove();
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