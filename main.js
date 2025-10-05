import { GameEngine } from './gameEngine.js';
import { UIController } from './ui.js';
import { CONFIG } from './config.js';
// ...existing code...
import { TrafficLightController } from './trafficLights.js';
import { Car } from './cars.js';
import './paths.js'; // Ensure paths.js is loaded

class TrafficSimulator {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gameEngine = new GameEngine(this.canvas, this.ctx);
        this.uiController = new UIController(this.gameEngine);
        this.trafficLightController = new TrafficLightController();
        
        this.isRunning = true;
        this.lastTime = 0;
        
        this.initializeGame();
        this.startGameLoop();
    }

    initializeGame() {
        // Set canvas size
        this.canvas.width = CONFIG.CANVAS_WIDTH;
        this.canvas.height = CONFIG.CANVAS_HEIGHT;
        
        // Initialize game systems
        this.gameEngine.initialize();
        this.uiController.initialize();
        
        console.log('Traffic Simulator initialized');
    }

    startGameLoop() {
        const gameLoop = (currentTime) => {
            const deltaTime = currentTime - this.lastTime;
            this.lastTime = currentTime;

            if (this.isRunning) {
                // Get durations from sliders (convert to milliseconds)
                const settings = {
                    GREEN_DURATION: Number(document.getElementById('greenDuration').value) * 1000,
                    YELLOW_DURATION: Number(document.getElementById('yellowDuration').value) * 1000,
                    RED_DURATION: Number(document.getElementById('redDuration').value) * 1000,
                    CAR_SPAWN_RATE: Number(document.getElementById('carSpawnRate').value),
                    CAR_SPEED: Number(document.getElementById('carSpeed').value),
                    MIN_GREEN_TIME: 5000,
                    DETECTOR_DISTANCE: 200
                };

                this.gameEngine.updateSettings(settings);
                this.gameEngine.update(deltaTime);
            }

            this.gameEngine.render();
            requestAnimationFrame(gameLoop);
        };

        requestAnimationFrame(gameLoop);
    }

    pause() {
        this.isRunning = false;
    }

    resume() {
        this.isRunning = true;
    }

    reset() {
        this.gameEngine.reset();
    }

    togglePause() {
        this.isRunning = !this.isRunning;
        return this.isRunning;
    }
}

// Initialize the game when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.trafficSimulator = new TrafficSimulator();
});
