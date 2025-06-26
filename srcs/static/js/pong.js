import { pongover } from "./spa.js";
// ----------------------------------------------------
// Déclaration des éléments DOM utilisés dans le script
// ----------------------------------------------------

let gameData = {
    totalGames: 0, // Nombre total de parties jouées
    totalScore: { player: 0, computer: 0 }, // Score total cumulé
    winLossRatio: { wins: 0, losses: 0 }, // Taux de victoires/défaites
    perfectGames: { player: 0, computer: 0 }, // Nombre de parties parfaites
    lastGames: [], // Historique des dernières parties
    gameStartTime: null, // Heure de début de la partie
    gameDuration: null, // Durée de la partie
};

window.pongInstanceActive = window.pongInstanceActive || false;

export function init() {
    // Empêcher les initialisations multiples
    if (window.pongInstanceActive === true) {
        console.log("Une instance de Pong est déjà active, initialisation ignorée");
        return;
    }
    window.pongInstanceActive = true;
    const firstInstruct = document.getElementById("firstInstruct");
    const secondInstruct = document.getElementById("secondInstruct");
    const menuLink = document.getElementById("menuLink");

    const menu = document.getElementById("menu");
    const menuItems = document.querySelectorAll("#menu .button");
    const playButton = document.getElementById("pButton");
    const infoButton = document.getElementById("iButton");
    const quitButton = document.getElementById("qButton")

    const infoBubble = document.getElementById("menuInfo");
    const infoItems = document.querySelectorAll("#menuInfo .button");
    const closeBubble = document.getElementById("closeBubble");
    const moreBubble = document.getElementById("moreBubble");

    const modeItems = document.querySelectorAll("#menuMode .button");
    const menuMode = document.getElementById("menuMode");
    const singleButton = document.getElementById("siButton");
    const multiButton = document.getElementById("muButton");
    const quitMButton = document.getElementById("qmButton");

    const difficultyItems = document.querySelectorAll("#menuDifficulty .button");
    const menuDifficulty = document.getElementById("menuDifficulty");
    const easyButton = document.getElementById("esButton");
    const mediumButton = document.getElementById("mdButton");
    const hardMButton = document.getElementById("hdButton");
    const quitDMButton = document.getElementById("qdButton");

    const startMenu = document.getElementById("menuStart");
    const startButton = document.getElementById("staButton");
    const quitStButton = document.getElementById("qsButton");

    const title = document.getElementById("title");
    const pong = document.getElementById("game");
    const MAX_BALL_SPEED = 6; // Vitesse maximale autorisée

    let DIFFICULTY = 1;
    let isGameOver = false;


    const PLAYER_HEIGHT = 80;
    const PLAYER_WIDTH = 4;
    const BALL_RADIUS = 5;
    const BALL_INITIAL_SPEED = 2;
    const COMPUTER_SPEED_FACTOR = 0.85;
    const PLAYER_SPEED = 5; // Vitesse de déplacement du joueur
    const COLORS = {
        background: '#262324',
        paddle: '#fcfcec',
        ball: '#fcfcec',
        line: '#fcfcec'
    };
    const winnerScore = 3;
    let currentFocus = 0;
    let bubbleFocus = 0;
    let modeFocus = 0;
    let difficultyFocus = 0;
    let canvas = document.getElementById('canvas');
    if (!canvas) {
        console.error("Canvas not found!");
        return;
    }
    let context = canvas.getContext('2d');
    let anim = null;
    let isGamming = false;
    let isUpPressed = false;
    let isDownPressed = false;

    let difficultySelect = "md";
    let gameMode = 'single'; // 'single' ou 'multi'
    let isWPressed = false;
    let isSPressed = false;
    let game = {
        player: { y: canvas.height / 2 - PLAYER_HEIGHT / 2, score: 0 },
        computer: { y: canvas.height / 2 - PLAYER_HEIGHT / 2, score: 0 },
        ball: {
            x: canvas.width / 2,
            y: canvas.height / 2,
            prevX: canvas.width / 2, // precedent emplacement
            prevY: canvas.height / 2, // precedent emplacement
            r: BALL_RADIUS,
            speed: { x: BALL_INITIAL_SPEED, y: BALL_INITIAL_SPEED },
            lastHit: null
        }
    };

    let textInterval;

    let focusIndexes = {
        menu: { value: 0 },
        bubble: { value: 0 },
        mode: { value: 0 },
        difficulty: { value: 0 }
    };

    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const direct = urlParams.get('direct');
    const player1 = urlParams.get('player1');
    const player2 = urlParams.get('player2');
    const gameId = urlParams.get('game_id');
    // Récupérer les alias s'ils sont fournis dans l'URL
    const player1_alias = urlParams.get('player1_alias') || player1;
    const player2_alias = urlParams.get('player2_alias') || player2;

    const difficulty = urlParams.get('difficulty');
    const vs_bot = urlParams.get('vs_bot') === 'true';
    const bot_name = urlParams.get('bot_name');

    const tournamentId = urlParams.get('tournament_id');
    const matchId = urlParams.get('match_id');
    const isTournamentMatch = matchId ? true : false;

    if (isTournamentMatch) {
        console.log(`Démarrage d'un match de tournoi: ID ${matchId}`);
        let tournamentMatchData = {
            tournament_id: tournamentId,
            match_id: matchId,
            timestamp: new Date().toISOString()
        };
        
        if (vs_bot) {
            // Match de tournoi contre un bot
            tournamentMatchData.vs_bot = true;
            tournamentMatchData.bot_name = bot_name;
            tournamentMatchData.player1 = player1;
            tournamentMatchData.player1_alias = player1_alias;
            tournamentMatchData.player1_position = 'left';
        } else {
            // Match de tournoi classique multijoueur
            tournamentMatchData.player1 = player1;
            tournamentMatchData.player1_alias = player1_alias;
            tournamentMatchData.player2 = player2;
            tournamentMatchData.player2_alias = player2_alias;
        }
        
        localStorage.setItem('current_tournament_match', JSON.stringify(tournamentMatchData));
    }
    
    // Mode tournoi vs bot (mode solo)
    if (vs_bot && mode === 'solo' && isTournamentMatch) {
        console.log(`Démarrage direct d'un match de tournoi contre un bot: ${bot_name}`);
        gameMode = 'single';
        
        // Définir la difficulté (si fournie, sinon medium par défaut)
        difficultySelect = difficulty || "md";
        
        // Cacher les menus et afficher le jeu
        menu.style.display = 'none';
        menuLink.style.display = 'none'; 
        menuMode.style.display = 'none';
        menuDifficulty.style.display = 'none';
        title.style.display = 'none';
        firstInstruct.style.display = 'none';
        secondInstruct.style.display = 'none';
        pong.style.display = 'block';
        
        // Initialiser le jeu avec un court délai
        setTimeout(() => {
            initializeGame();
        }, 100);
    }
    if (direct === 'true' && mode === 'multi' && player1 && player2) {
        console.log(`Démarrage direct du jeu: ${player1} vs ${player2}`);
        gameMode = 'multi';
        difficultySelect = "md"; // difficulté standard pour le multijoueur

        // Cacher les menus et afficher le jeu
        menu.style.display = 'none';
        menuLink.style.display = 'none';
        menuMode.style.display = 'none';
        menuDifficulty.style.display = 'none';
        title.style.display = 'none';
        firstInstruct.style.display = 'none';
        secondInstruct.style.display = 'none';
        pong.style.display = 'block';

        // Enregistrer les informations de jeu dans le localStorage si ce n'est pas déjà fait
        const gameInfo = {
            id: gameId || 'default',
            player1: player1,
            player2: player2,
            player1IsHost: true,  // Indiquez quel joueur est l'hôte
            timestamp: new Date().toISOString()
        };

        console.log("Enregistrement des données du jeu:", gameInfo);
        localStorage.setItem('current_game', JSON.stringify(gameInfo));

        // Initialiser le jeu avec un court délai pour s'assurer que le canvas est prêt
        setTimeout(() => {
            initializeGame();
        }, 100);
    }

    // Texte d'info pour l'info-bulle
    const infoText = "PONG is one of the most iconic video games ever created and is often considered the first commercially successful arcade game. It was developed by Ralph H Baer and Nolan Bushnell at Atari in 1972. The gameplay is a simple simulation of table tennis, where two paddles are used to hit a ball back and forth.";


    // ----------------------------------------------------
    // Fonctions pour la gestion du menu
    // ----------------------------------------------------

    /**
     * Ouvre ou ferme le menu principal
     */
    function toggleMenu() {
        menuItems[focusIndexes.menu.value].id = '';
        menuLink.style.display = 'none';
        firstInstruct.style.display = 'none';
        if (menu.style.display === "none" || menu.style.display === "") {
            currentFocus = 0;
            menu.style.display = 'block';
            menuItems[currentFocus].focus();
            if (secondInstruct.style.display === 'none')
                secondInstruct.style.display = 'block';
        }
    }
    

    /** 
     * Quit Any Menu
    */

    function selectMenu(targetMenu, actuMenu, focus, itemsMenu) {

        actuMenu.style.display = 'none';
        if ((targetMenu.style.display === 'none' || targetMenu.style.display === "") && targetMenu !== menuLink) {
            focus = 0;
            targetMenu.style.display = "block";
            itemsMenu[focus].focus();

        } else {
            targetMenu.style.display = "block";
            if (secondInstruct.style.display === 'block')
                secondInstruct.style.display = 'none';
            if (firstInstruct.style.display === 'none')
                firstInstruct.style.display = 'block';
        }
        focusIndexes.menu.value = 0;
        focusIndexes.bubble.value = 0;
        focusIndexes.difficulty.value = 0;
        focusIndexes.mode.value = 0;
    }


    function toggleInfoBubble() {
        if (infoBubble.style.display === 'none' || infoBubble.style.display === "") {
            infoBubble.style.display = 'block';
            bubbleFocus = 0;
            disableMenu();
            typeText("info1", infoText, 50);
        } else {
            infoBubble.style.display = 'none';
            enableMenu();
        }
    }

    /**
     * Désactive tous les boutons du menu
     */
    function disableMenu() {
        menuItems.forEach(button => {
            button.disabled = true;
        });
        moreBubble.focus();
    }

    /**
     * Réactive tous les boutons du menu
     */
    function enableMenu() {
        menuItems.forEach(button => {
            button.disabled = false;
        });
        infoButton.focus();
    }

    /**
     * Affiche le texte progressivement
     */
    function typeText(elementId, text, speed) {
        let i = 0;
        const element = document.getElementById(elementId);
        element.innerHTML = "";  // Effacer l'élément avant de commencer à écrire

        if (textInterval) {
            clearInterval(textInterval);
        }

        textInterval = setInterval(function () {
            element.innerHTML += text.charAt(i);
            if (text.charAt(i) === '.') {
                element.innerHTML += "<br><br>"; // Ajouter un retour à la ligne après un point
            }
            i++;
            if (i >= text.length) {
                clearInterval(textInterval);
            }
        }, speed);
    }

    function playGame() {
        if (gameMode === 'multi') {
            difficultySelect = "md";
            // Masquer TOUS les menus
            menuMode.style.display = 'none';
            menuDifficulty.style.display = 'none';
        } else {
            menuDifficulty.style.display = 'none';
        }
        menuDifficulty.style.display = 'none';
        title.style.display = 'none';
        pong.style.display = 'block';
        if (secondInstruct.style.display === 'block')
            secondInstruct.style.display = 'none';
        initializeGame();
    }

    // ----------------------------------------------------
    // Gestion des événements
    // ----------------------------------------------------

    /**
     * Ouvre/ferme le menu lorsque l'on clique sur "INSERT COIN"
     */
    function handleMenuLinkClick(event) {
        event.preventDefault();
        toggleMenu();
    }
    menuLink.addEventListener("click", handleMenuLinkClick);

    /**
     * Fermeture de l'info-bulle en cliquant sur "Close"
     */
    function handleCloseBubble() {
        enableMenu();
        infoBubble.style.display = 'none';
        infoButton.focus();

        document.getElementById("info1").innerHTML = "";

        if (textInterval) {
            clearInterval(textInterval);
        }
    };
    closeBubble.addEventListener("click", handleCloseBubble);

    function handleQuitButton() {
        selectMenu(menuLink, menu, null, null);
    }
    quitButton.addEventListener("click", handleQuitButton);

    /**
     * Ouverture de l'info-bulle en cliquant sur "INFO"
     */
    function handleInfoButton() {
        toggleInfoBubble();
    };
    infoButton.addEventListener("click", handleInfoButton);

    /**
     * Action pour "More Info"
     */
    function handleMoreBubble() {
        window.open("https://en.wikipedia.org/wiki/Pong", "_blank");
    };
    moreBubble.addEventListener("click", handleMoreBubble);

    function handleMoreBubbleFocus() {
        moreBubble.setAttribute('title', 'Opens Pong Wikipedia page in a new window.');
    };
    moreBubble.addEventListener("focus", handleMoreBubbleFocus);

    function handlePlayButton() {
        selectMenu(menuMode, menu, modeFocus, modeItems)
    }
    playButton.addEventListener("click", handlePlayButton);

    function handleSingleButton() {
        gameMode = 'single';
        updateStatsLabels();
        selectMenu(menuDifficulty, menuMode, difficultyFocus, difficultyItems)
    }
    singleButton.addEventListener("click", handleSingleButton);

    function handleQuitMButton() {
        selectMenu(menu, menuMode, currentFocus, menuItems)
    }
    quitMButton.addEventListener("click", handleQuitMButton);

    function handleMultiButton() {
        gameMode = 'multi';
        difficultySelect = "md"; // difficulté par défaut
        updateStatsLabels();
        playGame();
    };
    multiButton.addEventListener("click", handleMultiButton);

    function handleEasyButton() {
        difficultySelect = "es";
        playGame();
    }
    easyButton.addEventListener("click", handleEasyButton);

    function handleMediumButton() {
        difficultySelect = "md";
        playGame();
    }
    mediumButton.addEventListener("click", handleMediumButton);

    function handleHardMButton() {
        difficultySelect = "hd";
        playGame();
    }
    hardMButton.addEventListener("click", handleHardMButton);

    function handleQuitDMButton() {
        selectMenu(menuMode, menuDifficulty, modeFocus, modeItems)
    }
    quitDMButton.addEventListener("click", handleQuitDMButton);

    /**
     * Gestion des touches directionnelles pour naviguer dans le menu et l'info-bulle
      */
    function handleArrowNavigation(event, focusIndex, items) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            focusIndex.value = (focusIndex.value + 1) % items.length;
            items[focusIndex.value].focus();
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            focusIndex.value = (focusIndex.value - 1 + items.length) % items.length;
            items[focusIndex.value].focus();
        }
    }

    // Gestionnaire d'événements
    function handleDocumentKeydown(event) {
        if (menu.style.display === "block" && infoBubble.style.display !== "block") {
            // Navigation dans le menu
            handleArrowNavigation(event, focusIndexes.menu, menuItems);

            if (event.key === " " && menuItems[focusIndexes.menu.value].id === "pButton") {
                selectMenu(menuMode, menu, modeFocus, modeItems);
            } else if (event.key === " " && menuItems[focusIndexes.menu.value].id === "iButton") {
                toggleInfoBubble();
            } else if (event.key === " " && menuItems[focusIndexes.menu.value].id === "qButton") {
                selectMenu(menuLink, menu, null, null);
            }

        } else if (infoBubble.style.display === "block") {
            // Navigation dans l'info-bulle
            handleArrowNavigation(event, focusIndexes.bubble, infoItems);

        } else if (menuMode.style.display === "block") {
            // Navigation dans le menu des modes
            handleArrowNavigation(event, focusIndexes.mode, modeItems);

            if (event.key === " " && modeItems[focusIndexes.mode.value].id === "siButton") {
                selectMenu(menuDifficulty, menuMode, difficultyFocus, difficultyItems);
            } else if (event.key === " " && modeItems[focusIndexes.mode.value].id === "muButton") {
                gameMode = 'multi';
                difficultySelect = "md"; // Difficulté par défaut
                playGame();
            }

        } else if (menuDifficulty.style.display === "block") {
            // Navigation dans le menu de difficulté
            handleArrowNavigation(event, focusIndexes.difficulty, difficultyItems);

            if (event.key === " " && ["esButton", "mdButton", "hdButton"].includes(difficultyItems[focusIndexes.difficulty.value].id)) {
                if (difficultyItems[focusIndexes.difficulty.value].id === "esButton") {
                    difficultySelect = "es";
                } else if (difficultyItems[focusIndexes.difficulty.value].id === "mdButton") {
                    difficultySelect = "md";
                } else if (difficultyItems[focusIndexes.difficulty.value].id === "hdButton") {
                    difficultySelect = "hd";
                }
                playGame();
            } else if (event.key === " " && difficultyItems[focusIndexes.difficulty.value].id === "qdButton") {
                selectMenu(menuMode, menuDifficulty, modeFocus, modeItems);
            }

        } else if (pong.style.display === 'block') {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                // Placeholder for pong-specific logic
            }
        } else {
            title.style.display = 'block';
            pong.style.display = 'none';
            stop();
            toggleMenu();
        }
    };
    document.addEventListener("keydown", handleDocumentKeydown);


    /**
     * PONG
    */

    'use strict';

    // Configuration des constantes


    // Initialisation du jeu
    let gameInitialized = false;

    function initializeGame() {
        // Vérifier si un jeu est déjà initialisé
        if (gameInitialized) {
            console.log("Un jeu est déjà en cours, initialisation ignorée");
            return;
        }

        gameInitialized = true;
        gameData.gameStartTime = Date.now();

        // Configuration de la difficulté
        if (difficultySelect === "es") {
            DIFFICULTY = 1; // Facile
        } else if (difficultySelect === "md") {
            DIFFICULTY = 2; // Moyen
        } else {
            DIFFICULTY = 3; // Difficile
        }

        game = {
            player: { y: canvas.height / 2 - PLAYER_HEIGHT / 2, score: 0 },
            computer: { y: canvas.height / 2 - PLAYER_HEIGHT / 2, score: 0 },
            ball: {
                x: canvas.width / 2,
                y: canvas.height / 2,
                prevX: canvas.width / 2,
                prevY: canvas.height / 2,
                r: BALL_RADIUS,
                speed: { x: BALL_INITIAL_SPEED * DIFFICULTY, y: BALL_INITIAL_SPEED * DIFFICULTY },
                lastHit: null
            }
        };

        isGameOver = false;
        isGamming = true;

        window.addEventListener('keydown', keyDownHandler);
        window.addEventListener('keyup', keyUpHandler);

        play();
    }

    // Gestion des événements clavier
    function keyDownHandler(event) {
        switch (event.key) {
            case 'w': isUpPressed = true; break; // Joueur 1
            case 's': isDownPressed = true; break; // Joueur 1
            case 'ArrowUp': isWPressed = true; break; // Joueur 2
            case 'ArrowDown': isSPressed = true; break; // Joueur 2
        }
    }

    function keyUpHandler(event) {
        switch (event.key) {
            case 'w': isUpPressed = false; break;
            case 's': isDownPressed = false; break;
            case 'ArrowUp': isWPressed = false; break;
            case 'ArrowDown': isSPressed = false; break;
        }
    }
    // Déplacement de l'ordinateur
    function computerMoveEsMd() {
        const SPEED = 5;
    const ball = game.ball;

    // Ne pas réagir à chaque frame pour simuler un temps de réaction humain
    // Plus la difficulté est faible, moins souvent l'IA réagit
    if (Math.random() > (difficultySelect === "es" ? 0.4 : 0.7)) {
        return; // Sauter certaines frames pour simuler un temps de réaction
    }

    // Ajouter une erreur aléatoire à la position cible
    // L'erreur est plus grande en mode facile qu'en mode moyen
    const errorRange = difficultySelect === "es" ? 50 : 20; 
    const randomError = (Math.random() * errorRange * 2) - errorRange;

    // Position cible approximative avec erreur
    const targetY = ball.y - PLAYER_HEIGHT / 2 + randomError;
    
    // Parfois, anticipation incorrecte de la direction de la balle
    // en mode facile uniquement
    const incorrectAnticipation = difficultySelect === "es" && Math.random() > 0.7;
    const diff = incorrectAnticipation 
        ? -1 * (targetY - game.computer.y) // Mouvement dans la direction opposée
        : targetY - game.computer.y;

    // Mouvement avec vitesse constante de 5 mais direction potentiellement erronée
    game.computer.y += Math.sign(diff) * Math.min(Math.abs(diff), SPEED);

    // Assurer que le paddle reste dans les limites du canvas
    game.computer.y = Math.min(
        Math.max(0, game.computer.y),
        canvas.height - PLAYER_HEIGHT
    );
    }

    function computerMoveHard() {
        const SPEED = 5; // La vitesse augmente avec la difficulté

        let predictedY = game.ball.y + (game.ball.speed.y * (canvas.width - game.ball.x)) / game.ball.speed.x;

        while (predictedY < 0 || predictedY > canvas.height) {
            if (predictedY < 0) {
                predictedY = -predictedY;
            } else if (predictedY > canvas.height) {
                predictedY = canvas.height - (predictedY - canvas.height);
            }
        }

        const diff = predictedY - game.computer.y - PLAYER_HEIGHT / 2;

        game.computer.y += Math.sign(diff) * Math.min(Math.abs(diff), SPEED);
        game.computer.y = Math.min(Math.max(0, game.computer.y), canvas.height - PLAYER_HEIGHT);
    }

    // Fonction principale de la boucle de jeu
    function play() {
        if (isGameOver) return;

        movePlayer();
        draw();

        // Désactiver l'IA en multijoueur
        if (gameMode === 'single') {
            if (difficultySelect === "hd") {
                computerMoveHard();
            } else {
                computerMoveEsMd();
            }
        }

        ballMove();
        anim = requestAnimationFrame(play);
    }


    // Déplacement du joueur
    function movePlayer() {
        // Joueur 1 (W/S)
        if (isUpPressed) {
            game.player.y = Math.max(0, game.player.y - PLAYER_SPEED);
        }
        if (isDownPressed) {
            game.player.y = Math.min(canvas.height - PLAYER_HEIGHT, game.player.y + PLAYER_SPEED);
        }

        // Joueur 2 (Flèches Haut/Bas) uniquement en multijoueur
        if (gameMode === 'multi') {
            if (isWPressed) {
                game.computer.y = Math.max(0, game.computer.y - PLAYER_SPEED);
            }
            if (isSPressed) {
                game.computer.y = Math.min(canvas.height - PLAYER_HEIGHT, game.computer.y + PLAYER_SPEED);
            }
        }
    }

    // Dessiner le score
    function drawScore() {
        context.font = '40px "Press Start 2P"';
        context.fillStyle = COLORS.line;
        context.textAlign = 'center';

        context.fillText(game.player.score, canvas.width / 2 - 50, 50);
        context.fillText(game.computer.score, canvas.width / 2 + 50, 50);
    }

    // Remplacer la fonction drawWinningMessage par celle-ci:

    function drawWinningMessage(winner) {
        // Effacer l'écran pour l'écran de fin
        context.fillStyle = COLORS.background;
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Variable pour stocker le message final
        let displayMessage = winner;

        try {
            // Vérifier d'abord si c'est un match de tournoi
            const tournamentMatch = localStorage.getItem('current_tournament_match') ?
                JSON.parse(localStorage.getItem('current_tournament_match')) : null;
        
            if (tournamentMatch) {
                console.log("Affichage du message de victoire pour un match de tournoi:", tournamentMatch);
                console.log("Message original:", winner);
        
                // Déterminer le gagnant basé sur le score actuel
                const isPlayer1Winner = game.player.score > game.computer.score;
        
                if (tournamentMatch.vs_bot) {
                    // Dans les matchs contre un bot
                    displayMessage = isPlayer1Winner 
                        ? `${tournamentMatch.player1_alias || tournamentMatch.player1} gagne !` 
                        : `${tournamentMatch.bot_name} gagne !`;
                    console.log(`Score final - Joueur: ${game.player.score}, Bot: ${game.computer.score}`);
                    console.log(`Vainqueur déterminé: ${isPlayer1Winner ? 'Joueur humain' : 'Bot'}`);
                } else {
                    // Dans les matchs entre humains
                    displayMessage = isPlayer1Winner
                        ? `${tournamentMatch.player1_alias || tournamentMatch.player1} gagne !`
                        : `${tournamentMatch.player2_alias || tournamentMatch.player2} gagne !`;
                }
            }
            // Si ce n'est pas un match de tournoi, vérifier si c'est un match multijoueur standard
            else {
                // Récupérer les informations de la partie depuis localStorage
                const currentGame = localStorage.getItem('current_game') ?
                    JSON.parse(localStorage.getItem('current_game')) : null;
        
                if (currentGame && gameMode === 'multi') {
                    console.log("Affichage du message de victoire avec données:", currentGame);
                    console.log("Message original:", winner);
        
                    // Vérification explicite des différentes possibilités de messages
                    if (typeof winner === 'string') {
                        // Si le winner contient déjà le nom du joueur + "gagne !", on le garde tel quel
                        if ((winner.includes(currentGame.player1) || winner.includes(currentGame.player2))
                            && winner.includes("gagne")) {
                            displayMessage = winner;
                        }
                        // Sinon, on traduit les messages génériques
                        else if (winner.includes("Le joueur") || winner.includes("Player 1")) {
                            displayMessage = `${currentGame.player1} gagne !`;
                        }
                        else if (winner.includes("L'ordinateur") || winner.includes("Player 2")) {
                            displayMessage = `${currentGame.player2} gagne !`;
                        }
                        // Si aucune condition n'est remplie, on garde le message original
                    }
                }
            }

            console.log("Message final affiché:", displayMessage);
        } catch (e) {
            console.error("Erreur lors du traitement du message gagnant:", e);
            // En cas d'erreur, utiliser le message original
        }

        // Définir le style du texte et afficher le message
        context.font = '25px "Press Start 2P"';
        context.fillStyle = COLORS.line;
        context.textAlign = 'center';
        context.fillText(displayMessage, canvas.width / 2, canvas.height / 2);

        // Instructions de fin de partie
        context.font = '15px "Press Start 2P"';
        context.fillText("Appuyez sur 'b' pour rejouer", canvas.width / 2, canvas.height / 2 + 50);
        context.fillText("Appuyez sur 'q' pour quitter", canvas.width / 2, canvas.height / 2 + 80);
    }

    // Dessiner la scène
    function draw() {
        context.fillStyle = COLORS.background;
        context.fillRect(0, 0, canvas.width, canvas.height);
    
        drawMiddleLine();
        drawPaddle(10, game.player.y);
        drawPaddle(canvas.width - PLAYER_WIDTH - 10, game.computer.y);
        drawBall();
        drawScore();
        
        // Ajout: Afficher les noms des joueurs
        drawPlayerNames();
    }

    function drawPlayerNames() {
        context.font = '16px "Press Start 2P"';
        context.fillStyle = COLORS.line;
        context.textAlign = 'center';
        
        // Déterminer les noms à afficher
        let player1Name = "Joueur";
        let player2Name = "Ordinateur";
        
        // Pour les matchs de tournoi
        const tournamentMatch = localStorage.getItem('current_tournament_match') ?
            JSON.parse(localStorage.getItem('current_tournament_match')) : null;
            
        if (tournamentMatch) {
            if (tournamentMatch.vs_bot) {
                // Dans les matchs contre un bot, le bot est TOUJOURS le joueur 2 (à droite)
                player1Name = tournamentMatch.player1_alias || tournamentMatch.player1 || "Joueur";
                player2Name = tournamentMatch.bot_name || "Bot";
            } else {
                // Dans les matchs entre humains
                player1Name = tournamentMatch.player1_alias || tournamentMatch.player1 || "Joueur 1";
                player2Name = tournamentMatch.player2_alias || tournamentMatch.player2 || "Joueur 2";
            }
        } 
        // Pour les matchs normaux multi
        else if (gameMode === 'multi') {
            const currentGame = localStorage.getItem('current_game') ?
                JSON.parse(localStorage.getItem('current_game')) : null;
                
            if (currentGame) {
                player1Name = currentGame.player1 || "Joueur 1";
                player2Name = currentGame.player2 || "Joueur 2";
            }
        }
        
        // Afficher les noms
        context.fillText(player1Name, canvas.width / 4, 30);
        context.fillText(player2Name, canvas.width * 3 / 4, 30);
    }

    function drawMiddleLine() {
        context.strokeStyle = COLORS.line;
        context.beginPath();
        context.moveTo(canvas.width / 2, 0);
        context.lineTo(canvas.width / 2, canvas.height);
        context.setLineDash([10, 5]);
        context.lineWidth = 5;
        context.stroke();
    }

    function drawPaddle(x, y) {
        context.fillStyle = COLORS.paddle;
        context.fillRect(x, y, PLAYER_WIDTH, PLAYER_HEIGHT);
    }

    function drawBall() {
        const { x, y, r } = game.ball;
        context.beginPath();
        context.fillStyle = COLORS.ball;
        context.arc(x, y, r, 0, Math.PI * 2);
        context.fill();
    }

    // Déplacement de la balle
    function ballMove() {
        const ball = game.ball;

        // Sauvegarder la position précédente
        ball.prevX = ball.x;
        ball.prevY = ball.y;

        // Déplacer la balle
        ball.x += ball.speed.x;
        ball.y += ball.speed.y;

        // Collisions avec les murs
        if (ball.y <= 0 || ball.y >= canvas.height) {
            ball.speed.y *= -1;
        }

        // Vérifier les collisions avec les paddles
        if (ball.x >= canvas.width - PLAYER_WIDTH - 10) {
            collide(game.computer);
        } else if (ball.x <= PLAYER_WIDTH + 10) {
            collide(game.player);
        }
    }

    function collide(player) {
        const ball = game.ball;
        const isPlayerPaddle = player === game.player;
        const paddleX = isPlayerPaddle ? 10 : canvas.width - PLAYER_WIDTH - 10;
        const paddleEdgeX = isPlayerPaddle ? paddleX + PLAYER_WIDTH : paddleX;

        // Vérifier si la balle a traversé le paddle pendant ce déplacement
        const prevX = ball.prevX;
        const currentX = ball.x;

        if ((prevX < paddleEdgeX && currentX >= paddleEdgeX) ||
            (prevX > paddleEdgeX && currentX <= paddleEdgeX)) {

            // Calculer le moment de la collision
            const dx = currentX - prevX;
            const dt = (paddleEdgeX - prevX) / dx;

            // Position Y au moment de la collision
            const yAtCollision = ball.prevY + ball.speed.y * dt;

            if (yAtCollision >= player.y && yAtCollision <= player.y + PLAYER_HEIGHT) {
                // Collision réussie
                ball.speed.x *= -1.2;

                // Appliquer la limite de vitesse
                ball.speed.x = Math.sign(ball.speed.x) * Math.min(Math.abs(ball.speed.x), MAX_BALL_SPEED);
                ball.speed.y = Math.sign(ball.speed.y) * Math.min(Math.abs(ball.speed.y), MAX_BALL_SPEED);

                // Ajuster la direction en fonction du point d'impact
                const hitPosition = (yAtCollision - player.y) / PLAYER_HEIGHT;
                const angle = hitPosition * Math.PI / 2;
                ball.speed.y = Math.sin(angle) * (5 * DIFFICULTY / 2);

                // Corriger la position pour éviter le chevauchement
                ball.x = paddleEdgeX;
                ball.y = yAtCollision;
            } else {
                // Manqué le paddle
                if (isPlayerPaddle) {
                    game.computer.score++;
                    gameData.totalScore.computer++;
                } else {
                    game.player.score++;
                    gameData.totalScore.player++;
                }
                displayGameData();
                resetBall();
                if (game.computer.score === winnerScore || game.player.score === winnerScore) {
                    let winner;

                    const currentGame = localStorage.getItem('current_game') ?
                        JSON.parse(localStorage.getItem('current_game')) : null;

                    if (game.player.score === winnerScore) {
                        winner = gameMode === 'multi' && currentGame ?
                            `${currentGame.player1} gagne !` : "Le joueur gagne !";
                    } else {
                        winner = gameMode === 'multi' && currentGame ?
                            `${currentGame.player2} gagne !` : "L'ordinateur gagne !";
                    }

                    cancelAnimationFrame(anim);
                    drawWinningMessage(winner);
                    endGame(winner);
                }
            }
        }
    }

    // Fonction pour arrêter le jeu
    function endGame(winner) {
        // Vérification stricte pour éviter les appels multiples
        if (isGameOver) {
            console.log("La partie est déjà terminée, endGame ignoré");
            return;
        }

        console.log("Fin de partie déclenchée avec winner:", winner);
        isGameOver = true; // Marquer le jeu comme terminé immédiatement

        // Arrêter l'animation et les écouteurs d'événements
        cancelAnimationFrame(anim);
        window.removeEventListener('keydown', keyDownHandler);
        window.removeEventListener('keyup', keyUpHandler);

        // Calculer la durée
        const endTime = Date.now();
        gameData.gameDuration = (endTime - gameData.gameStartTime) / 1000; // Durée en secondes

        const tournamentMatch = localStorage.getItem('current_tournament_match') ?
        JSON.parse(localStorage.getItem('current_tournament_match')) : null;

        // Récupérer les données du jeu
        const currentGameData = localStorage.getItem('current_game') ?
            JSON.parse(localStorage.getItem('current_game')) : null;

        let winnerName;
        let displayMessage;

        if (tournamentMatch) {
            // Déterminer le gagnant basé sur le score
            const isPlayer1Winner = game.player.score > game.computer.score;
            // ERREUR: les deux branches de la condition utilisent player1_alias
            // winnerName = isPlayer1Winner ? tournamentMatch.player1_alias : tournamentMatch.player1_alias;
            
            // Correction: utiliser le bon nom pour chaque cas
            if (tournamentMatch.vs_bot) {
                // Dans les matchs contre un bot
                winnerName = isPlayer1Winner ? tournamentMatch.player1_alias : tournamentMatch.bot_name;
            } else {
                // Dans les matchs entre humains
                winnerName = isPlayer1Winner ? tournamentMatch.player1_alias : tournamentMatch.player2_alias;
            }
            displayMessage = `${winnerName} gagne !`;
            
            console.log("Match de tournoi terminé - Gagnant:", winnerName);
            
            // Enregistrer et afficher le résultat
            recordGameData(winnerName);
            drawWinningMessage(displayMessage);
            
            // Afficher un message supplémentaire pour indiquer que c'est un match de tournoi
            context.font = '12px "Press Start 2P"';
            context.fillText("Match de tournoi - Redirection automatique...", canvas.width / 2, canvas.height / 2 + 120);
        }
        else if (gameMode === 'multi' && currentGameData) {
            console.log("Données du jeu multijoueur:", currentGameData);

            // Déterminer le gagnant basé sur le score réel
            const isPlayer1Winner = game.player.score > game.computer.score;

            // Déterminer le nom du gagnant pour l'enregistrement
            winnerName = isPlayer1Winner ? currentGameData.player1 : currentGameData.player2;

            // Message à afficher
            displayMessage = `${winnerName} gagne !`;

            console.log("Gagnant déterminé:", winnerName);
            console.log("Message à afficher:", displayMessage);

            // Enregistrer les données et afficher le message
            recordGameData(winnerName);
            drawWinningMessage(displayMessage);
        } else {
            // Mode solo
            winnerName = game.player.score > game.computer.score ? "Joueur" : "Ordinateur";
            displayMessage = game.player.score > game.computer.score ? "Le joueur gagne !" : "L'ordinateur gagne !";
            recordGameData(winnerName);
            drawWinningMessage(displayMessage);
        }

        // Afficher les statistiques
        displayGameData();

        // Ajouter l'écouteur pour les touches de redémarrage/quitter
        window.addEventListener('keydown', handleWindowKeydown);
    }

    function displayGameData() {
        if (pongover === true) return;
        
        document.getElementById("totalGames").textContent = gameData.totalGames;
        document.getElementById("totalPlayerScore").textContent = gameData.totalScore.player;
        document.getElementById("totalComputerScore").textContent = gameData.totalScore.computer;

        const totalWins = gameData.winLossRatio.wins;
        const winRatio = gameData.totalGames > 0
            ? ((totalWins / gameData.totalGames) * 100).toFixed(2)
            : 0;
        document.getElementById("winRatio").textContent = `${winRatio}%`;

        document.getElementById("perfectPlayer").textContent = gameData.perfectGames.player;
        document.getElementById("perfectComputer").textContent = gameMode === 'multi'
            ? gameData.perfectGames.computer
            : gameData.perfectGames.computer;

        const lastGamesList = document.getElementById("lastGames");
        lastGamesList.innerHTML = ""; // Effacer la liste précédente

        gameData.lastGames.forEach(game => {
            const li = document.createElement("li");
            
            // Ajout d'un badge pour les matches de tournoi
            let tournamentBadge = game.isTournament ? ' - 🏆 Tournoi' : '';
            
            li.textContent = `${game.winner} a gagné (${game.score.player}-${game.score.computer}) - ${game.duration.toFixed(2)}s${tournamentBadge}`;
            
            if (game.isPerfect) {
                li.textContent += " - Parfait ! 🏆🏆";
            }
            
            lastGamesList.appendChild(li);
        });
    }

    function updateStatsLabels() {
        if (pongover === true) return;
        if (gameMode === 'multi') {
            document.getElementById('playerLabel').textContent = 'Joueur 1 :';
            document.getElementById('opponentLabel').textContent = 'Joueur 2 :';
            document.getElementById('perfectPlayerLabel').textContent = 'Joueur 1 :';
            document.getElementById('perfectOpponentLabel').textContent = 'Joueur 2 :';
        } else {
            document.getElementById('playerLabel').textContent = 'Joueur :';
            document.getElementById('opponentLabel').textContent = 'Ordinateur :';
            document.getElementById('perfectPlayerLabel').textContent = 'Joueur :';
            document.getElementById('perfectOpponentLabel').textContent = 'Ordinateur :';
        }
    }

    function recordGameData(winner) {
        console.log("====== DÉBUT RECORD GAME DATA ======");
        console.log("Winner reçu:", winner);
        console.log("Mode de jeu:", gameMode);
        console.log("Difficulté:", difficultySelect);
        console.log("Scores actuels - Joueur:", game.player.score, "Ordinateur/J2:", game.computer.score);

        // Calculer la durée de la partie
        const endTime = Date.now();
        gameData.gameDuration = (endTime - gameData.gameStartTime) / 1000; // Durée en secondes
        console.log("Durée de la partie:", gameData.gameDuration, "secondes");

        // Récupérer les vrais noms d'utilisateurs
        let winnerName = winner;
        let player1Name = "Joueur";
        let player2Name = "Ordinateur";

        const currentGame = localStorage.getItem('current_game') ?
            JSON.parse(localStorage.getItem('current_game')) : null;
        console.log("Données currentGame:", currentGame);

        if (currentGame && gameMode === 'multi') {
            player1Name = currentGame.player1 || "Joueur 1";
            player2Name = currentGame.player2 || "Joueur 2";

            if (winner === "Player 1") {
                winnerName = player1Name;
            } else if (winner === "Player 2") {
                winnerName = player2Name;
            }
        }

        // Le reste de la fonction reste inchangé...
        gameData.totalGames++;

        // Mettre à jour le taux de victoires/défaites
        if (gameMode === 'multi') {
            console.log("Appel saveGameStats en mode multi avec:", winnerName);
            saveGameStats(winnerName);
        } else {
            const statsData = {
                player_score: game.player.score,
                computer_score: game.computer.score,
                difficulty: difficultySelect,
                game_duration: gameData.gameDuration
            };
            console.log("Appel saveGameStats en mode solo avec:", statsData);
            saveGameStats(statsData);
        }
        console.log("====== FIN RECORD GAME DATA ======");
        // Ajouter cette partie à l'historique des dernières parties
        const gameResult = {
            winner: winnerName, // Utiliser le vrai nom du gagnant
            score: { player: game.player.score, computer: game.computer.score },
            duration: gameData.gameDuration,
            isPerfect: (game.player.score > 0 && game.computer.score === 0) || (game.computer.score > 0 && game.player.score === 0),
        };
        gameData.lastGames.unshift(gameResult); // Ajouter au début de la liste

        // Limiter l'historique à 5 parties
        if (gameData.lastGames.length > 5) {
            gameData.lastGames.pop();
        }

        // Afficher les données mises à jour
        if (pongover === true) return;
        displayGameData();
    }

    function resetBall() {
        const { ball, player, computer } = game;
        ball.x = canvas.width / 2;
        ball.y = canvas.height / 2;
        ball.speed.x = BALL_INITIAL_SPEED * DIFFICULTY * (Math.random() > 0.5 ? 1 : -1);
        ball.speed.y = BALL_INITIAL_SPEED * DIFFICULTY * (Math.random() > 0.5 ? 1 : -1);
        player.y = canvas.height / 2 - PLAYER_HEIGHT / 2;
        computer.y = canvas.height / 2 - PLAYER_HEIGHT / 2;
    }

    function saveGameStats(winner) {
        try {
            console.log("====== DÉBUT SAVE GAME STATS ======");
            
            // Récupérer les scores finaux
            const player1_score = game.player.score;
            const player2_score = game.computer.score;
            
            console.log(`Scores actuels - Joueur 1: ${player1_score}, Joueur 2: ${player2_score}`);
            
            // Vérifier si c'est un match de tournoi
            const currentTournamentMatch = localStorage.getItem('current_tournament_match') ?
                JSON.parse(localStorage.getItem('current_tournament_match')) : null;
                
            if (currentTournamentMatch) {
                console.log('Match de tournoi détecté, ID:', currentTournamentMatch.match_id);
                
                // Préparer les données à envoyer
                const dataToSend = {
                    match_id: currentTournamentMatch.match_id,
                    tournament_id: currentTournamentMatch.tournament_id,
                    player1_score: player1_score,
                    player2_score: player2_score,
                    duration: gameData.gameDuration || 0
                };
                
                // Si c'est un match contre un bot, ajouter cette info
                if (currentTournamentMatch.vs_bot) {
                    console.log('Match vs bot détecté:', currentTournamentMatch.bot_name);
                    dataToSend.vs_bot = true;
                    dataToSend.bot_name = currentTournamentMatch.bot_name;
                    dataToSend.player1 = currentTournamentMatch.player1;
                    
                    // Dans un match vs bot, le bot est TOUJOURS le joueur 2 (à droite)
                    const humanPlayer = currentTournamentMatch.player1;
                    const botPlayer = currentTournamentMatch.bot_name;
                    
                    // Déterminer le gagnant en fonction des scores
                    if (player1_score > player2_score) {
                        dataToSend.winner = humanPlayer;  // Le joueur humain gagne
                    } else {
                        dataToSend.winner = botPlayer;    // Le bot gagne
                    }
                    
                    // Pour les matchs contre un bot, inverser les scores pour l'affichage
                    // car le bot est toujours le joueur 2 (à droite)
                    const gameResult = {
                        winner: dataToSend.winner,
                        score: { 
                            player: player2_score,  // Score du bot
                            computer: player1_score // Score du joueur humain
                        },
                        duration: gameData.gameDuration,
                        isPerfect: (player2_score > 0 && player1_score === 0) || 
                                (player1_score > 0 && player2_score === 0),
                        isTournament: true,
                        tournamentId: currentTournamentMatch.tournament_id
                    };
                    
                    console.log(`Scores - Humain: ${player1_score}, Bot: ${player2_score}`);
                    console.log(`Gagnant déterminé: ${dataToSend.winner}`);
                    console.log('Résultat du jeu:', gameResult);
                    
                    // Ajouter au début de la liste
                    gameData.lastGames.unshift(gameResult);
                    
                    // Limiter l'historique à 5 parties
                    if (gameData.lastGames.length > 5) {
                        gameData.lastGames.pop();
                    }
                } else {
                    // Match humain vs humain
                    const isPlayer1Winner = player1_score > player2_score;
                    dataToSend.winner = isPlayer1Winner ? currentTournamentMatch.player1 : currentTournamentMatch.player2;
                    console.log(`Gagnant déterminé: ${dataToSend.winner} (joueur1: ${currentTournamentMatch.player1}, joueur2: ${currentTournamentMatch.player2})`);
                    
                    const gameResult = {
                        winner: dataToSend.winner,
                        score: { 
                            player: player1_score, 
                            computer: player2_score 
                        },
                        duration: gameData.gameDuration,
                        isPerfect: (player1_score > 0 && player2_score === 0) || 
                                (player2_score > 0 && player1_score === 0),
                        isTournament: true,
                        tournamentId: currentTournamentMatch.tournament_id
                    };
                    
                    // Ajouter au début de la liste
                    gameData.lastGames.unshift(gameResult);
                    
                    // Limiter l'historique à 5 parties
                    if (gameData.lastGames.length > 5) {
                        gameData.lastGames.pop();
                    }
                }
                
                console.log('Envoi des statistiques du match de tournoi:', dataToSend);
                
                fetch('/api/tournament-matches/save-result/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken')
                    },
                    body: JSON.stringify(dataToSend)
                })
                .then(response => {
                    if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
                    return response.json();
                })
                .then(data => {
                    console.log('Résultat du match de tournoi enregistré avec succès:', data);
                    
                    // Récupérer le nom du gagnant
                    const winnerName = dataToSend.winner;
                    
                    // Ajouter le match à l'historique des parties
                    const gameResult = {
                        winner: winnerName,
                        score: { 
                            player: player1_score, 
                            computer: player2_score 
                        },
                        duration: gameData.gameDuration,
                        isPerfect: (player1_score > 0 && player2_score === 0) || 
                                (player2_score > 0 && player1_score === 0),
                        isTournament: true,
                        tournamentId: currentTournamentMatch.tournament_id
                    };
                    
                    // Ajouter au début de la liste
                    gameData.lastGames.unshift(gameResult);
                    
                    // Limiter l'historique à 5 parties
                    if (gameData.lastGames.length > 5) {
                        gameData.lastGames.pop();
                    }
                    
                    // Mettre à jour l'affichage des statistiques si le jeu est visible
                    if (!pongover) {
                        displayGameData();
                    }
                    
                    // Nettoyage du localStorage
                    localStorage.removeItem('current_tournament_match');
                    
                    // Afficher une notification avec le gagnant et le score correct (plus élevé d'abord)
                    const winnerScore = Math.max(player1_score, player2_score);
                    const loserScore = Math.min(player1_score, player2_score);
                    alert(`Match de tournoi terminé ! ${winnerName} remporte la victoire avec un score de ${winnerScore}-${loserScore}.`);
                    
                    // Rediriger vers la page du tournoi après un délai
                    setTimeout(() => {
                        window.location.href = `/tournament/${currentTournamentMatch.tournament_id}`;
                    }, 2000);
                })
                .catch(error => {
                    console.error('Erreur lors de l\'enregistrement du match de tournoi:', error);
                    alert('Erreur lors de l\'enregistrement du match. Veuillez réessayer.');
                });
                
                return; // Sortir de la fonction après avoir traité le match de tournoi
            }
            
            // Traitement pour les matchs normaux (non-tournoi)
            const currentGame = localStorage.getItem('current_game') ?
                JSON.parse(localStorage.getItem('current_game')) : null;
            
            // Déterminer le type de données à envoyer selon le mode de jeu
            let dataToSend = {};
            
            if (typeof winner === 'object' && winner !== null) {
                // Mode solo avec objet de statistiques
                console.log('Mode solo détecté avec données structurées:', winner);
                
                dataToSend = {
                    player_score: winner.player_score || player1_score,
                    computer_score: winner.computer_score || player2_score,
                    difficulty: winner.difficulty || difficultySelect,
                    duration: winner.game_duration || gameData.gameDuration || 0,
                    is_perfect: (winner.player_score > 0 && winner.computer_score === 0),
                    game_mode: 'solo',
                    vs_ai: true
                };
            } else if (gameMode === 'multi' && currentGame) {
                // Mode multijoueur
                console.log('Mode multijoueur détecté, winner:', winner);
                
                // Déterminer si le joueur local est l'hôte
                const isHost = currentGame.player1IsHost === true;
                
                // Attribution des scores selon la perspective
                let p1_score = isHost ? player1_score : player2_score;
                let p2_score = isHost ? player2_score : player1_score;
                
                // Déterminer le nom réel du gagnant
                let winnerName;
                if (typeof winner === 'string') {
                    winnerName = winner; // Utiliser le nom passé
                } else {
                    // Déterminer selon les scores
                    const isPlayer1Winner = p1_score > p2_score;
                    winnerName = isPlayer1Winner ? currentGame.player1 : currentGame.player2;
                }
                
                dataToSend = {
                    game_id: currentGame.id,
                    player1: currentGame.player1,
                    player2: currentGame.player2,
                    player1_score: p1_score,
                    player2_score: p2_score,
                    winner: winnerName,
                    duration: gameData.gameDuration || 0,
                    is_perfect: (p1_score > 0 && p2_score === 0) || 
                                (p2_score > 0 && p1_score === 0),
                    current_player: isHost ? currentGame.player1 : currentGame.player2,
                    is_host: isHost,
                    both_players: true
                };
            } else {
                // Mode solo standard
                console.log('Mode solo standard, winner:', winner);
                
                dataToSend = {
                    player_score: player1_score,
                    computer_score: player2_score,
                    difficulty: difficultySelect,
                    duration: gameData.gameDuration || 0,
                    is_perfect: player1_score > 0 && player2_score === 0,
                    game_mode: 'solo',
                    vs_ai: true
                };
            }
            
            console.log('Données prêtes à être envoyées:', dataToSend);
            
            // Envoyer les statistiques au serveur pour les matchs non-tournoi
            fetch('/api/pong/save-stats/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify(dataToSend)
            })
            .then(response => {
                if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
                return response.json();
            })
            .then(data => {
                console.log('Statistiques enregistrées avec succès:', data);
                
                // Nettoyer le localStorage pour les matchs multijoueur
                if (gameMode === 'multi' && currentGame) {
                    localStorage.removeItem('current_game');
                }
            })
            .catch(error => {
                console.error('Erreur lors de l\'enregistrement des statistiques:', error);
            });
            
            console.log("====== FIN SAVE GAME STATS ======");
            
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des statistiques:', error);
        }
    }

    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    // Réinitialisation du jeu avec la touche 'b'
    // ----------------------------------------------------
    // Gestion des événements globaux
    // ----------------------------------------------------
    function handleWindowKeydown(event) {
        if (isGameOver) {
            // Vérifier si c'est un match de tournoi
            const tournamentMatch = localStorage.getItem('current_tournament_match');
            
            if (tournamentMatch) {
                const matchData = JSON.parse(tournamentMatch);
                console.log("Match de tournoi terminé, redirection automatique...");
                
                // Rediriger automatiquement après 3 secondes
                setTimeout(() => {
                    window.location.href = `/tournament/${matchData.tournament_id}`;
                }, 3000);
                
                return;
            }
            
            // Code existant pour les matchs normaux
            if (event.key === 'b') {
                // Réinitialiser la variable avant de redémarrer
                gameInitialized = false;
                initializeGame();
            } else if (event.key === 'q') {
                // Réinitialiser la variable avant de quitter
                gameInitialized = false;
                gameMode = 'single'; // Réinitialiser le mode
                updateStatsLabels();
                selectMenu(menu, pong, currentFocus, menuItems);
                title.style.display = 'block'; // Affiche le titre
                isGameOver = false; // Réinitialiser l'état du jeu
            }
        }
    }
    window.addEventListener('keydown', handleWindowKeydown);

    updateStatsLabels();
}

export function stopPong() {
    console.log("Arrêt de Pong");
    
    // Vérifier si l'animation est active et l'arrêter
    if (anim) {
        cancelAnimationFrame(anim);
        anim = null;
    }
    
    // Supprimer les écouteurs d'événements
    window.removeEventListener('keydown', keyDownHandler);
    window.removeEventListener('keyup', keyUpHandler);
    window.removeEventListener('keydown', handleWindowKeydown);
    
    // Réinitialiser l'état du jeu
    gameInitialized = false;
    isGameOver = false;
    
    // Nettoyer le localStorage si nécessaire
    const tournamentMatch = localStorage.getItem('current_tournament_match');
    if (tournamentMatch) {
        console.log("Nettoyage des données de match de tournoi");
        localStorage.removeItem('current_tournament_match');
    }
    
    console.log("Pong arrêté avec succès");
}