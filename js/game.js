/* ==========================================================================
   TOPSPEED - Main Game Controller & Loop (Cyberpunk Tokyo Arcade Racer)
   ========================================================================== */

class Game {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.audio = new AudioEngine();
    this.trackEngine = null;
    this.playerCar = null;
    this.aiManager = null;
    this.weather = null;

    this.gameState = 'menu'; // 'menu', 'countdown', 'racing', 'paused', 'results'
    this.selectedTrackIdx = 0;
    this.selectedCarColor = 0xff0055;
    this.selectedCarProfile = 'cannibalRed';
    this.totalLaps = 3;
    this.difficulty = 'medium';
    this.musicEnabled = true;

    this.inputState = {
      accelerate: false,
      left: false,
      right: false,
      brake: false,
      reverse: false
    };

    this.clock = new THREE.Clock();
    this.raceStartTime = 0;
    this.currentLapTime = 0;
    this.previousPlayerT = 0; // For lap crossing detection
    this.finishOrder = [];
    this.totalRacers = 1;
    this.hud = {};

    this.minimapCtx = null;
    this.cameraShake = 0;
    this.wasPlayerAirborne = false;

    this.init();
  }

  init() {
    // 1. Three.js Scene & Camera Setup
    const container = document.getElementById('canvas-container');
    if (!container) return;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070f);

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 3000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    // 2. Systems Instantiation
    this.trackEngine = new TrackEngine(this.scene);
    this.playerCar = new CarEngine(this.scene, false, this.selectedCarColor, "VOCÊ", this._getSelectedCarSurfaceProfile());
    this.aiManager = new AIManager(this.scene);
    this.aiManager.totalLaps = this.totalLaps;
    this.weather = new WeatherSystem(this.scene);

    // Minimap canvas context
    const minimapCanvas = document.getElementById('minimap-canvas');
    if (minimapCanvas) this.minimapCtx = minimapCanvas.getContext('2d');
    this.hud = {
      speed: document.getElementById('dash-speed'),
      gear: document.getElementById('dash-gear'),
      needle: document.getElementById('gauge-needle'),
      rpmPath: document.getElementById('gauge-rpm-path'),
      position: document.getElementById('hud-position'),
      time: document.getElementById('hud-time'),
      lap: document.getElementById('hud-lap'),
      surface: document.getElementById('hud-surface'),
      weather: document.getElementById('hud-weather'),
      centerAlert: document.getElementById('center-alert'),
      alertBody: document.getElementById('alert-body'),
      rivalAlert: document.getElementById('rival-alert'),
      rivalText: document.getElementById('rival-alert-text'),
      countdown: document.getElementById('race-countdown'),
      finalPosition: document.getElementById('final-position-text'),
      finalTime: document.getElementById('final-time-text'),
      resultsMenu: document.getElementById('results-menu'),
      leaderboardBody: document.getElementById('leaderboard-body')
    };
    this.aiManager.getRaceProgress = car => this._getRaceProgress(car);
    this.aiManager.onFinish = car => this._registerFinish(car);

    // 3. Event Listeners & UI Binding
    this._bindEvents();
    this._bindUI();

    // Resize Handler
    window.addEventListener('resize', () => this.onWindowResize());

    // 4. Initial Scene Setup
    this.trackEngine.loadTrack(0);
    this.weather.setWeather('night', this.trackEngine.currentConfig);

    // Start Game Loop
    this.animate();
  }

  /* --------------------------------------------------------------------------
     Event Listeners (Keyboard Input & Audio Resume)
     -------------------------------------------------------------------------- */
  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      this.audio.resume();

      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') this.inputState.accelerate = true;
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') this.inputState.left = true;
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') this.inputState.right = true;
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') this.inputState.reverse = true;
      if (e.key === ' ') this.inputState.brake = true;

      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        this.togglePause();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') this.inputState.accelerate = false;
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') this.inputState.left = false;
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') this.inputState.right = false;
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') this.inputState.reverse = false;
      if (e.key === ' ') this.inputState.brake = false;
    });
  }

  /* --------------------------------------------------------------------------
     UI Buttons & Selection Binding
     -------------------------------------------------------------------------- */
  _bindUI() {
    // Track Selection Cards
    const trackCards = document.querySelectorAll('.track-card');
    trackCards.forEach((card) => {
      card.addEventListener('click', (e) => {
        const target = e.currentTarget;
        trackCards.forEach(c => c.classList.remove('active'));
        target.classList.add('active');
        this.selectedTrackIdx = parseInt(target.getAttribute('data-track')) || 0;
        
        // Preview track in background scene
        this.trackEngine.loadTrack(this.selectedTrackIdx);
        this.weather.setWeather(this._weatherForTrack(this.selectedTrackIdx), this.trackEngine.currentConfig);
      });
    });

    // Car Selection Cards
    const carCards = document.querySelectorAll('.car-card');
    const colors = [0xff0055, 0x00f3ff, 0xffe600];
    const profiles = ['cannibalRed', 'sidewinderCyan', 'razorYellow'];
    carCards.forEach((card) => {
      card.addEventListener('click', (e) => {
        const target = e.currentTarget;
        carCards.forEach(c => c.classList.remove('active'));
        target.classList.add('active');
        const carIdx = parseInt(target.getAttribute('data-car')) || 0;
        this.selectedCarColor = colors[carIdx];
        this.selectedCarProfile = profiles[carIdx];

        // Update player car preview color
        if (this.playerCar) {
          this.playerCar.dispose();
          this.scene.remove(this.playerCar.mesh);
          this.playerCar = new CarEngine(this.scene, false, this.selectedCarColor, "VOCÊ", this._getSelectedCarSurfaceProfile());
        }
      });
    });

    // Difficulty & Laps Selects
    const difficultySelect = document.getElementById('select-difficulty');
    if (difficultySelect) {
      difficultySelect.addEventListener('change', (e) => this.difficulty = e.target.value);
    }
    const lapsSelect = document.getElementById('select-laps');
    if (lapsSelect) {
      lapsSelect.addEventListener('change', (e) => this.totalLaps = parseInt(e.target.value));
    }
    const musicSelect = document.getElementById('select-music');
    if (musicSelect) {
      musicSelect.addEventListener('change', (e) => {
        this.musicEnabled = e.target.value === 'on';
        this.audio.setMusicEnabled(this.musicEnabled);
        if (this.musicEnabled && this.gameState === 'racing') this.audio.startMusic();
      });
    }

    // Start & Restart Buttons
    const btnStart = document.getElementById('btn-start');
    if (btnStart) btnStart.addEventListener('click', () => this.startRace());

    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) btnRestart.addEventListener('click', () => this.startRace());

    const btnMainMenu = document.getElementById('btn-main-menu');
    if (btnMainMenu) btnMainMenu.addEventListener('click', () => this.showMainMenu());

    const btnResume = document.getElementById('btn-resume');
    if (btnResume) btnResume.addEventListener('click', () => this.togglePause());

    const btnQuit = document.getElementById('btn-quit');
    if (btnQuit) btnQuit.addEventListener('click', () => this.showMainMenu());

    const btnResetCar = document.getElementById('btn-reset-car');
    if (btnResetCar) btnResetCar.addEventListener('click', () => this.resetPlayerCar());
  }

  /* --------------------------------------------------------------------------
     Race Flow & State Transitions
     -------------------------------------------------------------------------- */
  startRace() {
    this.audio.init();
    this.audio.resume();
    this.audio.setMusicEnabled(this.musicEnabled);

    // Hide Menus & Show HUD
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('results-menu').classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');

    // Load Track & Setup Cars
    this.trackEngine.loadTrack(this.selectedTrackIdx);
    
    // Set Weather according to track theme
    this.weather.setWeather(this._weatherForTrack(this.selectedTrackIdx), this.trackEngine.currentConfig);

    const weatherLabels = ['NOITE CYBER', 'NEVE', 'CHUVA NEON'];
    if (this.hud.weather) this.hud.weather.innerText = weatherLabels[this.selectedTrackIdx] || 'NOITE CYBER';

    // Player & AI Spawn
    // Place the player behind the bot grid at the start. Bots occupy
    // approximately t=0.98..0.91, so t=0.88 leaves a clear rear row.
    const startPos = this.trackEngine.getPointAt(0.88);
    const startTangent = this.trackEngine.getTangentAt(0.88);
    const startHeading = Math.atan2(startTangent.x, startTangent.z);

    if (this.playerCar) {
      this.playerCar.dispose();
      this.scene.remove(this.playerCar.mesh);
    }
    this.playerCar = new CarEngine(this.scene, false, this.selectedCarColor, "VOCÊ", this._getSelectedCarSurfaceProfile());
    this.playerCar.resetPosition(startPos, startHeading);
    this.wasPlayerAirborne = false;

    this.aiManager.createBots(this.difficulty);
    this.aiManager.totalLaps = this.totalLaps;
    this.aiManager.resetPositions(this.trackEngine);
    this.totalRacers = this.aiManager.bots.length + 1;
    this.finishOrder = [];
    this.previousPlayerT = 0.88;
    this.currentLapTime = 0;
    Object.keys(this.inputState).forEach(key => { this.inputState[key] = false; });

    // Start Countdown
    this.gameState = 'countdown';
    this._runCountdownSequence();
  }

  _runCountdownSequence() {
    const cdElement = document.getElementById('race-countdown');
    cdElement.classList.remove('hidden');

    let count = 3;
    cdElement.innerText = count;
    this.audio.playCountdownBeep(false);

    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        cdElement.innerText = count;
        this.audio.playCountdownBeep(false);
      } else {
        clearInterval(timer);
        cdElement.innerText = 'GO!';
        this.audio.playCountdownBeep(true);
        this.gameState = 'racing';
        this.raceStartTime = performance.now();
        this.audio.startMusic();

        setTimeout(() => cdElement.classList.add('hidden'), 1000);
      }
    }, 1000);
  }

  showMainMenu() {
    this.gameState = 'menu';
    this.audio.stopMusic();
    this.audio.stopEngine();

    document.getElementById('main-menu').classList.remove('hidden');
    document.getElementById('results-menu').classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
  }

  togglePause() {
    if (this.gameState === 'racing') {
      this.gameState = 'paused';
      document.getElementById('pause-menu').classList.remove('hidden');
    } else if (this.gameState === 'paused') {
      this.gameState = 'racing';
      document.getElementById('pause-menu').classList.add('hidden');
    }
  }

  finishRace() {
    if (this.gameState === 'results') return;
    if (!this.playerCar.isFinished) this._registerFinish(this.playerCar);
    this.gameState = 'results';
    this.audio.stopMusic();

    // Finished cars are ordered by the immutable arrival registration. Cars
    // still racing are shown by their real progress and receive DNF.
    const allCars = this._getRaceStandings();

    const playerRank = allCars.findIndex(c => c === this.playerCar) + 1;

    if (this.hud.finalPosition) this.hud.finalPosition.innerText = `${playerRank}º LUGAR`;
    if (this.hud.finalTime) this.hud.finalTime.innerText = `Tempo Total: ${this._formatTime(this.playerCar.finishTime || this.currentLapTime)}`;

    const tbody = this.hud.leaderboardBody;
    if (!tbody) return;
    tbody.innerHTML = '';
    allCars.forEach((c, idx) => {
      const row = document.createElement('tr');
      if (c === this.playerCar) row.classList.add('player-row');
      row.innerHTML = `
        <td>${idx + 1}º</td>
        <td>${c.name}</td>
        <td>${c.name === 'VOCÊ' ? 'SEU CARRO' : 'MODEL-X'}</td>
        <td>${c.finishTime == null ? 'DNF' : this._formatTime(c.finishTime)}</td>
      `;
      tbody.appendChild(row);
    });

    if (this.hud.resultsMenu) this.hud.resultsMenu.classList.remove('hidden');
  }

  /* --------------------------------------------------------------------------
     Main Render & Update Loop
     -------------------------------------------------------------------------- */
  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);

    if (this.gameState === 'racing') {
      // 1. Update Player Physics & Audio
      this.playerCar.update(delta, this.inputState, this.trackEngine);
      if (!this.wasPlayerAirborne && this.playerCar.airborne) this.audio.playJump();
      if (this.wasPlayerAirborne && !this.playerCar.airborne) {
        this.audio.playLanding(this.playerCar.lastLandingImpact || 1);
      }
      this.wasPlayerAirborne = this.playerCar.airborne;
      this.audio.updateEngine(this.playerCar.speed, this.playerCar.maxSpeed, this.inputState.accelerate, this.playerCar.gear);
      this.audio.updateDriftSqueal(this.playerCar.isDrifting, this.playerCar.driftIntensity);

      // 1b. Lap Detection — detect when player crosses start/finish
      this._checkLapCrossing();

      // 2. Update AI Competitors
      this.aiManager.update(delta, this.trackEngine, this.playerCar);

      // 3. Update Weather & Particles
      this.weather.update(delta, this.playerCar.mesh.position);

      // 4. Update Rear-View Third Person Camera
      this._updateCamera();

      // 5. Update HUD & Minimap
      this._updateHUD();
      this._drawMinimap();

      // Check Speed limit zone
      this._checkSpeedLimit();
    } else {
      // Rotate camera in main menu for dynamic background preview
      if (this.gameState === 'menu') {
        const time = performance.now() * 0.0005;
        this.camera.position.x = Math.sin(time) * 100;
        this.camera.position.z = Math.cos(time) * 100;
        this.camera.position.y = 40;
        this.camera.lookAt(0, 0, 0);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  /* --------------------------------------------------------------------------
     Rear-View Arcade Camera
     -------------------------------------------------------------------------- */
  _updateCamera() {
    const carPos = this.playerCar.mesh.position;
    const heading = this.playerCar.heading;
    const speedRatio = Math.min(1, Math.abs(this.playerCar.speed) / this.playerCar.maxSpeed);
    const time = performance.now() * 0.001;
    this.cameraShake = Math.max(this.cameraShake * 0.86, this.playerCar.collisionImpact || 0);

    const camOffset = new THREE.Vector3(
      -Math.sin(heading) * 12,
      5.5,
      -Math.cos(heading) * 12
    );

    const targetCamPos = carPos.clone().add(camOffset);
    targetCamPos.y += Math.sin(time * 3.2) * 0.09 * speedRatio;
    targetCamPos.x += Math.cos(time * 2.4) * 0.05 * speedRatio;
    if (this.cameraShake > 0.01) {
      targetCamPos.x += (Math.random() - 0.5) * this.cameraShake * 0.35;
      targetCamPos.y += (Math.random() - 0.5) * this.cameraShake * 0.26;
      targetCamPos.z += (Math.random() - 0.5) * this.cameraShake * 0.2;
    }
    this.camera.position.lerp(targetCamPos, 0.15);

    const lookTarget = carPos.clone().add(new THREE.Vector3(
      Math.sin(heading) * 10,
      1.5,
      Math.cos(heading) * 10
    ));
    this.camera.lookAt(lookTarget);
  }

  resetPlayerCar() {
    if (!this.playerCar || !this.trackEngine) return;
    const progress = this.trackEngine.getTrackProgress(this.playerCar.mesh.position, this.playerCar.trackProgressT);
    const safeT = (progress.t + 0.006) % 1;
    const position = this.trackEngine.getPointAt(safeT);
    const tangent = this.trackEngine.getTangentAt(safeT);
    const lapBeforeReset = this.playerCar.lap;
    this.playerCar.resetPosition(position, Math.atan2(tangent.x, tangent.z));
    this.playerCar.lap = lapBeforeReset;
    this.playerCar.airborne = false;
    this.playerCar.verticalVelocity = 0;
    this.playerCar.trackProgressT = safeT;
    this.playerCar.collisionImpact = 0;
    this.cameraShake = 0;
    this.wasPlayerAirborne = false;
    Object.keys(this.inputState).forEach(key => { this.inputState[key] = false; });
  }

  /* --------------------------------------------------------------------------
     HUD Dashboard & Tachometer Updates
     -------------------------------------------------------------------------- */
  _updateHUD() {
    const speed = Math.floor(Math.abs(this.playerCar.speed));
    if (this.hud.speed) this.hud.speed.innerText = speed;
    if (this.hud.gear) this.hud.gear.innerText = this.playerCar.gear;

    // Keep the needle within the visible gauge arc.
    const rpmRatio = (this.playerCar.rpm - 1000) / 7000;
    const needleDeg = -82 + Math.min(1.0, Math.max(0, rpmRatio)) * 164;
    if (this.hud.needle) this.hud.needle.style.transform = `translateX(-50%) rotate(${needleDeg}deg)`;

    // RPM Arc dashoffset
    if (this.hud.rpmPath) {
      const offset = 251 - Math.min(1.0, Math.max(0, rpmRatio)) * 251;
      this.hud.rpmPath.style.strokeDashoffset = offset;
    }

    // Position ranking
    const allCars = this._getRaceStandings();
    const rank = allCars.findIndex(c => c === this.playerCar) + 1;
    if (this.hud.position) this.hud.position.innerHTML = `${rank}<sup>${this._getRankSuffix(rank)}</sup><small>/${this.totalRacers}</small>`;

    // Timer & Laps
    this.currentLapTime = (performance.now() - this.raceStartTime) / 1000;
    if (this.hud.time) this.hud.time.innerText = this._formatTime(this.currentLapTime);
    const completedLaps = this.playerCar.isFinished
      ? this.totalLaps
      : Math.max(0, this.playerCar.lap - 1);
    if (this.hud.lap) this.hud.lap.innerText = `${completedLaps} / ${this.totalLaps}`;
    const surfaceLabels = { asphalt: 'ASFALTO', dirt: 'TERRA', snow: 'NEVE' };
    if (this.hud.surface) this.hud.surface.innerText = surfaceLabels[this.playerCar.currentSurface] || 'ASFALTO';

    // Warn the player about the nearest racer using distance along the circuit.
    const rivalAlert = this.hud.rivalAlert;
    const rivalText = this.hud.rivalText;
    if (rivalAlert && rivalText) {
      let closest = null;
      this.aiManager.bots.forEach(bot => {
        const rival = bot.car;
        const signedGap = this._getRaceProgress(rival) - this._getRaceProgress(this.playerCar);
        const aheadGap = signedGap > 0 ? signedGap : Infinity;
        const behindGap = signedGap < 0 ? -signedGap : Infinity;
        const gap = Math.min(aheadGap, behindGap);
        if (gap > 0.001 && (!closest || gap < closest.gap)) {
          closest = { rival, gap, ahead: aheadGap < behindGap };
        }
      });
      if (closest && closest.gap < 0.026) {
        rivalText.innerText = closest.ahead ? `RIVAL À FRENTE: ${closest.rival.name}` : `RIVAL NA RETAGUARDA: ${closest.rival.name}`;
        rivalAlert.classList.toggle('behind', !closest.ahead);
        rivalAlert.classList.remove('hidden');
      } else {
        rivalAlert.classList.add('hidden');
      }
    }
  }

  _checkSpeedLimit() {
    const progress = this.trackEngine.getTrackProgress(this.playerCar.mesh.position, this.playerCar.trackProgressT);
    const seg = progress.segment;
    const alertBox = this.hud.centerAlert;
    if (!alertBox) return;

    if (seg.isSpeedLimit) {
      alertBox.classList.remove('hidden');
      const limit = this.trackEngine.currentConfig.speedLimit || 80;
      if (this.hud.alertBody) this.hud.alertBody.innerText = `LIMITE DE VELOCIDADE: ${limit} KM/H`;
      if (this.playerCar.speed > limit) {
        this.audio.playSpeedWarning();
      }
    } else {
      alertBox.classList.add('hidden');
    }
  }

  /* --------------------------------------------------------------------------
     Lap Crossing Detection
     Detects when trackProgressT wraps from >0.85 back to <0.15
     -------------------------------------------------------------------------- */
  _checkLapCrossing() {
    const currentT = this.playerCar.trackProgressT;

    // Player must be moving and have a previous T recorded
    if (this.playerCar.speed > 5) {
      // Crossed start/finish: was near end of track, now near beginning
      if (this.previousPlayerT > 0.85 && currentT < 0.15) {
        this.playerCar.lap++;

        // Check if race is complete
        if (this.playerCar.lap > this.totalLaps) {
          this.playerCar.lap = this.totalLaps;
          this._registerFinish(this.playerCar);
          this.finishRace();
          return;
        }
      }
      // Going backwards detection (optional)
      // if (this.previousPlayerT < 0.15 && currentT > 0.85) { ... }
    }

    this.previousPlayerT = currentT;
  }

  _drawMinimap() {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    ctx.clearRect(0, 0, 160, 160);

    // Draw spline circuit track line
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath();

    const segs = this.trackEngine.segments;
    for (let i = 0; i < segs.length; i += 10) {
      const p = segs[i].point;
      const mapX = 80 + (p.x / 800) * 60;
      const mapZ = 80 + (p.z / 800) * 60;
      if (i === 0) ctx.moveTo(mapX, mapZ);
      else ctx.lineTo(mapX, mapZ);
    }
    ctx.closePath();
    ctx.stroke();

    // Draw Bots on Minimap
    this.aiManager.bots.forEach(b => {
      const p = b.car.mesh.position;
      const mapX = 80 + (p.x / 800) * 60;
      const mapZ = 80 + (p.z / 800) * 60;
      ctx.fillStyle = '#ff0055';
      ctx.beginPath();
      ctx.arc(mapX, mapZ, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Player on Minimap
    const playerP = this.playerCar.mesh.position;
    const playerX = 80 + (playerP.x / 800) * 60;
    const playerZ = 80 + (playerP.z / 800) * 60;
    ctx.fillStyle = '#00f3ff';
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(playerX, playerZ, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  _formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  _getRankSuffix(rank) {
    if (rank === 1) return 'ST';
    if (rank === 2) return 'ND';
    if (rank === 3) return 'RD';
    return 'TH';
  }

  _getRaceProgress(car) {
    // `lap` is the human-facing lap number (starts at 1), while race
    // progress needs completed laps. A car that crossed the finish line is
    // always ahead of every car still on the final lap.
    if (car.isFinished) {
      // Keep completed vehicles strictly ordered by their immutable arrival.
      const tieBreaker = car.finishPosition ? (this.totalRacers - car.finishPosition) * 0.0001 : 0;
      return this.totalLaps + 1 + tieBreaker;
    }
    return Math.max(0, (car.lap || 1) - 1) + (car.trackProgressT || 0);
  }

  _getRaceStandings() {
    const allCars = [this.playerCar, ...this.aiManager.bots.map(bot => bot.car)];
    return allCars.sort((a, b) => {
      if (a.isFinished && b.isFinished) return (a.finishPosition || Infinity) - (b.finishPosition || Infinity);
      if (a.isFinished) return -1;
      if (b.isFinished) return 1;
      return this._getRaceProgress(b) - this._getRaceProgress(a);
    });
  }

  _registerFinish(car) {
    if (!car || car.finishTime != null) return;
    car.isFinished = true;
    car.finishTime = Math.max(0, (performance.now() - this.raceStartTime) / 1000);
    car.finishPosition = this.finishOrder.length + 1;
    this.finishOrder.push(car);
  }

  _weatherForTrack(trackIdx) {
    if (trackIdx === 1) return 'snow';
    if (trackIdx === 2) return 'rain';
    return 'night';
  }

  _getSelectedCarSurfaceProfile() {
    const profiles = {
      // Asphalt specialist: strongest on pavement, average on dirt, weakest on snow.
      cannibalRed: { asphalt: 1.12, dirt: 0.72, snow: 0.38 },
      // Dirt specialist: strongest on dirt, average on asphalt and snow.
      sidewinderCyan: { asphalt: 0.94, dirt: 0.98, snow: 0.58 },
      // Snow specialist: strongest on snow, average on asphalt and dirt.
      razorYellow: { asphalt: 0.94, dirt: 0.72, snow: 0.82 }
    };
    return profiles[this.selectedCarProfile] || profiles.cannibalRed;
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// Robust Initialization Handler
function startApp() {
  window.gameInstance = new Game();
}

if (document.readyState === 'interactive' || document.readyState === 'complete') {
  startApp();
} else {
  document.addEventListener('DOMContentLoaded', startApp);
}
