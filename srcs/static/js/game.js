// game.js - Logique complète du jeu Pong en SPA avec intégration Django

export class PongGame {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error("Canvas not found!");
            return;
        }
        this.context = this.canvas.getContext('2d');
        this.initGame();
        this.initCanvasUI();
        this.bindEvents();
        
        // Pour l'intégration avec Django
        this.apiClient = null;
    }
    
    setApiClient(apiClient) {
        this.apiClient = apiClient;
    }

    initGame() {
        // Paramètres du jeu par défaut (difficulté moyenne)
        this.PLAYER_HEIGHT = 80;
        this.PLAYER_WIDTH = 10;
        this.BALL_RADIUS = 5;
        this.BALL_SPEED = 4;
        this.PLAYER_SPEED = 5;
        this.COMPUTER_SPEED = 3;
        this.winnerScore = 5;
        this.isUpPressed = false;
        this.isDownPressed = false;
        this.gameActive = false;
        this.gameMode = 'single'; // 'single' ou 'multi'
        this.difficulty = 'medium'; // 'easy', 'medium', 'hard'
        
        // État du jeu
        this.currentState = 'splash'; // 'splash', 'menu', 'playing', 'paused', 'gameover'
        
        // Statistiques locales (seront synchronisées avec le backend)
        this.stats = {
            totalGames: 0,
            playerWins: 0,
            computerWins: 0,
            perfectPlayerGames: 0,
            recentGames: []
        };
        
        this.resetGame();
    }
    
    initCanvasUI() {
        // Tous les UI elements seront désormais dessinés sur le canvas
        this.uiElements = {
            // Définition des zones cliquables (boutons)
            buttons: {
                mainMenu: [
                    { id: 'pButton', text: 'Jouer', x: this.canvas.width/2 - 100, y: 160, width: 200, height: 40 },
                    { id: 'sButton', text: 'Difficulté', x: this.canvas.width/2 - 100, y: 210, width: 200, height: 40 },
                    { id: 'iButton', text: 'Info', x: this.canvas.width/2 - 100, y: 260, width: 200, height: 40 },
                    { id: 'qButton', text: 'Quitter', x: this.canvas.width/2 - 100, y: 310, width: 200, height: 40 }
                ],
                modeMenu: [
                    { id: 'siButton', text: 'Solo', x: this.canvas.width/2 - 100, y: 160, width: 200, height: 40 },
                    { id: 'muButton', text: 'Multi', x: this.canvas.width/2 - 100, y: 210, width: 200, height: 40 },
                    { id: 'qmButton', text: 'Retour', x: this.canvas.width/2 - 100, y: 260, width: 200, height: 40 }
                ],
                difficultyMenu: [
                    { id: 'esButton', text: 'Facile', x: this.canvas.width/2 - 100, y: 160, width: 200, height: 40 },
                    { id: 'mdButton', text: 'Moyen', x: this.canvas.width/2 - 100, y: 210, width: 200, height: 40 },
                    { id: 'hdButton', text: 'Difficile', x: this.canvas.width/2 - 100, y: 260, width: 200, height: 40 },
                    { id: 'qdButton', text: 'Retour', x: this.canvas.width/2 - 100, y: 310, width: 200, height: 40 }
                ]
            },
            // Info-bulle qui sera dessinée sur le canvas
            infoBubble: {
                visible: false,
                x: this.canvas.width/2 - 150,
                y: 150,
                width: 300,
                height: 200,
                text: "Pong est l'un des premiers jeux vidéo arcade, créé par Atari en 1972. Utilisez les touches ↑ et ↓ pour déplacer votre raquette."
            },
            // Statistiques qui seront dessinées sur le canvas
            statsView: {
                visible: false,
                x: this.canvas.width/2 - 200,
                y: 100,
                width: 400,
                height: 300
            }
        };
        
        // Pour la sélection des boutons
        this.activeMenuName = 'mainMenu';
        this.selectedButtonIndex = 0;
        
        // Gestion du clic sur le canvas
        this.canvas.addEventListener('click', (event) => this.handleCanvasClick(event));
    }

    handleCanvasClick(event) {
        // Obtenir les coordonnées réelles par rapport au canvas
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;
        
        // Si on est dans un menu, vérifier si un bouton a été cliqué
        if (this.currentState === 'menu') {
            const buttons = this.uiElements.buttons[this.activeMenuName];
            
            for (let i = 0; i < buttons.length; i++) {
                const button = buttons[i];
                
                if (x >= button.x && x <= button.x + button.width && 
                    y >= button.y && y <= button.y + button.height) {
                    
                    // Simuler le clic sur le bouton
                    this.handleButtonClick(button.id);
                    break;
                }
            }
        }
        
        // Pour l'info-bulle
        if (this.uiElements.infoBubble.visible) {
            const bubble = this.uiElements.infoBubble;
            
            // Bouton fermer (coin supérieur droit de la bulle)
            if (x >= bubble.x + bubble.width - 30 && x <= bubble.x + bubble.width - 10 &&
                y >= bubble.y + 10 && y <= bubble.y + 30) {
                this.uiElements.infoBubble.visible = false;
                this.uiElements.statsView.visible = false;
                return;
            }
            
            // Bouton "plus d'info" en bas de la bulle
            if (x >= bubble.x + bubble.width/2 - 50 && x <= bubble.x + bubble.width/2 + 50 &&
                y >= bubble.y + bubble.height - 40 && y <= bubble.y + bubble.height - 10) {
                this.uiElements.statsView.visible = true;
                // Si API disponible, charger les stats
                if (this.apiClient) {
                    this.apiClient.getPlayerStats().then(stats => {
                        this.stats = stats;
                    });
                }
                return;
            }
        }
        
        // En mode splash screen, cliquer n'importe où lance le menu
        if (this.currentState === 'splash') {
            this.currentState = 'menu';
            this.activeMenuName = 'mainMenu';
            this.selectedButtonIndex = 0;
        }
    }
    
    handleButtonClick(buttonId) {
        switch (buttonId) {
            // Menu principal
            case 'pButton':
                this.activeMenuName = 'modeMenu';
                this.selectedButtonIndex = 0;
                break;
            case 'sButton':
                this.activeMenuName = 'difficultyMenu';
                this.selectedButtonIndex = 0;
                break;
            case 'iButton':
                this.uiElements.infoBubble.visible = true;
                break;
            case 'qButton':
                this.currentState = 'splash';
                break;
                
            // Menu mode
            case 'siButton':
                this.gameMode = 'single';
                this.startGame();
                break;
            case 'muButton':
                this.gameMode = 'multi';
                this.startGame();
                break;
            case 'qmButton':
                this.activeMenuName = 'mainMenu';
                this.selectedButtonIndex = 0;
                break;
                
            // Menu difficulté
            case 'esButton':
                this.difficulty = 'easy';
                this.activeMenuName = 'mainMenu';
                this.selectedButtonIndex = 0;
                break;
            case 'mdButton':
                this.difficulty = 'medium';
                this.activeMenuName = 'mainMenu';
                this.selectedButtonIndex = 0;
                break;
            case 'hdButton':
                this.difficulty = 'hard';
                this.activeMenuName = 'mainMenu';
                this.selectedButtonIndex = 0;
                break;
            case 'qdButton':
                this.activeMenuName = 'mainMenu';
                this.selectedButtonIndex = 0;
                break;
        }
    }

    bindEvents() {
        // Contrôles du jeu
        document.addEventListener('keydown', (event) => this.handleKeyDown(event));
        document.addEventListener('keyup', (event) => this.handleKeyUp(event));
    }

    handleKeyDown(event) {
        // Navigation dans les menus
        if (this.currentState === 'menu') {
            switch (event.key) {
                case 'ArrowUp':
                    this.selectedButtonIndex = (this.selectedButtonIndex - 1 + this.uiElements.buttons[this.activeMenuName].length) % this.uiElements.buttons[this.activeMenuName].length;
                    event.preventDefault();
                    break;
                case 'ArrowDown':
                    this.selectedButtonIndex = (this.selectedButtonIndex + 1) % this.uiElements.buttons[this.activeMenuName].length;
                    event.preventDefault();
                    break;
                case ' ':
                case 'Enter':
                    const selectedButton = this.uiElements.buttons[this.activeMenuName][this.selectedButtonIndex];
                    this.handleButtonClick(selectedButton.id);
                    event.preventDefault();
                    break;
                case 'Escape':
                    if (this.activeMenuName !== 'mainMenu') {
                        this.activeMenuName = 'mainMenu';
                        this.selectedButtonIndex = 0;
                    } else {
                        this.currentState = 'splash';
                    }
                    event.preventDefault();
                    break;
            }
        }
        
        // Fermer l'info-bulle avec Escape
        if (this.uiElements.infoBubble.visible && event.key === 'Escape') {
            this.uiElements.infoBubble.visible = false;
            this.uiElements.statsView.visible = false;
            event.preventDefault();
            return;
        }
        
        // Contrôles du jeu
        if (this.currentState === 'playing') {
            if (event.key === 'w' || event.key === 'ArrowUp') this.isUpPressed = true;
            if (event.key === 's' || event.key === 'ArrowDown') this.isDownPressed = true;
            
            // Contrôles pour le joueur 2 en mode multi
            if (this.gameMode === 'multi') {
                if (event.key === 'o') this.isPlayer2UpPressed = true;
                if (event.key === 'l') this.isPlayer2DownPressed = true;
            }
            
            // Pause
            if (event.key === 'p') {
                if (this.currentState === 'playing') {
                    this.currentState = 'paused';
                } else if (this.currentState === 'paused') {
                    this.currentState = 'playing';
                    this.play();
                }
            }
            
            // Echap pour retourner au menu
            if (event.key === 'Escape') {
                this.currentState = 'menu';
                this.activeMenuName = 'mainMenu';
                this.selectedButtonIndex = 0;
            }
        }
        
        // Depuis l'écran de fin
        if (this.currentState === 'gameover') {
            if (event.key === 'r') {
                this.resetGame();
                this.startGame();
            }
            
            if (event.key === 'Escape') {
                this.currentState = 'menu';
                this.activeMenuName = 'mainMenu';
                this.selectedButtonIndex = 0;
            }
        }
    }

    handleKeyUp(event) {
        if (event.key === 'w' || event.key === 'ArrowUp') this.isUpPressed = false;
        if (event.key === 's' || event.key === 'ArrowDown') this.isDownPressed = false;
        
        if (this.gameMode === 'multi') {
            if (event.key === 'o') this.isPlayer2UpPressed = false;
            if (event.key === 'l') this.isPlayer2DownPressed = false;
        }
    }

    startGame() {
        this.resetGame();
        this.currentState = 'playing';
        this.play();
    }

    resetGame() {
        this.isGameOver = false;
        this.winner = null;
        
        // Ajuster les paramètres en fonction de la difficulté
        switch (this.difficulty) {
            case 'easy':
                this.BALL_SPEED = 3;
                this.COMPUTER_SPEED = 2;
                break;
            case 'medium':
                this.BALL_SPEED = 4;
                this.COMPUTER_SPEED = 3;
                break;
            case 'hard':
                this.BALL_SPEED = 5;
                this.COMPUTER_SPEED = 4;
                break;
        }
        
        this.gameData = {
            player: { y: this.canvas.height / 2 - this.PLAYER_HEIGHT / 2, score: 0 },
            computer: { y: this.canvas.height / 2 - this.PLAYER_HEIGHT / 2, score: 0 },
            ball: {
                x: this.canvas.width / 2,
                y: this.canvas.height / 2,
                speedX: this.BALL_SPEED * (Math.random() > 0.5 ? 1 : -1),
                speedY: this.BALL_SPEED * (Math.random() * 2 - 1)
            }
        };
    }

    endGame() {
        this.currentState = 'gameover';
        
        // Si connecté avec le backend, enregistrer les stats
        if (this.apiClient) {
            const gameData = {
                player_score: this.gameData.player.score,
                computer_score: this.gameData.computer.score,
                difficulty: this.difficulty
            };
            
            this.apiClient.saveGameStats(gameData).then(() => {
                // Recharger les stats mises à jour
                return this.apiClient.getPlayerStats();
            }).then(stats => {
                this.stats = stats;
            });
        }
    }

    // Méthodes de jeu (restent similaires)
    movePlayer() {
        if (this.isUpPressed) this.gameData.player.y = Math.max(0, this.gameData.player.y - this.PLAYER_SPEED);
        if (this.isDownPressed) this.gameData.player.y = Math.min(this.canvas.height - this.PLAYER_HEIGHT, this.gameData.player.y + this.PLAYER_SPEED);
    }

    movePlayer2OrComputer() {
        if (this.gameMode === 'multi') {
            // Déplacer le joueur 2
            if (this.isPlayer2UpPressed) this.gameData.computer.y = Math.max(0, this.gameData.computer.y - this.PLAYER_SPEED);
            if (this.isPlayer2DownPressed) this.gameData.computer.y = Math.min(this.canvas.height - this.PLAYER_HEIGHT, this.gameData.computer.y + this.PLAYER_SPEED);
        } else {
            // L'IA de l'ordinateur
            const computer = this.gameData.computer;
            const ball = this.gameData.ball;
            const computerCenter = computer.y + this.PLAYER_HEIGHT / 2;
            
            // Ajout d'une "erreur" pour rendre l'IA battable
            const errorFactor = this.difficulty === 'easy' ? 30 : (this.difficulty === 'medium' ? 20 : 10);
            
            if (ball.speedX > 0) { // La balle va vers l'ordinateur
                if (ball.y < computerCenter - errorFactor) {
                    computer.y = Math.max(0, computer.y - this.COMPUTER_SPEED);
                } else if (ball.y > computerCenter + errorFactor) {
                    computer.y = Math.min(this.canvas.height - this.PLAYER_HEIGHT, computer.y + this.COMPUTER_SPEED);
                }
            } else {
                // Quand la balle s'éloigne, l'ordinateur retourne doucement au centre
                if (Math.abs(computerCenter - this.canvas.height / 2) > 30) {
                    if (computerCenter > this.canvas.height / 2) {
                        computer.y -= this.COMPUTER_SPEED / 2;
                    } else {
                        computer.y += this.COMPUTER_SPEED / 2;
                    }
                }
            }
        }
    }

    checkCollision() {
        const ball = this.gameData.ball;
        const player = this.gameData.player;
        const computer = this.gameData.computer;

        // Collision avec le mur du haut ou du bas
        if (ball.y - this.BALL_RADIUS <= 0 || ball.y + this.BALL_RADIUS >= this.canvas.height) {
            ball.speedY *= -1;
        }

        // Collision avec la raquette du joueur
        if (ball.x - this.BALL_RADIUS <= 10 + this.PLAYER_WIDTH && 
            ball.y >= player.y && 
            ball.y <= player.y + this.PLAYER_HEIGHT) {
            ball.speedX = Math.abs(ball.speedX); // Rebondit vers la droite
            
            // Angle de rebond basé sur où la balle touche la raquette
            const hitPosition = (ball.y - player.y) / this.PLAYER_HEIGHT;
            ball.speedY = (hitPosition - 0.5) * 2 * this.BALL_SPEED;
        }

        // Collision avec la raquette de l'ordinateur/joueur 2
        if (ball.x + this.BALL_RADIUS >= this.canvas.width - this.PLAYER_WIDTH - 10 && 
            ball.y >= computer.y && 
            ball.y <= computer.y + this.PLAYER_HEIGHT) {
            ball.speedX = -Math.abs(ball.speedX); // Rebondit vers la gauche
            
            // Angle de rebond basé sur où la balle touche la raquette
            const hitPosition = (ball.y - computer.y) / this.PLAYER_HEIGHT;
            ball.speedY = (hitPosition - 0.5) * 2 * this.BALL_SPEED;
        }

        // La balle sort à gauche (point pour l'ordinateur/joueur 2)
        if (ball.x < 0) {
            this.gameData.computer.score++;
            this.resetBall();
        }

        // La balle sort à droite (point pour le joueur)
        if (ball.x > this.canvas.width) {
            this.gameData.player.score++;
            this.resetBall();
        }

        // Vérifier si un joueur a gagné
        if (this.gameData.player.score >= this.winnerScore) {
            this.isGameOver = true;
            this.winner = 'player';
            this.endGame();
        } else if (this.gameData.computer.score >= this.winnerScore) {
            this.isGameOver = true;
            this.winner = this.gameMode === 'multi' ? 'player2' : 'computer';
            this.endGame();
        }
    }

    resetBall() {
        this.gameData.ball = {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            speedX: this.BALL_SPEED * (Math.random() > 0.5 ? 1 : -1),
            speedY: this.BALL_SPEED * (Math.random() * 2 - 1) // Angle aléatoire
        };
    }

    moveBall() {
        let ball = this.gameData.ball;
        ball.x += ball.speedX;
        ball.y += ball.speedY;
    }

    // Méthode principale de dessin qui gère tous les états de l'interface
    draw() {
        const ctx = this.context;
        // Effacer le canvas
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Dessiner en fonction de l'état du jeu
        switch (this.currentState) {
            case 'splash':
                this.drawSplashScreen(ctx);
                break;
            case 'menu':
                this.drawMenu(ctx);
                break;
            case 'playing':
                this.drawGame(ctx);
                break;
            case 'paused':
                this.drawGame(ctx);
                this.drawPauseScreen(ctx);
                break;
            case 'gameover':
                this.drawGame(ctx);
                this.drawGameOverScreen(ctx);
                break;
        }
        
        // Dessiner l'info-bulle si elle est visible
        if (this.uiElements.infoBubble.visible) {
            this.drawInfoBubble(ctx);
        }
    }
    
    drawSplashScreen(ctx) {
        ctx.fillStyle = "white";
        ctx.font = "48px Arial";
        ctx.textAlign = "center";
        ctx.fillText("PONG", this.canvas.width / 2, this.canvas.height / 3);
        
        ctx.font = "24px Arial";
        ctx.fillText("Cliquez pour commencer", this.canvas.width / 2, this.canvas.height / 2);
        
        ctx.font = "16px Arial";
        ctx.fillText("© 2025 MonApp", this.canvas.width / 2, this.canvas.height - 30);
        ctx.textAlign = "start";
    }
    
    drawMenu(ctx) {
        ctx.fillStyle = "white";
        ctx.font = "36px Arial";
        ctx.textAlign = "center";
        
        let title = "";
        switch(this.activeMenuName) {
            case 'mainMenu': title = "Menu Principal"; break;
            case 'modeMenu': title = "Mode de Jeu"; break;
            case 'difficultyMenu': title = "Difficulté"; break;
        }
        
        ctx.fillText(title, this.canvas.width / 2, 100);
        
        // Dessiner les boutons du menu actif
        const buttons = this.uiElements.buttons[this.activeMenuName];
        
        buttons.forEach((button, index) => {
            // Bouton sélectionné en surbrillance
            if (index === this.selectedButtonIndex) {
                ctx.fillStyle = "#4286f4";
            } else {
                ctx.fillStyle = "#555555";
            }
            
            // Rectangle du bouton
            ctx.fillRect(button.x, button.y, button.width, button.height);
            
            // Texte du bouton
            ctx.fillStyle = "white";
            ctx.font = "20px Arial";
            ctx.textAlign = "center";
            ctx.fillText(button.text, button.x + button.width/2, button.y + button.height/2 + 6);
        });
        
        // Indication difficulté actuelle
        if (this.activeMenuName === 'mainMenu') {
            ctx.font = "16px Arial";
            ctx.fillText(`Difficulté actuelle: ${this.getDifficultyText()}`, this.canvas.width / 2, 380);
        }
        
        ctx.textAlign = "start";
    }
    
    getDifficultyText() {
        switch(this.difficulty) {
            case 'easy': return 'Facile';
            case 'medium': return 'Moyen';
            case 'hard': return 'Difficile';
            default: return 'Moyen';
        }
    }
    
    drawInfoBubble(ctx) {
        const bubble = this.uiElements.infoBubble;
        
        // Fond semi-transparent
        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Bulle d'info
        ctx.fillStyle = "#333333";
        ctx.fillRect(bubble.x, bubble.y, bubble.width, bubble.height);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.strokeRect(bubble.x, bubble.y, bubble.width, bubble.height);
        
        // Texte
        ctx.fillStyle = "white";
        ctx.font = "16px Arial";
        ctx.textAlign = "center";
        
        // Titre
        ctx.fillText("Information", bubble.x + bubble.width/2, bubble.y + 30);
        
        // Contenu
        ctx.font = "14px Arial";
        ctx.textAlign = "left";
        
        // Découper le texte en lignes
        const maxWidth = bubble.width - 40;
        const words = bubble.text.split(' ');
        let line = '';
        let lines = [];
        
        for(let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            
            if (testWidth > maxWidth && n > 0) {
                lines.push(line);
                line = words[n] + ' ';
            } else {
                line = testLine;
            }
        }
        lines.push(line);
        
        // Dessiner les lignes
        let y = bubble.y + 60;
        lines.forEach(line => {
            ctx.fillText(line, bubble.x + 20, y);
            y += 20;
        });
        
        // Bouton "Fermer"
        ctx.fillStyle = "#ff5555";
        ctx.fillRect(bubble.x + bubble.width - 30, bubble.y + 10, 20, 20);
        ctx.fillStyle = "white";
        ctx.font = "bold 16px Arial";
        ctx.textAlign = "center";
        ctx.fillText("X", bubble.x + bubble.width - 20, bubble.y + 25);
        
        // Bouton "Statistiques"
        if (this.uiElements.statsView.visible) {
            this.drawStats(ctx);
        } else {
            ctx.fillStyle = "#4286f4";
            ctx.fillRect(bubble.x + bubble.width/2 - 50, bubble.y + bubble.height - 40, 100, 30);
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.fillText("Statistiques", bubble.x + bubble.width/2, bubble.y + bubble.height - 20);
        }
        
        ctx.textAlign = "start";
    }
    
    drawStats(ctx) {
        const stats = this.uiElements.statsView;
        
        // Fond de la vue stats
        ctx.fillStyle = "#222222";
        ctx.fillRect(stats.x, stats.y, stats.width, stats.height);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.strokeRect(stats.x, stats.y, stats.width, stats.height);
        
        // Titre
        ctx.fillStyle = "white";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Statistiques du joueur", stats.x + stats.width/2, stats.y + 30);
        
        // Stats
        ctx.font = "16px Arial";
        ctx.textAlign = "left";
        
        const lineHeight = 28;
        let y = stats.y + 70;
        
        ctx.fillText(`Parties jouées: ${this.stats.totalGames}`, stats.x + 20, y);
        y += lineHeight;
        ctx.fillText(`Victoires: ${this.stats.playerWins}`, stats.x + 20, y);
        y += lineHeight;
        ctx.fillText(`Défaites: ${this.stats.computerWins}`, stats.x + 20, y);
        y += lineHeight;
        ctx.fillText(`Parties parfaites: ${this.stats.perfectPlayerGames}`, stats.x + 20, y);
        y += lineHeight;
        
        // Taux de victoire
        const winRate = this.stats.totalGames > 0 ? 
            Math.round((this.stats.playerWins / this.stats.totalGames) * 100) : 0;
        ctx.fillText(`Taux de victoire: ${winRate}%`, stats.x + 20, y);
        
        // Dernières parties
        y += lineHeight * 1.5;
        ctx.fillText("Dernières parties:", stats.x + 20, y);
        y += lineHeight * 0.8;
        
        if (this.stats.recentGames.length === 0) {
            ctx.fillText("Aucune partie récente", stats.x + 20, y);
        } else {
            this.stats.recentGames.slice(0, 3).forEach((game, index) => {
                const result = game.playerWon ? "Victoire" : "Défaite";
                const score = `${game.playerScore}-${game.computerScore}`;
                ctx.fillText(`${index+1}. ${result} (${score}) - ${game.difficulty}`, stats.x + 20, y);
                y += lineHeight * 0.8;
            });
        }
    }
    
    drawGame(ctx) {
        // Ligne médiane
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "white";
        ctx.beginPath();
        ctx.moveTo(this.canvas.width / 2, 0);
        ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Dessiner les scores
        ctx.fillStyle = "white";
        ctx.font = "48px Arial";
        ctx.textAlign = "center";
        ctx.fillText(this.gameData.player.score, this.canvas.width / 4, 50);
        ctx.fillText(this.gameData.computer.score, 3 * this.canvas.width / 4, 50);
        
        // Dessiner les raquettes
        // Joueur
        ctx.fillRect(
            10, 
            this.gameData.player.y, 
            this.PLAYER_WIDTH, 
            this.PLAYER_HEIGHT
        );
        
        // Ordinateur/Joueur 2
        ctx.fillRect(
            this.canvas.width - this.PLAYER_WIDTH - 10, 
            this.gameData.computer.y, 
            this.PLAYER_WIDTH, 
            this.PLAYER_HEIGHT
        );
        
        // Dessiner la balle
        ctx.beginPath();
        ctx.arc(
            this.gameData.ball.x, 
            this.gameData.ball.y, 
            this.BALL_RADIUS, 
            0, 
            Math.PI * 2
        );
        ctx.fill();
        
        // Indication du mode en cours
        ctx.font = "16px Arial";
        ctx.textAlign = "left";
        ctx.fillText(`Mode: ${this.gameMode === 'single' ? 'Solo' : 'Multi'}`, 10, this.canvas.height - 10);
        
        // Indication de la difficulté
        if (this.gameMode === 'single') {
            ctx.textAlign = "right";
            ctx.fillText(`Difficulté: ${this.getDifficultyText()}`, this.canvas.width - 10, this.canvas.height - 10);
        }
        
        ctx.textAlign = "start";
    }
    
    drawPauseScreen(ctx) {
        // Fond semi-transparent
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Texte de pause
        ctx.fillStyle = "white";
        ctx.font = "48px Arial";
        ctx.textAlign = "center";
        ctx.fillText("PAUSE", this.canvas.width / 2, this.canvas.height / 2);
        
        // Instructions
        ctx.font = "20px Arial";
        ctx.fillText("Appuyez sur P pour continuer", this.canvas.width / 2, this.canvas.height / 2 + 40);
        ctx.fillText("Appuyez sur ESC pour quitter", this.canvas.width / 2, this.canvas.height / 2 + 70);
        
        ctx.textAlign = "start";
    }
    
    drawGameOverScreen(ctx) {
        // Fond semi-transparent
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Texte de fin de partie
        ctx.fillStyle = "white";
        ctx.font = "48px Arial";
        ctx.textAlign = "center";
        
        let winnerText = "";
        if (this.winner === 'player') {
            winnerText = "Vous avez gagné!";
            ctx.fillStyle = "#6FFF6F"; // Vert
        } else if (this.winner === 'player2') {
            winnerText = "Joueur 2 a gagné!";
            ctx.fillStyle = "#FF6F6F"; // Rouge
        } else {
            winnerText = "Vous avez perdu!";
            ctx.fillStyle = "#FF6F6F"; // Rouge
        }
        
        ctx.fillText(winnerText, this.canvas.width / 2, this.canvas.height / 2);
        
        // Score
        ctx.fillStyle = "white";
        ctx.font = "24px Arial";
        const scoreText = `${this.gameData.player.score} - ${this.gameData.computer.score}`;
        ctx.fillText(scoreText, this.canvas.width / 2, this.canvas.height / 2 + 40);
        
        // Instructions
        ctx.font = "20px Arial";
        ctx.fillText("Appuyez sur R pour rejouer", this.canvas.width / 2, this.canvas.height / 2 + 80);
        ctx.fillText("Appuyez sur ESC pour retourner au menu", this.canvas.width / 2, this.canvas.height / 2 + 110);
        
        ctx.textAlign = "start";
    }
    
    play() {
        // La boucle de jeu principale
        if (this.currentState !== 'playing') return;
        
        this.movePlayer();
        this.movePlayer2OrComputer();
        this.moveBall();
        this.checkCollision();
        
        // Dessiner l'état actuel
        this.draw();
        
        // Continuer la boucle
        window.requestAnimationFrame(() => this.play());
    }
    
    // Point d'entrée principal
    start() {
        // Charger les statistiques depuis le localStorage ou le backend
        this.loadStats();
        
        // Initialiser l'interface
        this.draw();
    }
    
    loadStats() {
        // Si un API client est défini, charger depuis le backend
        if (this.apiClient) {
            this.apiClient.getPlayerStats().then(stats => {
                this.stats = stats;
            }).catch(error => {
                console.error('Error loading stats from backend:', error);
                // Fallback: charger depuis localStorage
                this.loadStatsFromLocalStorage();
            });
        } else {
            // Sinon, charger depuis localStorage
            this.loadStatsFromLocalStorage();
        }
    }
    
    loadStatsFromLocalStorage() {
        const savedStats = localStorage.getItem('pongStats');
        if (savedStats) {
            try {
                this.stats = JSON.parse(savedStats);
            } catch (e) {
                console.error('Error parsing stats from localStorage:', e);
            }
        }
    }
    
    saveStatsToLocalStorage() {
        localStorage.setItem('pongStats', JSON.stringify(this.stats));
    }
    
    updateStats(playerWon) {
        // Mise à jour des statistiques locales...
        
        // Sauvegarder sur le serveur
        if (this.apiClient) {
            const gameData = {
                player_score: this.gameData.player.score,
                computer_score: this.gameData.computer.score,
                difficulty: this.difficulty
            };
            
            console.log('Updating stats, sending to server:', gameData);
            
            this.apiClient.saveGameStats(gameData)
                .then(result => console.log('Stats saved successfully:', result))
                .catch(error => console.error('Failed to save stats:', error));
        } else {
            this.saveStatsToLocalStorage();
        }
    }
}

// Classe pour l'intégration avec l'API Django
export class PongApiClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl || '';
        this.endpoints = {
            stats: '/api/pong/stats/',
            saveGame: '/api/pong/save-game/'
        };
    }
    
    // Obtenir les headers pour les requêtes AJAX
    getHeaders() {
        // Pour Django CSRF protection
        const csrfToken = this.getCookie('csrftoken');
        return {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        };
    }
    
    // Obtenir les statistiques du joueur
    async getPlayerStats() {
        try {
            const response = await fetch(this.baseUrl + this.endpoints.stats, {
                method: 'GET',
                headers: this.getHeaders()
            });
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching player stats:', error);
            // Retourner des stats par défaut en cas d'erreur
            return {
                totalGames: 0,
                playerWins: 0,
                computerWins: 0,
                perfectPlayerGames: 0,
                recentGames: []
            };
        }
    }
    
    // Sauvegarder les statistiques d'une partie
    async saveGameStats(gameData) {
        try {
            console.log('Sending game stats to server:', gameData);
            
            // Récupérer le token CSRF
            const csrftoken = this.getCookie('csrftoken');
            if (!csrftoken) {
                console.warn('CSRF token not found');
            }
            
            const response = await fetch('/api/pong/save-stats/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken || ''
                },
                body: JSON.stringify({
                    player_score: gameData.player_score,
                    computer_score: gameData.computer_score,
                    difficulty: gameData.difficulty
                }),
                credentials: 'include'  // Important pour inclure les cookies
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server responded with error:', response.status, errorText);
                throw new Error(`Failed to save game stats: ${response.status}`);
            }

            const data = await response.json();
            console.log('Game stats saved successfully:', data);
            return data;
        } catch (error) {
            console.error('Error saving game stats:', error);
            throw error;
        }
    }
    
    // Helper pour obtenir les cookies (pour CSRF token)
    getCookie(name) {
        if (!document.cookie) {
            return null;
        }
        
        const cookies = document.cookie.split(';')
            .map(cookie => cookie.trim())
            .filter(cookie => cookie.startsWith(name + '='));
            
        if (cookies.length === 0) {
            return null;
        }
        
        return decodeURIComponent(cookies[0].split('=')[1]);
    }
}

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    // Créer l'instance du jeu
    const pongGame = new PongGame('pongCanvas');
    
    // Tenter d'initialiser l'API client
    try {
        const apiClient = new PongApiClient();
        pongGame.setApiClient(apiClient);
    } catch (e) {
        console.warn('API client initialization failed, using localStorage fallback:', e);
    }
    
    // Démarrer le jeu
    pongGame.start();
    
    // Gérer le redimensionnement de la fenêtre
    window.addEventListener('resize', () => {
        // Réajuster le canvas si nécessaire
        const canvas = document.getElementById('pongCanvas');
        if (canvas) {
            // Garder les proportions mais s'adapter au conteneur
            const container = canvas.parentElement;
            if (container) {
                const containerWidth = container.clientWidth;
                const ratio = canvas.height / canvas.width;
                
                canvas.style.width = Math.min(containerWidth, 800) + 'px';
                canvas.style.height = (Math.min(containerWidth, 800) * ratio) + 'px';
            }
        }
    });
});