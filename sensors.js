import { CONFIG } from "./config.js";

export class SensorSystem {
    constructor(intersection) {
        this.intersection = intersection;
        this.detectorDistance = CONFIG.DEFAULT_SETTINGS.DETECTOR_DISTANCE;
        this.sensorData = {};
        this.carCounts = {};
        this.waitingCars = {};
        this.totalCarsDetected = {};
        
        this.initializeSensors();
    }

    initializeSensors() {
        // Initialize sensor data for each direction
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            this.sensorData[direction] = {
                carsWaiting: 0,
                carsApproaching: 0,        // Cars in detection zone but not stopped
                carsPassed: 0,             // Cars that passed during current green phase
                waitTime: 0,
                detectedCars: [],
                firstCarWaitStart: null,
                totalCarsDetected: 0
            };
            this.carCounts[direction] = 0;
            this.waitingCars[direction] = null;
            this.totalCarsDetected[direction] = 0;
        });
    }

    initialize(detectorDistance) {
        this.detectorDistance = detectorDistance;
        this.initializeSensors();
    }

    update(cars, lightStates, prevLightStates) {
        // Reset ONLY approaching/waitTime data each frame, but NOT carsWaiting
        // carsWaiting will be recounted from scratch each frame based on actual waiting cars
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            // Reset these counters every frame - they'll be recalculated
            this.sensorData[direction].carsWaiting = 0;
            this.sensorData[direction].carsApproaching = 0;
            this.sensorData[direction].detectedCars = [];
            // DON'T reset waitTime - it's calculated from front car's wait time
            // DON'T reset firstCarWaitStart and waitingCars - keep tracking wait time
        });

        // Adaptive mode: reset car counts on light cycle change (but preserve timers)
        if (lightStates && prevLightStates) {
            Object.values(CONFIG.DIRECTIONS).forEach(direction => {
                if (lightStates[direction] !== prevLightStates[direction]) {
                    // Reset carsPassed counter when light turns green
                    if (lightStates[direction] === CONFIG.LIGHT_STATES.GREEN && 
                        prevLightStates[direction] !== CONFIG.LIGHT_STATES.GREEN) {
                        this.sensorData[direction].carsPassed = 0;
                        console.log(`🟢 GREEN STARTED: ${direction.toUpperCase()} - Reset carsPassed counter`);
                        // Clear front car tracking when light turns green
                        this.waitingCars[direction] = null;
                        this.sensorData[direction].firstCarWaitStart = null;
                        // RESET TOTAL CAR COUNTER when light turns green
                        this.totalCarsDetected[direction] = 0;
                        this.sensorData[direction].totalCarsDetected = 0;
                        console.log(`🔄 RESET: ${direction.toUpperCase()} - Total car counter reset to 0`);
                    }
                }
            });
        }

        // Check if we should reset counts (manual trigger)
        if (this.shouldResetCounts) {
            this.resetAllCarCounts();
            this.shouldResetCounts = false;
        }

        // Process each car
        cars.forEach(car => {
            const direction = car.getDirection();
            const detectionZone = this.getDetectionZone(direction);
            const inZone = this.isCarInDetectionZone(car, detectionZone);

            // Count cars entering detection zone (regardless of light state)
            if (!car._countedInDetector && inZone) {
                car._countedInDetector = true;
                this.totalCarsDetected[direction]++;
                this.sensorData[direction].totalCarsDetected = this.totalCarsDetected[direction];
                console.log(`🚗 CAR DETECTED: ${direction.toUpperCase()} (Total: ${this.totalCarsDetected[direction]}) - Car ${car.id}`);
            }
            if (!inZone && car._countedInDetector) {
                car._countedInDetector = false;
                // Remove car from detectedCars list if it has crossed the stop line (left the detection zone)
                const idx = this.sensorData[direction].detectedCars.indexOf(car);
                if (idx !== -1) {
                    this.sensorData[direction].detectedCars.splice(idx, 1);
                }
            }

            // Handle car states based on light color
            const isRedLight = lightStates && lightStates[direction] === CONFIG.LIGHT_STATES.RED;
            const isGreenLight = lightStates && lightStates[direction] === CONFIG.LIGHT_STATES.GREEN;
            const allLightsRed = !lightStates || Object.values(lightStates).every(state => state === CONFIG.LIGHT_STATES.RED);

            if (inZone) {
                // Track cars that pass through during green
                if (isGreenLight && !car._passedDuringGreen) {
                    car._passedDuringGreen = true;
                    this.sensorData[direction].carsPassed++;
                    console.log(`✅ CAR PASSED GREEN: ${direction.toUpperCase()} - Car ${car.id} (Total this green: ${this.sensorData[direction].carsPassed})`);
                }
            }
            
            // Reset pass counter when car leaves zone
            if (!inZone && car._passedDuringGreen) {
                car._passedDuringGreen = false;
            }

            if ((isRedLight || allLightsRed) && inZone) {
                this.sensorData[direction].detectedCars.push(car);

                // If the car is stopped and waiting, count it as a waiting car
                if (car.isWaiting()) {
                    this.sensorData[direction].carsWaiting++;
                    
                    // CRITICAL: Only track the FRONT (first) waiting car's timer
                    if (!this.waitingCars[direction]) {
                        this.waitingCars[direction] = car;
                        console.log(`⏰ FRONT CAR WAITING: Car ${car.id} from ${direction.toUpperCase()} - Starting timer NOW!`);
                        
                        // FIXED: Start timer NOW, not backdated
                        // Use car's own wait start time if it exists, otherwise use now
                        if (!this.sensorData[direction].firstCarWaitStart) {
                            if (car.waitStartTime) {
                                // Car already has a wait start time from when it stopped
                                this.sensorData[direction].firstCarWaitStart = car.waitStartTime;
                                console.log(`🚨 TIMER STARTED: ${direction.toUpperCase()} - Car ${car.id} has been waiting ${(car.getWaitTime() / 1000).toFixed(1)}s`);
                            } else {
                                // Fallback: use current time
                                this.sensorData[direction].firstCarWaitStart = Date.now();
                                console.log(`🚨 TIMER STARTED: ${direction.toUpperCase()} - Car ${car.id} just stopped (0.0s)`);
                            }
                        }
                    }
                    // Don't log additional cars to reduce spam
                } else if (inZone && !car.isWaiting()) {
                    // Car is in detection zone but not stopped = approaching
                    this.sensorData[direction].carsApproaching++;
                }
            } else if (isGreenLight && inZone && !car.isWaiting()) {
                // Cars approaching green light (in zone, not stopped)
                this.sensorData[direction].carsApproaching++;
            }
        });

        // Calculate wait times ONLY for the FRONT waiting car in each direction
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            if (this.waitingCars[direction]) {
                // Use ONLY the front car's wait time - ignore all other waiting cars
                this.sensorData[direction].waitTime = this.waitingCars[direction].getWaitTime();
                
                // Clean up waiting cars that are no longer waiting
                if (!this.waitingCars[direction].isWaiting()) {
                    console.log(`✅ FRONT CAR CLEARED: Car ${this.waitingCars[direction].id} from ${direction} no longer waiting`);
                    this.waitingCars[direction] = null;
                    this.sensorData[direction].firstCarWaitStart = null;
                }
            }
        });

        // SUMMARY LOG: Show complete sensor data every 60 frames (~1 second)
        if (!this._logCounter) this._logCounter = 0;
        this._logCounter++;
        if (this._logCounter % 60 === 0) {
            const summary = Object.entries(this.sensorData).map(([dir, data]) => {
                return `${dir.toUpperCase()}: W=${data.carsWaiting} A=${data.carsApproaching} P=${data.carsPassed} T=${(data.waitTime/1000).toFixed(1)}s`;
            }).join(' | ');
            console.log(`📊 SENSOR SUMMARY: ${summary}`);
        }

        return this.sensorData;
    }


    getDetectionZone(direction) {
        const stopLine = this.intersection.getStopLinePosition(direction);
        const roadWidth = CONFIG.ROAD_WIDTH;
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                return {
                    x1: this.intersection.centerX - roadWidth / 2,
                    y1: stopLine.y1 - this.detectorDistance,
                    x2: this.intersection.centerX + roadWidth / 2,
                    y2: stopLine.y1
                };
            case CONFIG.DIRECTIONS.EAST:
                return {
                    x1: stopLine.x1,
                    y1: this.intersection.centerY - roadWidth / 2,
                    x2: stopLine.x1 + this.detectorDistance,
                    y2: this.intersection.centerY + roadWidth / 2
                };
            case CONFIG.DIRECTIONS.SOUTH:
                return {
                    x1: this.intersection.centerX - roadWidth / 2,
                    y1: stopLine.y1,
                    x2: this.intersection.centerX + roadWidth / 2,
                    y2: stopLine.y1 + this.detectorDistance
                };
            case CONFIG.DIRECTIONS.WEST:
                return {
                    x1: stopLine.x1 - this.detectorDistance,
                    y1: this.intersection.centerY - roadWidth / 2,
                    x2: stopLine.x1,
                    y2: this.intersection.centerY + roadWidth / 2
                };
            default:
                return { x1: 0, y1: 0, x2: 0, y2: 0 };
        }
    }

    isCarInDetectionZone(car, zone) {
        return (
            car.x >= zone.x1 &&
            car.x <= zone.x2 &&
            car.y >= zone.y1 &&
            car.y <= zone.y2
        );
    }

    render(ctx) {
        // Only render in adaptive mode
        if (!this.shouldRenderSensors()) return;

        // Render detection zones with translucent overlay
        ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
        ctx.fillStyle = 'rgba(255, 165, 0, 0.1)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            const zone = this.getDetectionZone(direction);
            
            // Fill detection zone
            ctx.fillRect(zone.x1, zone.y1, zone.x2 - zone.x1, zone.y2 - zone.y1);
            
            // Stroke detection zone border
            ctx.strokeRect(zone.x1, zone.y1, zone.x2 - zone.x1, zone.y2 - zone.y1);
            
            // Show total cars detected (white box)
            this.renderCarCount(ctx, direction, zone);
            
            // Show wait time for first waiting car (smaller red box)
            this.renderWaitTime(ctx, direction, zone);
        });
        
        ctx.setLineDash([]);
    }

    shouldRenderSensors() {
        // Check if we're in adaptive mode by looking at the game engine
        // This is a simple check - in a real implementation you'd pass the mode
        return true; // For now, always render when called
    }

    renderCarCount(ctx, direction, zone) {
        const count = this.totalCarsDetected[direction] || 0;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        
        let textX, textY;
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                textX = zone.x1 - 40;
                textY = (zone.y1 + zone.y2) / 2;
                break;
            case CONFIG.DIRECTIONS.SOUTH:
                textX = zone.x2 + 40;
                textY = (zone.y1 + zone.y2) / 2;
                break;
            case CONFIG.DIRECTIONS.EAST:
                textX = (zone.x1 + zone.x2) / 2;
                textY = zone.y1 - 20;
                break;
            case CONFIG.DIRECTIONS.WEST:
                textX = (zone.x1 + zone.x2) / 2;
                textY = zone.y2 + 30;
                break;
        }
        
        // Draw background box
        const text = count.toString();
        const textWidth = ctx.measureText(text).width;
        const boxWidth = Math.max(textWidth + 10, 30);
        const boxHeight = 20;
        
        ctx.fillRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
        ctx.strokeRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
        
        // Draw count text
        ctx.fillStyle = '#333';
        ctx.fillText(text, textX, textY + 4);
        
        // Add direction label
        ctx.font = 'bold 10px Arial';
        ctx.fillText(direction.charAt(0).toUpperCase(), textX, textY - 15);
    }

    renderWaitTime(ctx, direction, zone) {
        const waitingCar = this.waitingCars[direction];
        if (!waitingCar) return;
        
        const waitTime = (waitingCar.getWaitTime() / 1000).toFixed(1);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 1; // Smaller line width
        ctx.font = 'bold 10px Arial'; // Smaller font
        ctx.textAlign = 'center';
        
        let textX, textY;
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                textX = zone.x2 + 30; // Closer to zone
                textY = (zone.y1 + zone.y2) / 2;
                break;
            case CONFIG.DIRECTIONS.SOUTH:
                textX = zone.x1 - 30; // Closer to zone
                textY = (zone.y1 + zone.y2) / 2;
                break;
            case CONFIG.DIRECTIONS.EAST:
                textX = (zone.x1 + zone.x2) / 2;
                textY = zone.y2 + 30; // Closer to zone
                break;
            case CONFIG.DIRECTIONS.WEST:
                textX = (zone.x1 + zone.x2) / 2;
                textY = zone.y1 - 25; // Closer to zone
                break;
        }
        
        // Draw smaller background box
        const text = `${waitTime}s`;
        const textWidth = ctx.measureText(text).width;
        const boxWidth = Math.max(textWidth + 6, 20); // Smaller box
        const boxHeight = 14; // Smaller height
        
        ctx.fillRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
        ctx.strokeRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
        
        // Draw wait time text
        ctx.fillStyle = '#ff4444';
        ctx.fillText(text, textX, textY + 2);
    }

    updateDetectorDistance(distance) {
        this.detectorDistance = distance;
    }

    getSensorData() {
        return { ...this.sensorData };
    }

    getCarCounts() {
        return { ...this.carCounts };
    }

    getTotalCarsDetected() {
        return { ...this.totalCarsDetected };
    }

    resetCarCount(direction) {
        this.totalCarsDetected[direction] = 0;
    }

    resetAllCarCounts() {
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            this.totalCarsDetected[direction] = 0;
        });
        console.log('Adaptive Mode: Car counts reset for new cycle');
    }
    
    triggerCountReset() {
        this.shouldResetCounts = true;
    }

    reset() {
        this.initializeSensors();
    }
}




