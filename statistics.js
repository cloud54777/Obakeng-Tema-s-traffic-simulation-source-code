export class Statistics {
    constructor() {
        this.reset();
    }

    initialize() {
        this.reset();
    }

    reset() {
        this.totalCarsPassed = 0;
        this.totalWaitTime = 0;
        this.currentCars = 0;
        this.waitTimes = [];
    }

    update(cars, deltaTime) {
        this.currentCars = cars.length;
    }

    recordCarCompletion(car) {
        this.totalCarsPassed++;
        const waitTime = car.getWaitTime();
        
        if (waitTime > 0) {
            this.totalWaitTime += waitTime;
            this.waitTimes.push(waitTime);
        }
    }

    getStats() {
        const avgWaitTime = this.waitTimes.length > 0 
            ? this.waitTimes.reduce((sum, time) => sum + time, 0) / this.waitTimes.length 
            : 0;

        return {
            totalCarsPassed: this.totalCarsPassed,
            averageWaitTime: avgWaitTime / 1000, // Convert to seconds
            currentCars: this.currentCars
        };
    }
}