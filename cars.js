import { CONFIG } from "./config.js";
import { utils } from './utils.js';
import { traj_precalc, trajFromSpec, INTERSECTION_RADIUS } from './paths.js';

export class Car {
    constructor({ id, direction, intersection, route = null, lane = 0 }) {
        this.id = id;
        this.fromDirection = direction;
        this.intersection = intersection;
        this.route = route || [direction, 'intersection', this.calculateToDirection()];
        this.lane = lane; // 0 = lane for one direction, 1 = lane for opposite direction
        this.lateralPosition = 0; // 0 = center of lane
        this.turnType = this.calculateTurnType();
        this.toDirection = this.route[2];

        
        // Position and movement
        const spawnPoint = intersection.getSpawnPointForLane(direction, lane);
        this.x = spawnPoint.x;
        this.y = spawnPoint.y;
        this.angle = this.getInitialAngle();

        // Properties
        this.speed = 0;
        this.maxSpeed = CONFIG.DEFAULT_SETTINGS.CAR_SPEED;
        this.width = CONFIG.CAR_WIDTH;
        this.height = CONFIG.CAR_HEIGHT;
        this.color = CONFIG.CAR_COLORS[Math.floor(Math.random() * CONFIG.CAR_COLORS.length)];

        // State
        this.state = 'approaching'; // approaching, waiting, crossing, turning, exiting, completed
        this.waitStartTime = null;
        this.totalWaitTime = 0;
        this.isInIntersection = false;
        this.pathProgress = 0;
        this.turnStartTime = null;

        // Path and trajectory properties
        this.trajectorySpec = null;
        this.trajectoryDistance = 0;
        this.isRegularVeh = true; // For path calculations
        this.hasInitializedTrajectory = false; // NEW: Prevent immediate trajectory jump
        
        // Lane change properties
        this.laneOld = lane;
        this.fracLaneOptical = 0; // Fractional position during lane change (0=start, 1=end)
        this.v = 0; // Lateral position for lane changes
        this.dvdt = 0; // Lateral velocity during lane change
        this.dt_LC = 4; // Lane change duration in seconds
        this.dt_afterLC = 0; // Time since lane change started

        // Calculate target position for movement
        this.calculateTargetPosition();
    }

    calculateTurnType() {
        // FLIPPED TRAFFIC DISTRIBUTION:
        // Lane 0 (turning lane) = 5% left + 5% right = 10% total traffic
        // Lane 1 (main road) = 80% straight + 10% right = 90% total traffic
        
        if (this.lane === 0) {
            // Turning lane: 5% left + 5% right out of 10% total
            // Within Lane 0: 5/10 = 50% left, 5/10 = 50% right
            const rand = Math.random();
            if (rand < 0.5) return CONFIG.TURN_TYPES.LEFT; // 50% left turns
            else return CONFIG.TURN_TYPES.RIGHT; // 50% right turns
        } else if (this.lane === 1) {
            // Main road lane: 80% straight + 10% right out of 90% total
            // Within Lane 1: 80/90 = 88.9% straight, 10/90 = 11.1% right
            const rand = Math.random();
            if (rand < 0.889) return CONFIG.TURN_TYPES.STRAIGHT; // 88.9% straight
            else return CONFIG.TURN_TYPES.LEFT; // 11.1% left turns
        }
        
        // Fallback
        return CONFIG.TURN_TYPES.STRAIGHT;
    }

    prepareForTurn() {
        // REMOVED: No lane changes allowed - cars must turn from their current lane
        // Cars stay in their assigned lane and turn from there
        // This prevents the teleporting/switching behavior
    }

    updateApproaching(dt, lightStates) {
        const stopLine = this.intersection.getStopLinePosition(this.fromDirection);
        const distanceToStop = this.getDistanceToStopLine(stopLine);
        
        // Check for cars ahead to maintain spacing
        const carAhead = this.checkForCarAhead();
        const shouldStopForCar = carAhead && this.getDistanceToCarAhead(carAhead) < 25;
        
        // IMPROVED RED LIGHT LOGIC: Check light status and stopping distance
        const isRedLight = lightStates[this.fromDirection] === CONFIG.LIGHT_STATES.RED;
        const isYellowLight = lightStates[this.fromDirection] === CONFIG.LIGHT_STATES.YELLOW;
        const isGreenLight = lightStates[this.fromDirection] === CONFIG.LIGHT_STATES.GREEN;
        
        // BETTER STOPPING LOGIC: Stop if approaching red/yellow light OR if there's a car ahead
        const shouldStopForLight = (isRedLight || isYellowLight) && distanceToStop > 0;
        const tooCloseToStopLine = distanceToStop <= 1; // Much closer to stop line - cars stop very close
        
        // Stop if: (red/yellow light AND close to stop line) OR (car ahead) OR (at stop line with red/yellow)
        if ((shouldStopForLight && distanceToStop <= 5) || shouldStopForCar || (tooCloseToStopLine && !isGreenLight)) {
            this.state = 'waiting';
            this.speed = 0;
            // Start timer immediately for red/yellow lights (not for car-following)
            if ((isRedLight || isYellowLight) && !this.waitStartTime) {
                this.waitStartTime = Date.now();
                this.totalWaitTime = 0; // Reset to ensure clean start
                console.log(`⏰ TIMER STARTED IMMEDIATELY: Car ${this.id} waiting at ${this.fromDirection} - Light: ${lightStates[this.fromDirection]}, Distance: ${distanceToStop.toFixed(1)}`);
            }
            console.log(`🛑 Car ${this.id} STOPPED at ${this.fromDirection} - Light: ${lightStates[this.fromDirection]}, Distance: ${distanceToStop.toFixed(1)}, Reason: ${shouldStopForLight ? 'RED/YELLOW LIGHT' : 'CAR AHEAD'}, Timer: ${this.waitStartTime ? 'ACTIVE' : 'NONE'}`);
            return;
        }
        
        // PROGRESSIVE DECELERATION: Slow down when approaching red lights
        if (isRedLight && distanceToStop < 20 && distanceToStop > 2) {
            // Calculate deceleration based on distance - closer = stronger braking
            const brakingForce = Math.max(80, 200 - distanceToStop * 2); // Much stronger braking
            this.speed = Math.max(0, this.speed - brakingForce * dt);
            console.log(`🚨 Car ${this.id} braking for RED light - Distance: ${distanceToStop.toFixed(1)}, Speed: ${this.speed.toFixed(1)}, Braking: ${brakingForce.toFixed(1)}`);
        } else if (isYellowLight && distanceToStop < 15 && distanceToStop > 3) {
            // Moderate braking for yellow light
            this.speed = Math.max(0, this.speed - 50 * dt);
        } else if (isGreenLight || distanceToStop > 15) {
            // Normal acceleration when light is green or far from intersection
            this.speed = Math.min(this.maxSpeed, this.speed + 30 * dt);
        }
        
        // Check if we've reached the intersection - but DON'T enter if light is red
        if (this.isInIntersection) {
            // Only enter intersection if light is green
            if (isGreenLight) {
                this.state = 'crossing';
                console.log(`🚗 Car ${this.id} entering intersection from ${this.fromDirection} - Light: ${lightStates[this.fromDirection]}`);
            } else {
                // Emergency stop - light is red/yellow and car is at intersection
                this.speed = 0;
                this.state = 'waiting';
                if (!this.waitStartTime) {
                    this.waitStartTime = Date.now();
                }
                console.log(`🚨 EMERGENCY STOP! Car ${this.id} stopped at intersection entrance - Light: ${lightStates[this.fromDirection]}`);
            }
        }
    }

    updateCrossing(dt) {
        // ENFORCE RED LIGHT EVEN IN CROSSING STATE (if not fully inside intersection)
        if (typeof this.intersection.getLightStates === 'function') {
            const lightStates = this.intersection.getLightStates();
            const lightColor = lightStates ? lightStates[this.fromDirection] : null;
            const isRedLight = lightColor === CONFIG.LIGHT_STATES.RED;
            if (isRedLight && !this.isInIntersection) {
                // Force car to stop immediately
                this.state = 'waiting';
                this.speed = 0;
                console.log(`🚨 Car ${this.id} emergency stop - red light while approaching intersection (crossing state)`);
                return;
            }
        }
        // Accelerate through intersection 
        this.speed = Math.min(this.maxSpeed * 1.2, this.speed + 40 * dt);
        
        // Check distance to intersection center for turn timing
        const centerX = this.intersection.centerX;
        const centerY = this.intersection.centerY;
        const distanceToCenter = Math.sqrt((this.x - centerX)**2 + (this.y - centerY)**2);
        
        // CRITICAL FIX: Gradual entry into turning trajectory
        if (this.turnType === CONFIG.TURN_TYPES.LEFT || this.turnType === CONFIG.TURN_TYPES.RIGHT) {
            // Check if car is close enough to intersection entry point to start turning
            const entryPoint = this.intersection.getPathEntryPoint ? 
                this.intersection.getPathEntryPoint(this.fromDirection) : null;
            const distanceToEntry = entryPoint ? 
                Math.sqrt((this.x - entryPoint.x)**2 + (this.y - entryPoint.y)**2) : 0;
            
            const nearEntryPoint = !entryPoint || distanceToEntry < 25;
            const shouldStartTurn = distanceToCenter < 30;
            
            // Only initialize trajectory when car is READY to turn (not immediately)
            if (shouldStartTurn && nearEntryPoint && !this.hasInitializedTrajectory) {
                console.log("Car", this.id, "NOW ready to turn - initializing trajectory:", this.turnType);
                this.initializeTrajectory();
                this.hasInitializedTrajectory = true;
            }
            
            // Use trajectory only if initialized and ready
            if (this.hasInitializedTrajectory && this.trajectorySpec) {
                this.followTurnTrajectory(dt);
            } else {
                // Move straight until ready to turn
                this.x += Math.cos(this.angle) * this.speed * dt;
                this.y += Math.sin(this.angle) * this.speed * dt;
                console.log("Car", this.id, "moving straight until ready to turn");
            }
        } else {
            // Straight movement
            this.x += Math.cos(this.angle) * this.speed * dt;
            this.y += Math.sin(this.angle) * this.speed * dt;
        }
        
        // Check if we've exited the intersection
        if (!this.isInIntersection && this.pathProgress > 0) {
            this.state = 'exiting';
        }
        this.pathProgress += dt;
    }

    followTurnTrajectory(dt) {
        if (!this.trajectorySpec) {
            console.warn("No trajectory spec for car", this.id, "- initializing");
            this.initializeTrajectory();
            return;
        }
        
        try {
            // Update trajectory distance based on speed
            this.trajectoryDistance += this.speed * dt;
            
            // Get current position from trajectory
            const position = trajFromSpec(this.trajectoryDistance, this.trajectorySpec);
            if (!position || position.length < 2) {
                console.warn("Invalid position from trajectory for car", this.id, "- using emergency fallback");
                // Emergency fallback - keep car moving in current direction
                this.x += Math.cos(this.angle) * this.speed * dt;
                this.y += Math.sin(this.angle) * this.speed * dt;
                return;
            }
            
            // Update car position
            this.x = position[0];
            this.y = position[1];
            
            // Add position validation to prevent cars from getting invalid positions
            if (isNaN(this.x) || isNaN(this.y)) {
                console.error("Invalid position for car", this.id, "- using fallback position");
                // Reset to a safe position near intersection center
                this.x = this.intersection.centerX;
                this.y = this.intersection.centerY;
            }
            
            // Update heading based on trajectory direction (look ahead for smooth rotation)
            const lookAhead = Math.max(2, this.speed * 0.1); // Dynamic look-ahead
            const nextPosition = trajFromSpec(this.trajectoryDistance + lookAhead, this.trajectorySpec);
            
            if (nextPosition && nextPosition.length >= 2) {
                const dx = nextPosition[0] - this.x;
                const dy = nextPosition[1] - this.y;
                if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) { // Only update if there's significant movement
                    this.angle = Math.atan2(dy, dx);
                }
            }
            
            console.log("Car", this.id, "trajectory position:", this.x.toFixed(1), this.y.toFixed(1), "angle:", (this.angle * 180/Math.PI).toFixed(1));
        } catch (error) {
            console.error("Error in followTurnTrajectory for car", this.id, error);
            throw error; // Re-throw so updateCrossing can handle fallback
        }
    }

    initializeTrajectory() {
        try {
            // Use intersection's trajectory calculation with car's specific lane
            this.trajectorySpec = this.intersection.calculateTrajectory(
                this.fromDirection, 
                this.toDirection, 
                this.turnType,
                this.lane  // Pass the car's current lane
            );
            
            if (!this.trajectorySpec) {
                console.error("Failed to create trajectory for car", this.id, {
                    from: this.fromDirection,
                    to: this.toDirection,
                    turnType: this.turnType,
                    lane: this.lane
                });
                // Create a simple fallback trajectory
                this.createFallbackTrajectory();
            } else {
                console.log("Initialized trajectory for car", this.id, "turn type:", this.turnType, "lane:", this.lane);
            }
        } catch (error) {
            console.error("Error creating trajectory for car", this.id, error);
            this.createFallbackTrajectory();
        }
    }

    doSimpleTurn(dt) {
        // Simple turning logic when trajectory system fails
        const centerX = this.intersection.centerX;
        const centerY = this.intersection.centerY;
        
        // Calculate turn rate based on speed and turn radius
        const turnRadius = 20; // Simple fixed radius for fallback turns
        const turnRate = this.speed / turnRadius; // radians per second
        
        // Apply turn rate based on turn type
        if (this.turnType === CONFIG.TURN_TYPES.LEFT) {
            this.angle += turnRate * dt; // Turn left (counter-clockwise)
        } else if (this.turnType === CONFIG.TURN_TYPES.RIGHT) {
            this.angle -= turnRate * dt; // Turn right (clockwise)
        }
        
        // Move forward
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;
        
        console.log("Car", this.id, "simple turn - angle:", (this.angle * 180/Math.PI).toFixed(1), "position:", this.x.toFixed(1), this.y.toFixed(1));
    }

    createFallbackTrajectory() {
        // Create a simple trajectory using the car's specific lane
        const entry = this.intersection.getPathEntryPoint(this.fromDirection, this.lane);
        const exit = this.intersection.getExitPointForTurn(this.fromDirection, this.turnType, this.lane);
        const distance = Math.sqrt((exit.x - entry.x)**2 + (exit.y - entry.y)**2);
        const heading = Math.atan2(exit.y - entry.y, exit.x - entry.x);
        
        this.trajectorySpec = traj_precalc(entry.x, entry.y, heading, [distance], [0]);
        console.warn("Using fallback trajectory for car", this.id, "lane:", this.lane);
    }

    calculateToDirection() {
        const directions = [CONFIG.DIRECTIONS.NORTH, CONFIG.DIRECTIONS.EAST, CONFIG.DIRECTIONS.SOUTH, CONFIG.DIRECTIONS.WEST];
        const currentIndex = directions.indexOf(this.fromDirection);
        
        switch (this.turnType) {
            case CONFIG.TURN_TYPES.STRAIGHT:
                return directions[(currentIndex + 2) % 4]; // Opposite direction
            case CONFIG.TURN_TYPES.RIGHT:
                return directions[(currentIndex + 3) % 4]; // Turn right (clockwise)
            case CONFIG.TURN_TYPES.LEFT:
                return directions[(currentIndex + 1) % 4]; // Turn left (counter-clockwise)
            default:
                return directions[(currentIndex + 2) % 4]; // Default to straight
        }
    }

    getInitialAngle() {
        switch (this.fromDirection) {
            case CONFIG.DIRECTIONS.NORTH: return Math.PI / 2; // Facing south (down)
            case CONFIG.DIRECTIONS.EAST: return Math.PI; // Facing west (left)
            case CONFIG.DIRECTIONS.SOUTH: return -Math.PI / 2; // Facing north (up)
            case CONFIG.DIRECTIONS.WEST: return 0; // Facing east (right)
            default: return 0;
        }
    }
calculateTargetPosition() {
    // Make sure intersection and fromDirection are valid
    if (this.intersection && typeof this.intersection.getExitPoint === 'function' && this.fromDirection) {
        const target = this.intersection.getExitPoint(this.fromDirection);
        if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
            console.warn("Target position is undefined or invalid for car", this.id);
            return;
        }
        this.targetX = target.x;
        this.targetY = target.y;
    } else {
        console.warn("intersection.getExitPoint is not a function or direction is missing");
    }
}

    update(deltaTime, lightStates) {
        const dt = deltaTime / 1000; // Convert to seconds

        // Safety check - if car has invalid position, reset to safe location
        if (isNaN(this.x) || isNaN(this.y)) {
            console.error("Car", this.id, "has invalid position, resetting to spawn point");
            const spawnPoint = this.intersection.getSpawnPointForLane(this.fromDirection, this.lane);
            this.x = spawnPoint.x;
            this.y = spawnPoint.y;
            this.state = 'approaching';
            this.speed = 0;
        }

        // REMOVED lane change physics - cars don't change lanes anymore
        // this.updateLaneChangePhysics(dt);

        switch (this.state) {
            case 'approaching':
                this.updateApproaching(dt, lightStates);
                break;
            case 'waiting':
                this.updateWaiting(dt, lightStates);
                break;
            case 'crossing':
                this.updateCrossing(dt);
                break;
            case 'turning':
                console.log("Car", this.id, "in turning state - redirecting to crossing");
                this.updateTurning(dt);
                break;
            case 'exiting':
                this.updateExiting(dt);
                break;
            default:
                console.warn("Car", this.id, "in unknown state:", this.state, "- setting to exiting");
                this.state = 'exiting'; // Safety fallback for unknown states
        }

        // Movement is now handled in individual state update methods
        // Trajectory-based movement for crossing state, normal movement for other states
        if (this.speed > 0 && this.state !== 'crossing') {
            // Only use straight-line movement for non-crossing states
            this.x += Math.cos(this.angle) * this.speed * dt;
            this.y += Math.sin(this.angle) * this.speed * dt;
        }

        // Check if car is in intersection
        this.isInIntersection = this.intersection.isInIntersection(this.x, this.y);
    }

    updateLaneChangePhysics(dt) {
        // DISABLED - cars no longer change lanes
        // This method is kept for compatibility but does nothing
    }

    startLaneChange(targetLane) {
        // DISABLED - cars cannot change lanes anymore
        console.log("Lane change attempted but disabled for car", this.id);
    }

    updateWaiting(dt, lightStates) {
        // Don't move while waiting
        this.speed = 0;
        
        // Update wait timer continuously
        if (this.waitStartTime) {
            this.totalWaitTime = Date.now() - this.waitStartTime;
        }
        
        // Check for car ahead before proceeding (only cars in SAME LANE)
        const carAhead = this.checkForCarAhead();
        const carTooClose = carAhead && this.getDistanceToCarAhead(carAhead) < 20;

        // Check light status
        const lightColor = lightStates[this.fromDirection];
        const isGreenLight = lightColor === CONFIG.LIGHT_STATES.GREEN;

        // Only allow to proceed if green and not blocked by car ahead
        if (isGreenLight && !carTooClose) {
            console.log(`🟢 Car ${this.id} proceeding from waiting - Light: ${lightColor}, Wait time: ${(this.totalWaitTime/1000).toFixed(1)}s`);
            this.state = 'crossing';
            // Clear wait timer when car starts moving
            this.waitStartTime = null;
            this.totalWaitTime = 0;
            this.speed = 10;
            // Reset trajectory initialization
            this.trajectorySpec = null;
            this.trajectoryDistance = 0;
            this.hasInitializedTrajectory = false;
        } else {
            // Stay waiting and speed stays zero, no matter how long the wait
            this.state = 'waiting';
            this.speed = 0;
            // Optionally, log why we can't proceed
            const reason = !isGreenLight ? `Light is ${lightColor}` : 'Car ahead too close';
            if (this.totalWaitTime % 2000 < 100) { // Log every 2 seconds
                console.log(`⏰ Car ${this.id} still waiting at ${this.fromDirection} - ${reason}, Wait time: ${(this.totalWaitTime/1000).toFixed(1)}s`);
            }
        }
    }

    updateTurning(dt) {
        // REMOVED: This method was causing cars to disappear
        // Instead, redirect all turning cars to use the crossing state
        console.log("Car", this.id, "redirected from turning to crossing state");
        this.state = 'crossing';
        
        // Ensure car maintains speed
        if (this.speed <= 0) {
            this.speed = this.maxSpeed * 0.8;
        }
        
        // Use crossing logic instead
        this.updateCrossing(dt);
    }

    getExitPosition(fromDirection, turnType, lane) {
        const cx = this.intersection.centerX;
        const cy = this.intersection.centerY;
        const roadWidth = CONFIG.ROAD_WIDTH;
        const laneWidth = CONFIG.LANE_WIDTH;
        const intersectionSize = CONFIG.INTERSECTION_SIZE;
        
        // Calculate lane offset from road center
        const laneOffset = (lane - 0.5) * laneWidth;
        const roadDistance = intersectionSize / 2 + 10; // Distance from center to road edge
        
        let exitDirection, x, y, heading;
        
        switch (fromDirection) {
            case CONFIG.DIRECTIONS.NORTH:
                switch (turnType) {
                    case CONFIG.TURN_TYPES.STRAIGHT:
                        exitDirection = CONFIG.DIRECTIONS.SOUTH;
                        x = cx + laneOffset;
                        y = cy + roadDistance;
                        heading = CONFIG.HEADINGS.SOUTH;
                        break;
                    case CONFIG.TURN_TYPES.LEFT:
                        exitDirection = CONFIG.DIRECTIONS.EAST;
                        x = cx + roadDistance;
                        y = cy + laneOffset;
                        heading = CONFIG.HEADINGS.EAST;
                        break;
                    case CONFIG.TURN_TYPES.RIGHT:
                        exitDirection = CONFIG.DIRECTIONS.WEST;
                        x = cx - roadDistance;
                        y = cy - laneOffset;
                        heading = CONFIG.HEADINGS.WEST;
                        break;
                }
                break;
                
            case CONFIG.DIRECTIONS.SOUTH:
                switch (turnType) {
                    case CONFIG.TURN_TYPES.STRAIGHT:
                        exitDirection = CONFIG.DIRECTIONS.NORTH;
                        x = cx - laneOffset;
                        y = cy - roadDistance;
                        heading = CONFIG.HEADINGS.NORTH;
                        break;
                    case CONFIG.TURN_TYPES.LEFT:
                        exitDirection = CONFIG.DIRECTIONS.WEST;
                        x = cx - roadDistance;
                        y = cy - laneOffset;
                        heading = CONFIG.HEADINGS.WEST;
                        break;
                    case CONFIG.TURN_TYPES.RIGHT:
                        exitDirection = CONFIG.DIRECTIONS.EAST;
                        x = cx + roadDistance;
                        y = cy + laneOffset;
                        heading = CONFIG.HEADINGS.EAST;
                        break;
                }
                break;
                
            case CONFIG.DIRECTIONS.EAST:
                switch (turnType) {
                    case CONFIG.TURN_TYPES.STRAIGHT:
                        exitDirection = CONFIG.DIRECTIONS.WEST;
                        x = cx - roadDistance;
                        y = cy + laneOffset;
                        heading = CONFIG.HEADINGS.WEST;
                        break;
                    case CONFIG.TURN_TYPES.LEFT:
                        exitDirection = CONFIG.DIRECTIONS.NORTH;
                        x = cx - laneOffset;
                        y = cy - roadDistance;
                        heading = CONFIG.HEADINGS.NORTH;
                        break;
                    case CONFIG.TURN_TYPES.RIGHT:
                        exitDirection = CONFIG.DIRECTIONS.SOUTH;
                        x = cx + laneOffset;
                        y = cy + roadDistance;
                        heading = CONFIG.HEADINGS.SOUTH;
                        break;
                }
                break;
                
            case CONFIG.DIRECTIONS.WEST:
                switch (turnType) {
                    case CONFIG.TURN_TYPES.STRAIGHT:
                        exitDirection = CONFIG.DIRECTIONS.EAST;
                        x = cx + roadDistance;
                        y = cy - laneOffset;
                        heading = CONFIG.HEADINGS.EAST;
                        break;
                    case CONFIG.TURN_TYPES.LEFT:
                        exitDirection = CONFIG.DIRECTIONS.SOUTH;
                        x = cx + laneOffset;
                        y = cy + roadDistance;
                        heading = CONFIG.HEADINGS.SOUTH;
                        break;
                    case CONFIG.TURN_TYPES.RIGHT:
                        exitDirection = CONFIG.DIRECTIONS.NORTH;
                        x = cx - laneOffset;
                        y = cy - roadDistance;
                        heading = CONFIG.HEADINGS.NORTH;
                        break;
                }
                break;
        }
        
        return { direction: exitDirection, x, y, heading };
    }

    degreesToRadians(degrees) {
        return (degrees * Math.PI) / 180;
    }

    getTargetExitAngle() {
        switch (this.toDirection) {
            case CONFIG.DIRECTIONS.NORTH: return -Math.PI / 2; // Facing up
            case CONFIG.DIRECTIONS.EAST: return 0; // Facing right
            case CONFIG.DIRECTIONS.SOUTH: return Math.PI / 2; // Facing down
            case CONFIG.DIRECTIONS.WEST: return Math.PI; // Facing left
            default: return this.angle;
        }
    }

    updateExiting(dt) {
        // Cars keep their original lane after exiting - no lane switching
        this.lateralPosition = 0; // Center in lane

        // Update route to next segment (simulate route progression)
        if (this.route && this.route.length > 1) {
            this.route = this.route.slice(1);
        }

        // Continue moving at normal speed in the direction we're facing
        this.speed = this.maxSpeed;

        // Check if we've reached the edge of the canvas - more conservative boundaries
        let hasExited = false;

        // More conservative exit detection - larger boundaries to prevent premature removal
        hasExited = this.x < -100 || this.x > CONFIG.CANVAS_WIDTH + 100 || 
                   this.y < -100 || this.y > CONFIG.CANVAS_HEIGHT + 100;

        if (hasExited) {
            console.log("Car", this.id, "exiting canvas at position:", this.x.toFixed(1), this.y.toFixed(1));
            this.state = 'completed';
        }
    }

    getDistanceToStopLine(stopLine) {
        // Calculate distance from car FRONT to stop line, considering car size and direction
        const carFrontX = this.x + (this.width/2) * Math.cos(this.angle);
        const carFrontY = this.y + (this.height/2) * Math.sin(this.angle);
        
        let distance = 0;
        
        switch (this.fromDirection) {
            case CONFIG.DIRECTIONS.NORTH:
                // Coming from north (top), going south - car front to horizontal stop line
                distance = Math.max(0, stopLine.y1 - carFrontY);
                break;
            case CONFIG.DIRECTIONS.EAST:
                // Coming from east (right), going west - car front to vertical stop line  
                distance = Math.max(0, carFrontX - stopLine.x1);
                break;
            case CONFIG.DIRECTIONS.SOUTH:
                // Coming from south (bottom), going north - car front to horizontal stop line
                distance = Math.max(0, carFrontY - stopLine.y1);
                break;
            case CONFIG.DIRECTIONS.WEST:
                // Coming from west (left), going east - car front to vertical stop line
                distance = Math.max(0, stopLine.x1 - carFrontX);
                break;
            default:
                distance = 0;
        }
        
        return distance;
    }

    render(ctx) {
        // Always render cars - multiple safeguards against disappearing cars
        
        // Validate position before rendering
        if (isNaN(this.x) || isNaN(this.y)) {
            console.error("Car", this.id, "has invalid position, skipping render");
            return;
        }
        
        ctx.save();
        // Move to car position and rotate
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        // Draw car body
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        // Draw car details
        ctx.fillStyle = '#333333';
        ctx.fillRect(-this.width / 2 + 2, -this.height / 2 + 2, this.width - 4, 3); // Windshield
        ctx.fillRect(-this.width / 2 + 2, this.height / 2 - 5, this.width - 4, 3); // Rear window
        ctx.restore();
    }

    // Getters for external systems
    isWaiting() {
        return this.state === 'waiting';
    }

    isCompleted() {
        return this.state === 'completed';
    }

    getWaitTime() {
        // Return real-time wait time if currently waiting
        if (this.waitStartTime) {
            return Date.now() - this.waitStartTime;
        }
        // Return stored total wait time if not currently waiting
        return this.totalWaitTime;
    }

    getDirection() {
        return this.fromDirection;
    }

    checkForCarAhead() {
        const allCars = this.intersection.carManager ? this.intersection.carManager.getCars() : [];
        
        let closestCar = null;
        let closestDistance = Infinity;
        
        for (const otherCar of allCars) {
            // Skip self
            if (otherCar.id === this.id) continue;
            
            // Skip cars from different directions
            if (otherCar.fromDirection !== this.fromDirection) continue;
            
            // MOST IMPORTANT: Only check cars in the EXACT SAME LANE
            if (otherCar.lane !== this.lane) continue; // This is the key fix!
            
            // Check if the other car is ahead of this car
            let isAhead = false;
            let distance = 0;
            
            switch (this.fromDirection) {
                case CONFIG.DIRECTIONS.NORTH:
                    isAhead = otherCar.y > this.y;
                    distance = otherCar.y - this.y - this.height;
                    break;
                case CONFIG.DIRECTIONS.EAST:
                    isAhead = otherCar.x < this.x;
                    distance = this.x - otherCar.x - this.width;
                    break;
                case CONFIG.DIRECTIONS.SOUTH:
                    isAhead = otherCar.y < this.y;
                    distance = this.y - otherCar.y - this.height;
                    break;
                case CONFIG.DIRECTIONS.WEST:
                    isAhead = otherCar.x > this.x;
                    distance = otherCar.x - this.x - this.width;
                    break;
            }
            
            if (isAhead && distance > 0 && distance < closestDistance) {
                closestDistance = distance;
                closestCar = otherCar;
            }
        }
        
        return closestCar;
    }

    getDistanceToCarAhead(carAhead) {
        if (!carAhead) return Infinity;
        
        switch (this.fromDirection) {
            case CONFIG.DIRECTIONS.NORTH:
                return carAhead.y - this.y - this.height;
            case CONFIG.DIRECTIONS.EAST:
                return this.x - carAhead.x - this.width;
            case CONFIG.DIRECTIONS.SOUTH:
                return this.y - carAhead.y - this.height;
            case CONFIG.DIRECTIONS.WEST:
                return carAhead.x - this.x - this.width;
            default:
                return Infinity;
        }
    }

    // ...existing code...
}

export class CarManager {
    constructor(intersection) {
        this.intersection = intersection;
        this.cars = [];
        this.nextCarId = 1;
        this.spawnTimer = 0;
        this.settings = { ...CONFIG.DEFAULT_SETTINGS };
        
        // Callbacks
        this.onCarCompleted = null;
        
        // Set reference in intersection for car-to-car communication
        this.intersection.carManager = this;
    }

    initialize(settings) {
        this.settings = { ...settings };
        this.cars = [];
        this.nextCarId = 1;
        this.spawnTimer = 0;
    }

    update(deltaTime, lightStates) {
        // Update spawn timer
        this.spawnTimer += deltaTime;
        
        // Spawn new cars
        const spawnInterval = (10000 / this.settings.CAR_SPAWN_RATE); // Convert rate to interval
        if (this.spawnTimer >= spawnInterval) {
            this.spawnCar();
            this.spawnTimer = 0;
        }

        // Update existing cars
        this.cars.forEach(car => {
            car.maxSpeed = this.settings.CAR_SPEED;
            
            // Safety check before updating each car
            if (!car || typeof car.update !== 'function') {
                console.error("Invalid car object found, skipping update");
                return;
            }
            
            car.update(deltaTime, lightStates);
        });

        // Remove completed cars and log what's happening
        const completedCars = this.cars.filter(car => car && car.isCompleted());
        
        // Only remove cars that have genuinely exited the canvas
        const validCompletedCars = completedCars.filter(car => {
            const hasExitedCanvas = car.x < -100 || car.x > CONFIG.CANVAS_WIDTH + 100 || 
                                   car.y < -100 || car.y > CONFIG.CANVAS_HEIGHT + 100;
            
            if (!hasExitedCanvas) {
                console.warn("Car", car.id, "marked as completed but hasn't exited canvas - keeping alive");
                car.state = 'exiting'; // Reset to exiting state
                return false;
            }
            return true;
        });
        
        validCompletedCars.forEach(car => {
            console.log("Removing completed car", car.id, "details:", {
                position: [car.x.toFixed(1), car.y.toFixed(1)],
                state: car.state,
                turnType: car.turnType,
                canvasBounds: {
                    width: CONFIG.CANVAS_WIDTH,
                    height: CONFIG.CANVAS_HEIGHT
                },
                exitedNaturally: car.x < -100 || car.x > CONFIG.CANVAS_WIDTH + 100 || 
                                car.y < -100 || car.y > CONFIG.CANVAS_HEIGHT + 100
            });
            if (this.onCarCompleted) {
                this.onCarCompleted(car);
            }
        });

        // Only remove cars that have genuinely completed their journey
        this.cars = this.cars.filter(car => car && !validCompletedCars.includes(car));
    }

    spawnCar() {
        const directions = [CONFIG.DIRECTIONS.NORTH, CONFIG.DIRECTIONS.EAST, CONFIG.DIRECTIONS.SOUTH, CONFIG.DIRECTIONS.WEST];
        const direction = directions[Math.floor(Math.random() * directions.length)];
        
        // TRAFFIC DISTRIBUTION: 10% Lane 0 (turning lane), 90% Lane 1 (main road)
        const laneRandom = Math.random();
        const lane = laneRandom < 0.10 ? 0 : 1; // 10% go to Lane 0, 90% go to Lane 1
        
        const spawnPoint = this.intersection.getSpawnPointForLane(direction, lane);
        const minSpacing = 60; // Reduced spacing for better traffic flow
        
        // Check for blocking cars in SAME DIRECTION and SAME LANE only
        const tooClose = this.cars.some(car => {
            if (car.fromDirection !== direction) return false;
            if (car.lane !== lane) return false; // Only check same lane
            
            const distance = utils.getDistance(car.x, car.y, spawnPoint.x, spawnPoint.y);
            return distance < minSpacing;
        });

        if (!tooClose) {
            const car = new Car({
                id: this.nextCarId++,
                direction: direction,
                intersection: this.intersection,
                lane: lane
            });
            this.cars.push(car);
            console.log("Spawned car", car.id, "from", direction, "in lane", lane, "at", spawnPoint.x, spawnPoint.y, "- Lane 1 is main road now!");
        }
    }

    render(ctx) {
        this.cars.forEach(car => car.render(ctx));
    }

    reset() {
        this.cars = [];
        this.nextCarId = 1;
        this.spawnTimer = 0;
    }

    updateSettings(settings) {
        this.settings = { ...settings };
    }

    // Getters for external systems
    getCars() {
        return [...this.cars];
    }

    getWaitingCars(direction) {
        return this.cars.filter(car => car.getDirection() === direction && car.isWaiting());
    }

    getCurrentCarCount() {
        return this.cars.length;
    }
}