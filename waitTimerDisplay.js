import { CONFIG } from "./config.js";

export class WaitTimerDisplay {
    constructor(intersection) {
        this.intersection = intersection;
        this.waitTimers = {};
        this.initializeTimers();
    }

    initializeTimers() {
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            this.waitTimers[direction] = {
                startTime: null,
                isActive: false
            };
        });
    }

    startTimer(direction) {
        if (!this.waitTimers[direction].isActive) {
            this.waitTimers[direction].startTime = Date.now();
            this.waitTimers[direction].isActive = true;
        }
    }

    stopTimer(direction) {
        this.waitTimers[direction].startTime = null;
        this.waitTimers[direction].isActive = false;
    }

    getWaitTime(direction) {
        if (!this.waitTimers[direction].isActive || !this.waitTimers[direction].startTime) {
            return 0;
        }
        return Date.now() - this.waitTimers[direction].startTime;
    }

    update(sensorData, lightStates) {
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            const isRed = lightStates[direction] === CONFIG.LIGHT_STATES.RED;
            const hasWaitingCar = sensorData[direction] && sensorData[direction].carsWaiting > 0;

            if (isRed && hasWaitingCar) {
                // Only log when first starting
                if (!this.waitTimers[direction].isActive) {
                    console.log(`✅ Wait Timer STARTED for ${direction} (${sensorData[direction].carsWaiting} cars waiting)`);
                }
                this.startTimer(direction);
            } else {
                // Only log when stopping an active timer
                if (this.waitTimers[direction].isActive) {
                    console.log(`❌ Wait Timer STOPPED for ${direction}`);
                }
                this.stopTimer(direction);
            }
        });
    }

    render(ctx) {
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            if (this.waitTimers[direction].isActive) {
                this.renderTimer(ctx, direction);
            }
        });
    }

    renderTimer(ctx, direction) {
        const waitTime = this.getWaitTime(direction);
        const seconds = (waitTime / 1000).toFixed(1);

        let position = this.getTimerPosition(direction);

        ctx.save();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 3;

        const text = `${seconds}s`;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textWidth = ctx.measureText(text).width;
        const boxWidth = textWidth + 20;
        const boxHeight = 40;

        ctx.fillRect(position.x - boxWidth / 2, position.y - boxHeight / 2, boxWidth, boxHeight);
        ctx.strokeRect(position.x - boxWidth / 2, position.y - boxHeight / 2, boxWidth, boxHeight);

        ctx.fillStyle = '#ff0000';
        ctx.fillText(text, position.x, position.y);

        ctx.restore();
    }

    getTimerPosition(direction) {
        const centerX = this.intersection.centerX;
        const centerY = this.intersection.centerY;
        const offset = 150;

        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                return { x: centerX, y: centerY - offset };
            case CONFIG.DIRECTIONS.SOUTH:
                return { x: centerX, y: centerY + offset };
            case CONFIG.DIRECTIONS.EAST:
                return { x: centerX + offset, y: centerY };
            case CONFIG.DIRECTIONS.WEST:
                return { x: centerX - offset, y: centerY };
            default:
                return { x: centerX, y: centerY };
        }
    }

    reset() {
        this.initializeTimers();
    }
}