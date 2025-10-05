import { CONFIG } from './config.js';
// Stop line positions (before intersection, always close to center)
// (Moved import below)
import { traj_precalc, INTERSECTION_RADIUS } from './paths.js';
export class Intersection {

    constructor(centerX, centerY) {
        this.centerX = centerX;
        this.centerY = centerY;
        this.size = CONFIG.INTERSECTION_SIZE;
        this.roadWidth = CONFIG.ROAD_WIDTH;
        this.laneWidth = CONFIG.LANE_WIDTH;
        
        this.calculatePositions();
    }

    initialize() {
        this.calculatePositions();
    }

    calculatePositions() {
        const halfSize = this.size / 2;
        const halfRoad = this.roadWidth / 2;
        const laneOffset = this.laneWidth / 2;
        
        // Stop line positions (much closer to intersection for better traffic flow)
        const stopLineOffset = halfSize - 5;
this.stopLines = {
    [CONFIG.DIRECTIONS.NORTH]: {
        x1: this.centerX - halfRoad,
        y1: this.centerY - stopLineOffset,
        x2: this.centerX + halfRoad,
        y2: this.centerY - stopLineOffset
    },
    [CONFIG.DIRECTIONS.EAST]: {
        x1: this.centerX + stopLineOffset,
        y1: this.centerY - halfRoad,
        x2: this.centerX + stopLineOffset,
        y2: this.centerY + halfRoad
    },
    [CONFIG.DIRECTIONS.SOUTH]: {
        x1: this.centerX - halfRoad,
        y1: this.centerY + stopLineOffset,
        x2: this.centerX + halfRoad,
        y2: this.centerY + stopLineOffset
    },
    [CONFIG.DIRECTIONS.WEST]: {
        x1: this.centerX - stopLineOffset,
        y1: this.centerY - halfRoad,
        x2: this.centerX - stopLineOffset,
        y2: this.centerY + halfRoad
    }
};
        // Traffic light positions - moved much further off the road
        this.lightPositions = {
            [CONFIG.DIRECTIONS.NORTH]: {
                x: this.centerX - 50,  // Much further left
                y: this.centerY - halfSize - 50  // Much further up
            },
            [CONFIG.DIRECTIONS.EAST]: {
                x: this.centerX + halfSize + 20,  // Much further right
                y: this.centerY - 50   // Much further up
            },
            [CONFIG.DIRECTIONS.SOUTH]: {
                x: this.centerX + 50,  // Much further right
                y: this.centerY + halfSize + 30  // Much further down
            },
            [CONFIG.DIRECTIONS.WEST]: {
                x: this.centerX - halfSize - 50,  // Much further left (moved 3 units right)
                y: this.centerY + 50  // Much further down
            }
        };

        // Car spawn points
        this.spawnPoints = {
            [CONFIG.DIRECTIONS.NORTH]: {
                x: this.centerX - laneOffset, // Default to right lane
                y: 0
            },
            [CONFIG.DIRECTIONS.EAST]: {
                x: CONFIG.CANVAS_WIDTH,
                y: this.centerY - laneOffset // Default to right lane
            },
            [CONFIG.DIRECTIONS.SOUTH]: {
                x: this.centerX + laneOffset, // Default to right lane
                y: CONFIG.CANVAS_HEIGHT
            },
            [CONFIG.DIRECTIONS.WEST]: {
                x: 0,
                y: this.centerY + laneOffset // Default to right lane
            }
        };
        
        // Update spawn points to support both lanes
        this.updateSpawnPointsForLanes();

        // Exit points - positioned in lane centers for straight-through traffic
        const laneCenter = this.laneWidth * 0.5; // 7.5px (inner lane center)
        this.exitPoints = {
            [CONFIG.DIRECTIONS.NORTH]: {
                x: this.centerX + laneCenter,
                y: 0
            },
            [CONFIG.DIRECTIONS.EAST]: {
                x: CONFIG.CANVAS_WIDTH,
                y: this.centerY + laneCenter
            },
            [CONFIG.DIRECTIONS.SOUTH]: {
                x: this.centerX - laneCenter,
                y: CONFIG.CANVAS_HEIGHT
            },
            [CONFIG.DIRECTIONS.WEST]: {
                x: 0,
                y: this.centerY - laneCenter
            }
        };
    }

    updateSpawnPointsForLanes() {
        // Simplified lane centering: place cars in center of each lane
        // Road has 4 lanes: 2 lanes each direction separated by centerline
        // Lane centers are at: -22.5, -7.5, +7.5, +22.5 from road center
        
        const lane1Center = this.laneWidth * 1.5; // 22.5px from center (outer lane)
        const lane2Center = this.laneWidth * 0.5; // 7.5px from center (inner lane)
        
        this.spawnPointsByLane = {
            [CONFIG.DIRECTIONS.NORTH]: [
                // Lane 0: Inner lane (closer to center)
                { x: this.centerX - lane2Center, y: 0 },
                // Lane 1: Outer lane (further from center)  
                { x: this.centerX - lane1Center, y: 0 },
                // Lane 2: Right inner lane (going north)
                { x: this.centerX + lane2Center, y: CONFIG.CANVAS_HEIGHT },
                // Lane 3: Right outer lane (going north)
                { x: this.centerX + lane1Center, y: CONFIG.CANVAS_HEIGHT }
            ],
            [CONFIG.DIRECTIONS.EAST]: [
                // Lane 0: Inner lane (closer to center)
                { x: CONFIG.CANVAS_WIDTH, y: this.centerY - lane2Center },
                // Lane 1: Outer lane (further from center)
                { x: CONFIG.CANVAS_WIDTH, y: this.centerY - lane1Center },
                // Lane 2: Bottom inner lane (going east)
                { x: 0, y: this.centerY + lane2Center },
                // Lane 3: Bottom outer lane (going east)
                { x: 0, y: this.centerY + lane1Center }
            ],
            [CONFIG.DIRECTIONS.SOUTH]: [
                // Lane 0: Inner lane (closer to center)
                { x: this.centerX + lane2Center, y: CONFIG.CANVAS_HEIGHT },
                // Lane 1: Outer lane (further from center)
                { x: this.centerX + lane1Center, y: CONFIG.CANVAS_HEIGHT },
                // Lane 2: Left inner lane (going south)
                { x: this.centerX - lane2Center, y: 0 },
                // Lane 3: Left outer lane (going south)
                { x: this.centerX - lane1Center, y: 0 }
            ],
            [CONFIG.DIRECTIONS.WEST]: [
                // Lane 0: Inner lane (closer to center)
                { x: 0, y: this.centerY + lane2Center },
                // Lane 1: Outer lane (further from center)
                { x: 0, y: this.centerY + lane1Center },
                // Lane 2: Top inner lane (going west)
                { x: CONFIG.CANVAS_WIDTH, y: this.centerY - lane2Center },
                // Lane 3: Top outer lane (going west)
                { x: CONFIG.CANVAS_WIDTH, y: this.centerY - lane1Center }
            ]
        };
    }

    getSpawnPointForLane(direction, lane) {
        if (this.spawnPointsByLane[direction] && this.spawnPointsByLane[direction][lane]) {
            return this.spawnPointsByLane[direction][lane];
        }
        return this.spawnPoints[direction];
    }

    render(ctx) {
        this.drawRoads(ctx);
        this.drawIntersection(ctx);
        this.drawLaneMarkings(ctx);
        this.drawStopLines(ctx);
    }

    drawRoads(ctx) {
        const halfRoad = this.roadWidth / 2;
        
        ctx.fillStyle = '#444444';
        
        // Vertical road (North-South)
        ctx.fillRect(
            this.centerX - halfRoad,
            0,
            this.roadWidth,
            CONFIG.CANVAS_HEIGHT
        );
        
        // Horizontal road (East-West)
        ctx.fillRect(
            0,
            this.centerY - halfRoad,
            CONFIG.CANVAS_WIDTH,
            this.roadWidth
        );
    }

drawIntersection(ctx) {
    const halfRoad = this.roadWidth / 2;
    const curveRadius = halfRoad; // Makes the inward curve meet nicely

    ctx.fillStyle = '#666666';
    ctx.beginPath();

    // Start top middle going clockwise
    ctx.moveTo(this.centerX - halfRoad, this.centerY - halfRoad - curveRadius);

    // Top left inward curve
    ctx.quadraticCurveTo(
        this.centerX - halfRoad, this.centerY - halfRoad,
        this.centerX - halfRoad - curveRadius, this.centerY - halfRoad
    );

    // Left top to left bottom
    ctx.lineTo(this.centerX - halfRoad - curveRadius, this.centerY + halfRoad);

    // Bottom left inward curve
    ctx.quadraticCurveTo(
        this.centerX - halfRoad, this.centerY + halfRoad,
        this.centerX - halfRoad, this.centerY + halfRoad + curveRadius
    );

    // Bottom middle to bottom right
    ctx.lineTo(this.centerX + halfRoad, this.centerY + halfRoad + curveRadius);

    // Bottom right inward curve
    ctx.quadraticCurveTo(
        this.centerX + halfRoad, this.centerY + halfRoad,
        this.centerX + halfRoad + curveRadius, this.centerY + halfRoad
    );

    // Right bottom to right top
    ctx.lineTo(this.centerX + halfRoad + curveRadius, this.centerY - halfRoad);

    // Top right inward curve
    ctx.quadraticCurveTo(
        this.centerX + halfRoad, this.centerY - halfRoad,
        this.centerX + halfRoad, this.centerY - halfRoad - curveRadius
    );

    // Back to start
    ctx.closePath();
    ctx.fill();

    // Restore normal drawing mode for anything after
    ctx.globalCompositeOperation = 'source-over';
}

    drawLaneMarkings(ctx) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);

        const halfRoad = this.roadWidth / 2;
        
        // Vertical lane markings (North-South road)
        ctx.beginPath();
        // Center divider
        ctx.moveTo(this.centerX, 0);
        ctx.lineTo(this.centerX, this.centerY - halfRoad);
        ctx.moveTo(this.centerX, this.centerY + halfRoad);
        ctx.lineTo(this.centerX, CONFIG.CANVAS_HEIGHT);
        
        // Lane divider for left side (between lanes 0 and 1)
        const leftDivider = this.centerX - this.laneWidth;
        ctx.moveTo(leftDivider, 0);
        ctx.lineTo(leftDivider, this.centerY - halfRoad);
        ctx.moveTo(leftDivider, this.centerY + halfRoad);
        ctx.lineTo(leftDivider, CONFIG.CANVAS_HEIGHT);
        
        // Lane divider for right side (between lanes 2 and 3)
        const rightDivider = this.centerX + this.laneWidth;
        ctx.moveTo(rightDivider, 0);
        ctx.lineTo(rightDivider, this.centerY - halfRoad);
        ctx.moveTo(rightDivider, this.centerY + halfRoad);
        ctx.lineTo(rightDivider, CONFIG.CANVAS_HEIGHT);
        ctx.stroke();
        
        // Horizontal lane markings (East-West road)
        ctx.beginPath();
        // Center divider
        ctx.moveTo(0, this.centerY);
        ctx.lineTo(this.centerX - halfRoad, this.centerY);
        ctx.moveTo(this.centerX + halfRoad, this.centerY);
        ctx.lineTo(CONFIG.CANVAS_WIDTH, this.centerY);
        
        // Lane divider for top side (between lanes 0 and 1)
        const topDivider = this.centerY - this.laneWidth;
        ctx.moveTo(0, topDivider);
        ctx.lineTo(this.centerX - halfRoad, topDivider);
        ctx.moveTo(this.centerX + halfRoad, topDivider);
        ctx.lineTo(CONFIG.CANVAS_WIDTH, topDivider);
        
        // Lane divider for bottom side (between lanes 2 and 3)
        const bottomDivider = this.centerY + this.laneWidth;
        ctx.moveTo(0, bottomDivider);
        ctx.lineTo(this.centerX - halfRoad, bottomDivider);
        ctx.moveTo(this.centerX + halfRoad, bottomDivider);
        ctx.lineTo(CONFIG.CANVAS_WIDTH, bottomDivider);
        ctx.stroke();

        ctx.setLineDash([]);
    }

    drawStopLines(ctx) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        
        Object.values(this.stopLines).forEach(line => {
            ctx.beginPath();
            ctx.moveTo(line.x1, line.y1);
            ctx.lineTo(line.x2, line.y2);
            ctx.stroke();
        });
    }

    // Helper methods for car navigation
    getStopLinePosition(direction) {
        return this.stopLines[direction];
    }

    getSpawnPoint(direction) {
        const offset = 300; // Adjust as needed for your canvas
        switch (direction) {
            case 'north': return { x: this.centerX, y: this.centerY - offset };
            case 'south': return { x: this.centerX, y: this.centerY + offset };
            case 'east':  return { x: this.centerX + offset, y: this.centerY };
            case 'west':  return { x: this.centerX - offset, y: this.centerY };
            default: return undefined;
        }
    }

    getExitPoint(direction) {
        const offset = 300; // Adjust as needed for your canvas
        switch (direction) {
            case 'north': return { x: this.centerX, y: this.centerY - offset };
            case 'south': return { x: this.centerX, y: this.centerY + offset };
            case 'east':  return { x: this.centerX + offset, y: this.centerY };
            case 'west':  return { x: this.centerX - offset, y: this.centerY };
            default: return undefined;
        }
    }
getLightPosition(direction) {
    if (!direction || typeof direction !== 'string') {
        console.warn("Invalid direction for getLightPosition:", direction);
        return undefined;
    }
    return this.lightPositions[direction];
}

    // Check if a point is within the intersection
    isInIntersection(x, y) {
        const halfRoad = this.roadWidth / 2;
        return (
            x >= this.centerX - halfRoad &&
            x <= this.centerX + halfRoad &&
            y >= this.centerY - halfRoad &&
            y <= this.centerY + halfRoad
        );
    }

    // Get proper exit point based on turn type to ensure correct lane usage
    // ...existing code...
    getProperExitPoint(fromDirection, toDirection, turnType) {
        const laneOffset = this.laneWidth / 2;

        // Improved turn logic based on your description
        // Removed turning logic
        return this.exitPoints[toDirection];
    }
// ...existing code...

    // Get turning path for straight-line turns (no curves)
    getTurningPath(fromDirection, toDirection, turnType) {
        // For straight corners, cars just need entry and exit points
        return [this.getPathEntryPoint(fromDirection), this.exitPoints[toDirection]];
    }

    getPathEntryPoint(direction, lane = 0) {
        // Entry point for trajectory calculation - should be at intersection edge, in the car's specific lane
        const halfRoad = this.roadWidth / 2; // 30px
        const laneWidth = this.laneWidth; // 15px
        
        // Calculate lane-specific offset
        // Lane 0 = inner lane (closer to center), Lane 1 = outer lane (further from center)
        const laneOffset = (lane === 0) ? laneWidth * 0.5 : laneWidth * 1.5;
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                return { 
                    x: this.centerX - laneOffset, 
                    y: this.centerY - halfRoad 
                };
            case CONFIG.DIRECTIONS.EAST:
                return { 
                    x: this.centerX + halfRoad, 
                    y: this.centerY - laneOffset 
                };
            case CONFIG.DIRECTIONS.SOUTH:
                return { 
                    x: this.centerX + laneOffset, 
                    y: this.centerY + halfRoad 
                };
            case CONFIG.DIRECTIONS.WEST:
                return { 
                    x: this.centerX - halfRoad, 
                    y: this.centerY + laneOffset 
                };
            default:
                return { x: this.centerX, y: this.centerY };
        }
    }

    // Method to provide car manager reference to cars
    setCarManager(carManager) {
        this.carManager = carManager;
    }
    
    getAllCars() {
        return this.carManager ? this.carManager.getCars() : [];
    }

    // Calculate trajectory for a vehicle based on turn type and lane
    calculateTrajectory(fromDirection, toDirection, turnType, lane = 0) {
        try {
            const entry = this.getPathEntryPoint(fromDirection, lane); // Pass lane here
            const exit = this.getExitPointForTurn(fromDirection, turnType, lane); // Pass lane here too
            
            if (!entry || !exit) {
                console.error("Invalid entry/exit points for trajectory", {fromDirection, turnType, lane, entry, exit});
                return null;
            }
            
            let du = []; // Segment lengths
            let curv = []; // Curvatures
            let phi0 = this.getInitialHeading(fromDirection);
            
            if (turnType === CONFIG.TURN_TYPES.LEFT) {
                // Left turn: straight -> curve -> straight
                // LANE-SPECIFIC: Lane 1 gets VERY SMALL turns, Lane 0 normal
                const straightDist = lane === 0 ? 12 : 6; // Lane 1 shorter approach
                const turnRadius = lane === 0 ? 14 : 4; // Lane 1 VERY SMALL radius
                const turnArcLength = (Math.PI / 2) * turnRadius;
                
                du = [straightDist, turnArcLength, straightDist];
                curv = [0, 1/turnRadius, 0]; // Positive curvature = left turn
                
            } else if (turnType === CONFIG.TURN_TYPES.RIGHT) {
                // Right turn: straight -> curve -> straight  
                // LANE-SPECIFIC: Different radii for each lane
                const straightDist = lane === 0 ? 12 : 8; // Inner lane longer approach
                const turnRadius = lane === 0 ? 20 : 15; // Inner lane wider turn
                const turnArcLength = (Math.PI / 2) * turnRadius;
                
                du = [straightDist, turnArcLength, straightDist];
                curv = [0, -1/turnRadius, 0]; // Negative curvature = right turn
                
            } else {
                // Straight through - same for both lanes
                const totalDist = Math.sqrt((exit.x - entry.x)**2 + (exit.y - entry.y)**2);
                du = [totalDist];
                curv = [0];
            }
            
            const trajectory = traj_precalc(entry.x, entry.y, phi0, du, curv);
            console.log("Created LANE-SPECIFIC trajectory for", fromDirection, "->", turnType, "lane", lane, 
                       "radius:", turnType !== CONFIG.TURN_TYPES.STRAIGHT ? (turnType === CONFIG.TURN_TYPES.LEFT ? 
                       (lane === 0 ? 12 : 16) : (lane === 0 ? 20 : 15)) : "N/A");
            return trajectory;
            
        } catch (error) {
            console.error("Error in calculateTrajectory:", error);
            return null;
        }
    }

    // Helper method to get initial heading based on direction
    getInitialHeading(direction) {
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH: return Math.PI / 2;   // Facing south
            case CONFIG.DIRECTIONS.EAST: return Math.PI;        // Facing west  
            case CONFIG.DIRECTIONS.SOUTH: return -Math.PI / 2;  // Facing north
            case CONFIG.DIRECTIONS.WEST: return 0;              // Facing east
            default: return 0;
        }
    }

    // Helper method to get exit point based on turn type
    getExitPointForTurn(fromDirection, turnType, lane = 0) {
        const laneWidth = this.laneWidth; // 15px
        
        // Calculate lane-specific offset for exit points
        // Lane 0 = inner lane, Lane 1 = outer lane
        const laneOffset = (lane === 0) ? laneWidth * 0.5 : laneWidth * 1.5;
        
        switch (fromDirection) {
            case CONFIG.DIRECTIONS.NORTH:
                switch (turnType) {
                    case CONFIG.TURN_TYPES.STRAIGHT:
                        return { x: this.centerX + laneOffset, y: CONFIG.CANVAS_HEIGHT };
                    case CONFIG.TURN_TYPES.LEFT:
                        return { x: CONFIG.CANVAS_WIDTH, y: this.centerY + laneOffset };
                    case CONFIG.TURN_TYPES.RIGHT:
                        return { x: 0, y: this.centerY - laneOffset };
                }
                break;
                
            case CONFIG.DIRECTIONS.SOUTH:
                switch (turnType) {
                    case CONFIG.TURN_TYPES.STRAIGHT:
                        return { x: this.centerX - laneOffset, y: 0 };
                    case CONFIG.TURN_TYPES.LEFT:
                        return { x: 0, y: this.centerY - laneOffset };
                    case CONFIG.TURN_TYPES.RIGHT:
                        return { x: CONFIG.CANVAS_WIDTH, y: this.centerY + laneOffset };
                }
                break;
                
            case CONFIG.DIRECTIONS.EAST:
                switch (turnType) {
                    case CONFIG.TURN_TYPES.STRAIGHT:
                        return { x: 0, y: this.centerY + laneOffset };
                    case CONFIG.TURN_TYPES.LEFT:
                        return { x: this.centerX - laneOffset, y: 0 };
                    case CONFIG.TURN_TYPES.RIGHT:
                        return { x: this.centerX + laneOffset, y: CONFIG.CANVAS_HEIGHT };
                }
                break;
                
            case CONFIG.DIRECTIONS.WEST:
                switch (turnType) {
                    case CONFIG.TURN_TYPES.STRAIGHT:
                        return { x: CONFIG.CANVAS_WIDTH, y: this.centerY - laneOffset };
                    case CONFIG.TURN_TYPES.LEFT:
                        return { x: this.centerX + laneOffset, y: CONFIG.CANVAS_HEIGHT };
                    case CONFIG.TURN_TYPES.RIGHT:
                        return { x: this.centerX - laneOffset, y: 0 };
                }
                break;
        }
        
        // Fallback
        return this.exitPoints[fromDirection];
    }

}

// Example usage
// ...existing code...