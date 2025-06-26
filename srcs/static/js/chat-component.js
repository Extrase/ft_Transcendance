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
            currentUserId: null,  // Ajout de cette ligne
            currentRecipient: null,
            isConnecting: false,
            reconnectAttempts: 0,
            maxReconnectAttempts: 3,
            serverOffline: false
        };
    }
    return window.chatState;
}

function initWebSocket() {
    const chatState = ensureChatState();
    
    // Vérification de l'état du serveur
    if (chatState.serverOffline) {
        showSystemMessage('Le serveur semble être arrêté. Veuillez rafraîchir la page quand le serveur sera disponible.');
        return;
    }

    // Éviter les connexions multiples
    if (chatState.socket && chatState.socket.readyState === WebSocket.OPEN) {
        console.log('WebSocket déjà connecté');
        return;
    }
    
    if (chatState.isConnecting) {
        console.log('WebSocket déjà en cours de connexion');
        return;
    }

    // Mise à jour de l'état avant la connexion
    chatState.isConnecting = true;
    
    // Construction de l'URL WebSocket dynamique selon le protocole courant
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws/chat/`;
    
    console.log('Tentative de connexion WebSocket à:', wsUrl);
    chatState.socket = new WebSocket(wsUrl);
    
    // Gestion de l'ouverture de connexion
    chatState.socket.onopen = function() {
        console.log('WebSocket connecté avec succès');
        chatState.isConnecting = false;
        chatState.reconnectAttempts = 0; 
        chatState.serverOffline = false;
        showSystemMessage('Connecté au chat');
    };

    // Gestion de la fermeture de connexion et des reconnexions
    chatState.socket.onclose = function(e) {
        console.log('WebSocket déconnecté, code:', e.code);
        chatState.isConnecting = false;
        
        // Gestion des tentatives de reconnexion
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

    // Gestionnaire des messages WebSocket
    chatState.socket.onmessage = function(e) {
        try {
            console.log('Message WebSocket reçu (brut):', e.data);
            const data = JSON.parse(e.data);
            console.log('Message WebSocket parsé:', data);
            
            // Gestion des différents types de messages
            switch (data.type) {
                case 'connection_established':
                    console.log('Connexion WebSocket établie', data);
                    window.chatState.currentUser = data.username;
                    window.chatState.currentUserId = data.user_id;
                    break;
                
                case 'game_invite':
                    console.log('Invitation de jeu reçue:', data);
                    // Appel direct de la fonction d'affichage
                    displayGameInvitation(data.sender, data.sender_id);
                    showSystemMessage(`${data.sender} vous invite à jouer`);
                    break;
                
                case 'game_invite_response':
                    console.log('Réponse invitation reçue:', data);
                    // Fermeture des modales existantes
                    const hostModal = document.getElementById('hostWaitingModal');
                    if (hostModal) hostModal.remove();
                    
                    // Traitement de la réponse à l'invitation
                    if (data.accepted) {
                        if (data.is_host) {
                            // L'hôte initialise la partie
                            initMultiplayerGame(data.sender, window.chatState.currentUser);
                        } else {
                            // Le joueur invité est redirigé
                            showAcceptationModal(data.sender);
                        }
                        showSystemMessage(`${data.sender} a accepté votre invitation`);
                    } else {
                        showSystemMessage(`${data.sender} a refusé l'invitation`);
                    }
                    break;
                
                case 'chat_message':
                    console.log('Message de chat reçu:', data);
                    
                    // Vérification si le message appartient à la conversation actuelle
                    const isCurrentConversation = (
                        chatState.currentRecipient && 
                        parseInt(data.sender_id) === parseInt(chatState.currentRecipient.id)
                    );
                    
                    if (isCurrentConversation) {
                        // Ajout du message à la conversation actuelle
                        addMessageToChat({
                            content: data.message,
                            sender: data.sender,
                            timestamp: data.timestamp,
                            is_sent: false
                        });
                    } else {
                        // Notification pour un nouveau message d'une autre conversation
                        notifyNewMessage(data);
                    }
                    break;
                
                case 'message_sent':
                    console.log('Message envoyé avec succès:', data);
                    // Confirmation que le message a été envoyé avec succès
                    break;
                
                case 'error':
                    console.error('Erreur WebSocket:', data.message);
                    showSystemMessage(`Erreur: ${data.message}`);
                    break;
                
                case 'connection_response':
                    console.log('Réponse de test de connexion:', data);
                    showSystemMessage('Connexion au serveur de chat établie');
                    break;

                case 'user_status_change':
                    console.log('Changement de statut utilisateur:', data);
                    updateUserStatus(data.user_id, data.status);
                    break;
                
                case 'game_cancel':
                    console.log('Annulation de partie reçue:', data);
                    // Fermer toutes les modales
                    const gameStartModal = document.getElementById('gameStartModal');
                    if (gameStartModal) gameStartModal.remove();
                        
                    const redirectModalCancel = document.getElementById('redirectModal');
                    if (redirectModalCancel) redirectModalCancel.remove();
                    
                    showSystemMessage(`${data.sender} a annulé la partie`);
                    localStorage.removeItem('current_game');
                    break;

                case 'game_start':
                    console.log('Début de partie reçu:', data);
                    // Fermer toutes les modales d'invitation/attente
                    const waitingModal = document.getElementById('hostWaitingModal');
                    if (waitingModal) waitingModal.remove();

                    const acceptModal = document.getElementById('acceptation-modal');
                    if (acceptModal) acceptModal.remove();
                        
                    const redirectModal = document.getElementById('redirectModal');
                    if (redirectModal) redirectModal.remove();
                    
                    showSystemMessage(`Début de la partie avec ${data.opponent}`);
                    
                    localStorage.setItem('current_game', JSON.stringify({
                        id: data.game_id,
                        player1: window.chatState.currentUser,
                        player2: data.opponent,
                        timestamp: new Date().toISOString()
                    }));

                    // Vérifier si c'est l'hôte qui doit lancer le jeu
                    if (data.is_host) {      
                        // Redirection vers la page du jeu uniquement pour l'hôte
                        showGameStartModal(data.opponent, data.game_id);
                    } else {
                            // Pour l'invité, afficher un message demandant de rejoindre l'hôte
                        showRedirectModal(data.host_name || data.sender || "l'hôte");
                    }
                    break;
                
                default:
                    console.log('Type de message non géré:', data.type);
                    break;
            }
        } catch (error) {
            console.error('Erreur lors du traitement du message WebSocket:', error);
            console.log('Message brut:', e.data);
        }
    };

    // Gestion des erreurs WebSocket
    chatState.socket.onerror = function(error) {
        console.error('Erreur WebSocket:', error);
        chatState.isConnecting = false;
        showSystemMessage('Erreur de connexion au serveur de chat');
    };
}

function showGameStartModal(opponent, gameId) {
    // Supprimer toute modal existante
    const existingModal = document.getElementById('gameStartModal');
    if (existingModal) existingModal.remove();
    
    const modalHtml = `
        <div id="gameStartModal" class="modal" style="display: flex !important; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 2000;">
            <div class="modal-content" style="background-color: #1b2838; border: 2px solid #66c0f4; padding: 20px; border-radius: 10px; margin: auto; width: 90%; max-width: 400px; text-align: center; color: #b8c2cc;">
                <h3 style="color: #66c0f4; margin-bottom: 20px;">Partie avec ${opponent}</h3>
                <p style="margin-bottom: 20px;">${opponent} a accepté votre invitation!</p>
                <p style="margin-bottom: 20px;">Cliquez sur "Lancer la partie" quand vous êtes prêt.</p>
                <div style="display: flex; justify-content: space-between;">
                    <button id="startGameBtn" style="background-color: #66c0f4; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; flex-grow: 1; margin-right: 10px;">Lancer la partie</button>
                    <button id="cancelGameBtn" style="background-color: #c94a4a; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; flex-grow: 1;">Annuler</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    setTimeout(() => {
        const startBtn = document.getElementById('startGameBtn');
        const cancelBtn = document.getElementById('cancelGameBtn');
        
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                const gameUrl = `/pong?mode=multi&direct=true&player1=${encodeURIComponent(window.chatState.currentUser)}&player2=${encodeURIComponent(opponent)}&game_id=${gameId}`;
                console.log(`Redirection vers: ${gameUrl}`);
                
                // Stocker les données pour les statistiques
                localStorage.setItem('current_game', JSON.stringify({
                    id: gameId || 'default',
                    player1: window.chatState.currentUser,
                    player2: opponent,
                    timestamp: new Date().toISOString()
                }));
                
                window.location.href = gameUrl;
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                const modal = document.getElementById('gameStartModal');
                if (modal) modal.remove();
                
                showSystemMessage("Partie annulée");
                
                // Informer l'autre joueur que la partie est annulée
                if (window.chatState?.socket?.readyState === WebSocket.OPEN) {
                    window.chatState.socket.send(JSON.stringify({
                        type: 'game_cancel',
                        recipient_id: JSON.parse(localStorage.getItem('current_game'))?.opponent_id
                    }));
                }
                
                localStorage.removeItem('current_game');
            });
        }
    }, 100);
}

function displayGameInvitation(sender, senderId) {
    console.log('Affichage invitation de jeu de:', sender, senderId);
    
    // Supprimer toute modal existante
    const existingModal = document.getElementById('game-invite-container');
    if (existingModal) {
        document.body.removeChild(existingModal);
    }
    
    // Créer un conteneur pour l'invitation
    const inviteContainer = document.createElement('div');
    inviteContainer.id = 'game-invite-container';
    inviteContainer.style.position = 'fixed';
    inviteContainer.style.top = '0';
    inviteContainer.style.left = '0';
    inviteContainer.style.width = '100%';
    inviteContainer.style.height = '100%';
    inviteContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    inviteContainer.style.display = 'flex';
    inviteContainer.style.justifyContent = 'center';
    inviteContainer.style.alignItems = 'center';
    inviteContainer.style.zIndex = '9999';
    
    // Créer le contenu de la modal
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = '#1b2838';
    modalContent.style.color = '#b8c2cc';
    modalContent.style.padding = '20px';
    modalContent.style.borderRadius = '10px';
    modalContent.style.textAlign = 'center';
    modalContent.style.maxWidth = '400px';
    modalContent.style.width = '90%';
    modalContent.style.border = '2px solid #66c0f4';
    
    // Titre
    const title = document.createElement('h3');
    title.textContent = 'Invitation à jouer';
    title.style.color = '#66c0f4';
    title.style.marginBottom = '20px';
    
    // Message
    const message = document.createElement('p');
    message.textContent = `${sender} vous invite à une partie de Pong`;
    message.style.marginBottom = '20px';
    
    // Conteneur de boutons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'center';
    buttonContainer.style.gap = '15px';
    
    // Bouton Accepter
    const acceptButton = document.createElement('button');
    acceptButton.textContent = 'Accepter';
    acceptButton.style.backgroundColor = '#28a745';
    acceptButton.style.color = 'white';
    acceptButton.style.padding = '10px 20px';
    acceptButton.style.border = 'none';
    acceptButton.style.borderRadius = '5px';
    acceptButton.style.cursor = 'pointer';
    
    // Bouton Refuser
    const rejectButton = document.createElement('button');
    rejectButton.textContent = 'Refuser';
    rejectButton.style.backgroundColor = '#dc3545';
    rejectButton.style.color = 'white';
    rejectButton.style.padding = '10px 20px';
    rejectButton.style.border = 'none';
    rejectButton.style.borderRadius = '5px';
    rejectButton.style.cursor = 'pointer';
    
    // Ajouter les événements aux boutons
    acceptButton.addEventListener('click', function() {
        console.log('Acceptation de l\'invitation de', sender);
        inviteContainer.remove();
        acceptGameInvite(senderId, sender);
    });
    
    rejectButton.addEventListener('click', function() {
        console.log('Refus de l\'invitation de', sender);
        inviteContainer.remove();
        rejectGameInvite(senderId);
    });
    
    // Assembler la modal
    buttonContainer.appendChild(acceptButton);
    buttonContainer.appendChild(rejectButton);
    modalContent.appendChild(title);
    modalContent.appendChild(message);
    modalContent.appendChild(buttonContainer);
    inviteContainer.appendChild(modalContent);
    
    // Ajouter la modal au document
    document.body.appendChild(inviteContainer);
    
    console.log('Modal d\'invitation affichée');
}

function sendGameResponse(senderId, senderName, accepted) {
    try {
        if (window.chatState?.socket?.readyState === WebSocket.OPEN) {
            const responseData = {
                type: 'game_invite_response',
                recipient_id: senderId,
                sender: window.chatState.currentUser,
                sender_id: window.chatState.currentUserId,
                accepted: accepted,
                is_host: false
            };
            
            console.log(`Envoi réponse invitation (${accepted ? 'acceptée' : 'refusée'}):`, responseData);
            window.chatState.socket.send(JSON.stringify(responseData));
            
            // Fermer la modal d'invitation
            const inviteModal = document.getElementById('game-invite-container');
            if (inviteModal) inviteModal.remove();
            
            // Afficher un message approprié
            if (accepted) {
                showSystemMessage(`Vous avez accepté l'invitation de ${senderName}`);
            } else {
                showSystemMessage("Vous avez refusé l'invitation");
            }
        } else {
            console.error('WebSocket non disponible pour répondre à l\'invitation');
            showSystemMessage('Erreur: WebSocket non disponible');
        }
    } catch (error) {
        console.error('Erreur lors de l\'envoi de la réponse:', error);
        showSystemMessage('Erreur lors de l\'envoi de la réponse');
    }
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

const style = document.createElement('style');
style.textContent = `
    .modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    .modal-content {
        background: white;
        padding: 20px;
        border-radius: 5px;
        text-align: center;
    }
    .modal-buttons {
        margin-top: 15px;
    }
    .modal-buttons button {
        margin: 0 5px;
    }
`;
document.head.appendChild(style);

// Fonction pour inviter à jouer
function sendGameInvite(userId, event) {
    const button = event.target;
    button.disabled = true;
    
    if (!window.chatState?.currentUserId) {
        console.error('ID utilisateur non défini');
        showSystemMessage('Erreur: ID utilisateur non défini');
        button.disabled = false;
        return;
    }
    
    const recipientName = document.querySelector(`[data-user-id="${userId}"] .username`).textContent;
    
    if (window.chatState?.socket?.readyState === WebSocket.OPEN) {
        const inviteData = {
            type: 'game_invite',
            recipient_id: userId,
            sender: window.chatState.currentUser,
            sender_id: window.chatState.currentUserId,
            is_host: true
        };
        
        try {
            window.chatState.socket.send(JSON.stringify(inviteData));
            createHostWaitingModal(recipientName);
            showSystemMessage(`Invitation envoyée à ${recipientName}`);
            
            setTimeout(() => {
                button.disabled = false;
            }, 30000);
        } catch (error) {
            console.error('Erreur envoi invitation:', error);
            button.disabled = false;
            showSystemMessage('Erreur envoi invitation');
        }
    }
}

function createHostWaitingModal(guestName) {
    const modalHtml = `
        <div id="hostWaitingModal" class="modal">
            <div class="modal-content">
                <h3>En attente de réponse</h3>
                <p>En attente de la réponse de ${guestName}...</p>
                <div class="loader"></div>
                <button id="cancelInviteBtn" class="btn btn-danger">Annuler l'invitation</button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    document.getElementById('cancelInviteBtn').addEventListener('click', () => {
        const modal = document.getElementById('hostWaitingModal');
        if (modal) modal.remove();
    });
}

// Créer une modal d'invitation à jouer
function createGameInviteModal(sender, senderId) {
    console.log('Création modal invitation de:', sender, senderId);
    
    // Supprimer toute modal existante
    const existingModal = document.getElementById('gameInviteModal');
    if (existingModal) existingModal.remove();
    
    // Créer le HTML de la modal avec style inline pour assurer la visibilité
    const modalHtml = `
        <div id="gameInviteModal" class="modal" style="display: flex !important; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 2000;">
            <div class="modal-content" style="background-color: var(--primary-bg); border: 2px solid var(--accent-color); padding: 20px; border-radius: 10px; margin: auto; width: 90%; max-width: 400px; text-align: center; color: var(--primary-text);">
                <h3 style="color: var(--accent-color); margin-bottom: 20px;">Invitation à jouer</h3>
                <p style="margin-bottom: 20px;">${sender} vous invite à une partie de Pong</p>
                <div class="modal-buttons" style="display: flex; justify-content: center; gap: 15px;">
                    <button id="acceptInviteBtn" class="btn btn-success" style="background-color: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Accepter</button>
                    <button id="rejectInviteBtn" class="btn btn-danger" style="background-color: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Refuser</button>
                </div>
            </div>
        </div>
    `;
    
    // Insérer la modal dans le document
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // IMPORTANT: Attacher les événements aux boutons immédiatement après l'insertion
    console.log('Attachement des événements aux boutons de la modal');
    
    // Utiliser setTimeout pour s'assurer que le DOM est mis à jour
    setTimeout(() => {
        const acceptBtn = document.getElementById('acceptInviteBtn');
        const rejectBtn = document.getElementById('rejectInviteBtn');
        
        console.log('Bouton accepter:', acceptBtn);
        console.log('Bouton refuser:', rejectBtn);
        
        if (acceptBtn) {
            acceptBtn.addEventListener('click', () => {
                console.log('Acceptation de l\'invitation de', sender);
                acceptGameInvite(senderId, sender);
            });
        }
        
        if (rejectBtn) {
            rejectBtn.addEventListener('click', () => {
                console.log('Refus de l\'invitation de', sender);
                rejectGameInvite(senderId);
            });
        }
    }, 100);
}

// Accepter une invitation à jouer
function acceptGameInvite(senderId, senderName) {
    // Assurons-nous que le nom de l'expéditeur est passé correctement
    sendGameResponse(senderId, senderName, true);
    
    // Stockons le nom pour l'utiliser plus tard
    localStorage.setItem('game_host_name', senderName);
}

// Fonction pour l'affichage d'une modal de confirmation
function showAcceptationModal(hostName) {
    // Supprimer toute modal existante
    const existingModal = document.getElementById('acceptation-modal');
    if (existingModal) {
        document.body.removeChild(existingModal);
    }
    
    // Créer un conteneur pour la modal
    const modalContainer = document.createElement('div');
    modalContainer.id = 'acceptation-modal';
    modalContainer.style.position = 'fixed';
    modalContainer.style.top = '0';
    modalContainer.style.left = '0';
    modalContainer.style.width = '100%';
    modalContainer.style.height = '100%';
    modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    modalContainer.style.display = 'flex';
    modalContainer.style.justifyContent = 'center';
    modalContainer.style.alignItems = 'center';
    modalContainer.style.zIndex = '9999';
    
    // Créer le contenu de la modal
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = '#1b2838';
    modalContent.style.color = '#b8c2cc';
    modalContent.style.padding = '20px';
    modalContent.style.borderRadius = '10px';
    modalContent.style.textAlign = 'center';
    modalContent.style.maxWidth = '400px';
    modalContent.style.width = '90%';
    modalContent.style.border = '2px solid #66c0f4';
    
    // Titre
    const title = document.createElement('h3');
    title.textContent = 'Invitation acceptée';
    title.style.color = '#66c0f4';
    title.style.marginBottom = '20px';
    
    // Message
    const message = document.createElement('p');
    
    message.style.marginBottom = '20px';
    
    // Bouton OK
    const okButton = document.createElement('button');
    okButton.textContent = 'OK';
    okButton.style.backgroundColor = '#66c0f4';
    okButton.style.color = 'white';
    okButton.style.padding = '10px 20px';
    okButton.style.border = 'none';
    okButton.style.borderRadius = '5px';
    okButton.style.cursor = 'pointer';
    
    // Ajouter l'événement au bouton
    okButton.addEventListener('click', function() {
        modalContainer.remove();
    });
    
    // Assembler la modal
    modalContent.appendChild(title);
    modalContent.appendChild(message);
    modalContent.appendChild(okButton);
    modalContainer.appendChild(modalContent);
    
    // Ajouter la modal au document
    document.body.appendChild(modalContainer);
}

function showRedirectModal(hostName) {
    // Supprimer toute modal existante
    const existingModal = document.getElementById('redirectModal');
    if (existingModal) existingModal.remove();

    // Utiliser directement le nom de l'hôte envoyé par le serveur
    const realHostName = hostName;
    console.log("Affichage modal de redirection vers l'hôte:", realHostName);
    
    const modalHtml = `
        <div id="redirectModal" class="modal" style="display: flex !important; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 2000;">
            <div class="modal-content" style="background-color: #1b2838; border: 2px solid #66c0f4; padding: 20px; border-radius: 10px; margin: auto; width: 90%; max-width: 400px; text-align: center; color: #b8c2cc;">
                <h3 style="color: #66c0f4; margin-bottom: 20px;">Partie acceptée</h3>
                <p style="margin-bottom: 20px;">Le jeu va démarrer sur l'ordinateur de ${realHostName}.</p>
                <p style="margin-bottom: 20px;">Veuillez vous rendre sur son PC pour jouer.</p>
                <button id="okRedirectBtn" style="background-color: #66c0f4; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">J'ai compris</button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    setTimeout(() => {
        const okBtn = document.getElementById('okRedirectBtn');
        if (okBtn) {
            okBtn.addEventListener('click', () => {
                const modal = document.getElementById('redirectModal');
                if (modal) modal.remove();
            });
        }
    }, 100);
    
    showSystemMessage(`Vous avez accepté l'invitation de ${realHostName}. Rendez-vous sur son PC pour jouer.`);
}

// Refuser une invitation à jouer
function rejectGameInvite(senderId) {
    sendGameResponse(senderId, null, false);
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

function initMultiplayerGame(player1, player2, gameId) {
    try {
        console.log('Démarrage du jeu multijoueur:', { player1, player2, gameId });
        
        // Vérifier si les informations nécessaires sont présentes
        if (!player1 || !player2) {
            console.error('Informations des joueurs manquantes');
            showSystemMessage('Erreur: informations des joueurs manquantes');
            return;
        }
        
        // Construction de l'URL avec un ID de partie unique et paramètre de démarrage direct
        const gameUrl = `/pong?mode=multi&direct=true&player1=${encodeURIComponent(player1)}&player2=${encodeURIComponent(player2)}&game_id=${gameId || 'default'}`;
        console.log(`Redirection vers: ${gameUrl}`);
        
        // Afficher une notification avant la redirection
        showSystemMessage(`Démarrage de la partie entre ${player1} et ${player2}...`);
        
        // Enregistrement des données de la partie dans le stockage local
        localStorage.setItem('current_game', JSON.stringify({
            id: gameId,
            player1: player1,
            player2: player2,
            timestamp: new Date().toISOString(),
            is_host: true
        }));
        
        // Rediriger après un court délai pour permettre de voir le message
        setTimeout(() => {
            window.location.href = gameUrl;
        }, 1000);
    } catch (error) {
        console.error('Erreur lors de l\'initialisation du jeu:', error);
        showSystemMessage('Erreur lors du lancement du jeu');
    }
}