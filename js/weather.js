/* ==========================================================================
   TOPSPEED - Dynamic Weather & Visual Effects System
   Strong lighting, proper sky colors, weather particles
   ========================================================================== */

class WeatherSystem {
  constructor(scene) {
    this.scene = scene;
    this.currentMode = 'night';

    this.rainParticles = null;
    this.snowParticles = null;

    this.ambientLight = null;
    this.hemiLight = null;
    this.dirLight = null;
    this.dirLight2 = null;

    this._setupLights();
  }

  _setupLights() {
    // Strong ambient so nothing is ever fully black
    this.ambientLight = new THREE.AmbientLight(0x444466, 0.7);
    this.scene.add(this.ambientLight);

    // Hemisphere: sky color above, ground color below
    this.hemiLight = new THREE.HemisphereLight(0x445566, 0x222233, 1.2);
    this.scene.add(this.hemiLight);

    // Main directional (sun/moon)
    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.dirLight.position.set(150, 300, 100);
    this.dirLight.castShadow = true;
    this.scene.add(this.dirLight);

    // Fill light from opposite direction
    this.dirLight2 = new THREE.DirectionalLight(0x334466, 0.8);
    this.dirLight2.position.set(-150, 100, -100);
    this.scene.add(this.dirLight2);
  }

  setWeather(mode, trackConfig) {
    this.currentMode = mode;

    // Remove old particles
    if (this.rainParticles) {
      this.scene.remove(this.rainParticles);
      if (this.rainParticles.geometry) this.rainParticles.geometry.dispose();
      if (this.rainParticles.material) this.rainParticles.material.dispose();
      this.rainParticles = null;
    }
    if (this.snowParticles) {
      this.scene.remove(this.snowParticles);
      if (this.snowParticles.geometry) this.snowParticles.geometry.dispose();
      if (this.snowParticles.material) this.snowParticles.material.dispose();
      this.snowParticles = null;
    }

    // Sky background color from track config
    if (trackConfig && trackConfig.skyTop) {
      this.scene.background = new THREE.Color(trackConfig.skyTop);
    }

    if (mode === 'rain') {
      this._createRain();
      this.ambientLight.color.setHex(0x334455);
      this.ambientLight.intensity = 0.6;
      this.hemiLight.color.setHex(0x334455);
      this.hemiLight.groundColor.setHex(0x1a2530);
      this.hemiLight.intensity = 1.0;
      this.dirLight.color.setHex(0x8899aa);
      this.dirLight.intensity = 1.0;
      this.dirLight2.color.setHex(0x00f3ff);
      this.dirLight2.intensity = 0.4;
    } else if (mode === 'snow') {
      this._createSnow();
      this.ambientLight.color.setHex(0x778899);
      this.ambientLight.intensity = 0.9;
      this.hemiLight.color.setHex(0x99aacc);
      this.hemiLight.groundColor.setHex(0x557744);
      this.hemiLight.intensity = 1.2;
      this.dirLight.color.setHex(0xddddee);
      this.dirLight.intensity = 1.3;
      this.dirLight2.color.setHex(0x778899);
      this.dirLight2.intensity = 0.6;
    } else {
      // Cyberpunk Night — stylized purple/blue
      this.ambientLight.color.setHex(0x333355);
      this.ambientLight.intensity = 0.7;
      this.hemiLight.color.setHex(0x2a2a4a);
      this.hemiLight.groundColor.setHex(0x110a1a);
      this.hemiLight.intensity = 1.0;
      this.dirLight.color.setHex(0x7755cc);
      this.dirLight.intensity = 1.2;
      this.dirLight2.color.setHex(0xff0055);
      this.dirLight2.intensity = 0.5;
    }
  }

  _createRain() {
    var count = 4000;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);

    for (var i = 0; i < count * 3; i += 3) {
      pos[i] = (Math.random() - 0.5) * 400;
      pos[i + 1] = Math.random() * 100;
      pos[i + 2] = (Math.random() - 0.5) * 400;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    var mat = new THREE.PointsMaterial({
      color: 0x88bbff,
      size: 0.3,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true
    });

    this.rainParticles = new THREE.Points(geo, mat);
    this.scene.add(this.rainParticles);
  }

  _createSnow() {
    var count = 2500;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);

    for (var i = 0; i < count * 3; i += 3) {
      pos[i] = (Math.random() - 0.5) * 400;
      pos[i + 1] = Math.random() * 100;
      pos[i + 2] = (Math.random() - 0.5) * 400;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    var mat = new THREE.PointsMaterial({
      color: 0xeeeeff,
      size: 0.6,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true
    });

    this.snowParticles = new THREE.Points(geo, mat);
    this.scene.add(this.snowParticles);
  }

  update(delta, playerPos) {
    if (this.rainParticles) {
      var rp = this.rainParticles.geometry.attributes.position.array;
      for (var i = 1; i < rp.length; i += 3) {
        rp[i] -= 120 * delta;
        if (rp[i] < 0) rp[i] = 100;
      }
      this.rainParticles.geometry.attributes.position.needsUpdate = true;
      this.rainParticles.position.x = playerPos.x;
      this.rainParticles.position.z = playerPos.z;
    }

    if (this.snowParticles) {
      var sp = this.snowParticles.geometry.attributes.position.array;
      for (var i = 0; i < sp.length; i += 3) {
        sp[i + 1] -= 20 * delta;
        sp[i] += Math.sin(sp[i + 1] * 0.08) * 0.15;
        if (sp[i + 1] < 0) sp[i + 1] = 100;
      }
      this.snowParticles.geometry.attributes.position.needsUpdate = true;
      this.snowParticles.position.x = playerPos.x;
      this.snowParticles.position.z = playerPos.z;
    }
  }
}
