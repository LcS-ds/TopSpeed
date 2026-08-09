/* ==========================================================================
   TOPSPEED - AI Competitor Logic & Steering Behaviors
   ========================================================================== */

class AIManager {
  constructor(scene) {
    this.scene = scene;
    this.bots = [];

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
    if (difficulty === 'easy') difficultyMult = 0.88;
    if (difficulty === 'hard') difficultyMult = 1.08;

    this.botPresets.forEach((preset, idx) => {
      const car = new CarEngine(this.scene, true, preset.color, preset.name);
      car.maxSpeed = Math.floor(210 * preset.speedSkill * difficultyMult);

      this.bots.push({
        car,
        skill: preset.speedSkill * difficultyMult,
        targetT: 0.05 + idx * 0.01,
        offsetLateral: (idx % 2 === 0 ? 1 : -1) * (4 + Math.random() * 3)
      });
    });
  }

  update(delta, trackEngine, playerCar) {
    this.bots.forEach(bot => {
      const car = bot.car;
      const currentPos = car.mesh.position;

      // 1. Get current track progress & target point slightly ahead on spline
      const trackProgress = trackEngine.getTrackProgress(currentPos);
      car.trackProgressT = trackProgress.t;

      // Target point 3% ahead on spline
      const aheadT = (trackProgress.t + 0.03) % 1.0;
      const targetPoint = trackEngine.getPointAt(aheadT);
      const tangent = trackEngine.getTangentAt(aheadT);

      // Add lateral racing line offset
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      targetPoint.add(normal.multiplyScalar(bot.offsetLateral));

      // 2. Steer towards target point
      const dirToTarget = targetPoint.clone().sub(currentPos).normalize();
      const targetHeading = Math.atan2(dirToTarget.x, dirToTarget.z);

      // Angle difference
      let angleDiff = targetHeading - car.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // AI Input state simulation
      const inputState = {
        accelerate: true,
        left: angleDiff > 0.05,
        right: angleDiff < -0.05,
        brake: Math.abs(angleDiff) > 0.4 // Slow down before tight hairpin bends
      };

      // 3. Rubber-banding (catch up if player is far ahead)
      const distToPlayer = playerCar.trackProgressT - car.trackProgressT;
      if (distToPlayer > 0.15) {
        car.speed += delta * 15; // Speed boost to catch up
      }

      car.update(delta, inputState, trackEngine);
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
    });
  }
}
