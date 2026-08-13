/* ==========================================================================
   TOPSPEED - 3D Track & Environment Engine
   Cenário Completo Inspirado no Top Gear (SNES)
   Chão visível, pista larga, marcações, cenário lateral, skyline
   ========================================================================== */

class TrackEngine {
  constructor(scene) {
    this.scene = scene;
    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);

    this.points = [];
    this.curve = null;
    this.segments = [];
    this.trackLength = 0;
    this.trackWidth = 28;
    this.surfaceTextures = {};
    this.obstacles = [];
    this.jumps = [];

    this.trackConfigs = [
      {
        id: 'shibuya',
        name: 'SHIBUYA CYBER-CIRCUIT',
        surfaceDefault: 'asphalt',
        hasSpeedLimitZone: true,
        speedLimit: 80,
        speedLimitStart: 0.35,
        speedLimitEnd: 0.55,
        theme: 'cyberpunk',
        laps: 3,
        groundColor: 0x0d0d1a,
        roadColor: 0x555577,
        rumbleColor1: 0xff0055,
        rumbleColor2: 0xffffff,
        skyTop: 0x0a0e2a,
        skyBottom: 0x1a0a2e
      },
      {
        id: 'fuji',
        name: 'FUJI PASS RALLY',
        surfaceDefault: 'asphalt',
        surfaceSegments: [
          { start: 0.25, end: 0.55, type: 'dirt' },
          { start: 0.55, end: 0.85, type: 'snow' }
        ],
        hasSpeedLimitZone: false,
        theme: 'rally',
        laps: 3,
        groundColor: 0x2d7a1e,
        roadColor: 0x666666,
        rumbleColor1: 0xff3300,
        rumbleColor2: 0xffffff,
        skyTop: 0x3388cc,
        skyBottom: 0x88bbdd
      },
      {
        id: 'expressway',
        name: 'TOKYO BAY EXPRESSWAY',
        surfaceDefault: 'asphalt',
        hasSpeedLimitZone: true,
        speedLimit: 90,
        speedLimitStart: 0.7,
        speedLimitEnd: 0.9,
        theme: 'coastal',
        laps: 3,
        groundColor: 0x1a2530,
        roadColor: 0x4a5565,
        rumbleColor1: 0x00f3ff,
        rumbleColor2: 0xffffff,
        skyTop: 0x0a1520,
        skyBottom: 0x1a2a40
      }
    ];

    this.currentConfig = this.trackConfigs[0];
  }

  loadTrack(trackIdx) {
    trackIdx = trackIdx || 0;
    this.obstacles = [];
    this.jumps = [];
    // Clear ALL previous objects from trackGroup
    while (this.trackGroup.children.length > 0) {
      var obj = this.trackGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          for (var m = 0; m < obj.material.length; m++) obj.material[m].dispose();
        } else {
          obj.material.dispose();
        }
      }
      this.trackGroup.remove(obj);
    }

    this.currentConfig = this.trackConfigs[trackIdx] || this.trackConfigs[0];
    this._generateCurvePoints(trackIdx);
    this._buildSkyDome();
    this._buildGroundPlane();
    if (this.currentConfig.theme === 'rally') this._buildRallyEmbankments();
    this._build3DTrackMesh();
    this._buildRoadMarkings();
    this._buildTrackEdgeLines();
    this._buildRumbleStrips();
    this._buildSurfaceDetails();
    this._buildTracksideDetails();
    this._buildStartFinishArch();
    this._buildSceneryProps();
    this._buildCyberpunkGates();
    this._buildRoadsideLandmarks();
    this._buildBackgroundSkyline();
  }

  /* --------------------------------------------------------------------------
     Track Curve Spline Generation
     -------------------------------------------------------------------------- */
  _generateCurvePoints(trackIdx) {
    var rawPoints = [];

    if (trackIdx === 0) {
      rawPoints.push(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(150, 0, -200),
        new THREE.Vector3(400, 0, -250),
        new THREE.Vector3(600, 0, -50),
        new THREE.Vector3(500, 0, 250),
        new THREE.Vector3(300, 0, 450),
        new THREE.Vector3(50, 0, 500),
        new THREE.Vector3(-200, 0, 350),
        new THREE.Vector3(-350, 0, 100),
        new THREE.Vector3(-250, 0, -150)
      );
    } else if (trackIdx === 1) {
      rawPoints.push(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(100, 5, -250),
        new THREE.Vector3(300, 10, -450),
        new THREE.Vector3(150, 15, -650),
        new THREE.Vector3(-100, 10, -500),
        new THREE.Vector3(-250, 5, -250),
        new THREE.Vector3(-450, 2, 0),
        new THREE.Vector3(-300, 0, 250),
        new THREE.Vector3(-100, 0, 150)
      );
    } else {
      rawPoints.push(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(250, 0, -350),
        new THREE.Vector3(650, 0, -450),
        new THREE.Vector3(900, 2, -200),
        new THREE.Vector3(800, 0, 250),
        new THREE.Vector3(450, 0, 550),
        new THREE.Vector3(0, 0, 600),
        new THREE.Vector3(-300, 0, 350)
      );
    }

    this.curve = new THREE.CatmullRomCurve3(rawPoints, true, 'catmullrom', 0.5);
    this.trackLength = this.curve.getLength();

    this.segments = [];
    var numSamples = 500;
    for (var i = 0; i <= numSamples; i++) {
      var t = i / numSamples;
      var point = this.curve.getPointAt(t);
      var tangent = this.curve.getTangentAt(t);
      var normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      var surface = this.currentConfig.surfaceDefault;
      if (this.currentConfig.surfaceSegments) {
        for (var s = 0; s < this.currentConfig.surfaceSegments.length; s++) {
          var seg = this.currentConfig.surfaceSegments[s];
          if (t >= seg.start && t <= seg.end) {
            surface = seg.type;
            break;
          }
        }
      }

      var isSpeedLimit = false;
      if (this.currentConfig.hasSpeedLimitZone) {
        if (t >= this.currentConfig.speedLimitStart && t <= this.currentConfig.speedLimitEnd) {
          isSpeedLimit = true;
        }
      }

      this.segments.push({
        t: t,
        point: point,
        tangent: tangent,
        normal: normal,
        surface: surface,
        isSpeedLimit: isSpeedLimit
      });
    }
  }

  /* --------------------------------------------------------------------------
     Ground Plane — Large colored terrain extending to horizon
     -------------------------------------------------------------------------- */
  _buildGroundPlane() {
    var cfg = this.currentConfig;
    var groundType = cfg.theme === 'rally' ? 'grass' : (cfg.theme === 'coastal' ? 'concrete' : 'cityGround');

    var groundGeo = new THREE.PlaneGeometry(4000, 4000);
    var groundUvs = groundGeo.attributes.uv;
    for (var uvIndex = 0; uvIndex < groundUvs.count; uvIndex++) {
      groundUvs.setXY(uvIndex, groundUvs.getX(uvIndex) * 160, groundUvs.getY(uvIndex) * 160);
    }
    groundUvs.needsUpdate = true;
    var groundMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: this._getSurfaceTexture(groundType) });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.trackGroup.add(ground);

    // Extra ground shoulder along the road for color variation
    // (lighter dirt/grass strip right next to road edges)
    if (cfg.theme === 'rally') {
      this._buildGroundShoulder(0x4a8a2a, 'grass'); // Lighter green near road
    } else if (cfg.theme === 'cyberpunk') {
      this._buildGroundShoulder(0x151530, 'concrete'); // Slightly lighter dark near road
    } else {
      this._buildGroundShoulder(0x1a2838, 'concrete'); // Concrete near road
    }
  }

  /* --------------------------------------------------------------------------
     Sky Dome — soft gradient instead of a flat, empty background
     -------------------------------------------------------------------------- */
  _buildSkyDome() {
    var cfg = this.currentConfig;
    var radius = 2200;
    var skyGeo = new THREE.SphereGeometry(radius, 32, 18);
    var positions = skyGeo.attributes.position;
    var colors = new Float32Array(positions.count * 3);
    var top = new THREE.Color(cfg.skyTop);
    var horizon = new THREE.Color(cfg.skyBottom);
    var color = new THREE.Color();

    for (var i = 0; i < positions.count; i++) {
      var heightRatio = THREE.MathUtils.clamp((positions.getY(i) / radius + 0.12) / 0.78, 0, 1);
      color.copy(horizon).lerp(top, heightRatio);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var skyMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    var sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.y = -250;
    sky.renderOrder = -10;
    this.trackGroup.add(sky);
  }

  /* --------------------------------------------------------------------------
     Procedural Surface Textures — tileable material detail without assets
     -------------------------------------------------------------------------- */
  _getSurfaceTexture(type) {
    if (this.surfaceTextures[type]) return this.surfaceTextures[type];

    var styles = {
      grass: { base: [47, 118, 36], noise: 30, fleck: [115, 163, 67] },
      asphalt: { base: [108, 114, 128], noise: 24, fleck: [175, 180, 190] },
      dirt: { base: [123, 91, 43], noise: 38, fleck: [180, 140, 70] },
      snow: { base: [194, 211, 226], noise: 18, fleck: [242, 248, 255] },
      concrete: { base: [27, 38, 54], noise: 18, fleck: [58, 79, 103] },
      cityGround: { base: [15, 19, 34], noise: 13, fleck: [38, 49, 75] }
    };
    var style = styles[type] || styles.asphalt;
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    var ctx = canvas.getContext('2d');
    var image = ctx.createImageData(256, 256);
    var data = image.data;
    var seed = type.length * 7919;
    var random = function() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (var pixel = 0; pixel < data.length; pixel += 4) {
      var shade = (random() - 0.5) * style.noise;
      data[pixel] = Math.max(0, Math.min(255, style.base[0] + shade));
      data[pixel + 1] = Math.max(0, Math.min(255, style.base[1] + shade));
      data[pixel + 2] = Math.max(0, Math.min(255, style.base[2] + shade));
      data[pixel + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);

    for (var mark = 0; mark < 550; mark++) {
      var size = 1 + random() * (type === 'grass' ? 3 : 2);
      ctx.globalAlpha = 0.13 + random() * 0.24;
      ctx.fillStyle = 'rgb(' + style.fleck[0] + ',' + style.fleck[1] + ',' + style.fleck[2] + ')';
      ctx.fillRect(random() * 256, random() * 256, size, type === 'grass' ? size * 2 : size);
    }
    ctx.globalAlpha = 1;

    if (type === 'asphalt' || type === 'concrete') {
      ctx.strokeStyle = type === 'asphalt' ? 'rgba(16,18,25,0.34)' : 'rgba(73,97,122,0.18)';
      ctx.lineWidth = 1;
      for (var crack = 0; crack < 18; crack++) {
        var x = random() * 256;
        var y = random() * 256;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (random() - 0.5) * 36, y + (random() - 0.5) * 22);
        ctx.stroke();
      }
    }

    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.anisotropy = 4;
    if (THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
    this.surfaceTextures[type] = texture;
    return texture;
  }

  _buildGroundShoulder(color, textureType) {
    var halfW = this.trackWidth / 2;
    var shoulderWidth = 20;
    var verts = [];
    var uvs = [];
    var indices = [];

    for (var i = 0; i < this.segments.length; i++) {
      var seg = this.segments[i];
      var p = seg.point;
      var n = seg.normal;

      // Left shoulder
      var innerL = p.clone().add(n.clone().multiplyScalar(halfW + 3));
      var outerL = p.clone().add(n.clone().multiplyScalar(halfW + shoulderWidth));
      verts.push(innerL.x, -0.3, innerL.z);
      verts.push(outerL.x, -0.3, outerL.z);
      uvs.push(0, i / 5, 4, i / 5);

      if (i < this.segments.length - 1) {
        var base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    var mat = new THREE.MeshLambertMaterial({ color: color, map: this._getSurfaceTexture(textureType) });
    this.trackGroup.add(new THREE.Mesh(geo, mat));

    // Right shoulder
    var verts2 = [];
    var uvs2 = [];
    var indices2 = [];
    for (var i = 0; i < this.segments.length; i++) {
      var seg = this.segments[i];
      var p = seg.point;
      var n = seg.normal;

      var innerR = p.clone().add(n.clone().multiplyScalar(-(halfW + 3)));
      var outerR = p.clone().add(n.clone().multiplyScalar(-(halfW + shoulderWidth)));
      verts2.push(innerR.x, -0.3, innerR.z);
      verts2.push(outerR.x, -0.3, outerR.z);
      uvs2.push(0, i / 5, 4, i / 5);

      if (i < this.segments.length - 1) {
        var base = i * 2;
        indices2.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    var geo2 = new THREE.BufferGeometry();
    geo2.setAttribute('position', new THREE.Float32BufferAttribute(verts2, 3));
    geo2.setAttribute('uv', new THREE.Float32BufferAttribute(uvs2, 2));
    geo2.setIndex(indices2);
    geo2.computeVertexNormals();
    this.trackGroup.add(new THREE.Mesh(geo2, mat.clone()));
  }

  /* --------------------------------------------------------------------------
     3D Road Mesh — Wide, visible, colored per surface type
     -------------------------------------------------------------------------- */
  _build3DTrackMesh() {
    var numSegs = this.segments.length;
    var halfWidth = this.trackWidth / 2;
    var cfg = this.currentConfig;
    var surfaces = {
      // The road uses a brighter material than the terrain so the racing lane
      // remains clear in every weather condition.
      asphalt: { color: 0xffffff, texture: 'asphalt' },
      dirt: { color: 0xb17e38, texture: 'dirt' },
      snow: { color: 0xc7d9e6, texture: 'snow' },
      speedZone: { color: 0x775494, texture: 'asphalt' }
    };
    var buckets = {};
    Object.keys(surfaces).forEach(function(key) {
      buckets[key] = { positions: [], uvs: [], indices: [] };
    });
    var roadDistance = 0;

    for (var i = 0; i < numSegs - 1; i++) {
      var seg = this.segments[i];
      var next = this.segments[i + 1];
      var surfaceKey = seg.isSpeedLimit ? 'speedZone' : (seg.surface || 'asphalt');
      var bucket = buckets[surfaceKey];
      var left = seg.point.clone().add(seg.normal.clone().multiplyScalar(halfWidth));
      var right = seg.point.clone().add(seg.normal.clone().multiplyScalar(-halfWidth));
      var nextLeft = next.point.clone().add(next.normal.clone().multiplyScalar(halfWidth));
      var nextRight = next.point.clone().add(next.normal.clone().multiplyScalar(-halfWidth));
      var base = bucket.positions.length / 3;
      var nextDistance = roadDistance + seg.point.distanceTo(next.point);

      [left, right, nextLeft, nextRight].forEach(function(point) {
        bucket.positions.push(point.x, point.y + 0.05, point.z);
      });
      // Five metres per texture tile keeps the grain visible at racing speed.
      bucket.uvs.push(-2.8, roadDistance / 5, 2.8, roadDistance / 5, -2.8, nextDistance / 5, 2.8, nextDistance / 5);
      bucket.indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      roadDistance = nextDistance;
    }

    Object.keys(surfaces).forEach(function(key) {
      var bucket = buckets[key];
      if (!bucket.indices.length) return;
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2));
      geometry.setIndex(bucket.indices);
      geometry.computeVertexNormals();
      var definition = surfaces[key];
      var material = new THREE.MeshPhongMaterial({
        color: definition.color,
        map: this._getSurfaceTexture(definition.texture),
        shininess: key === 'asphalt' || key === 'speedZone' ? 32 : 4,
        side: THREE.DoubleSide
      });
      var roadMesh = new THREE.Mesh(geometry, material);
      roadMesh.receiveShadow = true;
      this.trackGroup.add(roadMesh);
    }, this);
  }

  /* --------------------------------------------------------------------------
     Road Edge Lines — painted boundaries on both sides of the racing lane
     -------------------------------------------------------------------------- */
  _buildTrackEdgeLines() {
    var halfWidth = this.trackWidth / 2;
    var cfg = this.currentConfig;
    var edgeColors = cfg.theme === 'rally' ? [0xffffff, 0xffc928] : [0xffffff, cfg.rumbleColor1];
    var sides = [1, -1];

    for (var sideIndex = 0; sideIndex < sides.length; sideIndex++) {
      var side = sides[sideIndex];
      var positions = [];
      var indices = [];
      var lineWidth = 0.34;

      for (var i = 0; i < this.segments.length - 1; i++) {
        var seg = this.segments[i];
        var next = this.segments[i + 1];
        var edge = seg.point.clone().add(seg.normal.clone().multiplyScalar(side * (halfWidth - 0.62)));
        var edgeNext = next.point.clone().add(next.normal.clone().multiplyScalar(side * (halfWidth - 0.62)));
        var inner = edge.clone().add(seg.normal.clone().multiplyScalar(-side * lineWidth));
        var innerNext = edgeNext.clone().add(next.normal.clone().multiplyScalar(-side * lineWidth));
        var base = positions.length / 3;

        [edge, inner, edgeNext, innerNext].forEach(function(point) {
          positions.push(point.x, point.y + 0.13, point.z);
        });
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }

      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      var material = new THREE.MeshBasicMaterial({ color: edgeColors[sideIndex], side: THREE.DoubleSide });
      this.trackGroup.add(new THREE.Mesh(geometry, material));
    }
  }

  /* --------------------------------------------------------------------------
     Fuji Embankments — connect the raised road to the mountain terrain
     -------------------------------------------------------------------------- */
  _buildRallyEmbankments() {
    var halfWidth = this.trackWidth / 2;
    var sides = [1, -1];
    var ridgeCount = 9;
    var ridgeSpacing = 22;

    for (var sideIndex = 0; sideIndex < sides.length; sideIndex++) {
      var side = sides[sideIndex];
      var positions = [];
      var uvs = [];
      var indices = [];
      for (var i = 0; i < this.segments.length; i++) {
        var seg = this.segments[i];
        for (var ridge = 0; ridge < ridgeCount; ridge++) {
          var distance = halfWidth + 2.5 + ridge * ridgeSpacing;
          var point = seg.point.clone().add(seg.normal.clone().multiplyScalar(side * distance));
          point.y = this._getRallyTerrainHeight(seg, distance);
          positions.push(point.x, point.y, point.z);
          uvs.push(ridge * 1.5, i / 6);
        }
      }

      for (var row = 0; row < this.segments.length - 1; row++) {
        for (var col = 0; col < ridgeCount - 1; col++) {
          var base = row * ridgeCount + col;
          indices.push(base, base + 1, base + ridgeCount);
          indices.push(base + 1, base + ridgeCount + 1, base + ridgeCount);
        }
      }
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      var material = new THREE.MeshLambertMaterial({ color: 0x86a25c, map: this._getSurfaceTexture('grass'), side: THREE.DoubleSide });
      this.trackGroup.add(new THREE.Mesh(geometry, material));
    }
  }

  /* --------------------------------------------------------------------------
     Surface Details — readable dirt, snow/ice, safety markers and wet patches
     -------------------------------------------------------------------------- */
  _getRallyTerrainHeight(seg, lateralDistance) {
    var innerEdge = this.trackWidth / 2 + 2.5;
    var slopeWidth = 176;
    var progress = THREE.MathUtils.clamp((Math.abs(lateralDistance) - innerEdge) / slopeWidth, 0, 1);
    return seg.point.y * Math.pow(1 - progress, 2.15) - 0.42 * progress;
  }

  _buildRallyStructures() {
    var bridgeMat = new THREE.MeshPhongMaterial({ color: 0x6f4524, shininess: 12 });
    var railMat = new THREE.MeshPhongMaterial({ color: 0x3f291a, shininess: 8 });
    var rampMat = new THREE.MeshPhongMaterial({ color: 0xa4582c, shininess: 18 });
    var bridgeIndices = [105, 360];
    var jumpIndices = [175, 285];

    bridgeIndices.forEach(function(index) {
      // Build the bridge from short, flush planks sampled along the spline.
      // A single long rotated box cut across curved or elevated road sections.
      for (var plankIndex = -7; plankIndex <= 7; plankIndex++) {
        var sampleIndex = (index + plankIndex * 2 + this.segments.length) % this.segments.length;
        var plankSeg = this.segments[sampleIndex];
        var plank = new THREE.Mesh(new THREE.BoxGeometry(this.trackWidth - 2.2, 0.14, 3.0), bridgeMat);
        plank.position.copy(plankSeg.point);
        plank.position.y += 0.1;
        plank.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plankSeg.tangent.clone().normalize());
        this.trackGroup.add(plank);

        // Low edge boards identify the bridge without blocking the lane.
        [-1, 1].forEach(function(side) {
          var edgeBoard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 3.0), railMat);
          edgeBoard.position.copy(plankSeg.point)
            .add(plankSeg.normal.clone().multiplyScalar(side * (this.trackWidth / 2 - 0.45)));
          edgeBoard.position.y += 0.3;
          edgeBoard.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plankSeg.tangent.clone().normalize());
          this.trackGroup.add(edgeBoard);
        }, this);
      }
    }, this);

    jumpIndices.forEach(function(index) {
      var seg = this.segments[index];
      // Low wedge: it visually rises from the road instead of becoming a box
      // wall across the circuit. Jump physics remain driven by `this.jumps`.
      var rampGeo = new THREE.BufferGeometry();
      var halfRamp = (this.trackWidth - 5) / 2;
      var rampLength = 7.5;
      var rampVerts = [
        -halfRamp, 0, -rampLength / 2, halfRamp, 0, -rampLength / 2,
        -halfRamp, 0, rampLength / 2, halfRamp, 0, rampLength / 2,
        -halfRamp, 0.06, -rampLength / 2, halfRamp, 0.06, -rampLength / 2,
        -halfRamp, 0.62, rampLength / 2, halfRamp, 0.62, rampLength / 2
      ];
      rampGeo.setAttribute('position', new THREE.Float32BufferAttribute(rampVerts, 3));
      rampGeo.setIndex([
        4, 5, 7, 4, 7, 6, // sloped top
        0, 2, 3, 0, 3, 1, // bottom
        0, 4, 6, 0, 6, 2, // left
        1, 3, 7, 1, 7, 5, // right
        2, 6, 7, 2, 7, 3, // front
        0, 1, 5, 0, 5, 4  // back
      ]);
      rampGeo.computeVertexNormals();
      var ramp = new THREE.Mesh(rampGeo, rampMat);
      ramp.position.copy(seg.point);
      ramp.position.y += 0.1;
      ramp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), seg.tangent.clone().normalize());
      this.trackGroup.add(ramp);
      this.jumps.push({ position: seg.point.clone(), radius: 6.2 });
    }, this);
  }

  _buildSurfaceDetails() {
    var cfg = this.currentConfig;
    var halfWidth = this.trackWidth / 2;
    var dirtMat = new THREE.MeshBasicMaterial({ color: 0x9c6028, side: THREE.DoubleSide });
    var iceMat = new THREE.MeshBasicMaterial({
      color: 0x8ee8ff,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide
    });
    var snowMat = new THREE.MeshBasicMaterial({ color: 0xf2fbff, side: THREE.DoubleSide });
    var coneMat = new THREE.MeshBasicMaterial({ color: 0xff6b16 });
    var reflectorMat = new THREE.MeshBasicMaterial({ color: 0xffe339 });

    for (var i = 12; i < this.segments.length - 6; i += 12) {
      var seg = this.segments[i];
      var previous = this.segments[i - 1];
      var rotation = -Math.atan2(seg.tangent.x, seg.tangent.z);

      if (cfg.theme === 'rally' && seg.surface === 'dirt') {
        // Brown loose-earth patches make the dirt zone legible at a glance.
        if (i % 24 === 0) {
          var dirtPatch = new THREE.Mesh(new THREE.CircleGeometry(3.6, 12), dirtMat);
          dirtPatch.position.set(seg.point.x, seg.point.y + 0.11, seg.point.z);
          dirtPatch.rotation.x = -Math.PI / 2;
          dirtPatch.rotation.z = rotation;
          dirtPatch.scale.set(1.4, 0.58, 1);
          this.trackGroup.add(dirtPatch);
        }
      }

      if (cfg.theme === 'rally' && seg.surface === 'snow') {
        // Icy blue patches lie on the road while snowbanks sit on both sides.
        if (i % 24 === 0) {
          var ice = new THREE.Mesh(new THREE.CircleGeometry(3.8, 14), iceMat);
          ice.position.set(seg.point.x, seg.point.y + 0.12, seg.point.z);
          ice.rotation.x = -Math.PI / 2;
          ice.rotation.z = rotation;
          ice.scale.set(1.55, 0.52, 1);
          this.trackGroup.add(ice);
        }
        if (i % 36 === 0) {
          for (var snowSide = -1; snowSide <= 1; snowSide += 2) {
            var bankPos = seg.point.clone().add(seg.normal.clone().multiplyScalar(snowSide * (halfWidth + 14)));
            // Match the embankment slope so snow does not float beside climbs.
            bankPos.y = seg.point.y + (-0.35 - seg.point.y) * 0.43;
            var snowBank = new THREE.Mesh(new THREE.DodecahedronGeometry(2.5, 1), snowMat);
            snowBank.position.copy(bankPos);
            snowBank.scale.set(2.2, 0.45, 1.15);
            this.trackGroup.add(snowBank);
          }
        }
      }

      // Cones and small reflective boards announce every surface transition.
      if (cfg.theme === 'rally' && seg.surface !== previous.surface) {
        for (var side = -1; side <= 1; side += 2) {
          var conePos = seg.point.clone().add(seg.normal.clone().multiplyScalar(side * (halfWidth - 2)));
          var cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 8), coneMat);
          cone.position.set(conePos.x, conePos.y + 0.56, conePos.z);
          this.trackGroup.add(cone);
          this.obstacles.push({ position: cone.position.clone(), radius: 0.6 });
        }

        var marker = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.6, 0.18), reflectorMat);
        var markerPos = seg.point.clone().add(seg.normal.clone().multiplyScalar(halfWidth + 5));
        marker.position.set(markerPos.x, markerPos.y + 2.2, markerPos.z);
        marker.rotation.y = Math.atan2(-seg.normal.x, -seg.normal.z);
        this.trackGroup.add(marker);
      }
    }

    // Braking bands, cones and reflective sign panels on all routes.
    for (var warningIndex = 70; warningIndex < this.segments.length - 12; warningIndex += 105) {
      for (var band = 0; band < 3; band++) {
        var warningSeg = this.segments[warningIndex + band * 3];
        var brakeBand = new THREE.Mesh(
          new THREE.PlaneGeometry(this.trackWidth - 5, 0.42),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
        );
        brakeBand.position.set(warningSeg.point.x, warningSeg.point.y + 0.16, warningSeg.point.z);
        brakeBand.rotation.x = -Math.PI / 2;
        brakeBand.rotation.z = -Math.atan2(warningSeg.tangent.x, warningSeg.tangent.z);
        this.trackGroup.add(brakeBand);
      }
    }

    if (cfg.theme === 'coastal') this._buildWetRoadPatches();
  }

  _buildWetRoadPatches() {
    var wetMat = new THREE.MeshBasicMaterial({
      color: 0x1c6d82,
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide
    });
    for (var i = 40; i < this.segments.length - 10; i += 68) {
      var seg = this.segments[i];
      var patch = new THREE.Mesh(new THREE.PlaneGeometry(this.trackWidth - 7, 9), wetMat);
      patch.position.set(seg.point.x, seg.point.y + 0.12, seg.point.z);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = -Math.atan2(seg.tangent.x, seg.tangent.z);
      this.trackGroup.add(patch);
    }
  }

  /* --------------------------------------------------------------------------
     Road Markings — White center dashes (Top Gear style)
     -------------------------------------------------------------------------- */
  _buildRoadMarkings() {
    var dashGeo = new THREE.PlaneGeometry(0.5, 3.0);
    var dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

    var totalDist = 0;
    var placing = true;

    for (var i = 1; i < this.segments.length; i++) {
      var prev = this.segments[i - 1].point;
      var curr = this.segments[i].point;
      totalDist += prev.distanceTo(curr);

      if (placing && totalDist >= 3.0) {
        var seg = this.segments[i];
        var dash = new THREE.Mesh(dashGeo, dashMat);
        dash.position.set(seg.point.x, seg.point.y + 0.12, seg.point.z);
        dash.rotation.x = -Math.PI / 2;
        dash.rotation.z = -Math.atan2(seg.tangent.x, seg.tangent.z);
        this.trackGroup.add(dash);
        totalDist = 0;
        placing = false;
      } else if (!placing && totalDist >= 5.0) {
        totalDist = 0;
        placing = true;
      }
    }
  }

  /* --------------------------------------------------------------------------
     Rumble Strips — Alternating colored edges (red/white, cyan/white)
     -------------------------------------------------------------------------- */
  _buildRumbleStrips() {
    var halfWidth = this.trackWidth / 2;
    var stripWidth = 2.5;
    var cfg = this.currentConfig;
    var edgeColor1 = new THREE.Color(cfg.rumbleColor1);
    var edgeColor2 = new THREE.Color(cfg.rumbleColor2);

    // Build both sides
    var sides = [1, -1];
    for (var s = 0; s < sides.length; s++) {
      var side = sides[s];
      var verts = [];
      var cols = [];
      var inds = [];

      for (var i = 0; i < this.segments.length; i++) {
        var seg = this.segments[i];
        var p = seg.point;
        var n = seg.normal;

        var inner = p.clone().add(n.clone().multiplyScalar(side * halfWidth));
        var outer = p.clone().add(n.clone().multiplyScalar(side * (halfWidth + stripWidth)));

        verts.push(inner.x, inner.y + 0.08, inner.z);
        verts.push(outer.x, outer.y + 0.08, outer.z);

        var c = (Math.floor(i / 5) % 2 === 0) ? edgeColor1 : edgeColor2;
        cols.push(c.r, c.g, c.b, c.r, c.g, c.b);

        if (i < this.segments.length - 1) {
          var base = i * 2;
          inds.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        }
      }

      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      geo.setIndex(inds);
      var mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
      this.trackGroup.add(new THREE.Mesh(geo, mat));
    }
  }

  /* --------------------------------------------------------------------------
     Trackside Details — guardrails, reflectors and roadside depth cues
     -------------------------------------------------------------------------- */
  _buildTracksideDetails() {
    var cfg = this.currentConfig;
    var halfWidth = this.trackWidth / 2;
    var isNightCity = cfg.theme === 'cyberpunk' || cfg.theme === 'coastal';
    var railMat = new THREE.MeshPhongMaterial({
      color: isNightCity ? 0x17243a : 0x8a8170,
      emissive: isNightCity ? 0x07111f : 0x000000,
      shininess: 70
    });
    var accentMat = new THREE.MeshBasicMaterial({ color: isNightCity ? cfg.rumbleColor1 : 0xffcc44 });
    var railGeo = new THREE.BoxGeometry(0.38, 0.95, 30);
    var accentGeo = new THREE.BoxGeometry(0.56, 0.12, 29.5);
    var postGeo = new THREE.BoxGeometry(0.55, 2.4, 0.55);
    var sides = [1, -1];

    for (var i = 10; i < this.segments.length - 6; i += 9) {
      var seg = this.segments[i];
      var rotation = Math.atan2(seg.tangent.x, seg.tangent.z);

      for (var s = 0; s < sides.length; s++) {
        var side = sides[s];
        // Leave a visible runoff shoulder before the guardrail so cars have
        // room to recover instead of scraping it through every corner.
        var railPos = seg.point.clone().add(seg.normal.clone().multiplyScalar(side * (halfWidth + 5.0)));
        var rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(railPos.x, railPos.y + 0.8, railPos.z);
        rail.rotation.y = rotation;
        this.trackGroup.add(rail);

        var accent = new THREE.Mesh(accentGeo, accentMat);
        accent.position.set(railPos.x, railPos.y + 1.32, railPos.z);
        accent.rotation.y = rotation;
        this.trackGroup.add(accent);

        if (i % 18 === 10) {
          var post = new THREE.Mesh(postGeo, railMat);
          post.position.set(railPos.x, railPos.y + 1.15, railPos.z);
          this.trackGroup.add(post);
        }
      }
    }
  }

  /* --------------------------------------------------------------------------
     Cyberpunk Gates — repeated city landmarks framing the road
     -------------------------------------------------------------------------- */
  _buildCyberpunkGates() {
    var cfg = this.currentConfig;
    if (cfg.theme !== 'cyberpunk' && cfg.theme !== 'coastal') return;

    var halfWidth = this.trackWidth / 2;
    var pillarMat = new THREE.MeshPhongMaterial({ color: 0x121a2d, emissive: 0x07111e, shininess: 90 });
    var neonMat = new THREE.MeshBasicMaterial({ color: cfg.rumbleColor1 });
    var pillarGeo = new THREE.BoxGeometry(2.2, 16, 2.2);
    var beamGeo = new THREE.BoxGeometry(this.trackWidth + 13, 2.2, 2.2);
    var trimGeo = new THREE.BoxGeometry(this.trackWidth + 14, 0.22, 0.3);

    for (var i = 55; i < this.segments.length - 20; i += 95) {
      var seg = this.segments[i];
      var rotation = Math.atan2(seg.tangent.x, seg.tangent.z);
      var left = seg.point.clone().add(seg.normal.clone().multiplyScalar(halfWidth + 6));
      var right = seg.point.clone().add(seg.normal.clone().multiplyScalar(-(halfWidth + 6)));

      [left, right].forEach(function(pos) {
        var pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(pos.x, 8, pos.z);
        pillar.rotation.y = rotation;
        this.trackGroup.add(pillar);
      }, this);

      var beam = new THREE.Mesh(beamGeo, pillarMat);
      beam.position.set(seg.point.x, 16, seg.point.z);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), seg.normal);
      this.trackGroup.add(beam);

      var trim = new THREE.Mesh(trimGeo, neonMat);
      trim.position.set(seg.point.x, 17.2, seg.point.z);
      trim.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), seg.normal);
      this.trackGroup.add(trim);
    }
  }

  /* --------------------------------------------------------------------------
     Landmark pass — each route gets recognisable roadside storytelling
     -------------------------------------------------------------------------- */
  _buildRoadsideLandmarks() {
    if (this.currentConfig.theme === 'rally') {
      this._buildRallyLandmarks();
    } else {
      this._buildUrbanLandmarks();
    }
  }

  _buildUrbanLandmarks() {
    var cfg = this.currentConfig;
    var halfWidth = this.trackWidth / 2;
    var panelColors = [0x00f3ff, 0xff0055, 0x9d00ff, 0xffb000];
    var poleMat = new THREE.MeshPhongMaterial({ color: 0x18243a, emissive: 0x06101d, shininess: 85 });
    var poleGeo = new THREE.CylinderGeometry(0.16, 0.28, 10, 8);
    var lampGeo = new THREE.SphereGeometry(0.52, 10, 8);
    var panelGeo = new THREE.BoxGeometry(7, 3.6, 0.32);
    var frameGeo = new THREE.BoxGeometry(7.6, 4.2, 0.18);
    var stripeGeo = new THREE.BoxGeometry(5.6, 0.18, 0.08);

    for (var i = 24; i < this.segments.length - 10; i += 24) {
      var seg = this.segments[i];
      var side = (Math.floor(i / 24) % 2 === 0) ? 1 : -1;
      var pos = seg.point.clone().add(seg.normal.clone().multiplyScalar(side * (halfWidth + 8)));
      var facing = seg.normal.clone().multiplyScalar(-side);
      var rotation = Math.atan2(facing.x, facing.z);
      var color = panelColors[Math.floor(i / 24) % panelColors.length];
      var neonMat = new THREE.MeshBasicMaterial({ color: color });

      // Tall lamp and a small hanging luminaire establish the city rhythm.
      var pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(pos.x, 5, pos.z);
      this.trackGroup.add(pole);
      var lamp = new THREE.Mesh(lampGeo, neonMat);
      lamp.position.set(pos.x, 10.2, pos.z);
      this.trackGroup.add(lamp);

      if (i % 48 === 24) {
        var signGroup = new THREE.Group();
        signGroup.position.set(pos.x, 7.2, pos.z);
        signGroup.rotation.y = rotation;

        var frame = new THREE.Mesh(frameGeo, poleMat);
        frame.position.z = -0.12;
        signGroup.add(frame);
        var panel = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ color: 0x101b35 }));
        signGroup.add(panel);
        for (var stripe = -1; stripe <= 1; stripe++) {
          var bar = new THREE.Mesh(stripeGeo, neonMat);
          bar.position.set(0, stripe * 0.82, 0.21);
          signGroup.add(bar);
        }
        this.trackGroup.add(signGroup);
      }
    }
  }

  _buildRallyLandmarks() {
    var halfWidth = this.trackWidth / 2;
    var postMat = new THREE.MeshPhongMaterial({ color: 0x47351e, shininess: 10 });
    var boardMat = new THREE.MeshBasicMaterial({ color: 0xffd51c });
    var arrowMat = new THREE.MeshBasicMaterial({ color: 0x17130d });
    var postGeo = new THREE.CylinderGeometry(0.14, 0.18, 3.2, 6);
    var boardGeo = new THREE.BoxGeometry(4.4, 2.1, 0.18);
    var markerGeo = new THREE.BoxGeometry(0.55, 1.25, 0.08);
    var treeMat = new THREE.MeshPhongMaterial({ color: 0x235a31, flatShading: true });

    for (var i = 30; i < this.segments.length - 12; i += 30) {
      var seg = this.segments[i];
      var side = (Math.floor(i / 30) % 2 === 0) ? 1 : -1;
      var pos = seg.point.clone().add(seg.normal.clone().multiplyScalar(side * (halfWidth + 7)));
      var facing = seg.normal.clone().multiplyScalar(-side);
      var rotation = Math.atan2(facing.x, facing.z);

      var sign = new THREE.Group();
      sign.position.set(pos.x, pos.y + 2.7, pos.z);
      sign.rotation.y = rotation;
      var board = new THREE.Mesh(boardGeo, boardMat);
      sign.add(board);
      // Three dark bars make the low-poly board read as a directional chevron.
      for (var mark = -1; mark <= 1; mark++) {
        var marker = new THREE.Mesh(markerGeo, arrowMat);
        marker.position.set(mark * 1.1, 0, 0.12);
        marker.rotation.z = side * -0.55;
        sign.add(marker);
      }
      this.trackGroup.add(sign);

      [-1.5, 1.5].forEach(function(offset) {
        var post = new THREE.Mesh(postGeo, postMat);
        post.position.set(pos.x + offset * Math.cos(rotation), pos.y + 1.4, pos.z - offset * Math.sin(rotation));
        this.trackGroup.add(post);
      }, this);

      if (i % 60 === 30) {
        for (var t = 0; t < 3; t++) {
          var tree = new THREE.Mesh(new THREE.ConeGeometry(2.5 + t * 0.4, 7 + t, 7), treeMat);
          // Offset trees using the track normal, never the global X axis.
          // This keeps every tree outside the road even when the circuit turns.
          var treePos = pos.clone()
            .add(seg.normal.clone().multiplyScalar(side * (8 + t * 4)))
            .add(seg.tangent.clone().multiplyScalar((t - 1) * 4));
          tree.position.set(treePos.x, treePos.y + 3.5 + t * 0.5, treePos.z);
          this.trackGroup.add(tree);
        }
      }
    }
  }

  /* --------------------------------------------------------------------------
     Start/Finish Line & Arch
     -------------------------------------------------------------------------- */
  _buildStartFinishArch() {
    var seg = this.segments[0];
    var p = seg.point;
    var n = seg.normal;
    var halfW = this.trackWidth / 2 + 5;

    var leftPos = p.clone().add(n.clone().multiplyScalar(halfW));
    var rightPos = p.clone().add(n.clone().multiplyScalar(-halfW));

    // Pillars
    var pillarGeo = new THREE.BoxGeometry(2.5, 18, 2.5);
    var pillarMat = new THREE.MeshPhongMaterial({ color: 0x444466, shininess: 40 });

    var leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(leftPos.x, 9, leftPos.z);
    this.trackGroup.add(leftPillar);

    var rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(rightPos.x, 9, rightPos.z);
    this.trackGroup.add(rightPillar);

    // Top Banner
    var bannerGeo = new THREE.BoxGeometry(this.trackWidth + 12, 3, 2);
    var bannerMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
    var banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(p.x, 17, p.z);
    banner.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), n);
    this.trackGroup.add(banner);
    this._buildTrackNameBanner(p, n);

    // Checkered grid on road
    var gridSize = 2;
    var cols = Math.floor(this.trackWidth / gridSize);
    var rows = 3;
    for (var x = 0; x < cols; x++) {
      for (var z = 0; z < rows; z++) {
        var isWhite = (x + z) % 2 === 0;
        var tileGeo = new THREE.PlaneGeometry(gridSize, gridSize);
        var tileMat = new THREE.MeshBasicMaterial({
          color: isWhite ? 0xffffff : 0x111111,
          side: THREE.DoubleSide
        });
        var tile = new THREE.Mesh(tileGeo, tileMat);
        tile.rotation.x = -Math.PI / 2;

        var offsetX = (x * gridSize) - (this.trackWidth / 2) + (gridSize / 2);
        var offsetZ = (z * gridSize) - (rows * gridSize / 2) + (gridSize / 2);

        var worldPos = p.clone()
          .add(n.clone().multiplyScalar(offsetX))
          .add(seg.tangent.clone().multiplyScalar(offsetZ));

        tile.position.set(worldPos.x, 0.15, worldPos.z);
        this.trackGroup.add(tile);
      }
    }
  }

  _buildTrackNameBanner(position, normal) {
    var canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 192;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = this.currentConfig.theme === 'rally' ? '#192c18' : '#071326';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = this.currentConfig.theme === 'rally' ? '#ffd12b' : '#00f3ff';
    ctx.lineWidth = 12;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 58px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.currentConfig.name, canvas.width / 2, canvas.height / 2);

    var texture = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
    var sign = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 5.25),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(position.x, position.y + 22, position.z);
    sign.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), normal);
    this.trackGroup.add(sign);
  }

  /* --------------------------------------------------------------------------
     Scenery Props — Buildings, trees, barriers inspired by Top Gear
     -------------------------------------------------------------------------- */
  _buildSceneryProps() {
    var halfW = this.trackWidth / 2;
    var numSegs = this.segments.length;
    var cfg = this.currentConfig;

    for (var i = 0; i < numSegs; i += 5) {
      var seg = this.segments[i];
      var p = seg.point;
      var n = seg.normal;

      var side = (i % 10 < 5) ? 1 : -1;
      var dist = halfW + 10 + Math.random() * 12;
      var propPos = p.clone().add(n.clone().multiplyScalar(side * dist));

      if (cfg.theme === 'rally') propPos.y = this._getRallyTerrainHeight(seg, dist);

      if (cfg.theme === 'cyberpunk') {
        this._buildCyberpunkProp(propPos, i);
      } else if (cfg.theme === 'rally') {
        this._buildRallyProp(propPos, i, seg);
      } else {
        this._buildCoastalProp(propPos, i);
      }
    }
  }

  _buildCyberpunkProp(pos, idx) {
    if (idx % 20 === 0) {
      // TALL BUILDING with neon accents
      var bH = 25 + Math.random() * 40;
      var bW = 6 + Math.random() * 8;
      var bD = 6 + Math.random() * 8;

      var buildGeo = new THREE.BoxGeometry(bW, bH, bD);
      var buildMat = new THREE.MeshPhongMaterial({
        color: 0x1a1e30,
        emissive: 0x080c18,
        shininess: 15
      });
      var building = new THREE.Mesh(buildGeo, buildMat);
      building.position.set(pos.x, bH / 2, pos.z);
      this.trackGroup.add(building);

      // Neon sign
      var signW = bW * 0.7;
      var signH = 2 + Math.random() * 2;
      var signGeo = new THREE.PlaneGeometry(signW, signH);
      var neonColors = [0xff0055, 0x00f3ff, 0xff6600, 0x9d00ff, 0x00ff66, 0xffe600];
      var signColor = neonColors[idx % neonColors.length];
      var signMat = new THREE.MeshBasicMaterial({ color: signColor, side: THREE.DoubleSide });
      var sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(pos.x, bH * 0.5, pos.z + bD / 2 + 0.2);
      this.trackGroup.add(sign);

      // Window stripes
      for (var row = 0; row < Math.floor(bH / 6); row++) {
        var winGeo = new THREE.PlaneGeometry(bW * 0.8, 0.5);
        var winMat = new THREE.MeshBasicMaterial({
          color: 0xddcc88,
          transparent: true,
          opacity: 0.15 + Math.random() * 0.25,
          side: THREE.DoubleSide
        });
        var win = new THREE.Mesh(winGeo, winMat);
        win.position.set(pos.x, 3 + row * 6, pos.z + bD / 2 + 0.3);
        this.trackGroup.add(win);
      }

    } else if (idx % 10 === 0) {
      // STREET LIGHT with neon glow
      var poleGeo = new THREE.CylinderGeometry(0.25, 0.35, 14, 6);
      var poleMat = new THREE.MeshPhongMaterial({ color: 0x3a3a55, shininess: 40 });
      var pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(pos.x, 7, pos.z);
      this.trackGroup.add(pole);

      // Light globe
      var globeGeo = new THREE.SphereGeometry(0.8, 8, 6);
      var globeColor = (idx % 20 === 0) ? 0xff0055 : 0x00f3ff;
      var globeMat = new THREE.MeshBasicMaterial({ color: globeColor });
      var globe = new THREE.Mesh(globeGeo, globeMat);
      globe.position.set(pos.x, 14.5, pos.z);
      this.trackGroup.add(globe);

      // Actual point light
      var pLight = new THREE.PointLight(globeColor, 0.4, 35);
      pLight.position.set(pos.x, 14, pos.z);
      this.trackGroup.add(pLight);

    } else if (idx % 5 === 0) {
      // Small bollard/barrier
      var bGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.5, 8);
      var bMat = new THREE.MeshPhongMaterial({ color: 0x3a3a55 });
      var bollard = new THREE.Mesh(bGeo, bMat);
      bollard.position.set(pos.x, 0.75, pos.z);
      this.trackGroup.add(bollard);

      // Reflector strip
      var refGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8);
      var refMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
      var refl = new THREE.Mesh(refGeo, refMat);
      refl.position.set(pos.x, 1.2, pos.z);
      this.trackGroup.add(refl);
    }
  }

  _buildRallyProp(pos, idx, seg) {
    var isSnow = (seg.surface === 'snow');
    var isDirt = (seg.surface === 'dirt');

    if (idx % 15 === 0) {
      // BIG TREE — layered cone foliage
      var trunkH = 6 + Math.random() * 3;
      var trunkGeo = new THREE.CylinderGeometry(0.6, 1.0, trunkH, 6);
      var trunkMat = new THREE.MeshPhongMaterial({ color: 0x5a3a1a, shininess: 8 });
      var trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(pos.x, pos.y + trunkH / 2, pos.z);
      this.trackGroup.add(trunk);

      var foliageColor = isSnow ? 0x6a8a7a : 0x1a7a2a;
      for (var layer = 0; layer < 3; layer++) {
        var cR = 5 - layer * 1.0;
        var cH = 6 - layer * 1.0;
        var fGeo = new THREE.ConeGeometry(cR, cH, 6);
        var fMat = new THREE.MeshPhongMaterial({ color: foliageColor, shininess: 5 });
        var fol = new THREE.Mesh(fGeo, fMat);
        fol.position.set(pos.x, pos.y + trunkH + 1 + layer * 2.5, pos.z);
        this.trackGroup.add(fol);
      }

      if (isSnow) {
        var capGeo = new THREE.ConeGeometry(3.5, 1.5, 6);
        var capMat = new THREE.MeshBasicMaterial({ color: 0xeeeeff });
        var cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(pos.x, pos.y + trunkH + 9, pos.z);
        this.trackGroup.add(cap);
      }

    } else if (idx % 10 === 0) {
      // ROCK / BOULDER
      var rockR = 1.5 + Math.random() * 2;
      var rockGeo = new THREE.DodecahedronGeometry(rockR, 0);
      var rockColor = isDirt ? 0x7a6a4a : (isSnow ? 0x99aabb : 0x6a7a5a);
      var rockMat = new THREE.MeshPhongMaterial({ color: rockColor, shininess: 5, flatShading: true });
      var rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(pos.x, pos.y + rockR * 0.6, pos.z);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      this.trackGroup.add(rock);

    } else if (idx % 5 === 0) {
      // FENCE POST
      var postGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.5, 6);
      var postMat = new THREE.MeshPhongMaterial({ color: 0x5a4020, shininess: 5 });
      var post = new THREE.Mesh(postGeo, postMat);
      post.position.set(pos.x, pos.y + 1.25, pos.z);
      this.trackGroup.add(post);
    }
  }

  _buildCoastalProp(pos, idx) {
    if (idx % 15 === 0) {
      // GUARDRAIL section
      var railGeo = new THREE.BoxGeometry(12, 1.2, 0.3);
      var railMat = new THREE.MeshPhongMaterial({ color: 0x778899, shininess: 60 });
      var rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(pos.x, 0.8, pos.z);
      this.trackGroup.add(rail);

      // Reflective strip
      var refGeo = new THREE.PlaneGeometry(11.8, 0.25);
      var refMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, side: THREE.DoubleSide });
      var ref = new THREE.Mesh(refGeo, refMat);
      ref.position.set(pos.x, 1.0, pos.z + 0.2);
      this.trackGroup.add(ref);

      // Support posts
      for (var sp = -5; sp <= 5; sp += 5) {
        var spGeo = new THREE.CylinderGeometry(0.15, 0.15, 2, 6);
        var spMat = new THREE.MeshPhongMaterial({ color: 0x556677 });
        var sPost = new THREE.Mesh(spGeo, spMat);
        sPost.position.set(pos.x + sp, 1, pos.z);
        this.trackGroup.add(sPost);
      }

    } else if (idx % 25 === 0) {
      // FLOOD LIGHT TOWER
      var tGeo = new THREE.CylinderGeometry(0.4, 0.6, 25, 6);
      var tMat = new THREE.MeshPhongMaterial({ color: 0x556677, shininess: 30 });
      var tower = new THREE.Mesh(tGeo, tMat);
      tower.position.set(pos.x, 12.5, pos.z);
      this.trackGroup.add(tower);

      var lampGeo = new THREE.BoxGeometry(4, 1.5, 1.5);
      var lampMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
      var lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(pos.x, 25.5, pos.z);
      this.trackGroup.add(lamp);

      var tLight = new THREE.PointLight(0xffffcc, 0.5, 50);
      tLight.position.set(pos.x, 25, pos.z);
      this.trackGroup.add(tLight);
    }
  }

  /* --------------------------------------------------------------------------
     Background Skyline — Distant silhouettes for depth
     -------------------------------------------------------------------------- */
  _buildBackgroundSkyline() {
    var cfg = this.currentConfig;
    var numElements = 50;
    var radius = 1400;

    for (var i = 0; i < numElements; i++) {
      var angle = (i / numElements) * Math.PI * 2;
      var x = Math.cos(angle) * (radius + Math.random() * 200);
      var z = Math.sin(angle) * (radius + Math.random() * 200);

      if (cfg.theme === 'cyberpunk' || cfg.theme === 'coastal') {
        var bH = 30 + Math.random() * 120;
        var bW = 12 + Math.random() * 25;
        var bD = 12 + Math.random() * 25;

        var bgGeo = new THREE.BoxGeometry(bW, bH, bD);
        var bgMat = new THREE.MeshPhongMaterial({
          color: 0x080c18,
          emissive: 0x040810,
          shininess: 3
        });
        var bgBuild = new THREE.Mesh(bgGeo, bgMat);
        bgBuild.position.set(x, bH / 2, z);
        this.trackGroup.add(bgBuild);

        // Random neon strip on rooftop
        if (Math.random() > 0.4) {
          var nsGeo = new THREE.BoxGeometry(bW + 1, 1, bD + 1);
          var nsColor = [0xff0055, 0x00f3ff, 0x9d00ff, 0xff6600][Math.floor(Math.random() * 4)];
          var nsMat = new THREE.MeshBasicMaterial({ color: nsColor });
          var nsObj = new THREE.Mesh(nsGeo, nsMat);
          nsObj.position.set(x, bH + 0.5, z);
          this.trackGroup.add(nsObj);
        }

        // Random window glow
        if (Math.random() > 0.5) {
          var wGeo = new THREE.PlaneGeometry(bW * 0.6, bH * 0.5);
          var wMat = new THREE.MeshBasicMaterial({
            color: 0xffeeaa,
            transparent: true,
            opacity: 0.05 + Math.random() * 0.08,
            side: THREE.DoubleSide
          });
          var wObj = new THREE.Mesh(wGeo, wMat);
          wObj.position.set(x, bH * 0.5, z + bD / 2 + 0.5);
          this.trackGroup.add(wObj);
        }

      } else {
        // Mountains for rally
        var mH = 50 + Math.random() * 100;
        var mR = 25 + Math.random() * 40;
        var mGeo = new THREE.ConeGeometry(mR, mH, 5);
        var mColor = (Math.random() > 0.5) ? 0x2a5a3a : 0x3a6a4a;
        var mMat = new THREE.MeshPhongMaterial({ color: mColor, shininess: 3, flatShading: true });
        var mountain = new THREE.Mesh(mGeo, mMat);
        mountain.position.set(x, mH / 2 - 5, z);
        this.trackGroup.add(mountain);

        if (Math.random() > 0.3) {
          var scGeo = new THREE.ConeGeometry(mR * 0.35, mH * 0.2, 5);
          var scMat = new THREE.MeshBasicMaterial({ color: 0xeeeeff });
          var sc = new THREE.Mesh(scGeo, scMat);
          sc.position.set(x, mH * 0.85, z);
          this.trackGroup.add(sc);
        }
      }
    }

    // A nearer, denser skyline makes Tokyo read as a real city rather than a
    // sparse ring of silhouettes on the horizon.
    if (cfg.theme === 'cyberpunk' || cfg.theme === 'coastal') {
      var towerRadius = 900;
      var towerMat = new THREE.MeshPhongMaterial({
        color: 0x101a30,
        emissive: 0x07101f,
        shininess: 45
      });
      var windowColors = [0x00d9ff, 0xff176d, 0xa855f7, 0xffc400];

      for (var towerIndex = 0; towerIndex < 30; towerIndex++) {
        var towerAngle = (towerIndex / 30) * Math.PI * 2;
        var towerHeight = 55 + ((towerIndex * 31) % 90);
        var towerWidth = 20 + ((towerIndex * 13) % 18);
        var towerX = Math.cos(towerAngle) * towerRadius;
        var towerZ = Math.sin(towerAngle) * towerRadius;
        var tower = new THREE.Mesh(new THREE.BoxGeometry(towerWidth, towerHeight, towerWidth), towerMat);
        tower.position.set(towerX, towerHeight / 2, towerZ);
        this.trackGroup.add(tower);

        var windowMat = new THREE.MeshBasicMaterial({ color: windowColors[towerIndex % windowColors.length] });
        for (var floor = 12; floor < towerHeight - 8; floor += 18) {
          var windowBand = new THREE.Mesh(new THREE.BoxGeometry(towerWidth + 0.5, 0.55, towerWidth + 0.5), windowMat);
          windowBand.position.set(towerX, floor, towerZ);
          this.trackGroup.add(windowBand);
        }
      }
    }
  }

  /* --------------------------------------------------------------------------
     Track Position & Progression Utilities
     -------------------------------------------------------------------------- */
  getTrackProgress(position) {
    if (!this.curve) return { t: 0, distance: 0, segment: this.segments[0] };

    var minDistSq = Infinity;
    var closestIndex = 0;

    for (var i = 0; i < this.segments.length; i += 2) {
      // Track selection is horizontal: on hills the car must still find the
      // road directly beneath it rather than a distant, lower road segment.
      var dx = position.x - this.segments[i].point.x;
      var dz = position.z - this.segments[i].point.z;
      var dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        closestIndex = i;
      }
    }

    var seg = this.segments[closestIndex];
    var lateralOffset = position.clone().sub(seg.point).dot(seg.normal);
    return {
      t: seg.t,
      distance: seg.t * this.trackLength,
      segment: seg,
      lateralOffset: lateralOffset
    };
  }

  getObstacleCollision(position, radius) {
    for (var i = 0; i < this.obstacles.length; i++) {
      var obstacle = this.obstacles[i];
      var dx = position.x - obstacle.position.x;
      var dz = position.z - obstacle.position.z;
      var collisionDistance = radius + obstacle.radius;
      if (dx * dx + dz * dz < collisionDistance * collisionDistance) return obstacle;
    }
    return null;
  }

  getJumpAt(position) {
    for (var i = 0; i < this.jumps.length; i++) {
      var jump = this.jumps[i];
      var dx = position.x - jump.position.x;
      var dz = position.z - jump.position.z;
      if (dx * dx + dz * dz < jump.radius * jump.radius) return jump;
    }
    return null;
  }

  getPointAt(t) {
    if (!this.curve) return new THREE.Vector3();
    return this.curve.getPointAt(t % 1.0);
  }

  getTangentAt(t) {
    if (!this.curve) return new THREE.Vector3(0, 0, -1);
    return this.curve.getTangentAt(t % 1.0);
  }
}
