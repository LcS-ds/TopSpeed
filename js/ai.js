/* ==========================================================================
   TOPSPEED - AI Competitor Logic & Steering Behaviors
   ========================================================================== */

class AIManager {
  constructor(scene) {
    this.scene = scene;
    this.bots = [];
    this.totalLaps = 3;

    this.botPresets = [
      { name: 'Ryu (Top Rival)', color: 0xff0055, speedSkill: 1.02 },
      { name: 'Ken (Sidewinder)', color: 0x00f3ff, speedSkill: 0.98 },
      { name: 'Akira (Razor)', color: 0xffe600, speedSkill: 1.00 },
      { name: 'Hiro (Shadow)', color: 0x9d00ff, speedSkill: 0.96 },
      { name: 'Shin (Viper)', color: 0x00ff66, speedSkill: 0.97 },
      { name: 'Yuki (Nitro)', color: 0xff6600, speedSkill: 0.95 },
      { name: 'Kaito (Ghost)', color: 0xffffff, speedSkill: 0.94 }
    ];
  }

  createBots(difficulty = 'medium') {
    // Clear old bots
    this.bots.forEach(b => {
      this.scene.remove(b.car.mesh);
    });
    this.bots = [];

    let difficultyMult = 1.0;
    if (difficulty === 'easy') difficultyMult = 0.94;
    if (difficulty === 'medium') difficultyMult = 1.04;
    if (difficulty === 'hard') difficultyMult = 1.08;

    this.botPresets.forEach((preset, idx) => {
      const car = new CarEngine(this.scene, true, preset.color, preset.name);
      car.maxSpeed = Math.floor(210 * preset.speedSkill * difficultyMult);

      this.bots.push({
        car,
        skill: preset.speedSkill * difficultyMult,
        targetT: 0.05 + idx * 0.01,
        offsetLateral: (idx % 2 === 0 ? 1 : -1) * (2.5 + Math.random() * 2.5),
        laneBias: (idx % 2 === 0 ? 1 : -1),
        racingLineOffset: 0,
        lastProgress: 0,
        stuckTime: 0,
        recoveryCooldown: 0
      });
    });
  }

  update(delta, trackEngine, playerCar) {
    this.bots.forEach(bot => {
      const car = bot.car;
      const currentPos = car.mesh.position;
      bot.recoveryCooldown = Math.max(0, bot.recoveryCooldown - delta);

      // 1. Get current track progress & target point slightly ahead on spline
      const trackProgress = trackEngine.getTrackProgress(currentPos);
      car.trackProgressT = trackProgress.t;

      // Look farther ahead at speed, then read a second tangent to estimate
      // curve severity before choosing steering and throttle.
      const speedRatio = Math.min(1, Math.abs(car.speed) / car.maxSpeed);
      const lookAhead = 0.018 + speedRatio * 0.045;
      const aheadT = (trackProgress.t + lookAhead) % 1.0;
      const farT = (aheadT + 0.022) % 1.0;
      const targetPoint = trackEngine.getPointAt(aheadT);
      const tangent = trackEngine.getTangentAt(aheadT);
      const farTangent = trackEngine.getTangentAt(farT);

      let curveAngle = Math.acos(THREE.MathUtils.clamp(tangent.dot(farTangent), -1, 1));
      const curveSeverity = Math.min(1, curveAngle * 3.2);

      // Add lateral racing line offset
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const botTrackLimit = trackEngine.trackWidth / 2 - 1.15;
      // Ease toward the inside of a corner while keeping each bot in a
      // consistent lane so they do not oscillate across the circuit.
      const turnDirection = tangent.x * farTangent.z - tangent.z * farTangent.x;
      const apexOffset = -Math.sign(turnDirection) * curveSeverity * 3.5;

      // Central racing line: it stays at the middle of the road on straights
      // and moves gently toward the apex in corners. The stored value makes
      // the guide smooth instead of forcing an abrupt lane change.
      const lineBlend = Math.min(1, delta * 4.5);
      bot.racingLineOffset = THREE.MathUtils.lerp(bot.racingLineOffset, apexOffset * 0.78, lineBlend);
      let desiredOffset = bot.racingLineOffset;
      const currentLateral = trackProgress.lateralOffset;

      // Softly guide a bot back toward the road when inertia carries it over
      // the red edge. This is steering assistance, not a collision wall.
      if (Math.abs(currentLateral) > botTrackLimit * 0.72) {
        const returnStrength = THREE.MathUtils.clamp(
          (Math.abs(currentLateral) - botTrackLimit * 0.72) / (botTrackLimit * 0.28),
          0,
          1
        );
        desiredOffset = THREE.MathUtils.lerp(
          desiredOffset,
          -Math.sign(currentLateral) * botTrackLimit * 0.62,
          returnStrength
        );
      }
      let hazard = null;
      let hazardDistance = Infinity;

      // Sample the racing line before reaching it. A point-only collision
      // check reacts too late, especially on Fuji's ramps and city hairpins.
      [0.012, 0.024, 0.038].forEach(sampleOffset => {
        const sampleT = (trackProgress.t + sampleOffset) % 1.0;
        const samplePoint = trackEngine.getPointAt(sampleT);
        for (let obstacleIndex = 0; obstacleIndex < trackEngine.obstacles.length; obstacleIndex++) {
          const candidate = trackEngine.obstacles[obstacleIndex];
          const dx = samplePoint.x - candidate.position.x;
          const dz = samplePoint.z - candidate.position.z;
          const distance = Math.sqrt(dx * dx + dz * dz);
          if (distance < candidate.radius + 3.8 && distance < hazardDistance) {
            hazard = candidate;
            hazardDistance = distance;
          }
        }
      });

      if (hazard) {
        const obstacleOffset = hazard.position.clone().sub(targetPoint).dot(normal);
        const clearSide = obstacleOffset >= 0 ? -1 : 1;
        // Move early toward the side opposite the obstacle and hold that line
        // long enough to clear it, rather than swerving frame-to-frame.
        const obstacleAvoidanceOffset = clearSide * (4.2 + Math.max(0, 2.2 - hazardDistance));
        desiredOffset = THREE.MathUtils.lerp(desiredOffset, obstacleAvoidanceOffset, 0.82);
      }
      let nearestAhead = null;
      let nearestBehind = null;
      let aheadGap = Infinity;
      let behindGap = Infinity;
      const opponents = [playerCar, ...this.bots.filter(other => other !== bot).map(other => other.car)];

      opponents.forEach(opponent => {
        const forwardGap = (opponent.trackProgressT - car.trackProgressT + 1) % 1;
        const rearGap = (car.trackProgressT - opponent.trackProgressT + 1) % 1;
        if (forwardGap > 0.002 && forwardGap < aheadGap) {
          aheadGap = forwardGap;
          nearestAhead = opponent;
        }
        if (rearGap > 0.002 && rearGap < behindGap) {
          behindGap = rearGap;
          nearestBehind = opponent;
        }
      });

      if (nearestAhead && aheadGap < 0.032 && car.speed >= nearestAhead.speed - 8) {
        // Pick the clearer side of the target and commit long enough to pass.
        const rivalOffset = nearestAhead.mesh.position.clone().sub(targetPoint).dot(normal);
        const passSide = rivalOffset >= 0 ? -1 : 1;
        desiredOffset = THREE.MathUtils.lerp(desiredOffset, passSide * 4.6, 0.74);
      } else if (nearestBehind && behindGap < 0.022 && car.speed >= nearestBehind.speed - 4) {
        // Defend the current line once, without weaving from side to side.
        desiredOffset = THREE.MathUtils.lerp(desiredOffset, bot.laneBias * 3.8, 0.58);
      }

      // Stay safely inside the red strip while attacking or defending.
      desiredOffset = THREE.MathUtils.clamp(desiredOffset, -botTrackLimit, botTrackLimit);
      targetPoint.add(normal.multiplyScalar(desiredOffset));

      // 2. Steer towards target point
      const dirToTarget = targetPoint.clone().sub(currentPos).normalize();
      const targetHeading = Math.atan2(dirToTarget.x, dirToTarget.z);

      // Angle difference
      let angleDiff = targetHeading - car.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // AI Input state simulation
      const trackSurface = trackEngine.getTrackProgress(targetPoint).segment.surface;
      const surfaceGrip = trackSurface === 'snow' ? 0.52 : (trackSurface === 'dirt' ? 0.76 : 1);
      const targetSpeed = car.maxSpeed * surfaceGrip * (1 - curveSeverity * 0.48) * (hazard ? 0.72 : 1);
      const shouldBrake = (hazard && hazardDistance < 2.2 && car.speed > targetSpeed + 3) ||
        (car.speed > targetSpeed + 9 && car.speed > 32);
      const inputState = {
        accelerate: !shouldBrake && car.speed < targetSpeed + 5,
        left: angleDiff > 0.025,
        right: angleDiff < -0.025,
        brake: shouldBrake,
        reverse: false
      };

      // 3. Rubber-banding (catch up if player is far ahead)
      const distToPlayer = playerCar.trackProgressT - car.trackProgressT;
      if (distToPlayer > 0.15) {
        car.speed += delta * 15; // Speed boost to catch up
      }

      car.update(delta, inputState, trackEngine);

      // Bots also complete laps. Without this, their progress resets near
      // zero after crossing the line and the results screen ranks them ahead
      // of a player who actually finished the race.
      if (car.speed > 5 && bot.lastProgress > 0.85 && car.trackProgressT < 0.15) {
        car.lap = Math.min(this.totalLaps, car.lap + 1);
      }

      // A bot that gets pinned against a rail, another car, or a ramp is put
      // back on the racing line. This prevents a single collision from
      // turning into a permanent traffic jam.
      const progressDelta = Math.abs(car.trackProgressT - bot.lastProgress);
      const madeProgress = Math.min(progressDelta, 1 - progressDelta);
      if (car.speed < 9 && madeProgress < 0.00035 && !car.airborne) {
        bot.stuckTime += delta;
      } else {
        bot.stuckTime = Math.max(0, bot.stuckTime - delta * 2);
      }

      if (bot.stuckTime > 1.2 && bot.recoveryCooldown <= 0) {
        const recoveryT = (car.trackProgressT + 0.012) % 1;
        const recoveryPos = trackEngine.getPointAt(recoveryT);
        const recoveryTangent = trackEngine.getTangentAt(recoveryT);
        const recoveryNormal = new THREE.Vector3(-recoveryTangent.z, 0, recoveryTangent.x).normalize();
        recoveryPos.add(recoveryNormal.multiplyScalar(bot.laneBias * 2.2));
        const lapBeforeRecovery = car.lap;
        car.resetPosition(recoveryPos, Math.atan2(recoveryTangent.x, recoveryTangent.z));
        car.lap = lapBeforeRecovery;
        car.speed = 32;
        bot.stuckTime = 0;
        bot.recoveryCooldown = 3;
      }

      bot.lastProgress = car.trackProgressT;
    });
  }

  resetPositions(trackEngine) {
    this.bots.forEach((bot, idx) => {
      const startT = 0.98 - (idx * 0.012); // Grid start line spacing
      const startPos = trackEngine.getPointAt(startT);
      const tangent = trackEngine.getTangentAt(startT);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      startPos.add(normal.multiplyScalar(bot.offsetLateral));
      const heading = Math.atan2(tangent.x, tangent.z);

      bot.car.resetPosition(startPos, heading);
      bot.racingLineOffset = 0;
      bot.lastProgress = startT;
      bot.stuckTime = 0;
      bot.recoveryCooldown = 0;
    });
  }
}
