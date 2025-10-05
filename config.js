export const CONFIG = {
    // Canvas settings
    CANVAS_WIDTH: 1200,
    CANVAS_HEIGHT: 1200,

    // Intersection settings
    INTERSECTION_SIZE: 120,
    ROAD_WIDTH: 60,   // Width for 4 total lanes
    LANE_WIDTH: 15,   // Lane width for 4 lanes total

    // Car settings
    CAR_WIDTH: 16,
    CAR_HEIGHT: 8,
    CAR_COLORS: [
        "#FF0000", // red
        "#00FF00", // green
        "#0000FF", // blue
        "#FFFF00", // yellow
        "#FFA500", // orange
        "#FFFFFF", // white
        "#000000", // black
        "#888888"  // gray
    ],

    // Directions
    DIRECTIONS: {
        NORTH: 'north',
        SOUTH: 'south',
        EAST: 'east',
        WEST: 'west'
    },

    // Turn types
    TURN_TYPES: {
        STRAIGHT: 'straight',
        LEFT: 'left',
        RIGHT: 'right'
    },

    // Modes
    MODES: {
        FIXED: 'fixed',
        ADAPTIVE: 'adaptive'
    },

    // Light settings
    LIGHT_SIZE: 6
    ,

    // Light states
    LIGHT_STATES: {
        RED: 'red',
        YELLOW: 'yellow',
        GREEN: 'green'
    },

    // Default settings
    DEFAULT_SETTINGS: {
        GREEN_DURATION: 100000,      // 100 seconds (legacy, not used in fixed mode)
        YELLOW_DURATION: 5000,       // 5 seconds (legacy, not used in fixed mode)
        RED_DURATION: 100000,        // 100 seconds (legacy, not used in fixed mode)
        CAR_SPAWN_RATE: 4,           // cars per 10 seconds
        CAR_SPEED: 25,               // pixels per second
        TURN_RATE: 0.4,              // 40% chance to turn (20% left, 20% right)
        DETECTOR_DISTANCE: 500,      // Increased range for adaptive mode
        MIN_GREEN_TIME: 5000,        // 5 seconds minimum green
                    
    },

    // Turn delays (based on arc length / speed)
    TURN_DELAYS: {
        LEFT: 2000,    // 2 seconds for left turn
        RIGHT: 1500,   // 1.5 seconds for right turn
        STRAIGHT: 0    // No delay for straight
    },

    // Heading angles in degrees
    HEADINGS: {
        NORTH: 270,
        SOUTH: 90,
        EAST: 0,
        WEST: 180
    },

    // Adaptive mode settings
    ADAPTIVE_SETTINGS: {
    DETECTOR_DISTANCE_RANGE: [100, 500] // 100 to 500 pixels
    }
};
