// menu.js - Gestion du menu de Pong

export class PongMenu {
    constructor(menuId, startButtonId) {
        this.menu = document.getElementById(menuId);
        this.startButton = document.getElementById(startButtonId);
        
        if (!this.menu || !this.startButton) {
            console.error("Menu elements not found!");
            return;
        }
        
        this.bindEvents();
    }

    bindEvents() {
        this.startButton.addEventListener("click", () => this.startGame());
        document.addEventListener("keydown", (event) => this.handleKeyPress(event));
    }

    handleKeyPress(event) {
        if (event.key === "Enter") {
            this.startGame();
        }
    }

    startGame() {
        this.menu.style.display = "none";
        document.dispatchEvent(new CustomEvent("game:start"));
    }

    showMenu() {
        this.menu.style.display = "block";
    }
}