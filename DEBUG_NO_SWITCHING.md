# Expected Adaptive Traffic Light Behavior

## The Correct Flow

### **Phase 1: Startup (All Red)**
```
🔴 All lights RED
🚗 Cars spawn from all directions
⏰ First car to stop → Timer starts
🔍 System detects which direction has first car
```

**Example:**
- Car spawns from NORTH
- Car approaches red light
- Car stops → ⏰ Timer starts
- System: "First car from North detected"
- → **North-South goes GREEN**

---

### **Phase 2: Green Active + Score Calculation**
```
🟢 North-South GREEN
🔴 West-East RED

Green Side (NS):
  - Cars passing through
  - greenScore = carsPassed + carsApproaching
  
Red Side (WE):
  - Cars waiting
  - Timer counting up
  - redScore = (carsWaiting × waitTime_s) + carsApproaching
  
📊 Every frame: Compare scores
```

**Example Timeline:**
```
Time 0s:  🟢 NS Green starts
Time 2s:  Green=5, Red=0   → Keep green
Time 5s:  Green=10, Red=8  → Keep green (8 < 10×1.5=15)
Time 10s: Green=15, Red=25 → Keep green (25 < 15×1.5=22.5) // CLOSE!
Time 12s: Green=18, Red=35 → SWITCH! (35 > 18×1.5=27)
```

---

### **Phase 3: Switching Sequence**
```
When redScore > greenScore × 1.5:
  
1. 🟡 YELLOW (current green → yellow)
   - Duration: ~3 seconds
   - Cars clear intersection
   
2. 🔴 ALL RED (safety clearance)
   - Duration: 2 seconds
   - Intersection clears completely
   
3. 🟢 GREEN (other pair)
   - Other direction gets green
   - Cycle repeats
```

**Example:**
```
12s: 🔄 SWITCHING! Reason: THRESHOLD EXCEEDED
     🟢 NS → 🟡 NS Yellow

15s: 🟡 NS → 🔴 ALL RED (2s clearance)

17s: 🔴 → 🟢 WE Green
     Now West-East has green
     North-South has red
     
     → Cycle repeats with WE green
```

---

## Current Problem: No Switching

### **Possible Causes:**

1. **Wait Time Not Counting** ❌
   - Timer might not be incrementing
   - Check: `waitTime` should increase every frame

2. **Red Score Always 0** ❌
   - If `carsWaiting = 0` → score = 0
   - If `waitTime = 0` → score = 0
   - Formula: `(0 × anything) + approaching = only approaching`

3. **Threshold Too High** ❌
   - Current: `redScore > greenScore × 1.5`
   - If green=20, red needs >30 to switch
   - Might take too long

---

## Debug Checklist

### **In Browser Console, Look For:**

✅ **Startup:**
```
⏰ FRONT CAR DETECTED: Car X from north
🔍 FIRST CAR DETECTION - Combined Scores: NS=5.0, WE=0.0
🟢 RED→GREEN: Switching to GREEN for NS
```

✅ **During Green Phase:**
```
🟢 GREEN SCORE (NS): Passed=10, Approaching=2, Total=12.0
🔴 RED SCORE (WE): Waiting=3/2, WaitTime=5.2s/4.1s, Approaching=1/0, Total=20.6
📊 SCORE CHECK: Green=12.0, Red=20.6, Threshold=18.0, ThresholdExceeded=true
```

✅ **Switching:**
```
🔄 SWITCHING! Reason: THRESHOLD EXCEEDED
🟡 YELLOW→RED: NS going to red
🔴 RED→GREEN: Switching to GREEN for WE
```

---

## What to Check NOW

### 1. **Is waitTime increasing?**
Look for this in console:
```
⏱️  FRONT CAR WAIT TIME: NORTH - Car 42 has waited 5.2s
⏱️  FRONT CAR WAIT TIME: NORTH - Car 42 has waited 5.3s
⏱️  FRONT CAR WAIT TIME: NORTH - Car 42 has waited 5.4s
```

**If you see this → Timer is working** ✅
**If wait time stays 0 → Timer broken** ❌

### 2. **Is red score being calculated?**
Look for:
```
🔴 RED SCORE (WE): Waiting=3/2, WaitTime=5.2s/4.1s, Approaching=1/0, Total=20.6
```

**If Total > 0 → Score calculating** ✅
**If Total always 0 → Data not flowing** ❌

### 3. **Is threshold check happening?**
Look for:
```
📊 SCORE CHECK: Green=12.0, Red=20.6, Threshold=18.0, ThresholdExceeded=true
```

**If ThresholdExceeded=true but no switch → Switching logic broken** ❌
**If ThresholdExceeded=false always → Threshold too high** ❌

---

## Quick Fix Options

### If waitTime = 0:
**Problem:** Timer not starting when car stops
**Fix:** Check sensors.js - make sure `waitStartTime` is set

### If redScore always 0:
**Problem:** No waiting cars detected OR wait time not passing through
**Fix:** Check data flow from sensors → trafficLights

### If scores look good but no switch:
**Problem:** Switching logic not triggering
**Fix:** Check the `shouldSwitch` condition

### If threshold never exceeded:
**Problem:** Threshold too high (1.5×)
**Fix:** Lower threshold to 1.2 or even 1.0 temporarily

---

## Expected Console Output (Working System)

```
⏰ FRONT CAR DETECTED: Car 1 from north
🚨 TIMER STARTED FOR FRONT CAR: NORTH - Car 1 has been waiting 0.0s
🔍 FIRST CAR DETECTION - Combined Scores: NS=0.2, WE=0.0
🟢 RED→GREEN: Switching to GREEN for NS

[Time passes, cars flow through NS...]

⏱️  FRONT CAR WAIT TIME: WEST - Car 5 has waited 3.2s
🔴 RED SCORE (WE): Waiting=2/1, WaitTime=3.2s/2.1s, Total=9.5
🟢 GREEN SCORE (NS): Passed=8, Approaching=1, Total=9.0
📊 SCORE CHECK: Green=9.0, Red=9.5, Threshold=13.5, ThresholdExceeded=false

[More time passes...]

⏱️  FRONT CAR WAIT TIME: WEST - Car 5 has waited 8.7s
🔴 RED SCORE (WE): Waiting=4/3, WaitTime=8.7s/6.2s, Total=79.1
🟢 GREEN SCORE (NS): Passed=12, Approaching=0, Total=12.0
📊 SCORE CHECK: Green=12.0, Red=79.1, Threshold=18.0, ThresholdExceeded=true
🔄 SWITCHING! Reason: THRESHOLD EXCEEDED
🟡 YELLOW→RED: NS going to red
🔴 RED→GREEN: Switching to GREEN for WE
```

---

## Action Items

1. **Open browser console** (F12)
2. **Look for the debug messages** above
3. **Identify which phase is failing:**
   - ❌ Timer not starting?
   - ❌ Scores not calculating?
   - ❌ Threshold not exceeding?
   - ❌ Switch not triggering?

4. **Report back what you see** in the console!

The logs will tell us exactly where the problem is! 🔍
