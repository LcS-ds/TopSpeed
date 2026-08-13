/* ==========================================================================
   TOPSPEED - 3D Vehicle & Physics Engine
   ========================================================================== */

class CarEngine {
  constructor(scene, isAI = false, colorHex = 0xff0055, name = "PLAYER", surfaceProfile = null) {
    this.scene = scene;
    this.isAI = isAI;
    this.name = name;
    this.colorHex = colorHex;
    this.surfaceProfile = surfaceProfile;

    this.mesh = new THREE.Group();
    this.scene.add(this.mesh);

    // Car Physics Variables
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.heading = 0; // Orientation angle in radians

    this.speed = 0; // Speed in km/h
    this.maxSpeed = 220; // Top speed in km/h
    this.acceleration = 90; // km/h per second
    this.decelerationCoasting = 25; // km/h per second natural coasting
    this.brakeForce = 120; // km/h per second brake
    this.reverseAcceleration = 55;
    this.reverseMaxSpeed = 45;

    this.steeringAngle = 0;
    this.maxSteerAngle = 0.015; // Reduced sensitivity

    this.gear = 1;
    this.rpm = 1000;

    this.isDrifting = false;
    this.driftIntensity = 0;

    this.currentSurface = 'asphalt';
    this.surfaceFriction = 1.0;

    this.lap = 1;
    this.trackProgressT = 0;
    this.lapStartTime = 0;
    this.totalRaceTime = 0;
    this.isFinished = false;
    this.trailMeshes = [];
    this.trailTimer = 0;
    this.airborne = false;
    this.verticalVelocity = 0;
    this.jumpCooldown = 0;
    this.collisionImpact = 0;
    this.lastLandingImpact = 0;

    this._buildCarMesh();
  }

  /* --------------------------------------------------------------------------
     Stylized 3D Arcade Car Model
     -------------------------------------------------------------------------- */
  _buildCarMesh() {
    // Main Body Chassis
    const bodyGeo = new THREE.BoxGeometry(2.4, 1.0, 4.8);
    const bodyMat = new THREE.MeshPhongMaterial({
      color: this.colorHex,
      shininess: 80
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    this.mesh.add(body);

    // Cabin Glass / Windshield
    const cabinGeo = new THREE.BoxGeometry(2.0, 0.7, 2.4);
    const cabinMat = new THREE.MeshPhongMaterial({
      color: 0x0d1326,
      shininess: 120,
      transparent: true,
      opacity: 0.9
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.45, -0.2);
    this.mesh.add(cabin);

    // Rear Spoiler
    const spoilerGeo = new THREE.BoxGeometry(2.6, 0.2, 0.8);
    const spoilerMat = new THREE.MeshPhongMaterial({ color: 0x111625, shininess: 50 });
    const spoiler = new THREE.Mesh(spoilerGeo, spoilerMat);
    spoiler.position.set(0, 1.6, -2.1);
    this.mesh.add(spoiler);

    // Headlights (Front Neon Glowing)
    const headMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
    const leftHead = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.2), headMat);
    leftHead.position.set(-0.9, 0.9, 2.41);
    const rightHead = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.2), headMat);
    rightHead.position.set(0.9, 0.9, 2.41);
    this.mesh.add(leftHead);
    this.mesh.add(rightHead);

    // Taillights (Rear Neon Red Glowing)
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const tailLight = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.1), tailMat);
    tailLight.position.set(0, 0.9, -2.41);
    this.mesh.add(tailLight);

    // Neon Underglow Light
    const underglowGeo = new THREE.PlaneGeometry(2.8, 5.0);
    const underglowMat = new THREE.MeshBasicMaterial({
      color: this.colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const underglow = new THREE.Mesh(underglowGeo, underglowMat);
    underglow.rotation.x = Math.PI / 2;
    underglow.position.y = 0.05;
    this.mesh.add(underglow);

    // Wheels (4 Wheels)
    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 16);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x151821 });

    const wheelPositions = [
      [-1.25, 0.45, 1.5],
      [1.25, 0.45, 1.5],
      [-1.25, 0.45, -1.5],
      [1.25, 0.45, -1.5]
    ];

    wheelPositions.forEach(pos => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(...pos);
      w.castShadow = true;
      this.mesh.add(w);
      this.wheels.push(w);
    });
  }

  /* --------------------------------------------------------------------------
     Physics Update (Arcade Driving Physics)
     -------------------------------------------------------------------------- */
  update(delta, inputState, trackEngine) {
    if (this.isFinished) return;

    // 1. Check current track surface & friction
    const trackProgress = trackEngine.getTrackProgress(this.mesh.position);
    this.trackProgressT = trackProgress.t;
    const currentSeg = trackProgress.segment;

    this.currentSurface = currentSeg.surface || 'asphalt';

    const defaultSurfaceGrip = { asphalt: 1.0, dirt: 0.75, snow: 0.50 };
    this.surfaceFriction = this.surfaceProfile?.[this.currentSurface] ??
      defaultSurfaceGrip[this.currentSurface] ?? defaultSurfaceGrip.asphalt;

    const effectiveMaxSpeed = this.maxSpeed * this.surfaceFriction;

    // 2. Acceleration (W key or AI input)
    if (inputState.accelerate) {
      if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.brakeForce * delta);
      } else {
        this.speed += this.acceleration * this.surfaceFriction * delta;
        if (this.speed > effectiveMaxSpeed) this.speed = effectiveMaxSpeed;
      }
    } else if (inputState.reverse) {
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.brakeForce * delta);
      } else {
        this.speed -= this.reverseAcceleration * delta;
        if (this.speed < -this.reverseMaxSpeed) this.speed = -this.reverseMaxSpeed;
      }
    } else if (inputState.brake) {
      // Braking (S or Space)
      this.speed -= this.brakeForce * delta;
      if (this.speed < 0) this.speed = 0;
    } else {
      // Natural Coasting (Releasing accelerator)
      this.speed -= this.decelerationCoasting * delta;
      if (this.speed < 0) this.speed = 0;
    }

    // 3. Steering & Rotation (A/D keys)
    let steerInput = 0;
    if (inputState.left) steerInput += 1;
    if (inputState.right) steerInput -= 1;

    // Steering sensitivity scales inversely with high speed for stability
    const speedRatio = this.speed / this.maxSpeed;
    const currentSteerFactor = this.maxSteerAngle * (1 - speedRatio * 0.4);

    if (steerInput !== 0 && Math.abs(this.speed) > 5) {
      this.heading += steerInput * currentSteerFactor * (this.speed / 40);
    }

    // 4. Drift Mechanics (Brake/Handbrake turned in high speed)
    if (inputState.brake && Math.abs(steerInput) > 0 && this.speed > 70) {
      this.isDrifting = true;
      this.driftIntensity = Math.min(1.0, this.driftIntensity + delta * 3.0);
    } else {
      this.isDrifting = false;
      this.driftIntensity = Math.max(0, this.driftIntensity - delta * 4.0);
    }

    // 5. Gear & RPM Calculation
    if (this.speed < -1) this.gear = 'R';
    else if (this.speed < 35) this.gear = 1;
    else if (this.speed < 75) this.gear = 2;
    else if (this.speed < 115) this.gear = 3;
    else if (this.speed < 155) this.gear = 4;
    else if (this.speed < 195) this.gear = 5;
    else this.gear = 6;

    this.rpm = 1000 + (Math.abs(this.speed) % 40) * 150 + (inputState.accelerate ? 500 : 0);

    // 6. Update 3D Position & Mesh Orientation
    const moveDistance = (this.speed * 1000 / 3600) * delta; // Convert km/h to m/s
    const forwardVec = new THREE.Vector3(
      Math.sin(this.heading),
      0,
      Math.cos(this.heading)
    );

    this.mesh.position.add(forwardVec.multiplyScalar(moveDistance));

    // Keep every vehicle seated on the sampled track elevation.  This makes
    // the player and AI climb and descend together on Fuji's raised sections.
    const updatedProgress = trackEngine.getTrackProgress(this.mesh.position);
    const roadTangent = updatedProgress.segment.tangent;
    const horizontalLength = Math.sqrt(roadTangent.x * roadTangent.x + roadTangent.z * roadTangent.z);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - delta);
    var roadHeight = updatedProgress.segment.point.y;
    if (this.airborne) {
      this.verticalVelocity -= 19 * delta;
      this.mesh.position.y += this.verticalVelocity * delta;
      if (this.mesh.position.y <= roadHeight) {
        this.lastLandingImpact = Math.abs(this.verticalVelocity);
        this.mesh.position.y = roadHeight;
        this.airborne = false;
        this.verticalVelocity = 0;
      }
    } else {
      var jump = trackEngine.getJumpAt(this.mesh.position);
      if (jump && this.speed > 70 && this.jumpCooldown <= 0) {
        this.airborne = true;
        this.verticalVelocity = 6 + this.speed * 0.025;
        this.jumpCooldown = 1.4;
      }
      this.mesh.position.y = roadHeight;
    }
    this.mesh.rotation.x = -Math.atan2(roadTangent.y, horizontalLength);

    // Only the player is constrained by the off-track boundary. Bots have no
    // invisible wall here, so they can take a wider escape line around a
    // barrier and recover naturally instead of getting pinned against it.
    var roadLimit = trackEngine.trackWidth / 2 + 4.5;
    if (!this.isAI && Math.abs(updatedProgress.lateralOffset) > roadLimit) {
      var side = updatedProgress.lateralOffset < 0 ? -1 : 1;
      this.mesh.position.copy(updatedProgress.segment.point)
        .add(updatedProgress.segment.normal.clone().multiplyScalar(side * roadLimit));
      this.speed *= 0.42;
      this.isDrifting = false;
      this.collisionImpact = Math.max(this.collisionImpact, 0.7);
    }

    var obstacle = trackEngine.getObstacleCollision(this.mesh.position, 0.55);
    if (obstacle) {
      var away = this.mesh.position.clone().sub(obstacle.position);
      away.y = 0;
      if (away.lengthSq() < 0.01) away.copy(updatedProgress.segment.normal);
      away.normalize();
      this.mesh.position.add(away.multiplyScalar(0.75));
      this.speed *= 0.5;
      this.collisionImpact = Math.max(this.collisionImpact, 1);
    }

    this._leaveSurfaceTrail(delta, updatedProgress);

    this.mesh.rotation.y = this.heading;

    // Tilt mesh slightly when turning/drifting for arcade visual dynamism
    this.mesh.rotation.z = -steerInput * 0.08 * (this.speed / 100);

    // Spin wheels
    this.wheels.forEach(w => {
      w.rotation.x += moveDistance * 0.8;
    });
    this.collisionImpact = Math.max(0, this.collisionImpact - delta * 2.8);
  }

  _leaveSurfaceTrail(delta, progress) {
    if (this.isAI || this.speed < 25) return;
    if (this.currentSurface === 'asphalt' && !this.isDrifting) return;

    this.trailTimer += delta;
    if (this.trailTimer < 0.12) return;
    this.trailTimer = 0;

    var colors = { asphalt: 0x242424, dirt: 0x75401d, snow: 0xdff8ff };
    var mark = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 3.2),
      new THREE.MeshBasicMaterial({
        color: colors[this.currentSurface] || 0x444444,
        transparent: true,
        opacity: this.currentSurface === 'snow' ? 0.38 : 0.5,
        side: THREE.DoubleSide
      })
    );
    var behind = new THREE.Vector3(-Math.sin(this.heading) * 1.8, 0, -Math.cos(this.heading) * 1.8);
    mark.position.copy(this.mesh.position).add(behind);
    mark.position.y = progress.segment.point.y + 0.09;
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = -this.heading;
    this.scene.add(mark);
    this.trailMeshes.push(mark);

    if (this.trailMeshes.length > 48) {
      var oldMark = this.trailMeshes.shift();
      this.scene.remove(oldMark);
      oldMark.geometry.dispose();
      oldMark.material.dispose();
    }
  }

  resetPosition(startPos, heading = 0) {
    this.mesh.position.copy(startPos);
    this.heading = heading;
    this.mesh.rotation.y = heading;
    this.speed = 0;
    this.airborne = false;
    this.verticalVelocity = 0;
    this.jumpCooldown = 0;
    this.lastLandingImpact = 0;
    this.lap = 1;
    this.isFinished = false;
  }
}
