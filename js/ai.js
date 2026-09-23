/* ==========================================================================
   TOPSPEED - AI Competitor Logic & Steering Behaviors
   ========================================================================== */

class AIManager {
  constructor(scene) {
    this.scene = scene;
    this.bots = [];
    this.totalLaps = 3;
    this.getRaceProgress = null;
    this.onFinish = null;
    this.trackGuideStrength = 0.82;
    this.recoveryDuration = 0.9;

    this.botPresets = [
      {
        name: 'Ryu (Top Rival)', color: 0xff0055, speedSkill: 1.02,
        surfaceProfile: { asphalt: 1.08, dirt: 0.78, snow: 0.48 }
      },
      {
        name: 'Ken (Sidewinder)', color: 0x00f3ff, speedSkill: 0.98,
        surfaceProfile: { asphalt: 0.97, dirt: 1.02, snow: 0.58 }
      },
      {
        name: 'Akira (Razor)', color: 0xffe600, speedSkill: 1.00,
        surfaceProfile: { asphalt: 0.98, dirt: 0.78, snow: 0.92 }
      },
      { name: 'Hiro (Shadow)', color: 0x9d00ff, speedSkill: 0.96 },
      { name: 'Shin (Viper)', color: 0x00ff66, speedSkill: 0.97 },
      { name: 'Yuki (Nitro)', color: 0xff6600, speedSkill: 0.95 },
      { name: 'Kaito (Ghost)', color: 0xffffff, speedSkill: 0.94 }
    ];
  }

  createBots(difficulty = 'medium') {
    // Clear old bots
    this.bots.forEach(b => {
      if (b.car && typeof b.car.dispose === 'function') b.car.dispose();
      this.scene.remove(b.car.mesh);
    });
    this.bots = [];

    // Keep the first learning moments forgiving, but avoid the situation
    // reported in the playtest where the bots become irrelevant afterwards.
    // These modifiers affect pace and decision quality independently so the
    // difficulty does not come only from an arbitrary top-speed increase.
    const difficultyProfiles = {
      easy: { speed: 0.97, lookAhead: 0.92, cornering: 0.86, avoidance: 0.92 },
      medium: { speed: 1.06, lookAhead: 1.00, cornering: 1.00, avoidance: 1.00 },
      hard: { speed: 1.11, lookAhead: 1.08, cornering: 1.08, avoidance: 1.08 }
    };
    const difficultyProfile = difficultyProfiles[difficulty] || difficultyProfiles.medium;

    this.botPresets.forEach((preset, idx) => {
      const car = new CarEngine(this.scene, true, preset.color, preset.name, preset.surfaceProfile || null);
      car.maxSpeed = Math.floor(210 * preset.speedSkill * difficultyProfile.speed);

      this.bots.push({
        car,
        skill: preset.speedSkill * difficultyProfile.speed,
        lookAheadScale: difficultyProfile.lookAhead,
        corneringSkill: difficultyProfile.cornering,
        avoidanceStrength: difficultyProfile.avoidance,
        targetT: 0.05 + idx * 0.01,
        offsetLateral: (idx % 2 === 0 ? 1 : -1) * (2.5 + Math.random() * 2.5),
        laneBias: (idx % 2 === 0 ? 1 : -1),
        racingLineOffset: 0,
        lastProgress: null,
        stuckTime: 0,
        recoveryCooldown: 0,
        recoveryTime: 0,
        maneuver: 'follow-line',
        maneuverTime: 0,
        maneuverCooldown: 0,
        maneuverSide: 0,
        targetSpeed: 0,
        brakeHold: 0,
        state: 'follow-line'
      });
    });
  }

  update(delta, trackEngine, playerCar) {
    this.bots.forEach(bot => {
      const car = bot.car;
      const currentPos = car.mesh.position;
      bot.recoveryCooldown = Math.max(0, bot.recoveryCooldown - delta);
      bot.recoveryTime = Math.max(0, bot.recoveryTime - delta);
      bot.maneuverTime = Math.max(0, bot.maneuverTime - delta);
      bot.maneuverCooldown = Math.max(0, bot.maneuverCooldown - delta);
      bot.brakeHold = Math.max(0, bot.brakeHold - delta);

      // 1. Get current track progress & target point slightly ahead on spline
      if (car.isFinished) return;
      const trackProgress = trackEngine.getTrackProgress(currentPos, car.trackProgressT);
      car.trackProgressT = trackProgress.t;

      // Look farther ahead at speed, then read a second tangent to estimate
      // curve severity before choosing steering and throttle.
      const speedRatio = Math.min(1, Math.abs(car.speed) / car.maxSpeed);
      const lookAhead = (0.018 + speedRatio * 0.045) * bot.lookAheadScale;
      const aheadT = (trackProgress.t + lookAhead) % 1.0;
      const farT = (aheadT + 0.022) % 1.0;
      const deepT = (farT + 0.034 + speedRatio * 0.018) % 1.0;
      const targetPoint = trackEngine.getPointAt(aheadT);
      const tangent = trackEngine.getTangentAt(aheadT);
      const farTangent = trackEngine.getTangentAt(farT);
      const deepTangent = trackEngine.getTangentAt(deepT);

      let curveAngle = Math.acos(THREE.MathUtils.clamp(tangent.dot(farTangent), -1, 1));
      const deepCurveAngle = Math.acos(THREE.MathUtils.clamp(farTangent.dot(deepTangent), -1, 1));
      // Use the strongest curvature in the next section, not only the first
      // tangent pair. This gives the bot time to brake before a hairpin and
      // prevents the late steering corrections that used to push it outside
      // the red boundary.
      const curveSeverity = Math.min(1, Math.max(curveAngle, deepCurveAngle) * 3.2);

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
      const lateralRatio = Math.abs(currentLateral) / Math.max(1, botTrackLimit);
      const edgeHazard = lateralRatio > 0.84;
      if (lateralRatio > 0.52) {
        // Use a soft virtual corridor instead of a physical wall. The target
        // moves back toward the center as the bot approaches the red edge,
        // preventing the repeated edge collisions seen during testing.
        const returnStrength = THREE.MathUtils.clamp((lateralRatio - 0.52) / 0.48, 0, 1);
        const centerCorrection = THREE.MathUtils.clamp(-currentLateral * 0.58, -botTrackLimit * 0.72, botTrackLimit * 0.72);
        desiredOffset = THREE.MathUtils.lerp(desiredOffset, centerCorrection, returnStrength * this.trackGuideStrength);
        bot.state = 'return-to-line';
      } else if (bot.recoveryTime <= 0) {
        bot.state = 'follow-line';
      }
      let hazard = null;
      let hazardDistance = Infinity;

      // Sample the racing line before reaching it. A point-only collision
      // check reacts too late, especially on Fuji's ramps and city hairpins.
      const obstacleSamples = [0.004, 0.012, 0.024, 0.038, 0.055];
      obstacleSamples.forEach(sampleOffset => {
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
        // Compare both sides of the road before choosing a detour. The old
        // logic only looked at the obstacle's side, which could send a bot
        // directly into a second cone or a nearby car.
        const sideClearance = [-1, 1].map(side => {
          let clearance = Infinity;
          obstacleSamples.forEach(sampleOffset => {
            const sampleT = (trackProgress.t + sampleOffset) % 1.0;
            const samplePoint = trackEngine.getPointAt(sampleT);
            const probeX = samplePoint.x + normal.x * side * 4.5;
            const probeZ = samplePoint.z + normal.z * side * 4.5;
            for (let obstacleIndex = 0; obstacleIndex < trackEngine.obstacles.length; obstacleIndex++) {
              const candidate = trackEngine.obstacles[obstacleIndex];
              const dx = probeX - candidate.position.x;
              const dz = probeZ - candidate.position.z;
              clearance = Math.min(clearance, Math.sqrt(dx * dx + dz * dz) - candidate.radius);
            }
          });
          return clearance;
        });
        const clearSide = sideClearance[1] >= sideClearance[0] ? 1 : -1;
        // Move early toward the clearer side and hold that line long enough
        // to clear the obstacle instead of swerving frame-to-frame.
        const obstacleAvoidanceOffset = clearSide * (4.2 + Math.max(0, 2.2 - hazardDistance));
        desiredOffset = THREE.MathUtils.lerp(
          desiredOffset,
          obstacleAvoidanceOffset,
          THREE.MathUtils.clamp(0.82 * bot.avoidanceStrength, 0, 1)
        );
        bot.state = 'avoid-obstacle';
      }
      let nearestAhead = null;
      let nearestBehind = null;
      let aheadGap = Infinity;
      let behindGap = Infinity;
      let closestOpponent = null;
      let closestOpponentDistance = Infinity;
      const opponents = [playerCar, ...this.bots.filter(other => other !== bot).map(other => other.car)];
      const progressOf = vehicle => this.getRaceProgress
        ? this.getRaceProgress(vehicle)
        : Math.max(0, (vehicle.lap || 1) - 1) + (vehicle.trackProgressT || 0);

      opponents.forEach(opponent => {
        const forwardGap = progressOf(opponent) - progressOf(car);
        const rearGap = progressOf(car) - progressOf(opponent);
        const opponentDx = opponent.mesh.position.x - currentPos.x;
        const opponentDz = opponent.mesh.position.z - currentPos.z;
        const opponentDistance = Math.sqrt(opponentDx * opponentDx + opponentDz * opponentDz);
        if (opponentDistance < closestOpponentDistance) {
          closestOpponentDistance = opponentDistance;
          closestOpponent = opponent;
        }
        if (forwardGap > 0.002 && forwardGap < aheadGap) {
          aheadGap = forwardGap;
          nearestAhead = opponent;
        }
        if (rearGap > 0.002 && rearGap < behindGap) {
          behindGap = rearGap;
          nearestBehind = opponent;
        }
      });

      // Keep a chosen maneuver for a short commitment window. This prevents
      // frame-to-frame side switching when two cars are nearly aligned.
      if (bot.maneuverTime > 0 && bot.maneuver !== 'follow-line') {
        desiredOffset = THREE.MathUtils.lerp(desiredOffset, bot.maneuverSide * 4.45, 0.5);
        bot.state = bot.maneuver === 'overtake' ? 'overtake' : 'defend';
      } else if (nearestAhead && aheadGap < 0.032 && car.speed >= nearestAhead.speed - 8 && bot.maneuverCooldown <= 0) {
        // Pick a side and commit long enough to complete the pass.
        const rivalOffset = nearestAhead.mesh.position.clone().sub(targetPoint).dot(normal);
        const passSide = rivalOffset >= 0 ? -1 : 1;
        bot.maneuver = 'overtake';
        bot.maneuverSide = passSide;
        bot.maneuverTime = 1.25;
        bot.maneuverCooldown = 1.45;
        desiredOffset = THREE.MathUtils.lerp(desiredOffset, passSide * 4.45, 0.72);
        bot.state = 'overtake';
      } else if (nearestBehind && behindGap < 0.022 && nearestBehind.speed > car.speed + 4 && bot.maneuverCooldown <= 0) {
        // Defend only when the rival behind is demonstrably faster. Hold a
        // single lane instead of weaving across the whole road.
        bot.maneuver = 'defend';
        bot.maneuverSide = bot.laneBias;
        bot.maneuverTime = 0.85;
        bot.maneuverCooldown = 1.2;
        desiredOffset = THREE.MathUtils.lerp(desiredOffset, bot.laneBias * 3.6, 0.58);
        bot.state = 'defend';
      } else if (bot.maneuverTime <= 0) {
        bot.maneuver = 'follow-line';
        bot.maneuverSide = 0;
      }

      // Treat a car directly ahead as a moving obstacle. This prevents bots
      // from following the spline into a traffic jam and gives overtakes a
      // real spatial trigger in addition to the progress-gap check.
      let trafficBlocked = false;
      if (nearestAhead) {
        const toRival = nearestAhead.mesh.position.clone().sub(currentPos);
        const forwardDistance = toRival.dot(tangent);
        const lateralDistance = Math.abs(toRival.dot(normal));
        if (forwardDistance > -2 && forwardDistance < 18 && lateralDistance < 4.8) {
          trafficBlocked = true;
          const rivalOffset = nearestAhead.mesh.position.clone().sub(targetPoint).dot(normal);
          const preferredSide = rivalOffset >= 0 ? -1 : 1;
          const trafficSideClearance = [-1, 1].map(side => {
            const probe = targetPoint.clone().add(normal.clone().multiplyScalar(side * 4.4));
            let clearance = Infinity;
            opponents.forEach(opponent => {
              if (opponent === car) return;
              const dx = probe.x - opponent.mesh.position.x;
              const dz = probe.z - opponent.mesh.position.z;
              const distance = Math.sqrt(dx * dx + dz * dz);
              clearance = Math.min(clearance, distance);
            });
            return clearance;
          });
          const openSide = trafficSideClearance[1] >= trafficSideClearance[0] ? 1 : -1;
          const passSide = bot.maneuverTime > 0
            ? bot.maneuverSide
            : (trafficSideClearance[preferredSide === 1 ? 1 : 0] > 3.4 ? preferredSide : openSide);
          if (bot.maneuverTime <= 0 && bot.maneuverCooldown <= 0) {
            bot.maneuver = 'overtake';
            bot.maneuverSide = passSide;
            bot.maneuverTime = 0.9;
            bot.maneuverCooldown = 1.25;
          }
          desiredOffset = THREE.MathUtils.lerp(desiredOffset, passSide * 4.4, 0.62);
          bot.state = 'avoid-traffic';
        }
      }

      // Add a small spatial separation when cars are side by side or nearly
      // touching. Progress-based ordering alone misses this case because two
      // vehicles can have almost identical T values while occupying the same
      // lane. The offset is deliberately modest so it opens a gap without
      // forcing a bot outside the virtual racing corridor.
      if (closestOpponent && closestOpponentDistance < 8) {
        const opponentDelta = closestOpponent.mesh.position.clone().sub(currentPos);
        const opponentForward = opponentDelta.dot(tangent);
        const opponentLateral = opponentDelta.dot(normal);
        if (opponentForward > -5 && opponentForward < 10 && Math.abs(opponentLateral) < 3.8) {
          const separationSide = opponentLateral >= 0 ? -1 : 1;
          desiredOffset = THREE.MathUtils.lerp(
            desiredOffset,
            desiredOffset + separationSide * 2.4,
            0.34
          );
          if (!trafficBlocked) bot.state = 'separate-traffic';
        }
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
      const trackSurface = trackEngine.getTrackProgress(targetPoint, aheadT).segment.surface;
      const defaultSurfaceGrip = { asphalt: 1, dirt: 0.76, snow: 0.52 };
      const surfaceGrip = car.surfaceProfile?.[trackSurface] ?? defaultSurfaceGrip[trackSurface] ?? 1;
      const curvePenalty = 0.48 - (bot.corneringSkill - 1) * 0.18;
      const targetSpeed = car.maxSpeed * car.maxSpeedMultiplier * surfaceGrip *
        (1 - curveSeverity * curvePenalty) * (hazard ? 0.72 : 1) *
        (trafficBlocked ? 0.84 : 1) * (edgeHazard ? 0.72 : 1);
      // Smooth the target speed, but let braking react faster than
      // acceleration. This avoids the throttle/brake oscillation that made
      // bots stall at the entrance of technical sections.
      const targetBlend = targetSpeed < bot.targetSpeed
        ? Math.min(1, delta * 8)
        : Math.min(1, delta * 2.8);
      bot.targetSpeed = bot.targetSpeed > 0
        ? THREE.MathUtils.lerp(bot.targetSpeed, targetSpeed, targetBlend)
        : targetSpeed;
      const shouldBrake = (hazard && hazardDistance < 2.2 && car.speed > bot.targetSpeed + 3) ||
        (car.speed > bot.targetSpeed + 9 && car.speed > 32);
      if (shouldBrake) bot.brakeHold = Math.max(bot.brakeHold, 0.12);
      const braking = shouldBrake || (bot.brakeHold > 0 && car.speed > bot.targetSpeed + 5);
      const inputState = {
        accelerate: !braking && car.speed < bot.targetSpeed + 5,
        left: angleDiff > 0.025,
        right: angleDiff < -0.025,
        brake: braking,
        reverse: false
      };

      // A short physical recovery replaces the old position reset. The bot
      // briefly reverses while steering toward the guide, then resumes forward
      // motion. No teleport is used, so race progress remains continuous.
      if (bot.recoveryTime > 0) {
        const reversePhase = bot.recoveryTime > this.recoveryDuration * 0.45;
        inputState.accelerate = !reversePhase;
        inputState.reverse = reversePhase;
        inputState.brake = false;
        inputState.left = angleDiff > 0.012;
        inputState.right = angleDiff < -0.012;
        bot.state = 'recover';
      }

      // 3. Rubber-banding: a bounded, temporary modifier is applied before
      // CarEngine.update so it is not erased by the normal speed clamp.
      const distToPlayer = progressOf(playerCar) - progressOf(car);
      const catchup = THREE.MathUtils.clamp((distToPlayer - 0.12) / 0.9, 0, 1);
      const desiredSpeedMultiplier = 1 + catchup * 0.18;
      const desiredMaxSpeedMultiplier = 1 + catchup * 0.12;
      const modifierBlend = Math.min(1, delta * 2.5);
      car.speedMultiplier = THREE.MathUtils.lerp(car.speedMultiplier, desiredSpeedMultiplier, modifierBlend);
      car.maxSpeedMultiplier = THREE.MathUtils.lerp(car.maxSpeedMultiplier, desiredMaxSpeedMultiplier, modifierBlend);

      car.update(delta, inputState, trackEngine);

      // Bots also complete laps. Without this, their progress resets near
      // zero after crossing the line and the results screen ranks them ahead
      // of a player who actually finished the race.
      if (Math.abs(car.speed) > 1 && bot.lastProgress !== null && bot.lastProgress > 0.85 && car.trackProgressT < 0.15) {
        car.lap += 1;
        if (car.lap > this.totalLaps && !car.isFinished) {
          car.lap = this.totalLaps;
          car.isFinished = true;
          if (this.onFinish) this.onFinish(car);
        }
      }

      // A bot that gets pinned against a rail, another car, or a ramp is put
      // back on the racing line. This prevents a single collision from
      // turning into a permanent traffic jam.
      const progressDelta = bot.lastProgress === null ? 1 : Math.abs(car.trackProgressT - bot.lastProgress);
      const madeProgress = bot.lastProgress === null ? 1 : Math.min(progressDelta, 1 - progressDelta);
      const offGuide = Math.abs(currentLateral - desiredOffset) > 3.5;
      const stalledNearHazard = madeProgress < 0.00035 && (offGuide || edgeHazard || hazard || trafficBlocked);
      const lowMotionOrPinned = Math.abs(car.speed) < 18 || offGuide || edgeHazard;
      if (stalledNearHazard && lowMotionOrPinned && !car.airborne) {
        bot.stuckTime += delta;
      } else {
        bot.stuckTime = Math.max(0, bot.stuckTime - delta * 2);
      }

      if (bot.stuckTime > 1.2 && bot.recoveryCooldown <= 0) {
        bot.recoveryTime = this.recoveryDuration;
        bot.stuckTime = 0;
        bot.recoveryCooldown = 2.8;
        bot.state = 'recover';
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
      bot.lastProgress = null;
      bot.stuckTime = 0;
      bot.recoveryCooldown = 0;
      bot.recoveryTime = 0;
      bot.targetSpeed = 0;
      bot.brakeHold = 0;
      bot.maneuver = 'follow-line';
      bot.maneuverTime = 0;
      bot.maneuverCooldown = 0;
      bot.maneuverSide = 0;
      bot.state = 'follow-line';
    });
  }
}
