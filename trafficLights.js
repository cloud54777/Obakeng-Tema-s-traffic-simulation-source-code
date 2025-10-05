/*
 * ADAPTIVE TRAFFIC LIGHT CONTROLLER - COMBINED SCORING METHOD
 * ===========================================================
 * 
 * This controller uses a combined scoring method that balances EFFICIENCY and FAIRNESS.
 * 
 * 1) SHORT EXPLANATION
 * --------------------
 * The controller decides whether to keep the current green or switch by comparing two scores:
 * 
 * • GREEN SCORE (Efficiency Check):
 *   Measures how well the current green is being used. It's the sum of vehicles that have
 *   already passed during this green plus vehicles currently approaching the green stop line.
 *   If cars are still flowing, the system prefers to keep green to preserve momentum.
 * 
 * • RED SCORE (Fairness & Urgency):
 *   Measures how urgent it is to serve the waiting side. It combines the number of cars 
 *   stopped at the red and how long the FIRST car has been waiting (front-car wait acts
 *   as proxy for queue delay). It also adds cars approaching the red (will soon join queue).
 *   This captures both current frustration and imminent demand.
 * 
 * DECISION RULE:
 *   Switch if: redScore > greenScore × threshold (default: 1.5)
 *   Fast-track: If green flow stopped (carsPassed ≈ 0) and redScore > 0 → switch immediately
 *   Safety cap: Always enforce MAX_GREEN (100s) to prevent permanent green
 * 
 * This combines EFFICIENCY (don't break flowing green) with FAIRNESS (long waits force switch).
 * 
 * 
 * 2) FORMULAS (Explicit)
 * ----------------------
 * All time measures in SECONDS.
 * 
 * • redScore = (carsWaiting × firstWait_s) + carsApproaching_red
 *   - carsWaiting = vehicles stopped at red line
 *   - firstWait_s = seconds the first (front) waiting car has been stopped
 *   - carsApproaching_red = vehicles in detection zone heading toward red (not yet stopped)
 * 
 * • greenScore = carsPassed_green + carsApproaching_green
 *   - carsPassed_green = vehicles that passed during current green phase
 *   - carsApproaching_green = vehicles in detection zone heading toward green (will pass if green continues)
 * 
 * • Switch if: redScore > greenScore × threshold (threshold = 1.5 recommended)
 * 
 * • Fast-track rule: if carsPassed_green ≈ 0 and redScore > 0 → switch immediately
 * 
 * • Max green cap: enforce MAX_GREEN (100s) to avoid permanent green
 * 
 * 
 * 3) DESIGN NOTES
 * ---------------
 * • Using front car wait makes fairness responsive to real experienced delay
 * • Adding carsApproaching to both sides anticipates demand (platoons) before jams form
 * • Threshold (1.5) prevents frequent flipping; higher = more stable, lower = more responsive
 * • MAX_GREEN safety ensures no direction monopolizes the intersection
 * 
 */

import { CONFIG } from "./config.js";


export class TrafficLightController {
    initialize(mode, settings) {
        this.mode = mode;
        this.settings = { ...settings };
        if (mode === CONFIG.MODES.FIXED) {
            this.initializeFixedMode();
        } else if (mode === CONFIG.MODES.ADAPTIVE) {
            this.initializeAdaptiveMode();
        }
    }
    constructor() {
        this.lights = {};
        this.mode = CONFIG.MODES.FIXED;
        this.settings = { ...CONFIG.DEFAULT_SETTINGS };
       
        // Fixed mode state - explicit phases for described cycle
        // 0: NS green, 1: NS yellow, 2: NS red (wait), 3: WE green, 4: WE yellow, 5: WE red (wait)
        this.fixedState = {
            currentPhase: 0,
            phaseTimer: 0,
            isActive: false
        };
       
        // Adaptive mode state - completely independent
        this.adaptiveState = {
            currentPair: null,           // 'WE', 'NS', or null (no active pair)
            currentPhase: 'red',         // 'red', 'yellow', 'green'
            phaseTimer: 0,               // Milliseconds in current phase
            isActive: false,             // Whether adaptive mode is running
            greenPairScores: { north: 0, south: 0, east: 0, west: 0 },  // Cars detected on currently green directions
            redPairScores: { north: 0, south: 0, east: 0, west: 0 },    // Cars waiting on red directions
            redPairWaitTimes: { north: 0, south: 0, east: 0, west: 0 }, // How long cars have been waiting (ms)
            greenPairApproaching: { north: 0, south: 0, east: 0, west: 0 }, // Cars approaching green
            redPairApproaching: { north: 0, south: 0, east: 0, west: 0 },   // Cars approaching red
            priorityScores: { WE: 0, NS: 0 },    // Combined priority scores for each pair
            switchThreshold: 1.5,        // Red score must be 1.5x green score to switch
            maxGreenDuration: 100000,    // Maximum green duration = 100 seconds
            lastSwitchTime: 0,           // Timestamp of last pair switch
            firstCarTriggered: false,    // Has first car been detected?
            nextPair: null,              // Which pair gets green after current red phase
            greenLockTime: 0,            // Remaining time in green lock (ms)
            greenLockDuration: 5000,     // Green lock duration = 5 seconds
            currentGreenCarsPassed: 0    // Count of cars that passed during current green
        };
       
        this.initializeLights();

    }

    initializeLights() {
        // Initialize all lights to red
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            this.lights[direction] = {
                state: CONFIG.LIGHT_STATES.RED,
                timer: 0
            };
        });
    }

    initializeFixedMode() {
        console.log('Initializing Fixed Mode');
        this.fixedState = {
            currentPhase: 0, // Start with North-South green
            phaseTimer: 0,
            isActive: true
        };
        this.setFixedLightState();
    }


    initializeAdaptiveMode() {
        this.adaptiveState.currentPair = null;      // No pair has green initially
        this.adaptiveState.currentPhase = 'red';    // Start with all red
        this.adaptiveState.phaseTimer = 0;          // Reset timer
        this.adaptiveState.isActive = true;         // Activate adaptive mode
        this.adaptiveState.greenPairScores = { north: 0, south: 0, east: 0, west: 0 };
        this.adaptiveState.redPairScores = { north: 0, south: 0, east: 0, west: 0 };
        this.adaptiveState.redPairWaitTimes = { north: 0, south: 0, east: 0, west: 0 };
        this.adaptiveState.greenPairApproaching = { north: 0, south: 0, east: 0, west: 0 };
        this.adaptiveState.redPairApproaching = { north: 0, south: 0, east: 0, west: 0 };
        this.adaptiveState.switchThreshold = 1.5;
        this.adaptiveState.maxGreenDuration = 100000;
        this.adaptiveState.lastSwitchTime = 0;
        this.adaptiveState.firstCarTriggered = false;
        
        this.setAllLightsRed();  // Set all directions to red
        console.log('Adaptive mode initialized - all lights red, waiting for cars');
    }


    update(deltaTime, mode, settings) {
        this.mode = mode;
        this.settings = { ...settings };


        if (mode === CONFIG.MODES.FIXED) {
            if (!this.fixedState.isActive) {
                this.initializeFixedMode();
            }
            this.updateFixedMode(deltaTime);
        } else if (mode === CONFIG.MODES.ADAPTIVE) {
            if (!this.adaptiveState.isActive) {
                this.initializeAdaptiveMode();
            }
            this.updateAdaptiveMode(deltaTime);
        }
    }


    // FIXED MODE LOGIC - Simple timer-based cycling
    updateFixedMode(deltaTime) {
        this.fixedState.phaseTimer += deltaTime;


        switch (this.fixedState.currentPhase) {
            case 0: // NS green
                if (this.fixedState.phaseTimer >= this.settings.GREEN_DURATION) {
                    this.advanceFixedPhase();
                }
                break;
            case 1: // NS yellow
                if (this.fixedState.phaseTimer >= this.settings.YELLOW_DURATION) {
                    this.advanceFixedPhase();
                }
                break;
            case 2: // NS red (wait)
                if (this.fixedState.phaseTimer >= 3000) { // 3 seconds wait
                    this.advanceFixedPhase();
                }
                break;
            case 3: // WE green
                if (this.fixedState.phaseTimer >= this.settings.GREEN_DURATION) {
                    this.advanceFixedPhase();
                }
                break;
            case 4: // WE yellow
                if (this.fixedState.phaseTimer >= this.settings.YELLOW_DURATION) {
                    this.advanceFixedPhase();
                }
                break;
            case 5: // WE red (wait)
                if (this.fixedState.phaseTimer >= 3000) { // 3 seconds wait
                    this.advanceFixedPhase();
                }
                break;
        }
    }


    advanceFixedPhase() {
    this.fixedState.currentPhase = (this.fixedState.currentPhase + 1) % 6;
    this.fixedState.phaseTimer = 0;
    this.setFixedLightState();
    console.log(`Fixed Mode: Advanced to phase ${this.fixedState.currentPhase}`);
    }


    setFixedLightState() {
        // Reset all lights to red first
        this.setAllLightsRed();


        switch (this.fixedState.currentPhase) {
            case 0: // NS green
                this.lights[CONFIG.DIRECTIONS.NORTH].state = CONFIG.LIGHT_STATES.GREEN;
                this.lights[CONFIG.DIRECTIONS.SOUTH].state = CONFIG.LIGHT_STATES.GREEN;
                break;
            case 1: // NS yellow
                this.lights[CONFIG.DIRECTIONS.NORTH].state = CONFIG.LIGHT_STATES.YELLOW;
                this.lights[CONFIG.DIRECTIONS.SOUTH].state = CONFIG.LIGHT_STATES.YELLOW;
                break;
            case 2: // NS red (wait)
                // All lights remain red
                break;
            case 3: // WE green
                this.lights[CONFIG.DIRECTIONS.WEST].state = CONFIG.LIGHT_STATES.GREEN;
                this.lights[CONFIG.DIRECTIONS.EAST].state = CONFIG.LIGHT_STATES.GREEN;
                break;
            case 4: // WE yellow
                this.lights[CONFIG.DIRECTIONS.WEST].state = CONFIG.LIGHT_STATES.YELLOW;
                this.lights[CONFIG.DIRECTIONS.EAST].state = CONFIG.LIGHT_STATES.YELLOW;
                break;
            case 5: // WE red (wait)
                // All lights remain red
                break;
        }
    }


    // ADAPTIVE MODE LOGIC - THE HEART OF ADAPTIVE MODE
    updateAdaptiveMode(deltaTime) {
        if (!this.adaptiveState.isActive) return;   // Exit if not active

        this.adaptiveState.phaseTimer += deltaTime; // Increment phase timer

        // PHASE 1: WAITING FOR FIRST CAR
        if (this.adaptiveState.currentPair === null) {
            const firstDetectedPair = this.getFirstDetectedPair();
            if (firstDetectedPair) {
                console.log(`🚦 FIRST CAR DETECTED! Starting ${firstDetectedPair} green phase`);
                this.switchToAdaptivePair(firstDetectedPair);
                this.startAdaptiveGreen();
                this.adaptiveState.firstCarTriggered = true;
            }
        } 
        // PHASE 2: ACTIVE TRAFFIC MANAGEMENT
        else {
            if (this.adaptiveState.currentPhase === 'green') {
                // GREEN LOCK LOGIC
                if (this.adaptiveState.greenLockTime > 0) {
                    this.adaptiveState.greenLockTime = Math.max(0, this.adaptiveState.greenLockTime - deltaTime);
                    if (this.adaptiveState.greenLockTime > 0) {
                        console.log(`🔒 GREEN LOCK ACTIVE: ${(this.adaptiveState.greenLockTime / 1000).toFixed(1)}s remaining`);
                        this.setAdaptiveLightState();
                        return; // Skip score comparison during lock
                    } else {
                        console.log(`🔓 GREEN LOCK EXPIRED - Starting score evaluation`);
                    }
                }

                // SIMPLIFIED SWITCHING LOGIC - Make it actually work!
                const currentScore = this.calculateCurrentGreenPairScore();
                const waitingScore = this.calculateWaitingRedPairScore();

                // RULE 1: Force switch after 30 seconds minimum (to ensure switching happens)
                const minGreenExceeded = this.adaptiveState.phaseTimer >= 30000; // 30 seconds minimum
                
                // RULE 2: Force switch after 100 seconds maximum (safety)
                const maxGreenExceeded = this.adaptiveState.phaseTimer >= this.adaptiveState.maxGreenDuration;

                // RULE 3: Switch if red has ANY waiting cars and green is idle
                const greenIdle = currentScore === 0;
                const redHasDemand = waitingScore > 0;
                const fastTrackSwitch = greenIdle && redHasDemand && this.adaptiveState.phaseTimer > 5000;

                // RULE 4: Normal threshold - switch if red score is significantly higher
                const thresholdExceeded = waitingScore > currentScore * this.adaptiveState.switchThreshold;
                
                // Decide if we should switch - simplified logic
                const shouldSwitch = minGreenExceeded || maxGreenExceeded || fastTrackSwitch || thresholdExceeded;
                
                // DEBUG: Always log scores when in green phase (but less frequently)
                if (!this._scoreLogCounter) this._scoreLogCounter = 0;
                this._scoreLogCounter++;
                if (this._scoreLogCounter % 60 === 0 || shouldSwitch) {
                    console.log(`📊 SCORE CHECK: Green=${currentScore.toFixed(1)}, Red=${waitingScore.toFixed(1)}, PhaseTime=${(this.adaptiveState.phaseTimer/1000).toFixed(1)}s, Pair=${this.adaptiveState.currentPair}`);
                    console.log(`   MinGreen=${minGreenExceeded}, MaxGreen=${maxGreenExceeded}, FastTrack=${fastTrackSwitch}, Threshold=${thresholdExceeded}, SWITCH=${shouldSwitch}`);
                }

                if (shouldSwitch) {
                    const reason = maxGreenExceeded ? 'MAX GREEN (100s)' : 
                                   minGreenExceeded ? 'MIN GREEN (30s)' :
                                   fastTrackSwitch ? 'FAST-TRACK (Green Idle + Red Demand)' : 
                                   'THRESHOLD EXCEEDED';
                    console.log(`🔄 SWITCHING! Reason: ${reason}`);
                    this.startAdaptiveYellow();
                } else {
                    // Green wins - apply 5-second lock
                    this.adaptiveState.greenLockTime = this.adaptiveState.greenLockDuration;
                }
                
            } else if (this.adaptiveState.currentPhase === 'yellow') {
                // YELLOW PHASE
                if (this.adaptiveState.phaseTimer >= this.settings.YELLOW_DURATION) {
                    console.log(`🔴 YELLOW→RED: ${this.adaptiveState.currentPair} going to red`);
                    this.startAdaptiveRed();
                }
                
            } else if (this.adaptiveState.currentPhase === 'red') {
                // RED CLEARANCE PHASE
                if (this.adaptiveState.phaseTimer >= 2000) { // 2 second safety clearance
                    const nextPair = this.adaptiveState.nextPair || this.getOtherPair();
                    console.log(`🟢 RED→GREEN: Switching to GREEN for ${nextPair}`);
                    this.switchToAdaptivePair(nextPair);
                    this.startAdaptiveGreen();
                    this.adaptiveState.nextPair = null;
                }
            }
        }

        this.setAdaptiveLightState(); // Apply current state to actual lights
    }


    // PAIR SWITCHING
    switchToAdaptivePair(pair) {
        this.adaptiveState.currentPair = pair;           // Set new active pair
        this.adaptiveState.lastSwitchTime = Date.now();  // Record switch time
    }

    // GREEN PHASE START
    startAdaptiveGreen() {
        this.adaptiveState.currentPhase = 'green';
        this.adaptiveState.phaseTimer = 0;               // Reset phase timer
        this.adaptiveState.greenLockTime = this.adaptiveState.greenLockDuration; // Start with 5s lock
        this.adaptiveState.currentGreenCarsPassed = 0;   // Reset car counter
        
        // RESET carsPassed counters for the new green pair
        if (this.adaptiveState.currentPair === 'NS') {
            this.adaptiveState.greenPairScores.north = 0;
            this.adaptiveState.greenPairScores.south = 0;
            console.log(`✅ GREEN STARTED for NS - Reset carsPassed counters`);
        } else if (this.adaptiveState.currentPair === 'WE') {
            this.adaptiveState.greenPairScores.west = 0;
            this.adaptiveState.greenPairScores.east = 0;
            console.log(`✅ GREEN STARTED for WE - Reset carsPassed counters`);
        }
    }

    // YELLOW PHASE START
    startAdaptiveYellow() {
        this.adaptiveState.currentPhase = 'yellow';
        this.adaptiveState.phaseTimer = 0;               // Reset for yellow timing
    }

    // RED PHASE START
    startAdaptiveRed() {
        this.adaptiveState.currentPhase = 'red';
        this.adaptiveState.phaseTimer = 0;               // Reset for red clearance timing
    }

    // PHYSICAL LIGHT CONTROL
    setAdaptiveLightState() {
        // Determine what color lights should be
        const state = this.adaptiveState.currentPhase === 'green' ? CONFIG.LIGHT_STATES.GREEN :
                     this.adaptiveState.currentPhase === 'yellow' ? CONFIG.LIGHT_STATES.YELLOW :
                     CONFIG.LIGHT_STATES.RED;

        // Apply to the correct directions
        if (this.adaptiveState.currentPair === 'WE') {
            // West-East gets the current phase color
            this.lights[CONFIG.DIRECTIONS.WEST].state = state;
            this.lights[CONFIG.DIRECTIONS.EAST].state = state;
            // North-South stays red
            this.lights[CONFIG.DIRECTIONS.NORTH].state = CONFIG.LIGHT_STATES.RED;
            this.lights[CONFIG.DIRECTIONS.SOUTH].state = CONFIG.LIGHT_STATES.RED;
            
        } else if (this.adaptiveState.currentPair === 'NS') {
            // North-South gets the current phase color
            this.lights[CONFIG.DIRECTIONS.NORTH].state = state;
            this.lights[CONFIG.DIRECTIONS.SOUTH].state = state;
            // West-East stays red
            this.lights[CONFIG.DIRECTIONS.WEST].state = CONFIG.LIGHT_STATES.RED;
            this.lights[CONFIG.DIRECTIONS.EAST].state = CONFIG.LIGHT_STATES.RED;
            
        } else {
            // No active pair - all lights red (initialization state)
            this.lights[CONFIG.DIRECTIONS.NORTH].state = CONFIG.LIGHT_STATES.RED;
            this.lights[CONFIG.DIRECTIONS.SOUTH].state = CONFIG.LIGHT_STATES.RED;
            this.lights[CONFIG.DIRECTIONS.WEST].state = CONFIG.LIGHT_STATES.RED;
            this.lights[CONFIG.DIRECTIONS.EAST].state = CONFIG.LIGHT_STATES.RED;
        }
    }

    // UTILITY METHODS
    getOtherPair() {
        if (!this.adaptiveState.currentPair) return null;
        return this.adaptiveState.currentPair === 'WE' ? 'NS' : 'WE';
    }

    // FIRST CAR DETECTION
    getFirstDetectedPair() {
        // NEW METHOD: Use combined scores to determine first green
        // Compare both pairs using their initial demand
        if (!this.adaptiveState.currentSensorData) return null;
        
        const sensorData = this.adaptiveState.currentSensorData;
        
        // Calculate initial score for each pair (using red score formula since all start red)
        const nsScore = this.calculateInitialPairScore('NS', sensorData);
        const weScore = this.calculateInitialPairScore('WE', sensorData);
        
        console.log(`🔍 FIRST CAR DETECTION - Combined Scores: NS=${nsScore.toFixed(1)}, WE=${weScore.toFixed(1)}`);
        
        // Return pair with higher initial demand
        if (nsScore > 0 && nsScore >= weScore) return 'NS';
        if (weScore > 0) return 'WE';
        return null; // No cars detected yet
    }

    // Initial score calculation (for startup when all lights are red)
    calculateInitialPairScore(pair, sensorData) {
        if (pair === 'NS') {
            const northData = sensorData[CONFIG.DIRECTIONS.NORTH] || { carsWaiting: 0, waitTime: 0, carsApproaching: 0 };
            const southData = sensorData[CONFIG.DIRECTIONS.SOUTH] || { carsWaiting: 0, waitTime: 0, carsApproaching: 0 };
            
            // redScore formula: (carsWaiting × firstWait_s) + carsApproaching
            const northScore = (northData.carsWaiting * (northData.waitTime / 1000)) + (northData.carsApproaching || 0);
            const southScore = (southData.carsWaiting * (southData.waitTime / 1000)) + (southData.carsApproaching || 0);
            return northScore + southScore;
        } else {
            const westData = sensorData[CONFIG.DIRECTIONS.WEST] || { carsWaiting: 0, waitTime: 0, carsApproaching: 0 };
            const eastData = sensorData[CONFIG.DIRECTIONS.EAST] || { carsWaiting: 0, waitTime: 0, carsApproaching: 0 };
            
            const westScore = (westData.carsWaiting * (westData.waitTime / 1000)) + (westData.carsApproaching || 0);
            const eastScore = (eastData.carsWaiting * (eastData.waitTime / 1000)) + (eastData.carsApproaching || 0);
            return westScore + eastScore;
        }
    }

    // CURRENT GREEN PAIR PERFORMANCE (EFFICIENCY CHECK)
    // NEW FORMULA: greenScore = carsPassed_green + carsApproaching_green
    calculateCurrentGreenPairScore() {
        const currentPair = this.adaptiveState.currentPair;
        if (!currentPair) return 0;
        
        if (currentPair === 'NS') {
            const northPassed = this.adaptiveState.greenPairScores.north || 0;
            const southPassed = this.adaptiveState.greenPairScores.south || 0;
            const northApproaching = this.adaptiveState.greenPairApproaching?.north || 0;
            const southApproaching = this.adaptiveState.greenPairApproaching?.south || 0;
            
            const score = northPassed + southPassed + northApproaching + southApproaching;
            console.log(`🟢 GREEN SCORE (NS): Passed=${northPassed + southPassed}, Approaching=${northApproaching + southApproaching}, Total=${score.toFixed(1)}`);
            return score;
        } else {
            const westPassed = this.adaptiveState.greenPairScores.west || 0;
            const eastPassed = this.adaptiveState.greenPairScores.east || 0;
            const westApproaching = this.adaptiveState.greenPairApproaching?.west || 0;
            const eastApproaching = this.adaptiveState.greenPairApproaching?.east || 0;
            
            const score = westPassed + eastPassed + westApproaching + eastApproaching;
            console.log(`🟢 GREEN SCORE (WE): Passed=${westPassed + eastPassed}, Approaching=${westApproaching + eastApproaching}, Total=${score.toFixed(1)}`);
            return score;
        }
    }

    // Helper to get cars passed during current green
    getCurrentGreenCarsPassed() {
        const currentPair = this.adaptiveState.currentPair;
        if (!currentPair) return 0;
        
        if (currentPair === 'NS') {
            return (this.adaptiveState.greenPairScores.north || 0) + (this.adaptiveState.greenPairScores.south || 0);
        } else {
            return (this.adaptiveState.greenPairScores.west || 0) + (this.adaptiveState.greenPairScores.east || 0);
        }
    }

    // WAITING PAIR DEMAND (FAIRNESS & URGENCY CHECK)
    // NEW FORMULA: redScore = (carsWaiting × firstWait_s) + carsApproaching_red
    calculateWaitingRedPairScore() {
        const waitingPair = this.getOtherPair();
        if (!waitingPair) return 0;
        
        if (waitingPair === 'NS') {
            const northWaiting = this.adaptiveState.redPairScores.north || 0;
            const southWaiting = this.adaptiveState.redPairScores.south || 0;
            const northWaitTime_s = (this.adaptiveState.redPairWaitTimes.north || 0) / 1000; // Convert ms to seconds
            const southWaitTime_s = (this.adaptiveState.redPairWaitTimes.south || 0) / 1000;
            const northApproaching = this.adaptiveState.redPairApproaching?.north || 0;
            const southApproaching = this.adaptiveState.redPairApproaching?.south || 0;

            // Formula: (carsWaiting × firstWait_s) + carsApproaching
            const northScore = (northWaiting * northWaitTime_s) + northApproaching;
            const southScore = (southWaiting * southWaitTime_s) + southApproaching;
            const totalScore = northScore + southScore;
            
            if (totalScore > 0) {
                console.log(`🔴 RED SCORE (NS): Waiting=${northWaiting}/${southWaiting}, WaitTime=${northWaitTime_s.toFixed(1)}s/${southWaitTime_s.toFixed(1)}s, Approaching=${northApproaching}/${southApproaching}, Total=${totalScore.toFixed(1)}`);
            }
            return totalScore;
        } else {
            const westWaiting = this.adaptiveState.redPairScores.west || 0;
            const eastWaiting = this.adaptiveState.redPairScores.east || 0;
            const westWaitTime_s = (this.adaptiveState.redPairWaitTimes.west || 0) / 1000;
            const eastWaitTime_s = (this.adaptiveState.redPairWaitTimes.east || 0) / 1000;
            const westApproaching = this.adaptiveState.redPairApproaching?.west || 0;
            const eastApproaching = this.adaptiveState.redPairApproaching?.east || 0;

            const westScore = (westWaiting * westWaitTime_s) + westApproaching;
            const eastScore = (eastWaiting * eastWaitTime_s) + eastApproaching;
            const totalScore = westScore + eastScore;
            
            console.log(`🔴 RED SCORE (WE): Waiting=${westWaiting + eastWaiting}, WaitTime=${westWaitTime_s.toFixed(1)}s/${eastWaitTime_s.toFixed(1)}s, Approaching=${westApproaching + eastApproaching}, Total=${totalScore.toFixed(1)}`);
            return totalScore;
        }
    }

    // SENSOR DATA PROCESSING & SCORE CALCULATION
    // NEW COMBINED METHOD: Track carsPassed, carsWaiting, carsApproaching for green/red pairs
    updateAdaptiveLogic(sensorData, deltaTime) {
        if (this.mode !== CONFIG.MODES.ADAPTIVE || !this.adaptiveState.isActive) return;

        // DEFAULT DATA STRUCTURE
        if (!sensorData) {
            sensorData = {
                north: { carsWaiting: 0, carsApproaching: 0, carsPassed: 0, waitTime: 0, totalCarsDetected: 0 },
                south: { carsWaiting: 0, carsApproaching: 0, carsPassed: 0, waitTime: 0, totalCarsDetected: 0 },
                east: { carsWaiting: 0, carsApproaching: 0, carsPassed: 0, waitTime: 0, totalCarsDetected: 0 },
                west: { carsWaiting: 0, carsApproaching: 0, carsPassed: 0, waitTime: 0, totalCarsDetected: 0 }
            };
        }
        
        // Store for first car detection
        this.adaptiveState.currentSensorData = sensorData;

        // Initialize approaching tracking if not exists
        if (!this.adaptiveState.greenPairApproaching) {
            this.adaptiveState.greenPairApproaching = { north: 0, south: 0, east: 0, west: 0 };
        }
        if (!this.adaptiveState.redPairApproaching) {
            this.adaptiveState.redPairApproaching = { north: 0, south: 0, east: 0, west: 0 };
        }

        // DISTRIBUTE SENSOR DATA BASED ON CURRENT LIGHT STATE
        const northData = sensorData[CONFIG.DIRECTIONS.NORTH] || { carsWaiting: 0, carsApproaching: 0, carsPassed: 0, waitTime: 0, totalCarsDetected: 0 };
        const southData = sensorData[CONFIG.DIRECTIONS.SOUTH] || { carsWaiting: 0, carsApproaching: 0, carsPassed: 0, waitTime: 0, totalCarsDetected: 0 };
        const eastData = sensorData[CONFIG.DIRECTIONS.EAST] || { carsWaiting: 0, carsApproaching: 0, carsPassed: 0, waitTime: 0, totalCarsDetected: 0 };
        const westData = sensorData[CONFIG.DIRECTIONS.WEST] || { carsWaiting: 0, carsApproaching: 0, carsPassed: 0, waitTime: 0, totalCarsDetected: 0 };

        if (this.adaptiveState.currentPair === 'NS') {
            // NS has green - track carsPassed and carsApproaching
            this.adaptiveState.greenPairScores.north = northData.carsPassed || 0;
            this.adaptiveState.greenPairScores.south = southData.carsPassed || 0;
            this.adaptiveState.greenPairApproaching.north = northData.carsApproaching || 0;
            this.adaptiveState.greenPairApproaching.south = southData.carsApproaching || 0;

            // WE is red - track carsWaiting, waitTime, and carsApproaching
            this.adaptiveState.redPairScores.east = eastData.carsWaiting || 0;
            this.adaptiveState.redPairScores.west = westData.carsWaiting || 0;
            this.adaptiveState.redPairWaitTimes.east = eastData.waitTime || 0;
            this.adaptiveState.redPairWaitTimes.west = westData.waitTime || 0;
            this.adaptiveState.redPairApproaching.east = eastData.carsApproaching || 0;
            this.adaptiveState.redPairApproaching.west = westData.carsApproaching || 0;
            
            // DEBUG: Show what data we're getting
            if (eastData.carsWaiting > 0 || westData.carsWaiting > 0) {
                console.log(`🔍 DATA UPDATE (NS=GREEN, WE=RED): East waiting=${eastData.carsWaiting}, waitTime=${(eastData.waitTime/1000).toFixed(1)}s | West waiting=${westData.carsWaiting}, waitTime=${(westData.waitTime/1000).toFixed(1)}s`);
            }
            
        } else if (this.adaptiveState.currentPair === 'WE') {
            // WE has green - track carsPassed and carsApproaching
            this.adaptiveState.greenPairScores.east = eastData.carsPassed || 0;
            this.adaptiveState.greenPairScores.west = westData.carsPassed || 0;
            this.adaptiveState.greenPairApproaching.east = eastData.carsApproaching || 0;
            this.adaptiveState.greenPairApproaching.west = westData.carsApproaching || 0;

            // NS is red - track carsWaiting, waitTime, and carsApproaching
            this.adaptiveState.redPairScores.north = northData.carsWaiting || 0;
            this.adaptiveState.redPairScores.south = southData.carsWaiting || 0;
            this.adaptiveState.redPairWaitTimes.north = northData.waitTime || 0;
            this.adaptiveState.redPairWaitTimes.south = southData.waitTime || 0;
            this.adaptiveState.redPairApproaching.north = northData.carsApproaching || 0;
            this.adaptiveState.redPairApproaching.south = southData.carsApproaching || 0;
        } else {
            // No active pair - track all as potential initial demand
            this.adaptiveState.greenPairScores.north = northData.totalCarsDetected || 0;
            this.adaptiveState.greenPairScores.south = southData.totalCarsDetected || 0;
            this.adaptiveState.greenPairScores.east = eastData.totalCarsDetected || 0;
            this.adaptiveState.greenPairScores.west = westData.totalCarsDetected || 0;
        }
    }

    setAllLightsRed() {
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            this.lights[direction].state = CONFIG.LIGHT_STATES.RED;
        });
    }


    render(ctx, intersection) {
        const directions = ['north', 'south', 'east', 'west'];
        directions.forEach(direction => {
            const state = this.lights[CONFIG.DIRECTIONS[direction.toUpperCase()]].state;
            this.renderTrafficLight(ctx, direction, state, intersection);
        });
    }


    renderTrafficLight(ctx, direction, state, intersection) {
        const position = intersection.getLightPosition(direction);
        if (!position) return;


        const lightSize = CONFIG.LIGHT_SIZE || 12;
        const spacing = lightSize + 2;


        // Draw light housing
        ctx.fillStyle = '#333';
        ctx.fillRect(position.x - lightSize - 1, position.y - spacing * 1.5 - 1, (lightSize + 1) * 2, spacing * 3 + 2);


        // Draw lights
        const lights = ['red', 'yellow', 'green'];
        lights.forEach((color, index) => {
            const lightY = position.y - spacing + (index * spacing);


            // Light background
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.arc(position.x, lightY, lightSize, 0, Math.PI * 2);
            ctx.fill();


            // Active light
            if (state === color) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(position.x, lightY, lightSize - 2, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }


    // Public methods for UI and game engine
    getLightStates() {
        const states = {};
        Object.entries(this.lights).forEach(([direction, light]) => {
            states[direction] = light.state;
        });
        return states;
    }


    setMode(mode) {
        this.mode = mode;
        if (mode === CONFIG.MODES.FIXED && !this.fixedState.isActive) {
            this.initializeFixedMode();
        } else if (mode === CONFIG.MODES.ADAPTIVE && !this.adaptiveState.isActive) {
            this.initializeAdaptiveMode();
        }
    }


    updateSettings(settings) {
        this.settings = { ...settings };
    }


    reset() {
        if (this.mode === CONFIG.MODES.FIXED) {
            this.fixedState.isActive = false;
            this.initializeFixedMode();
        } else if (this.mode === CONFIG.MODES.ADAPTIVE) {
            this.adaptiveState.isActive = false;
            this.initializeAdaptiveMode();
        }
        console.log(`${this.mode} mode reset`);
    }


    // Debug methods
    getDebugInfo() {
        if (this.mode === CONFIG.MODES.FIXED) {
            return {
                mode: 'Fixed',
                phase: this.fixedState.currentPhase,
                timer: (this.fixedState.phaseTimer / 1000).toFixed(1) + 's',
                active: this.fixedState.isActive
            };
        } else {
            return {
                mode: 'Adaptive',
                pair: this.adaptiveState.currentPair,
                phase: this.adaptiveState.currentPhase,
                timer: (this.adaptiveState.phaseTimer / 1000).toFixed(1) + 's',
                scores: this.adaptiveState.priorityScores,
                greenLock: (this.adaptiveState.greenLockTime / 1000).toFixed(1) + 's',
                greenScores: this.adaptiveState.greenPairScores,
                redScores: this.adaptiveState.redPairScores,
                waitTimes: this.adaptiveState.redPairWaitTimes,
                active: this.adaptiveState.isActive
            };
        }
    }
}