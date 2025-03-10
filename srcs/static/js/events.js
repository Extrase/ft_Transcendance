// events.js - Gestion des événements globaux

export class PongEvents {
    constructor(gameInstance, menuInstance) {
        this.game = gameInstance;
        this.menu = menuInstance;
        
        this.bindEvents();
    }

    bindEvents() {
        document.addEventListener("game:start", () => this.game.play());
        document.addEventListener("keydown", (event) => this.handleKeyDown(event));
        document.addEventListener("keyup", (event) => this.handleKeyUp(event));
    }

    handleKeyDown(event) {
        if (event.key === "Escape") {
            this.menu.showMenu();
        }
    }

    handleKeyUp(event) {
        // Ajoute ici d'autres actions si nécessaire
    }
}
