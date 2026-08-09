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
    this._buildGroundPlane();
    this._build3DTrackMesh();
    this._buildRoadMarkings();
    this._buildRumbleStrips();
    this._buildStartFinishArch();
    this._buildSceneryProps();
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

    var groundGeo = new THREE.PlaneGeometry(4000, 4000);
    var groundMat = new THREE.MeshLambertMaterial({ color: cfg.groundColor });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.trackGroup.add(ground);

    // Extra ground shoulder along the road for color variation
    // (lighter dirt/grass strip right next to road edges)
    if (cfg.theme === 'rally') {
      this._buildGroundShoulder(0x4a8a2a); // Lighter green near road
    } else if (cfg.theme === 'cyberpunk') {
      this._buildGroundShoulder(0x151530); // Slightly lighter dark near road
    } else {
      this._buildGroundShoulder(0x1a2838); // Concrete near road
    }
  }

  _buildGroundShoulder(color) {
    var halfW = this.trackWidth / 2;
    var shoulderWidth = 20;
    var verts = [];
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

      if (i < this.segments.length - 1) {
        var base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    var mat = new THREE.MeshLambertMaterial({ color: color });
    this.trackGroup.add(new THREE.Mesh(geo, mat));

    // Right shoulder
    var verts2 = [];
    var indices2 = [];
    for (var i = 0; i < this.segments.length; i++) {
      var seg = this.segments[i];
      var p = seg.point;
      var n = seg.normal;

      var innerR = p.clone().add(n.clone().multiplyScalar(-(halfW + 3)));
      var outerR = p.clone().add(n.clone().multiplyScalar(-(halfW + shoulderWidth)));
      verts2.push(innerR.x, -0.3, innerR.z);
      verts2.push(outerR.x, -0.3, outerR.z);

      if (i < this.segments.length - 1) {
        var base = i * 2;
        indices2.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    var geo2 = new THREE.BufferGeometry();
    geo2.setAttribute('position', new THREE.Float32BufferAttribute(verts2, 3));
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

    var vertices = [];
    var colors = [];
    var indices = [];

    var colorRoad = new THREE.Color(cfg.roadColor);
    var colorDirt = new THREE.Color(0x8B7014);
    var colorSnow = new THREE.Color(0xbbccdd);
    var colorSpeedZone = new THREE.Color(0x3b2546);

    for (var i = 0; i < numSegs; i++) {
      var seg = this.segments[i];
      var p = seg.point;
      var n = seg.normal;

      var leftV = p.clone().add(n.clone().multiplyScalar(halfWidth));
      var rightV = p.clone().add(n.clone().multiplyScalar(-halfWidth));

      vertices.push(leftV.x, leftV.y + 0.05, leftV.z);
      vertices.push(rightV.x, rightV.y + 0.05, rightV.z);

      var c = colorRoad;
      if (seg.isSpeedLimit) c = colorSpeedZone;
      else if (seg.surface === 'dirt') c = colorDirt;
      else if (seg.surface === 'snow') c = colorSnow;

      colors.push(c.r, c.g, c.b);
      colors.push(c.r, c.g, c.b);

      if (i < numSegs - 1) {
        var base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    var material = new THREE.MeshLambertMaterial({ vertexColors: true });
    var roadMesh = new THREE.Mesh(geometry, material);
    roadMesh.receiveShadow = true;
    this.trackGroup.add(roadMesh);
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
      var mat = new THREE.MeshBasicMaterial({ vertexColors: true });
      this.trackGroup.add(new THREE.Mesh(geo, mat));
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
      trunk.position.set(pos.x, trunkH / 2, pos.z);
      this.trackGroup.add(trunk);

      var foliageColor = isSnow ? 0x6a8a7a : 0x1a7a2a;
      for (var layer = 0; layer < 3; layer++) {
        var cR = 5 - layer * 1.0;
        var cH = 6 - layer * 1.0;
        var fGeo = new THREE.ConeGeometry(cR, cH, 6);
        var fMat = new THREE.MeshPhongMaterial({ color: foliageColor, shininess: 5 });
        var fol = new THREE.Mesh(fGeo, fMat);
        fol.position.set(pos.x, trunkH + 1 + layer * 2.5, pos.z);
        this.trackGroup.add(fol);
      }

      if (isSnow) {
        var capGeo = new THREE.ConeGeometry(3.5, 1.5, 6);
        var capMat = new THREE.MeshBasicMaterial({ color: 0xeeeeff });
        var cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(pos.x, trunkH + 9, pos.z);
        this.trackGroup.add(cap);
      }

    } else if (idx % 10 === 0) {
      // ROCK / BOULDER
      var rockR = 1.5 + Math.random() * 2;
      var rockGeo = new THREE.DodecahedronGeometry(rockR, 0);
      var rockColor = isDirt ? 0x7a6a4a : (isSnow ? 0x99aabb : 0x6a7a5a);
      var rockMat = new THREE.MeshPhongMaterial({ color: rockColor, shininess: 5, flatShading: true });
      var rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(pos.x, rockR * 0.6, pos.z);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      this.trackGroup.add(rock);

    } else if (idx % 5 === 0) {
      // FENCE POST
      var postGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.5, 6);
      var postMat = new THREE.MeshPhongMaterial({ color: 0x5a4020, shininess: 5 });
      var post = new THREE.Mesh(postGeo, postMat);
      post.position.set(pos.x, 1.25, pos.z);
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
  }

  /* --------------------------------------------------------------------------
     Track Position & Progression Utilities
     -------------------------------------------------------------------------- */
  getTrackProgress(position) {
    if (!this.curve) return { t: 0, distance: 0, segment: this.segments[0] };

    var minDistSq = Infinity;
    var closestIndex = 0;

    for (var i = 0; i < this.segments.length; i += 2) {
      var dSq = position.distanceToSquared(this.segments[i].point);
      if (dSq < minDistSq) {
        minDistSq = dSq;
        closestIndex = i;
      }
    }

    var seg = this.segments[closestIndex];
    return {
      t: seg.t,
      distance: seg.t * this.trackLength,
      segment: seg
    };
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
