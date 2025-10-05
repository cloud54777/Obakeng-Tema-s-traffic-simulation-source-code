import { CONFIG } from './config.js';

export class UIController {
    constructor(gameEngine) {
        this.gameEngine = gameEngine;
        this.elements = {};
        this.isPlaying = true;
        
        this.initializeElements();
    }

    initializeElements() {
        // Control elements
        this.elements = {
            modeSelect: document.getElementById('mode-select'),
            playPauseBtn: document.getElementById('playPauseBtn'),
            resetBtn: document.getElementById('resetBtn'),
            
            // Fixed timer controls
            fixedControls: document.getElementById('fixed-controls'),
            greenDuration: document.getElementById('greenDuration'),
            greenValue: document.getElementById('greenDurationValue'),
            yellowDuration: document.getElementById('yellowDuration'),
            yellowValue: document.getElementById('yellowDurationValue'),
            redDuration: document.getElementById('redDuration'),
            redValue: document.getElementById('redDurationValue'),
            
            // Adaptive controls
            adaptiveControls: document.getElementById('adaptive-controls'),
            detectorDistance: document.getElementById('detectorDistance'),
            minGreenTime: document.getElementById('minGreenTime'),
            detectorValue: document.getElementById('detectorValue'),
            minGreenValue: document.getElementById('minGreenValue'),
            adaptiveYellowDuration: document.getElementById('adaptiveYellowDuration'),
            adaptiveYellowValue: document.getElementById('adaptiveYellowValue'),
            
            // Car controls
            carSpawnRate: document.getElementById('carSpawnRate'),
            carSpeed: document.getElementById('carSpeed'),
            // ...existing code...
            spawnValue: document.getElementById('spawnValue'),
            speedValue: document.getElementById('speedValue'),
            // ...existing code...
            
            // Statistics
            carsPassedStat: document.getElementById('carsPassedStat'),
            avgWaitStat: document.getElementById('avgWaitStat'),
            currentCarsStat: document.getElementById('currentCarsStat'),
            northCountStat: document.getElementById('northCountStat'),
            southCountStat: document.getElementById('southCountStat'),
            eastCountStat: document.getElementById('eastCountStat'),
            westCountStat: document.getElementById('westCountStat'),
            
            // Light status
            northLight: document.getElementById('north-light'),
            eastLight: document.getElementById('east-light'),
            southLight: document.getElementById('south-light'),
            westLight: document.getElementById('west-light')
        };
    }

    initialize() {
        this.setupEventListeners();
        this.updateModeDisplay();
        this.startStatsUpdate();
    }

    setupEventListeners() {
        // Mode selector
        this.elements.modeSelect.addEventListener('change', (e) => {
            this.gameEngine.updateMode(e.target.value);
            this.updateModeDisplay();
            this.updateSliderValues(); // Update sliders when mode changes
        });

        // Control buttons
        this.elements.playPauseBtn.addEventListener('click', () => {
            this.isPlaying = window.trafficSimulator.togglePause();
            this.elements.playPauseBtn.textContent = this.isPlaying ? '⏸️ Pause' : '▶️ Play';
        });

        this.elements.resetBtn.addEventListener('click', () => {
            this.gameEngine.reset();
        });

        // Fixed timer controls
        this.setupSlider('greenDuration', 'greenValue', 'NORTH_SOUTH_GREEN_TIME', (value) => value * 1000);
        this.setupSlider('yellowDuration', 'yellowValue', 'YELLOW_TIME', (value) => value * 1000);
        this.setupSlider('redDuration', 'redValue', 'RED_TIME', (value) => value * 1000);

        // Adaptive controls
        this.setupSlider('detectorDistance', 'detectorValue', 'DETECTOR_DISTANCE');
        this.setupSlider('minGreenTime', 'minGreenValue', 'MIN_GREEN_TIME', (value) => value * 1000);
        this.setupSlider('adaptiveYellowDuration', 'adaptiveYellowValue', 'YELLOW_TIME', (value) => value * 1000);

        // Car controls
        this.setupSlider('carSpawnRate', 'spawnValue', 'CAR_SPAWN_RATE');
        this.setupSlider('carSpeed', 'speedValue', 'CAR_SPEED');
    // ...existing code...
    }

    setupSlider(sliderId, valueId, settingKey, transform = null) {
        const slider = this.elements[sliderId];
        const valueDisplay = this.elements[valueId];

        if (!slider || !valueDisplay) return;

        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            valueDisplay.textContent = value;
            
            const settingValue = transform ? transform(value) : value;
            
            // Special handling for green duration - apply to both NS and EW in fixed mode
            if (settingKey === 'NORTH_SOUTH_GREEN_TIME') {
                this.gameEngine.updateSetting('NORTH_SOUTH_GREEN_TIME', settingValue);
                this.gameEngine.updateSetting('EAST_WEST_GREEN_TIME', settingValue);
            } else if (settingKey === 'YELLOW_TIME') {
                if (sliderId === 'adaptiveYellowDuration') {
                    this.gameEngine.updateSetting(settingKey, settingValue, CONFIG.MODES.ADAPTIVE);
                } else {
                    this.gameEngine.updateSetting(settingKey, settingValue, CONFIG.MODES.FIXED);
                }
            } else {
                this.gameEngine.updateSetting(settingKey, settingValue);
            }
        });

        // Initialize display
        valueDisplay.textContent = slider.value;
    }

    updateSliderValues() {
        const mode = this.gameEngine.getCurrentMode();
        const settings = this.gameEngine.getSettings();
        
        // Update slider values based on current mode settings
        if (mode === CONFIG.MODES.FIXED) {
            this.elements.greenDuration.value = settings.NORTH_SOUTH_GREEN_TIME / 1000;
            this.elements.greenValue.textContent = settings.NORTH_SOUTH_GREEN_TIME / 1000;
            this.elements.yellowDuration.value = settings.YELLOW_TIME / 1000;
            this.elements.yellowValue.textContent = settings.YELLOW_TIME / 1000;
            this.elements.redDuration.value = settings.RED_TIME / 1000;
            this.elements.redValue.textContent = settings.RED_TIME / 1000;
        } else {
            this.elements.detectorDistance.value = settings.DETECTOR_DISTANCE;
            this.elements.detectorValue.textContent = settings.DETECTOR_DISTANCE;
            this.elements.minGreenTime.value = settings.MIN_GREEN_TIME / 1000;
            this.elements.minGreenValue.textContent = settings.MIN_GREEN_TIME / 1000;
            if (this.elements.adaptiveYellowDuration) {
                this.elements.adaptiveYellowDuration.value = settings.YELLOW_TIME / 1000;
                this.elements.adaptiveYellowValue.textContent = settings.YELLOW_TIME / 1000;
            }
        }
        
        // Car settings are shared
        this.elements.carSpawnRate.value = settings.CAR_SPAWN_RATE;
        this.elements.spawnValue.textContent = settings.CAR_SPAWN_RATE;
        this.elements.carSpeed.value = settings.CAR_SPEED;
        this.elements.speedValue.textContent = settings.CAR_SPEED;
    }
    updateModeDisplay() {
        const mode = this.gameEngine.getCurrentMode();
        
        if (mode === CONFIG.MODES.FIXED) {
            this.elements.fixedControls.style.display = 'block';
            this.elements.adaptiveControls.style.display = 'none';
        } else {
            this.elements.fixedControls.style.display = 'none';
            this.elements.adaptiveControls.style.display = 'block';
        }
    }

    startStatsUpdate() {
        setInterval(() => {
            this.updateStatistics();
            this.updateLightStatus();
        }, 100); // Update 10 times per second
    }

    updateStatistics() {
        const stats = this.gameEngine.getStatistics();
        const totalCarsDetected = this.gameEngine.getSensorSystem().getTotalCarsDetected();
        
        this.elements.carsPassedStat.textContent = stats.totalCarsPassed;
        this.elements.avgWaitStat.textContent = stats.averageWaitTime.toFixed(1) + 's';
        this.elements.currentCarsStat.textContent = stats.currentCars;
        
        // Update car count statistics (only show in adaptive mode)
        if (this.gameEngine.getCurrentMode() === 'adaptive') {
            this.elements.northCountStat.textContent = totalCarsDetected.north || 0;
            this.elements.southCountStat.textContent = totalCarsDetected.south || 0;
            this.elements.eastCountStat.textContent = totalCarsDetected.east || 0;
            this.elements.westCountStat.textContent = totalCarsDetected.west || 0;
        } else {
            // Hide counts in fixed mode
            this.elements.northCountStat.textContent = '-';
            this.elements.southCountStat.textContent = '-';
            this.elements.eastCountStat.textContent = '-';
            this.elements.westCountStat.textContent = '-';
        }
    }

    updateLightStatus() {
        const lightStates = this.gameEngine.getLightStates();
        
        const lightElements = {
            [CONFIG.DIRECTIONS.NORTH]: this.elements.northLight,
            [CONFIG.DIRECTIONS.EAST]: this.elements.eastLight,
            [CONFIG.DIRECTIONS.SOUTH]: this.elements.southLight,
            [CONFIG.DIRECTIONS.WEST]: this.elements.westLight
        };

        Object.entries(lightStates).forEach(([direction, state]) => {
            const element = lightElements[direction];
            if (element) {
                // Remove all state classes
                element.classList.remove('red', 'yellow', 'green');
                
                // Add current state class
                element.classList.add(state);
            }
        });
    }

    setMode(mode) {
        this.elements.modeSelect.value = mode;
    }

    updateSliderValue(sliderId, value) {
        const slider = this.elements[sliderId];
        if (slider) {
            slider.value = value;
            slider.dispatchEvent(new Event('input'));
        }
    }
}

document.getElementById('greenDuration').min = 15;
document.getElementById('greenDuration').max = 100;

document.getElementById('redDuration').min = 15;
document.getElementById('redDuration').max = 100;

const greenSlider = document.getElementById('greenDuration');
const greenValue = document.getElementById('greenDurationValue');
greenSlider.addEventListener('input', () => {
    greenValue.textContent = greenSlider.value;
});



















