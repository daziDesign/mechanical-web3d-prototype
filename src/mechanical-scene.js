import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { parts, assemblySteps, operationPayloads } from './prototype-data.js';

const partColors = {
  base: 0x8590c6,
  turntable: 0xa9b3ec,
  shoulder: 0x6f7ec8,
  upperArm: 0xbfc8f8,
  elbow: 0x8d99df,
  forearm: 0xb1bcf0,
  wrist: 0xdde4ff,
  tool: 0xe8edf8,
};

const materialProfiles = {
  base: { color: 0x8590c6, metalness: 0.84, roughness: 0.19, envMapIntensity: 1.85 },
  turntable: { color: 0xa9b3ec, metalness: 0.86, roughness: 0.16, envMapIntensity: 1.95 },
  shoulder: { color: 0x6f7ec8, metalness: 0.86, roughness: 0.18, envMapIntensity: 1.8 },
  upperArm: { color: 0xbfc8f8, metalness: 0.88, roughness: 0.14, envMapIntensity: 2.05 },
  elbow: { color: 0x8d99df, metalness: 0.86, roughness: 0.16, envMapIntensity: 1.9 },
  forearm: { color: 0xb1bcf0, metalness: 0.88, roughness: 0.14, envMapIntensity: 2 },
  wrist: { color: 0xdde4ff, metalness: 0.9, roughness: 0.12, envMapIntensity: 2.15 },
  tool: { color: 0xe8edf8, metalness: 0.9, roughness: 0.12, envMapIntensity: 2.2 },
};

const modelUrl = new URL('../模型文件/机械手臂3dm.3dm', import.meta.url).href;
const objModelUrl = new URL('../模型文件/Industriska_robotska_ruka_sklop.obj', import.meta.url).href;
const glbModelUrl = new URL('../模型文件/Industriska_robotska_ruka_sklop.glb', import.meta.url).href;

const explodedOffsets = {
  base: new THREE.Vector3(-1.1, -0.25, 0.25),
  turntable: new THREE.Vector3(-0.55, 0.5, 0),
  shoulder: new THREE.Vector3(-0.15, 0.85, 0.2),
  upperArm: new THREE.Vector3(0.45, 1.1, -0.2),
  elbow: new THREE.Vector3(1.05, 0.7, 0.15),
  forearm: new THREE.Vector3(1.45, 0.35, -0.35),
  wrist: new THREE.Vector3(1.8, 0.05, 0.2),
  tool: new THREE.Vector3(2.1, -0.2, -0.05),
};

const fallbackAssemblyLibrarySlots = {
  base: new THREE.Vector3(2.25, 0.12, -1.05),
  turntable: new THREE.Vector3(2.25, 0.54, -1.05),
  shoulder: new THREE.Vector3(2.25, 0.96, -1.05),
  upperArm: new THREE.Vector3(2.25, 1.38, -1.05),
  elbow: new THREE.Vector3(3.05, 0.12, -0.35),
  forearm: new THREE.Vector3(3.05, 0.54, -0.35),
  wrist: new THREE.Vector3(3.05, 0.96, -0.35),
  tool: new THREE.Vector3(3.05, 1.38, -0.35),
};

const snapScreenRadius = 100;

export class MechanicalScene {
  constructor(mount, { onPartSelected, onPartFocused, onPartDropped, onPayloadSelected }) {
    this.mount = mount;
    this.onPartSelected = onPartSelected;
    this.onPartFocused = onPartFocused;
    this.onPartDropped = onPartDropped;
    this.onPayloadSelected = onPayloadSelected;
    this.partGroups = new Map();
    this.payloadGroups = new Map();
    this.payloadTargets = new Map();
    this.targetPositions = new Map();
    this.targetScales = new Map();
    this.modelMode = 'procedural';
    this.modelRoot = null;
    this.loadingLabel = null;
    this.assemblyLibrarySlots = new Map();
    this.operationRoot = null;
    this.operationRigRoot = null;
    this.robotRigRoot = null;
    this.operationWorkcellRoot = null;
    this.operationSkeletonRoot = null;
    this.operationSkeletonLinks = {};
    this.operationSkeletonJoints = {};
    this.operationSkeletonClaws = {};
    this.operationFrame = null;
    this.robotBasePivot = null;
    this.robotTurntablePivot = null;
    this.robotShoulderPivot = null;
    this.robotElbowPivot = null;
    this.robotWristPivot = null;
    this.robotToolPivot = null;
    this.robotLeftClaw = null;
    this.robotRightClaw = null;
    this.robotGripperAnchor = null;
    this.turntablePivot = null;
    this.armPivot = null;
    this.forearmPivot = null;
    this.wristPivot = null;
    this.toolPivot = null;
    this.conveyorGroup = null;
    this.conveyorStripes = [];
    this.conveyorRollers = [];
    this.conveyorOffset = 0;
    this.lastAnimateAt = performance.now();
    this.operationPath = null;
    this.operationPathPhase = null;
    this.gripperGuide = null;
    this.operationToolProxy = null;
    this.gripperAnchor = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.selectedPart = null;
    this.focusedPart = null;
    this.lastFocusCheckAt = 0;
    this.partFocusBox = new THREE.Box3();
    this.partFocusCenter = new THREE.Vector3();
    this.screenProjector = new THREE.Vector3();
    this.dragState = null;
    this.dragPlane = new THREE.Plane();
    this.dragPlaneNormal = new THREE.Vector3();
    this.dragPoint = new THREE.Vector3();
    this.snapTargetWorld = new THREE.Vector3();
    this.snapReleaseWorld = new THREE.Vector3();
    this.snapTargetScreen = new THREE.Vector2();
    this.snapReleaseScreen = new THREE.Vector2();
    this.targetMarker = null;
    this.state = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x171c34);
    this.scene.fog = new THREE.Fog(0x171c34, 8, 20);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(5.4, 3.8, 7.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(mount.clientWidth, mount.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    mount.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.target.set(0.15, 1.35, 0);

    this.root = new THREE.Group();
    this.root.rotation.y = -0.46;
    this.scene.add(this.root);

    this.addEnvironment();
    this.buildModel();
    this.buildOperationStage();
    this.loadPrimaryModel();
    this.bindEvents();
    this.resize();
    this.animate();
  }

  addEnvironment() {
    const ambient = new THREE.AmbientLight(0xaebcff, 1.18);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xe3e9ff, 0x253058, 1.08);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xf4f7ff, 3.8);
    key.position.set(4.6, 6.6, 5.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x8fa8ff, 1.8);
    fill.position.set(-3.4, 3.2, 4.8);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0x8ea6ff, 3.1);
    rim.position.set(-4.2, 3.4, -3.4);
    this.scene.add(rim);

    const topGlow = new THREE.PointLight(0xdde5ff, 5.4, 9);
    topGlow.position.set(0.2, 3.4, 1.6);
    this.scene.add(topGlow);

    const blue = new THREE.PointLight(0x5f7cff, 9.2, 13);
    blue.position.set(-3.4, 2.4, 2.8);
    this.scene.add(blue);

    const cyan = new THREE.PointLight(0x9deeff, 4.6, 10);
    cyan.position.set(3.2, 1.6, 2.1);
    this.scene.add(cyan);

    const red = new THREE.PointLight(0xff315d, 3.8, 8);
    red.position.set(2.4, 1.2, -1.7);
    this.scene.add(red);

    const grid = new THREE.GridHelper(10, 36, 0xa9b5ef, 0x4a557e);
    grid.position.y = -0.32;
    grid.material.transparent = true;
    grid.material.opacity = 0.34;
    this.scene.add(grid);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.ShadowMaterial({ color: 0x253058, opacity: 0.22 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.34;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  buildModel() {
    this.clearPartGroups();
    this.modelMode = 'procedural';
    this.createBase();
    this.createTurntable();
    this.createShoulder();
    this.createUpperArm();
    this.createElbow();
    this.createForearm();
    this.createWrist();
    this.createTool();
    this.captureHomeTargets();
  }

  buildOperationStage() {
    this.operationRoot = new THREE.Group();
    this.operationRoot.name = 'operation-workcell';
    this.operationRoot.visible = false;
    this.scene.add(this.operationRoot);

    this.operationRigRoot = new THREE.Group();
    this.operationRigRoot.name = 'operation-rig-root';
    this.turntablePivot = new THREE.Group();
    this.armPivot = new THREE.Group();
    this.forearmPivot = new THREE.Group();
    this.wristPivot = new THREE.Group();
    this.toolPivot = new THREE.Group();
    this.operationRigRoot.add(this.turntablePivot);
    this.turntablePivot.add(this.armPivot);
    this.armPivot.add(this.forearmPivot);
    this.forearmPivot.add(this.wristPivot);
    this.wristPivot.add(this.toolPivot);
    this.operationRoot.add(this.operationRigRoot);
    this.buildOperationRobotRig();
    this.buildOperationSkeletonRobot();

    this.conveyorGroup = new THREE.Group();
    this.conveyorGroup.position.set(-1.15, -0.18, 0.75);
    this.operationRoot.add(this.conveyorGroup);

    const metal = new THREE.MeshStandardMaterial({
      color: 0xb7bec9,
      metalness: 0.7,
      roughness: 0.22,
    });
    const belt = new THREE.MeshStandardMaterial({
      color: 0x3d4148,
      metalness: 0.22,
      roughness: 0.58,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x252932,
      metalness: 0.62,
      roughness: 0.3,
    });

    const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(4.75, 0.12, 0.86), belt);
    beltMesh.position.set(1.3, 0.15, 0);
    beltMesh.receiveShadow = true;
    this.conveyorGroup.add(beltMesh);

    [-0.52, 0.52].forEach((z) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4.95, 0.18, 0.08), metal);
      rail.position.set(1.3, 0.24, z);
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.conveyorGroup.add(rail);
    });

    for (let i = 0; i < 13; i += 1) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.78), darkMetal);
      stripe.position.set(-1.02 + i * 0.38, 0.225, 0);
      stripe.userData.baseX = stripe.position.x;
      stripe.receiveShadow = true;
      this.conveyorStripes.push(stripe);
      this.conveyorGroup.add(stripe);
    }

    [-0.84, 3.44].forEach((x) => {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.92, 32), darkMetal);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(x, 0.2, 0);
      roller.castShadow = true;
      this.conveyorRollers.push(roller);
      this.conveyorGroup.add(roller);
    });

    [-0.9, 0, 0.9, 1.8, 2.7, 3.5].forEach((x) => {
      [-0.46, 0.46].forEach((z) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.82, 0.06), metal);
        leg.position.set(x, -0.3, z);
        leg.castShadow = true;
        this.conveyorGroup.add(leg);
      });
    });

    const worktable = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.12, 1.2), metal);
    worktable.position.set(0.98, 0.06, -0.95);
    worktable.castShadow = true;
    worktable.receiveShadow = true;
    this.operationRoot.add(worktable);

    const bin = new THREE.Group();
    bin.name = 'operation-collection-bin';
    bin.position.set(2.52, 0.13, 0.75);
    const binBase = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 1.02), darkMetal);
    binBase.position.y = -0.04;
    bin.add(binBase);
    [
      [0, 0.28, -0.5, 0.78, 0.44, 0.08],
      [0, 0.28, 0.5, 0.78, 0.44, 0.08],
      [0.38, 0.28, 0, 0.08, 0.44, 1.02],
    ].forEach(([x, y, z, width, height, depth]) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), metal);
      wall.position.set(x, y, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      bin.add(wall);
    });
    this.operationRoot.add(bin);

    const payloadMaterial = new THREE.MeshStandardMaterial({
      color: 0xc5793c,
      metalness: 0.12,
      roughness: 0.42,
      emissive: 0x2d1505,
      emissiveIntensity: 0.05,
    });
    const payloadEdges = new THREE.LineBasicMaterial({
      color: 0xffc18a,
      transparent: true,
      opacity: 0.36,
    });

    operationPayloads.forEach((payload, index) => {
      const group = new THREE.Group();
      group.name = payload.id;
      group.userData.payloadId = payload.id;
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), payloadMaterial.clone());
      cube.castShadow = true;
      cube.receiveShadow = true;
      cube.userData.payloadId = payload.id;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry), payloadEdges.clone());
      edges.userData.payloadId = payload.id;
      edges.userData.nonPickable = true;
      cube.add(edges);
      group.add(cube);
      group.position.copy(this.getPayloadHomePosition(payload.id, index));
      this.payloadGroups.set(payload.id, group);
      this.payloadTargets.set(payload.id, group.position.clone());
      this.operationRoot.add(group);
    });

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.72, 1.1, -0.95),
      new THREE.Vector3(0.25, 1.45, -0.9),
      new THREE.Vector3(0.05, 1.25, -0.15),
      new THREE.Vector3(0.75, 0.78, 0.75),
    ]);
    this.operationPath = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(42)),
      new THREE.LineDashedMaterial({
        color: 0x7de8ff,
        dashSize: 0.18,
        gapSize: 0.12,
        transparent: true,
        opacity: 0.72,
      })
    );
    this.operationPath.computeLineDistances();
    this.operationPath.visible = false;
    this.operationRoot.add(this.operationPath);

    this.gripperGuide = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.26, 36),
      new THREE.MeshBasicMaterial({
        color: 0xff8b3d,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthTest: false,
      })
    );
    this.gripperGuide.rotation.x = -Math.PI / 2;
    this.gripperGuide.visible = false;
    this.gripperGuide.renderOrder = 40;
    this.operationRoot.add(this.gripperGuide);

    this.operationToolProxy = new THREE.Group();
    this.operationToolProxy.name = 'operation-tool-proxy';
    const proxyMetal = new THREE.MeshStandardMaterial({
      color: 0xe8edf8,
      metalness: 0.82,
      roughness: 0.18,
      emissive: 0x10162f,
      emissiveIntensity: 0.18,
    });
    const proxyHead = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.32, 24), proxyMetal);
    proxyHead.rotation.z = Math.PI / 2;
    proxyHead.castShadow = true;
    this.operationToolProxy.add(proxyHead);
    [-1, 1].forEach((side) => {
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.045), proxyMetal);
      claw.position.set(0.18, -0.1, side * 0.11);
      claw.rotation.z = side * 0.18;
      claw.castShadow = true;
      this.operationToolProxy.add(claw);
    });
    this.operationToolProxy.visible = false;
    this.operationRoot.add(this.operationToolProxy);
  }

  operationRobotMaterial(partId, overrides = {}) {
    const profile = materialProfiles[partId] ?? materialProfiles.tool;
    return new THREE.MeshStandardMaterial({
      color: overrides.color ?? profile.color,
      metalness: overrides.metalness ?? profile.metalness,
      roughness: overrides.roughness ?? profile.roughness,
      emissive: overrides.emissive ?? 0x10162f,
      emissiveIntensity: overrides.emissiveIntensity ?? 0.16,
    });
  }

  operationRobotMesh(geometry, partId, position = new THREE.Vector3(), rotation = new THREE.Euler()) {
    const mesh = new THREE.Mesh(geometry, this.operationRobotMaterial(partId));
    mesh.position.copy(position);
    mesh.rotation.copy(rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.nonPickable = true;
    return mesh;
  }

  buildOperationRobotRig() {
    this.robotRigRoot = new THREE.Group();
    this.robotRigRoot.name = 'operationRobotRig';
    this.robotRigRoot.position.set(-0.1, -0.18, 0.02);
    this.operationRoot.add(this.robotRigRoot);

    this.robotBasePivot = new THREE.Group();
    this.robotTurntablePivot = new THREE.Group();
    this.robotShoulderPivot = new THREE.Group();
    this.robotElbowPivot = new THREE.Group();
    this.robotWristPivot = new THREE.Group();
    this.robotToolPivot = new THREE.Group();
    this.robotGripperAnchor = new THREE.Group();

    this.robotRigRoot.add(this.robotBasePivot);
    this.robotBasePivot.add(this.robotTurntablePivot);
    this.robotTurntablePivot.position.set(0, 0.42, 0);
    this.robotTurntablePivot.add(this.robotShoulderPivot);
    this.robotShoulderPivot.position.set(0, 0.54, 0);
    this.robotShoulderPivot.add(this.robotElbowPivot);
    this.robotElbowPivot.position.set(0, 1.15, 0);
    this.robotElbowPivot.add(this.robotWristPivot);
    this.robotWristPivot.position.set(0, 1.16, 0);
    this.robotWristPivot.add(this.robotToolPivot);
    this.robotToolPivot.position.set(0, 0.42, 0);
    this.robotToolPivot.add(this.robotGripperAnchor);
    this.robotGripperAnchor.position.set(0.46, -0.04, 0);

    const basePlate = this.operationRobotMesh(new THREE.CylinderGeometry(0.78, 0.88, 0.22, 64), 'base', new THREE.Vector3(0, 0.11, 0));
    const baseBlock = this.operationRobotMesh(new THREE.CylinderGeometry(0.52, 0.66, 0.26, 64), 'turntable', new THREE.Vector3(0, 0.34, 0));
    this.robotBasePivot.add(basePlate, baseBlock);

    const turntableShell = this.operationRobotMesh(new THREE.CylinderGeometry(0.45, 0.52, 0.24, 64), 'turntable');
    const shoulderColumn = this.operationRobotMesh(new THREE.BoxGeometry(0.36, 0.58, 0.48), 'shoulder', new THREE.Vector3(0, 0.27, 0));
    this.robotTurntablePivot.add(turntableShell, shoulderColumn);

    const shoulderAxis = this.operationRobotMesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.78, 36),
      'shoulder',
      new THREE.Vector3(0, 0, 0),
      new THREE.Euler(Math.PI / 2, 0, 0)
    );
    const upperArm = this.operationRobotMesh(new THREE.BoxGeometry(0.34, 1.18, 0.34), 'upperArm', new THREE.Vector3(0.09, 0.58, 0));
    const upperArmCover = this.operationRobotMesh(new THREE.BoxGeometry(0.18, 0.94, 0.44), 'upperArm', new THREE.Vector3(0.26, 0.58, 0));
    this.robotShoulderPivot.add(shoulderAxis, upperArm, upperArmCover);

    const elbowAxis = this.operationRobotMesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.72, 36),
      'elbow',
      new THREE.Vector3(0, 0, 0),
      new THREE.Euler(Math.PI / 2, 0, 0)
    );
    const forearm = this.operationRobotMesh(new THREE.BoxGeometry(0.3, 1.18, 0.3), 'forearm', new THREE.Vector3(0, 0.58, 0));
    const forearmCover = this.operationRobotMesh(new THREE.BoxGeometry(0.42, 0.92, 0.18), 'forearm', new THREE.Vector3(0, 0.58, 0.17));
    this.robotElbowPivot.add(elbowAxis, forearm, forearmCover);

    const wristAxis = this.operationRobotMesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.58, 32),
      'wrist',
      new THREE.Vector3(0, 0, 0),
      new THREE.Euler(Math.PI / 2, 0, 0)
    );
    const wristBall = this.operationRobotMesh(new THREE.SphereGeometry(0.24, 32, 18), 'wrist', new THREE.Vector3(0, 0.22, 0));
    this.robotWristPivot.add(wristAxis, wristBall);

    const toolBody = this.operationRobotMesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.58, 24),
      'tool',
      new THREE.Vector3(0, 0.22, 0)
    );
    const toolHead = this.operationRobotMesh(new THREE.BoxGeometry(0.2, 0.18, 0.22), 'tool', new THREE.Vector3(0, 0.48, 0));
    this.robotToolPivot.add(toolBody, toolHead);

    this.robotLeftClaw = this.operationRobotMesh(new THREE.BoxGeometry(0.06, 0.34, 0.055), 'tool', new THREE.Vector3(0, 0.6, -0.12));
    this.robotRightClaw = this.operationRobotMesh(new THREE.BoxGeometry(0.06, 0.34, 0.055), 'tool', new THREE.Vector3(0, 0.6, 0.12));
    this.robotLeftClaw.rotation.z = -0.16;
    this.robotRightClaw.rotation.z = -0.16;
    this.robotToolPivot.add(this.robotLeftClaw, this.robotRightClaw);
  }

  buildOperationSkeletonRobot() {
    this.operationWorkcellRoot = new THREE.Group();
    this.operationWorkcellRoot.name = 'operation-workcell-skeleton';
    this.operationRoot.add(this.operationWorkcellRoot);

    this.operationSkeletonRoot = new THREE.Group();
    this.operationSkeletonRoot.name = 'operation-skeleton-robot';
    this.operationWorkcellRoot.add(this.operationSkeletonRoot);

    const jointMaterial = this.operationRobotMaterial('turntable', { emissiveIntensity: 0.24 });
    const shellMaterial = this.operationRobotMaterial('base', { color: 0x92a0da, emissiveIntensity: 0.18 });
    const linkMaterial = this.operationRobotMaterial('forearm', { color: 0x7f8fd7, emissiveIntensity: 0.16 });
    const toolMaterial = this.operationRobotMaterial('tool', { color: 0xe5ebff, emissiveIntensity: 0.2 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.96, 0.22, 64), shellMaterial);
    base.position.set(0, -0.2, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    this.operationSkeletonJoints.base = base;
    this.operationSkeletonRoot.add(base);

    const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.66, 0.24, 64), jointMaterial);
    turntable.position.set(0, 0, 0);
    turntable.castShadow = true;
    turntable.receiveShadow = true;
    this.operationSkeletonJoints.turntable = turntable;
    this.operationSkeletonRoot.add(turntable);

    ['column', 'upperArm', 'forearm', 'tool'].forEach((key) => {
      const radius = key === 'tool' ? 0.07 : key === 'column' ? 0.18 : 0.16;
      const material = key === 'tool' ? toolMaterial : linkMaterial;
      const link = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 28), material);
      link.castShadow = true;
      link.receiveShadow = true;
      this.operationSkeletonLinks[key] = link;
      this.operationSkeletonRoot.add(link);
    });

    ['shoulder', 'elbow', 'wrist'].forEach((key) => {
      const joint = new THREE.Mesh(new THREE.SphereGeometry(key === 'shoulder' ? 0.3 : 0.24, 32, 18), jointMaterial);
      joint.castShadow = true;
      joint.receiveShadow = true;
      this.operationSkeletonJoints[key] = joint;
      this.operationSkeletonRoot.add(joint);
    });

    const gripper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.24), toolMaterial);
    gripper.castShadow = true;
    gripper.receiveShadow = true;
    this.operationSkeletonJoints.gripper = gripper;
    this.operationSkeletonRoot.add(gripper);

    ['left', 'right'].forEach((key) => {
      const claw = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 14), toolMaterial);
      claw.castShadow = true;
      claw.receiveShadow = true;
      this.operationSkeletonClaws[key] = claw;
      this.operationSkeletonRoot.add(claw);
    });
  }

  getPayloadHomePosition(payloadId, index = 0) {
    const homes = {
      payloadA: new THREE.Vector3(0.72, 0.28, -0.95),
      payloadB: new THREE.Vector3(0.99, 0.28, -0.95),
      payloadC: new THREE.Vector3(1.26, 0.28, -0.95),
      payloadD: new THREE.Vector3(1.76, 0.18, 0.75),
    };
    return homes[payloadId]?.clone() ?? new THREE.Vector3(0.72 + index * 0.34, 0.28, -0.95);
  }

  async loadRhinoModel() {
    const loader = new Rhino3dmLoader();
    loader.setLibraryPath('/vendor/rhino3dm/');
    loader.setWorkerLimit(2);

    try {
      const object = await loader.loadAsync(modelUrl);
      this.useLoadedModel(object, { minimumRenderableCount: 4, source: '3DM' });
    } catch (error) {
      console.warn('3DM model loading failed, using procedural fallback.', error);
    }
  }

  async loadPrimaryModel() {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(glbModelUrl);
      this.useLoadedModel(gltf.scene, { minimumRenderableCount: 4, source: 'GLB' });
    } catch (error) {
      console.warn('GLB model loading failed, trying OBJ model.', error);
      this.loadObjModel();
    }
  }

  async loadObjModel() {
    const loader = new OBJLoader();

    try {
      const object = await loader.loadAsync(objModelUrl);
      this.useLoadedModel(object, { minimumRenderableCount: 1, source: 'OBJ' });
    } catch (error) {
      console.warn('OBJ model loading failed, trying 3DM model.', error);
      this.loadRhinoModel();
    }
  }

  useLoadedModel(object, { minimumRenderableCount = 4, source = 'model' } = {}) {
    this.clearPartGroups();
    this.modelMode = source.toLowerCase();
    this.modelRoot = new THREE.Group();
    this.modelRoot.name = `机械手臂-${source}`;

    parts.forEach((part) => {
      const group = this.makePartGroup(part.id, new THREE.Vector3(0, 0, 0), this.modelRoot);
      group.name = part.id;
    });

    let renderableCount = 0;
    object.updateMatrixWorld(true);
    object.traverse((child) => {
      if (!child.isMesh && !child.isLine && !child.isPoints) return;
      renderableCount += 1;
      const partId = this.inferPartId(this.objectNameTrail(child));
      const group = this.partGroups.get(partId);
      const clone = child.clone(false);
      clone.geometry = child.geometry;
      clone.matrix.copy(child.matrixWorld);
      clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
      this.decorateLoadedObject(clone, partId);
      group.add(clone);
    });

    if (renderableCount < minimumRenderableCount) {
      console.warn(`${source} model only exposed ${renderableCount} renderable object(s). Using procedural assembly fallback.`);
      this.clearPartGroups();
      this.buildModel();
      this.setState(this.state ?? { viewMode: 'normal', selectedPart: null, assemblyStep: 0 });
      return;
    }

    this.normalizeLoadedModel(this.modelRoot, source);
    this.root.add(this.modelRoot);
    this.captureHomeTargets();
    this.setState(this.state ?? { viewMode: 'normal', selectedPart: null, assemblyStep: 0 });
  }

  clearPartGroups() {
    this.partGroups.forEach((group) => {
      if (group.parent) group.parent.remove(group);
    });
    this.partGroups.clear();
    this.targetPositions.clear();
    this.targetScales.clear();
    if (this.modelRoot?.parent) this.modelRoot.parent.remove(this.modelRoot);
    this.modelRoot = null;
    if (this.targetMarker?.parent) this.targetMarker.parent.remove(this.targetMarker);
    this.targetMarker = null;
  }

  inferPartId(name = '') {
    const normalized = name.toLowerCase();
    if (normalized.includes('part1')) return 'base';
    if (normalized.includes('part2')) return 'turntable';
    if (normalized.includes('part3')) return 'shoulder';
    if (normalized.includes('part4')) return 'upperArm';
    if (normalized.includes('part5')) return 'elbow';
    if (normalized.includes('part6')) return 'forearm';
    if (normalized.includes('part7')) return 'wrist';
    if (normalized.includes('kljun') || normalized.includes('klin')) return 'tool';
    return 'tool';
  }

  objectNameTrail(object) {
    const names = [];
    let current = object;
    while (current) {
      if (current.name) names.push(current.name);
      current = current.parent;
    }
    return names.join(' ');
  }

  decorateLoadedObject(object, partId) {
    const profile = materialProfiles[partId] ?? materialProfiles.tool;
    object.traverse((child) => {
      child.userData.partId = partId;
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = new THREE.MeshPhysicalMaterial({
        color: profile.color,
        metalness: profile.metalness,
        roughness: profile.roughness,
        clearcoat: 0.5,
        clearcoatRoughness: 0.16,
        sheen: 0.08,
        sheenColor: new THREE.Color(0xaebcff),
        envMapIntensity: profile.envMapIntensity,
        emissive: 0x14204a,
        emissiveIntensity: 0.08,
      });

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(child.geometry, 32),
        new THREE.LineBasicMaterial({
          color: 0xf2f5ff,
          transparent: true,
          opacity: partId === 'tool' ? 0.34 : 0.22,
        })
      );
      edges.userData.partId = partId;
      edges.userData.nonPickable = true;
      child.add(edges);
    });
  }

  normalizeLoadedModel(modelRoot, source = 'model') {
    const box = new THREE.Box3().setFromObject(modelRoot);
    const size = box.getSize(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z) || 1;
    const scale = (source === 'OBJ' ? 3.55 : source === 'GLB' ? 2.9 : 3.25) / maxSize;

    modelRoot.position.set(0, 0, 0);
    modelRoot.scale.setScalar(scale);
    modelRoot.rotation.x = source === 'GLB' ? 0 : -Math.PI / 2;
    modelRoot.rotation.y = source === 'GLB' ? Math.PI * 0.08 : 0;
    modelRoot.rotation.z = source === 'OBJ' ? Math.PI * 1.08 : source === 'GLB' ? 0 : Math.PI;
    modelRoot.updateMatrixWorld(true);

    const fittedBox = new THREE.Box3().setFromObject(modelRoot);
    const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
    const anchorBox = source === 'GLB'
      ? this.getPartAnchorBox('base', modelRoot) ?? fittedBox
      : fittedBox;
    const anchorCenter = anchorBox.getCenter(new THREE.Vector3());
    modelRoot.position.set(
      -anchorCenter.x,
      -anchorBox.min.y - 0.32,
      -anchorCenter.z
    );
  }

  getPartAnchorBox(partId, modelRoot) {
    const group = this.partGroups.get(partId);
    if (!group) return null;

    modelRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return null;
    return box;
  }

  createBase() {
    const group = this.makePartGroup('base', new THREE.Vector3(0, 0, 0));
    group.add(this.mesh(new THREE.BoxGeometry(1.85, 0.22, 1.45), 'base', new THREE.Vector3(0, 0, 0)));
    group.add(this.mesh(new THREE.BoxGeometry(1.25, 0.16, 0.98), 'base', new THREE.Vector3(0, 0.18, 0)));
  }

  createTurntable() {
    const group = this.makePartGroup('turntable', new THREE.Vector3(0, 0.44, 0));
    group.add(this.mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.34, 48), 'turntable'));
    group.add(this.mesh(new THREE.TorusGeometry(0.55, 0.035, 10, 48), 'turntable', new THREE.Vector3(0, 0.2, 0)));
  }

  createShoulder() {
    const group = this.makePartGroup('shoulder', new THREE.Vector3(-0.05, 0.95, 0));
    group.rotation.z = -0.18;
    const axis = this.mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.72, 32), 'shoulder');
    axis.rotation.x = Math.PI / 2;
    group.add(axis);
    group.add(this.mesh(new THREE.BoxGeometry(0.42, 0.82, 0.48), 'shoulder', new THREE.Vector3(0, 0.28, 0)));
  }

  createUpperArm() {
    const group = this.makePartGroup('upperArm', new THREE.Vector3(0.42, 1.62, 0));
    group.rotation.z = -0.42;
    group.add(this.mesh(new THREE.BoxGeometry(0.42, 1.45, 0.42), 'upperArm'));
    group.add(this.mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.5, 28), 'upperArm', new THREE.Vector3(0, 0.72, 0)));
  }

  createElbow() {
    const group = this.makePartGroup('elbow', new THREE.Vector3(0.95, 2.35, 0));
    const joint = this.mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.68, 32), 'elbow');
    joint.rotation.x = Math.PI / 2;
    group.add(joint);
    group.add(this.mesh(new THREE.TorusGeometry(0.32, 0.035, 10, 42), 'elbow'));
  }

  createForearm() {
    const group = this.makePartGroup('forearm', new THREE.Vector3(1.45, 1.78, 0));
    group.rotation.z = 0.58;
    group.add(this.mesh(new THREE.BoxGeometry(0.34, 1.22, 0.34), 'forearm'));
    group.add(this.mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.42, 28), 'forearm', new THREE.Vector3(0, -0.63, 0)));
  }

  createWrist() {
    const group = this.makePartGroup('wrist', new THREE.Vector3(1.88, 1.15, 0));
    const joint = this.mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.52, 28), 'wrist');
    joint.rotation.z = Math.PI / 2;
    group.add(joint);
    group.add(this.mesh(new THREE.SphereGeometry(0.22, 28, 18), 'wrist', new THREE.Vector3(0.32, 0, 0)));
  }

  createTool() {
    const group = this.makePartGroup('tool', new THREE.Vector3(2.25, 0.88, 0));
    group.rotation.z = 0.78;
    group.add(this.mesh(new THREE.CylinderGeometry(0.075, 0.14, 0.86, 20), 'tool'));
    group.add(this.mesh(new THREE.ConeGeometry(0.13, 0.32, 20), 'tool', new THREE.Vector3(0, -0.55, 0)));
  }

  makePartGroup(partId, position, parent = this.root) {
    const group = new THREE.Group();
    group.userData.partId = partId;
    group.position.copy(position);
    group.userData.home = position.clone();
    this.partGroups.set(partId, group);
    this.targetPositions.set(partId, position.clone());
    parent.add(group);
    return group;
  }

  captureHomeTargets() {
    this.root.updateMatrixWorld(true);
    this.partGroups.forEach((group) => {
      const parent = group.parent ?? this.root;
      parent.updateMatrixWorld(true);
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      if (box.isEmpty()) {
        group.userData.homeVisualCenter = group.userData.home.clone();
        return;
      }

      const centerWorld = box.getCenter(new THREE.Vector3());
      group.userData.homeVisualCenter = parent.worldToLocal(centerWorld.clone());
    });
  }

  ensureTargetMarker() {
    if (this.targetMarker) return this.targetMarker;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.43, 64),
      new THREE.MeshBasicMaterial({
        color: 0x6f8dff,
        transparent: true,
        opacity: 0.72,
        depthTest: false,
        side: THREE.DoubleSide,
      })
    );
    ring.renderOrder = 30;

    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 64),
      new THREE.MeshBasicMaterial({
        color: 0x6f8dff,
        transparent: true,
        opacity: 0.12,
        depthTest: false,
        side: THREE.DoubleSide,
      })
    );
    fill.renderOrder = 29;

    this.targetMarker = new THREE.Group();
    this.targetMarker.add(fill, ring);
    this.targetMarker.visible = false;
    this.scene.add(this.targetMarker);
    return this.targetMarker;
  }

  mesh(geometry, partId, position = new THREE.Vector3()) {
    const material = new THREE.MeshStandardMaterial({
      color: partColors[partId],
      metalness: materialProfiles[partId]?.metalness ?? 0.82,
      roughness: materialProfiles[partId]?.roughness ?? 0.18,
      emissive: 0x10162f,
      emissiveIntensity: 0.2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(position);
    mesh.userData.partId = partId;
    return mesh;
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
    this.renderer.domElement.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    this.renderer.domElement.addEventListener('pointerup', (event) => this.handlePointerUp(event));
    this.renderer.domElement.addEventListener('pointercancel', (event) => this.handlePointerUp(event));
    window.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    window.addEventListener('pointerup', (event) => this.handlePointerUp(event));
  }

  updatePointerFromEvent(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  pickPart(event) {
    this.updatePointerFromEvent(event);
    const pickableMeshes = [];
    this.partGroups.forEach((group) => {
      group.traverse((child) => {
        if (child.isMesh && !child.userData.nonPickable && child.visible) pickableMeshes.push(child);
      });
    });
    const hits = this.raycaster.intersectObjects(pickableMeshes, false);
    return hits[0] ?? null;
  }

  pickPayload(event) {
    this.updatePointerFromEvent(event);
    const pickableMeshes = [];
    this.payloadGroups.forEach((group) => {
      group.traverse((child) => {
        if (child.isMesh && !child.userData.nonPickable && child.visible) pickableMeshes.push(child);
      });
    });
    const hits = this.raycaster.intersectObjects(pickableMeshes, false);
    return hits[0] ?? null;
  }

  handlePointerDown(event) {
    if (this.state?.viewMode === 'operation') {
      const payloadHit = this.pickPayload(event);
      const payloadId = payloadHit?.object?.userData?.payloadId;
      if (payloadId) {
        this.onPayloadSelected?.(payloadId, this.worldToCanvasPoint(payloadHit.point));
        return;
      }
    }

    const hit = this.pickPart(event);
    const partId = hit?.object?.userData?.partId;
    if (!partId) return;

    this.onPartSelected(partId, this.worldToCanvasPoint(hit.point));

    if (this.state?.viewMode !== 'assembly' || !this.state?.assemblyStarted) return;
    const status = this.state.partStatuses?.[partId] ?? 'inLibrary';
    if (status === 'installed') return;

    const group = this.partGroups.get(partId);
    if (!group) return;

    const planePoint = this.getDragPlanePoint(partId, hit.point);
    this.dragPlaneNormal.copy(this.camera.position).sub(planePoint).normalize();
    this.dragPlane.setFromNormalAndCoplanarPoint(this.dragPlaneNormal, planePoint);
    this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint);
    const localDragPoint = this.worldToPartParentLocal(partId, this.dragPoint);

    this.dragState = {
      partId,
      offset: group.position.clone().sub(localDragPoint),
    };
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture?.(event.pointerId);
    this.targetPositions.set(partId, group.position.clone());
    this.targetScales.set(partId, Math.max(group.scale.x, 0.62));
  }

  beginDragFromLibrary(partId, event) {
    if (this.state?.viewMode !== 'assembly' || !this.state?.assemblyStarted) return false;
    const status = this.state.partStatuses?.[partId] ?? 'inLibrary';
    if (status === 'installed') return false;

    const group = this.partGroups.get(partId);
    if (!group) return false;

    this.updatePointerFromEvent(event);
    const currentWorldPosition = new THREE.Vector3();
    group.getWorldPosition(currentWorldPosition);
    const planePoint = this.getDragPlanePoint(partId, currentWorldPosition);
    this.dragPlaneNormal.copy(this.camera.position).sub(planePoint).normalize();
    this.dragPlane.setFromNormalAndCoplanarPoint(this.dragPlaneNormal, planePoint);
    this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint);

    this.dragState = {
      partId,
      offset: (group.userData.home ?? new THREE.Vector3()).clone()
        .sub(group.userData.homeVisualCenter ?? group.userData.home ?? new THREE.Vector3()),
    };
    this.controls.enabled = false;
    this.targetPositions.set(partId, group.position.clone());
    this.targetScales.set(partId, Math.max(group.scale.x, 0.82));
    return true;
  }

  handlePointerMove(event) {
    if (!this.dragState) return;
    this.updatePointerFromEvent(event);
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint)) return;

    const group = this.partGroups.get(this.dragState.partId);
    if (!group) return;

    const localPoint = this.worldToPartParentLocal(this.dragState.partId, this.dragPoint).add(this.dragState.offset);
    group.position.copy(localPoint);
    this.targetPositions.set(this.dragState.partId, localPoint.clone());
    this.targetScales.set(this.dragState.partId, 0.72);
    this.updateMaterials();
    this.updateTargetMarker();
  }

  handlePointerUp(event) {
    if (!this.dragState) return;

    const { partId } = this.dragState;
    const group = this.partGroups.get(partId);
    const releasePosition = group?.position.clone() ?? new THREE.Vector3();
    const currentPartId = assemblySteps[this.state?.assemblyStep]?.partId ?? null;
    const home = group?.userData.home ?? new THREE.Vector3();
    const snapInfo = this.getSnapInfo(partId);
    const nearTarget = snapInfo.screenDistance <= snapScreenRadius || snapInfo.worldDistance <= this.getSnapDistance() * 2.2;
    const installed = partId === currentPartId && nearTarget;

    if (installed && group) {
      group.position.copy(home);
      this.targetPositions.set(partId, home.clone());
      this.targetScales.set(partId, 1);
    } else {
      this.targetPositions.set(partId, releasePosition.clone());
      this.targetScales.set(partId, 0.72);
    }

    this.controls.enabled = true;
    if (this.renderer.domElement.hasPointerCapture?.(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
    this.dragState = null;
    this.onPartDropped?.({
      partId,
      installed,
      nearTarget,
      expectedPartId: currentPartId,
      position: releasePosition.toArray(),
      screenDistance: snapInfo.screenDistance,
      snapRadius: snapScreenRadius,
    });
  }

  worldToPartParentLocal(partId, worldPoint) {
    const group = this.partGroups.get(partId);
    const parent = group?.parent ?? this.root;
    parent.updateMatrixWorld(true);
    return parent.worldToLocal(worldPoint.clone());
  }

  partParentLocalToWorld(partId, localPoint) {
    const group = this.partGroups.get(partId);
    const parent = group?.parent ?? this.root;
    parent.updateMatrixWorld(true);
    return parent.localToWorld(localPoint.clone());
  }

  getHomeTargetLocal(partId) {
    const group = this.partGroups.get(partId);
    return group?.userData.homeVisualCenter?.clone()
      ?? group?.userData.home?.clone()
      ?? null;
  }

  getHomeTargetWorld(partId) {
    const targetLocal = this.getHomeTargetLocal(partId);
    if (!targetLocal) return null;
    return this.partParentLocalToWorld(partId, targetLocal);
  }

  getDragPlanePoint(partId, fallbackWorldPoint) {
    const currentPartId = assemblySteps[this.state?.assemblyStep]?.partId ?? null;
    return partId === currentPartId
      ? this.getHomeTargetWorld(partId) ?? fallbackWorldPoint.clone()
      : fallbackWorldPoint.clone();
  }

  worldToScreenVector(worldPoint) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.screenProjector.copy(worldPoint).project(this.camera);
    return new THREE.Vector2(
      (this.screenProjector.x * 0.5 + 0.5) * rect.width,
      (-this.screenProjector.y * 0.5 + 0.5) * rect.height
    );
  }

  getCurrentVisualCenterWorld(partId) {
    const group = this.partGroups.get(partId);
    if (!group) return null;
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return this.partParentLocalToWorld(partId, group.position);
    return box.getCenter(new THREE.Vector3());
  }

  getSnapInfo(partId) {
    const releaseWorld = this.getCurrentVisualCenterWorld(partId)
      ?? this.partParentLocalToWorld(partId, this.partGroups.get(partId)?.position ?? new THREE.Vector3());
    const targetWorld = this.getHomeTargetWorld(partId) ?? releaseWorld.clone();
    const releaseScreen = this.worldToScreenVector(releaseWorld);
    const targetScreen = this.worldToScreenVector(targetWorld);
    return {
      releaseWorld,
      targetWorld,
      screenDistance: releaseScreen.distanceTo(targetScreen),
      worldDistance: releaseWorld.distanceTo(targetWorld),
    };
  }

  getSnapDistance() {
    if (this.modelMode === 'glb') return 0.62;
    if (this.modelMode === 'obj') return 0.78;
    return 0.55;
  }

  updateTargetMarker() {
    const marker = this.ensureTargetMarker();
    const currentPartId = assemblySteps[this.state?.assemblyStep]?.partId ?? null;
    const currentStatus = currentPartId ? this.state?.partStatuses?.[currentPartId] : null;
    const targetWorld = currentPartId ? this.getHomeTargetWorld(currentPartId) : null;

    if (
      this.state?.viewMode !== 'assembly' ||
      !this.state?.assemblyStarted ||
      !currentPartId ||
      currentStatus === 'installed' ||
      !targetWorld
    ) {
      marker.visible = false;
      return;
    }

    const snapInfo = this.dragState?.partId === currentPartId ? this.getSnapInfo(currentPartId) : null;
    const isNear = snapInfo ? snapInfo.screenDistance <= snapScreenRadius : false;
    const color = isNear ? 0x7de8ff : 0x6f8dff;
    marker.visible = true;
    marker.position.copy(targetWorld);
    marker.quaternion.copy(this.camera.quaternion);
    marker.scale.setScalar(this.modelMode === 'procedural' ? 1 : 0.72);
    marker.children.forEach((child) => {
      if (!child.material) return;
      child.material.color.setHex(color);
      child.material.opacity = child.geometry.type === 'CircleGeometry'
        ? isNear ? 0.22 : 0.12
        : isNear ? 0.95 : 0.72;
    });
  }

  pick(event) {
    const hit = this.pickPart(event);
    if (hit?.object?.userData?.partId) {
      this.onPartSelected(hit.object.userData.partId, this.worldToCanvasPoint(hit.point));
    }
  }

  getPartScreenPosition(partId) {
    const group = this.partGroups.get(partId);
    if (!group || !group.visible) return null;
    this.partFocusBox.setFromObject(group);
    if (this.partFocusBox.isEmpty()) return null;
    return this.worldToCanvasPoint(this.partFocusBox.getCenter(new THREE.Vector3()));
  }

  worldToCanvasPoint(worldPoint) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.screenProjector.copy(worldPoint).project(this.camera);
    return {
      x: (this.screenProjector.x * 0.5 + 0.5) * rect.width,
      y: (-this.screenProjector.y * 0.5 + 0.5) * rect.height,
    };
  }

  easeCinematic(value) {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  mixCinematicPoint(a, b, value) {
    return a.clone().lerp(b, this.easeCinematic(value));
  }

  alignObjectBetween(object, start, end, thicknessScale = 1) {
    const delta = end.clone().sub(start);
    const length = Math.max(delta.length(), 0.001);
    object.position.copy(start).addScaledVector(delta, 0.5);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    object.scale.set(thicknessScale, length, thicknessScale);
  }

  legacyGetOperationFrame(time = 0) {
    const t = THREE.MathUtils.clamp(time, 0, 11);
    const base = new THREE.Vector3(-0.65, -0.2, -0.85);
    const shoulder = new THREE.Vector3(-0.65, 0.72, -0.85);
    const home = new THREE.Vector3(-0.15, 1.02, -0.55);
    const abovePayload = new THREE.Vector3(0.72, 0.92, -0.95);
    const clampPayload = new THREE.Vector3(0.72, 0.56, -0.95);
    const liftPayload = new THREE.Vector3(0.72, 1.08, -0.95);
    const beltHigh = new THREE.Vector3(0.75, 0.84, 0.75);
    const beltRelease = new THREE.Vector3(0.75, 0.44, 0.75);
    const retract = new THREE.Vector3(-0.05, 1.0, -0.2);

    let gripper = home.clone();
    if (t < 1) gripper = home.clone();
    else if (t < 2.5) gripper = this.mixCinematicPoint(home, abovePayload, (t - 1) / 1.5);
    else if (t < 3.5) gripper = this.mixCinematicPoint(abovePayload, clampPayload, (t - 2.5) / 1);
    else if (t < 4.2) gripper = this.mixCinematicPoint(clampPayload, liftPayload, (t - 3.5) / 0.7);
    else if (t < 6) gripper = this.mixCinematicPoint(liftPayload, beltHigh, (t - 4.2) / 1.8);
    else if (t < 7) gripper = this.mixCinematicPoint(beltHigh, beltRelease, (t - 6) / 1);
    else if (t < 10) gripper = this.mixCinematicPoint(beltRelease, retract, (t - 7) / 3);
    else gripper = this.mixCinematicPoint(retract, home, (t - 10) / 1);

    const wristDirection = gripper.clone().sub(shoulder).normalize();
    const wrist = gripper.clone().addScaledVector(wristDirection, -0.42);
    const span = wrist.clone().sub(shoulder);
    const mid = shoulder.clone().addScaledVector(span, 0.5);
    const side = new THREE.Vector3().crossVectors(span, new THREE.Vector3(0, 1, 0)).normalize();
    if (side.lengthSq() < 0.01) side.set(0, 0, 1);
    const bend = new THREE.Vector3().crossVectors(side, span).normalize();
    if (bend.y < 0) bend.multiplyScalar(-1);
    const reach = span.length();
    const arc = Math.max(0.35, Math.min(0.9, 0.86 - reach * 0.12));
    const elbow = mid.addScaledVector(bend, arc);
    const clawClosed = t >= 3.2 && t < 6.35;
    const beltStart = new THREE.Vector3(0.75, 0.18, 0.75);
    const beltEnd = new THREE.Vector3(2.18, 0.18, 0.75);
    const collected = new THREE.Vector3(2.48, 0.3, 0.75);
    const payloadHome = new THREE.Vector3(0.72, 0.28, -0.95);
    let payload = payloadHome.clone();
    if (t >= 3.5 && t < 6.15) payload = gripper.clone().add(new THREE.Vector3(0, -0.28, 0));
    else if (t >= 6.15 && t < 7) payload = this.mixCinematicPoint(gripper.clone().add(new THREE.Vector3(0, -0.28, 0)), beltStart, (t - 6.15) / 0.85);
    else if (t >= 7 && t < 10) payload = this.mixCinematicPoint(beltStart, beltEnd, (t - 7) / 3);
    else if (t >= 10) payload = this.mixCinematicPoint(beltEnd, collected, (t - 10) / 1);

    return {
      base,
      shoulder,
      elbow,
      wrist,
      gripper,
      payload,
      clawSpread: clawClosed ? 0.055 : 0.16,
      conveyorActive: t >= 6.5 && t < 10,
    };
  }

  getOperationCycleFrame(time = 0) {
    const payloadIds = ['payloadA', 'payloadB', 'payloadC'];
    const cycleDuration = 9;
    const totalDuration = cycleDuration * payloadIds.length;
    const t = THREE.MathUtils.clamp(time, 0, totalDuration);
    const cycleIndex = Math.min(payloadIds.length - 1, Math.floor(t / cycleDuration));
    const localTime = t >= totalDuration ? cycleDuration : t - cycleIndex * cycleDuration;
    return {
      cycleDuration,
      cycleIndex,
      localTime,
      payloadId: payloadIds[cycleIndex],
      totalDuration,
    };
  }

  getPayloadCollectedPosition(payloadId) {
    const positions = {
      payloadA: new THREE.Vector3(2.34, 0.03, 0.58),
      payloadB: new THREE.Vector3(2.52, 0.05, 0.75),
      payloadC: new THREE.Vector3(2.70, 0.07, 0.92),
    };
    return positions[payloadId]?.clone() ?? new THREE.Vector3(2.52, 0.05, 0.75);
  }

  getPayloadBinMouthPosition(payloadId) {
    const collected = this.getPayloadCollectedPosition(payloadId);
    return new THREE.Vector3(collected.x, 0.22, collected.z);
  }

  getPayloadFramePosition(payloadId, frame, gripper) {
    const home = this.getPayloadHomePosition(payloadId, operationPayloads.findIndex((payload) => payload.id === payloadId));
    const index = ['payloadA', 'payloadB', 'payloadC'].indexOf(payloadId);
    if (index === -1) return home;
    if (index < frame.cycleIndex || frame.time >= frame.totalDuration) return this.getPayloadCollectedPosition(payloadId);
    if (index > frame.cycleIndex) return home;

    const localTime = frame.localTime;
    const beltStart = new THREE.Vector3(0.75, 0.18, 0.75);
    const binMouth = this.getPayloadBinMouthPosition(payloadId);
    const beltEnd = binMouth.clone();
    const collected = this.getPayloadCollectedPosition(payloadId);
    if (localTime >= 2.7 && localTime < 4.85) return gripper.clone().add(new THREE.Vector3(0, -0.28, 0));
    if (localTime >= 4.85 && localTime < 5.4) {
      return this.mixCinematicPoint(gripper.clone().add(new THREE.Vector3(0, -0.28, 0)), beltStart, (localTime - 4.85) / 0.55);
    }
    if (localTime >= 5.4 && localTime < 7.8) return this.mixCinematicPoint(beltStart, beltEnd, (localTime - 5.4) / 2.4);
    if (localTime >= 7.8 && localTime < 8.5) {
      const fall = this.easeCinematic((localTime - 7.8) / 0.7);
      const dropped = this.mixCinematicPoint(binMouth, collected, fall);
      dropped.y -= Math.sin(fall * Math.PI) * 0.06;
      return dropped;
    }
    if (localTime >= 8.5) return collected;
    return home;
  }

  getOperationFrame(time = 0) {
    const frame = this.getOperationCycleFrame(time);
    frame.time = THREE.MathUtils.clamp(time, 0, frame.totalDuration);
    const base = new THREE.Vector3(-0.65, -0.2, -0.85);
    const shoulder = new THREE.Vector3(-0.65, 0.72, -0.85);
    const home = new THREE.Vector3(-0.15, 1.02, -0.55);
    const payloadHome = this.getPayloadHomePosition(frame.payloadId, frame.cycleIndex);
    const abovePayload = new THREE.Vector3(payloadHome.x, 0.92, payloadHome.z);
    const clampPayload = new THREE.Vector3(payloadHome.x, 0.56, payloadHome.z);
    const liftPayload = new THREE.Vector3(payloadHome.x, 1.08, payloadHome.z);
    const beltHigh = new THREE.Vector3(0.75, 0.84, 0.75);
    const beltRelease = new THREE.Vector3(0.75, 0.44, 0.75);
    const retract = new THREE.Vector3(-0.05, 1.0, -0.2);
    const localTime = frame.localTime;

    let gripper = home.clone();
    if (localTime < 0.5) gripper = home.clone();
    else if (localTime < 1.8) gripper = this.mixCinematicPoint(home, abovePayload, (localTime - 0.5) / 1.3);
    else if (localTime < 2.7) gripper = this.mixCinematicPoint(abovePayload, clampPayload, (localTime - 1.8) / 0.9);
    else if (localTime < 3.4) gripper = this.mixCinematicPoint(clampPayload, liftPayload, (localTime - 2.7) / 0.7);
    else if (localTime < 4.7) gripper = this.mixCinematicPoint(liftPayload, beltHigh, (localTime - 3.4) / 1.3);
    else if (localTime < 5.4) gripper = this.mixCinematicPoint(beltHigh, beltRelease, (localTime - 4.7) / 0.7);
    else if (localTime < 8.5) gripper = this.mixCinematicPoint(beltRelease, retract, (localTime - 5.4) / 3.1);
    else gripper = this.mixCinematicPoint(retract, home, (localTime - 8.5) / 0.5);

    const wristDirection = gripper.clone().sub(shoulder).normalize();
    const wrist = gripper.clone().addScaledVector(wristDirection, -0.42);
    const span = wrist.clone().sub(shoulder);
    const mid = shoulder.clone().addScaledVector(span, 0.5);
    const side = new THREE.Vector3().crossVectors(span, new THREE.Vector3(0, 1, 0)).normalize();
    if (side.lengthSq() < 0.01) side.set(0, 0, 1);
    const bend = new THREE.Vector3().crossVectors(side, span).normalize();
    if (bend.y < 0) bend.multiplyScalar(-1);
    const reach = span.length();
    const arc = Math.max(0.35, Math.min(0.9, 0.86 - reach * 0.12));
    const elbow = mid.addScaledVector(bend, arc);
    const clawClosed = localTime >= 2.45 && localTime < 4.95;
    const payloads = {};
    ['payloadA', 'payloadB', 'payloadC', 'payloadD'].forEach((payloadId) => {
      payloads[payloadId] = this.getPayloadFramePosition(payloadId, frame, gripper);
    });

    return {
      ...frame,
      base,
      shoulder,
      elbow,
      wrist,
      gripper,
      payload: payloads[frame.payloadId],
      payloads,
      clawSpread: clawClosed ? 0.055 : 0.16,
      conveyorActive: true,
    };
  }

  getOperationCinematicPhase(time = 0) {
    const { localTime } = this.getOperationCycleFrame(time);
    if (localTime < 0.5) return 'standby';
    if (localTime < 1.8) return 'moveToTarget';
    if (localTime < 2.7) return 'grasp';
    if (localTime < 4.7) return 'transfer';
    if (localTime < 5.4) return 'release';
    if (localTime < 7.8) return 'conveyor';
    if (localTime < 8.5) return 'drop';
    return 'returnHome';
  }

  getCinematicAnchor(time = 0) {
    const home = new THREE.Vector3(0.15, 1.05, -0.08);
    const aboveTarget = new THREE.Vector3(-2.28, 0.92, 1.02);
    const contactTarget = new THREE.Vector3(-2.28, 0.48, 1.02);
    const liftTarget = new THREE.Vector3(-2.28, 1.02, 1.02);
    const beltHigh = new THREE.Vector3(1.35, 0.86, -1.65);
    const beltLow = new THREE.Vector3(1.35, 0.42, -1.65);
    const retract = new THREE.Vector3(0.75, 0.95, -1.15);

    if (time < 3) return home;
    if (time < 7) return this.mixCinematicPoint(home, aboveTarget, (time - 3) / 4);
    if (time < 10) return this.mixCinematicPoint(aboveTarget, contactTarget, (time - 7) / 3);
    if (time < 11.2) return this.mixCinematicPoint(contactTarget, liftTarget, (time - 10) / 1.2);
    if (time < 15) return this.mixCinematicPoint(liftTarget, beltHigh, (time - 11.2) / 3.8);
    if (time < 18) return this.mixCinematicPoint(beltHigh, beltLow, (time - 15) / 3);
    if (time < 24) return this.mixCinematicPoint(beltLow, retract, (time - 18) / 6);
    return this.mixCinematicPoint(retract, home, (time - 24) / 3.31);
  }

  getCinematicPayloadPosition(payloadId, time = 0) {
    if (payloadId !== 'payloadA') {
      const index = operationPayloads.findIndex((payload) => payload.id === payloadId);
      return this.getPayloadHomePosition(payloadId, index);
    }
    const table = new THREE.Vector3(-2.38, 0.28, 0.98);
    const release = new THREE.Vector3(1.35, 0.18, -1.65);
    const beltEnd = new THREE.Vector3(3.16, 0.18, -1.65);
    const collected = new THREE.Vector3(3.35, 0.3, -1.65);
    if (time < 10) return table;
    if (time < 15) {
      const anchor = this.gripperAnchor.lengthSq() > 0
        ? this.gripperAnchor
        : this.getCinematicAnchor(time);
      return new THREE.Vector3(anchor.x, anchor.y - 0.26, anchor.z);
    }
    if (time < 18) return this.mixCinematicPoint(new THREE.Vector3(1.35, 0.34, -1.65), release, (time - 15) / 3);
    if (time < 24) return this.mixCinematicPoint(release, beltEnd, (time - 18) / 6);
    return this.mixCinematicPoint(beltEnd, collected, (time - 24) / 3.31);
  }

  getOperationRobotPose(time = 0) {
    const poses = [
      { time: 0, turntable: -0.18, shoulder: -0.28, elbow: -1.02, wristZ: 0.32, wristY: 0, tool: 0.1, claw: 0.13 },
      { time: 3, turntable: -0.18, shoulder: -0.28, elbow: -1.02, wristZ: 0.32, wristY: 0, tool: 0.1, claw: 0.13 },
      { time: 7, turntable: -2.22, shoulder: -0.82, elbow: -0.72, wristZ: 0.46, wristY: -0.12, tool: -0.05, claw: 0.13 },
      { time: 10, turntable: -2.34, shoulder: -1.02, elbow: -0.44, wristZ: 0.58, wristY: -0.18, tool: -0.08, claw: 0.055 },
      { time: 12, turntable: -2.26, shoulder: -0.62, elbow: -0.78, wristZ: 0.38, wristY: -0.08, tool: -0.03, claw: 0.055 },
      { time: 15, turntable: 0.74, shoulder: -0.45, elbow: -0.82, wristZ: 0.42, wristY: 0.1, tool: 0.02, claw: 0.055 },
      { time: 18, turntable: 0.78, shoulder: -0.72, elbow: -0.5, wristZ: 0.54, wristY: 0.1, tool: 0.08, claw: 0.13 },
      { time: 24, turntable: 0.42, shoulder: -0.34, elbow: -0.92, wristZ: 0.34, wristY: 0.04, tool: 0.1, claw: 0.13 },
      { time: 11, turntable: -0.18, shoulder: -0.28, elbow: -1.02, wristZ: 0.32, wristY: 0, tool: 0.1, claw: 0.13 },
    ];
    const nextIndex = poses.findIndex((pose) => time <= pose.time);
    if (nextIndex === -1) return poses[poses.length - 1];
    if (nextIndex <= 0) return poses[0];
    const from = poses[nextIndex - 1];
    const to = poses[nextIndex];
    const mix = this.easeCinematic((time - from.time) / Math.max(0.001, to.time - from.time));
    return Object.fromEntries(Object.keys(from).map((key) => [
      key,
      key === 'time' ? time : THREE.MathUtils.lerp(from[key], to[key], mix),
    ]));
  }

  applyOperationRobotPose(time = 0) {
    if (!this.robotRigRoot) return;
    const pose = this.getOperationRobotPose(time);
    const target = this.getCinematicAnchor(time);
    this.robotRigRoot.visible = true;
    this.robotRigRoot.updateMatrixWorld(true);
    this.robotShoulderPivot.updateMatrixWorld(true);
    const shoulderWorld = this.robotShoulderPivot.getWorldPosition(new THREE.Vector3());
    const toTarget = target.clone().sub(shoulderWorld);
    const yaw = Math.atan2(-toTarget.z, toTarget.x);
    this.robotTurntablePivot.rotation.y = yaw;
    this.robotTurntablePivot.updateMatrixWorld(true);
    const localTarget = this.robotShoulderPivot.worldToLocal(target.clone());
    const radial = THREE.MathUtils.clamp(localTarget.x, -2.75, 2.75);
    const vertical = THREE.MathUtils.clamp(localTarget.y, -0.72, 2.55);
    const l1 = 1.15;
    const l2 = 1.98;
    const distanceSq = radial * radial + vertical * vertical;
    const cosElbow = THREE.MathUtils.clamp((distanceSq - l1 * l1 - l2 * l2) / (2 * l1 * l2), -0.98, 0.98);
    const elbow = Math.acos(cosElbow);
    const shoulder = Math.atan2(radial, vertical) - Math.atan2(l2 * Math.sin(elbow), l1 + l2 * Math.cos(elbow));
    this.robotShoulderPivot.rotation.z = -shoulder;
    this.robotElbowPivot.rotation.z = -elbow;
    this.robotWristPivot.rotation.z = shoulder + elbow + pose.wristZ;
    this.robotWristPivot.rotation.y = pose.wristY;
    this.robotToolPivot.rotation.z = pose.tool;
    if (this.robotLeftClaw && this.robotRightClaw) {
      this.robotLeftClaw.position.z = -pose.claw;
      this.robotRightClaw.position.z = pose.claw;
    }
    this.robotRigRoot.updateMatrixWorld(true);
    if (this.robotGripperAnchor) {
      this.robotGripperAnchor.getWorldPosition(this.gripperAnchor);
    }
  }

  updateOperationCinematicPath(time = 0) {
    if (!this.operationPath) return;
    const phase = this.getOperationCinematicPhase(time);
    if (this.operationPathPhase === `cinematic-${phase}`) return;
    this.operationPathPhase = `cinematic-${phase}`;
    const points = phase === 'conveyor'
      ? [
        new THREE.Vector3(1.35, 0.22, -1.65),
        new THREE.Vector3(2.25, 0.22, -1.65),
        new THREE.Vector3(3.35, 0.28, -1.65),
      ]
      : [
        new THREE.Vector3(0.15, 1.05, -0.08),
        new THREE.Vector3(-1.1, 1.25, 0.7),
        new THREE.Vector3(-2.28, 0.84, 1.02),
        new THREE.Vector3(-1.55, 1.2, 0.35),
        new THREE.Vector3(1.35, 0.78, -1.65),
      ];
    const curve = new THREE.CatmullRomCurve3(points);
    this.operationPath.geometry.dispose();
    this.operationPath.geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(64));
    this.operationPath.computeLineDistances();
    this.operationPath.visible = true;
  }

  updateOperationCinematicObjects(delta = 0) {
    this.updateOperationWorkcell(this.state?.operationPlaybackTime ?? 0, delta);
    return;
  }

  updateOperationWorkcell(time = 0, delta = 0) {
    if (this.state?.viewMode !== 'operation') return;
    const frame = this.getOperationFrame(time);
    this.operationFrame = frame;
    if (this.robotRigRoot) this.robotRigRoot.visible = false;
    if (this.operationToolProxy) this.operationToolProxy.visible = false;
    if (this.operationSkeletonRoot) this.operationSkeletonRoot.visible = true;

    this.alignObjectBetween(this.operationSkeletonLinks.column, frame.base, frame.shoulder, 1);
    this.alignObjectBetween(this.operationSkeletonLinks.upperArm, frame.shoulder, frame.elbow, 1);
    this.alignObjectBetween(this.operationSkeletonLinks.forearm, frame.elbow, frame.wrist, 1);
    this.alignObjectBetween(this.operationSkeletonLinks.tool, frame.wrist, frame.gripper, 1);
    if (this.operationSkeletonJoints.base) {
      this.operationSkeletonJoints.base.position.set(frame.base.x, frame.base.y, frame.base.z);
    }
    if (this.operationSkeletonJoints.turntable) {
      this.operationSkeletonJoints.turntable.position.set(frame.base.x, 0, frame.base.z);
    }
    Object.entries({
      shoulder: frame.shoulder,
      elbow: frame.elbow,
      wrist: frame.wrist,
      gripper: frame.gripper,
    }).forEach(([key, value]) => {
      const object = this.operationSkeletonJoints[key];
      if (object) object.position.copy(value);
    });

    const toolDir = frame.gripper.clone().sub(frame.wrist).normalize();
    const side = new THREE.Vector3().crossVectors(toolDir, new THREE.Vector3(0, 1, 0)).normalize();
    if (side.lengthSq() < 0.01) side.set(0, 0, 1);
    const leftRoot = frame.gripper.clone().addScaledVector(side, -frame.clawSpread);
    const rightRoot = frame.gripper.clone().addScaledVector(side, frame.clawSpread);
    const leftTip = leftRoot.clone().addScaledVector(toolDir, 0.34);
    const rightTip = rightRoot.clone().addScaledVector(toolDir, 0.34);
    this.alignObjectBetween(this.operationSkeletonClaws.left, leftRoot, leftTip, 1);
    this.alignObjectBetween(this.operationSkeletonClaws.right, rightRoot, rightTip, 1);
    this.gripperAnchor.copy(frame.gripper);

    if (this.operationToolProxy) {
      this.operationToolProxy.visible = false;
    }
    if (this.gripperGuide) {
      this.gripperGuide.visible = time >= 1 && time < 7;
      this.gripperGuide.position.copy(frame.gripper);
    }
    this.payloadGroups.forEach((group, payloadId) => {
      if (payloadId === 'payloadD') {
        group.visible = false;
        return;
      }
      group.visible = true;
      const target = frame.payloads?.[payloadId]
        ?? this.getPayloadHomePosition(payloadId, operationPayloads.findIndex((payload) => payload.id === payloadId));
      group.position.copy(target);
    });
    this.updateOperationWorkcellPath(time, frame);
    if (this.state.operationPlaying && this.conveyorGroup) {
      const beltSpeed = 0.85;
      this.conveyorOffset = (this.conveyorOffset + delta * beltSpeed) % 0.38;
      this.conveyorStripes.forEach((stripe) => {
        let nextX = (stripe.userData.baseX ?? stripe.position.x) + this.conveyorOffset;
        if (nextX > 3.62) nextX -= 4.94;
        stripe.position.x = nextX;
      });
      this.conveyorRollers.forEach((roller) => {
        roller.rotation.y -= delta * beltSpeed * 6.2;
      });
    }
  }

  updateOperationWorkcellPath(time = 0, frame = this.getOperationFrame(time)) {
    if (!this.operationPath) return;
    const phase = this.getOperationCinematicPhase(time);
    if (this.operationPathPhase === `workcell-${frame.cycleIndex}-${phase}`) return;
    this.operationPathPhase = `workcell-${frame.cycleIndex}-${phase}`;
    const payloadHome = this.getPayloadHomePosition(frame.payloadId, frame.cycleIndex);
    const binMouth = this.getPayloadBinMouthPosition(frame.payloadId);
    const points = phase === 'conveyor' || phase === 'drop'
      ? [
        new THREE.Vector3(0.75, 0.2, 0.75),
        new THREE.Vector3(1.58, 0.2, binMouth.z),
        binMouth,
        this.getPayloadCollectedPosition(frame.payloadId),
      ]
      : [
        frame.shoulder.clone(),
        new THREE.Vector3(-0.15, 1.24, -0.95),
        new THREE.Vector3(payloadHome.x, 0.92, payloadHome.z),
        new THREE.Vector3(0.55, 1.16, -0.18),
        new THREE.Vector3(0.75, 0.84, 0.75),
      ];
    const curve = new THREE.CatmullRomCurve3(points);
    this.operationPath.geometry.dispose();
    this.operationPath.geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(64));
    this.operationPath.computeLineDistances();
    this.operationPath.visible = true;
  }

  getOperationRigPose(stepId) {
    const poses = {
      standby: {
        turntable: [0, 0, 0],
        shoulder: [0, 0, 0],
        upperArm: [0, 0, 0],
        elbow: [0, 0, 0],
        forearm: [0, 0, 0],
        wrist: [0, 0, 0],
        tool: [0, 0, 0],
      },
      approachTarget: {
        turntable: [0, 0.34, 0],
        shoulder: [0, 0.1, 0.04],
        upperArm: [0, 0, -0.08],
        elbow: [0, 0.08, 0.04],
        forearm: [0, 0, 0.08],
        wrist: [0, 0, 0.14],
        tool: [0.1, 0.08, 0],
      },
      contactTarget: {
        turntable: [0, 0.42, 0],
        shoulder: [0, 0.16, 0.08],
        upperArm: [0, 0, -0.12],
        elbow: [0, 0.12, 0.08],
        forearm: [0, 0, 0.12],
        wrist: [0, 0, 0.2],
        tool: [0.18, 0.12, 0],
      },
      grasp: {
        turntable: [0, 0.42, 0],
        shoulder: [0, 0.16, 0.08],
        upperArm: [0, 0, -0.12],
        elbow: [0, 0.12, 0.08],
        forearm: [0, 0, 0.12],
        wrist: [0, 0, 0.2],
        tool: [0.22, 0.14, 0],
      },
      liftPayload: {
        turntable: [0, 0.26, 0],
        shoulder: [0, 0.04, 0],
        upperArm: [0, 0, -0.04],
        elbow: [0, 0.04, 0],
        forearm: [0, 0, 0.04],
        wrist: [0, 0, 0.08],
        tool: [0.1, 0.08, 0],
      },
      moveToBelt: {
        turntable: [0, -0.36, 0],
        shoulder: [0, -0.04, -0.04],
        upperArm: [0, 0, 0.06],
        elbow: [0, -0.08, -0.04],
        forearm: [0, 0, -0.08],
        wrist: [0, 0, -0.16],
        tool: [-0.12, -0.1, 0],
      },
      releaseOnBelt: {
        turntable: [0, -0.46, 0],
        shoulder: [0, -0.08, -0.06],
        upperArm: [0, 0, 0.08],
        elbow: [0, -0.1, -0.06],
        forearm: [0, 0, -0.1],
        wrist: [0, 0, -0.2],
        tool: [-0.18, -0.16, 0],
      },
      beltToBin: {
        turntable: [0, -0.28, 0],
        shoulder: [0, -0.02, 0],
        upperArm: [0, 0, 0.02],
        elbow: [0, -0.04, 0],
        forearm: [0, 0, -0.02],
        wrist: [0, 0, -0.08],
        tool: [-0.08, -0.06, 0],
      },
      returnHome: {
        turntable: [0, 0, 0],
        shoulder: [0, 0, 0],
        upperArm: [0, 0, 0],
        elbow: [0, 0, 0],
        forearm: [0, 0, 0],
        wrist: [0, 0, 0],
        tool: [0, 0, 0],
      },
    };
    return poses[stepId] ?? poses.standby;
  }

  setVectorRotationTarget(object, values) {
    if (!object) return;
    object.userData.targetRotation = new THREE.Euler(...values);
  }

  getGripperAnchorPosition(phaseId) {
    const anchors = {
      standby: new THREE.Vector3(0.2, 1.1, -0.1),
      approachTarget: new THREE.Vector3(-2.05, 0.74, 0.98),
      contactTarget: new THREE.Vector3(-2.05, 0.44, 0.98),
      grasp: new THREE.Vector3(-2.05, 0.44, 0.98),
      liftPayload: new THREE.Vector3(-2.05, 0.96, 0.98),
      moveToBelt: new THREE.Vector3(1.35, 0.82, -1.65),
      releaseOnBelt: new THREE.Vector3(1.35, 0.34, -1.65),
      beltToBin: new THREE.Vector3(1.35, 0.74, -1.65),
      returnHome: new THREE.Vector3(0.2, 1.1, -0.1),
    };
    return anchors[phaseId]?.clone() ?? anchors.standby.clone();
  }

  updateOperationPath(phaseId) {
    if (!this.operationPath) return;
    if (this.operationPathPhase === phaseId) return;
    this.operationPathPhase = phaseId;
    const paths = {
      approachTarget: [
        new THREE.Vector3(0.2, 1.1, -0.1),
        new THREE.Vector3(-0.8, 1.35, 0.45),
        new THREE.Vector3(-2.05, 0.74, 0.98),
      ],
      contactTarget: [
        new THREE.Vector3(-2.05, 0.74, 0.98),
        new THREE.Vector3(-2.05, 0.44, 0.98),
      ],
      grasp: [
        new THREE.Vector3(-2.05, 0.44, 0.98),
        new THREE.Vector3(-2.05, 0.44, 0.98),
      ],
      liftPayload: [
        new THREE.Vector3(-2.05, 0.44, 0.98),
        new THREE.Vector3(-2.05, 0.96, 0.98),
      ],
      moveToBelt: [
        new THREE.Vector3(-2.05, 0.96, 0.98),
        new THREE.Vector3(-0.35, 1.34, -0.2),
        new THREE.Vector3(1.35, 0.82, -1.65),
      ],
      releaseOnBelt: [
        new THREE.Vector3(1.35, 0.82, -1.65),
        new THREE.Vector3(1.35, 0.34, -1.65),
      ],
      beltToBin: [
        new THREE.Vector3(1.35, 0.22, -1.65),
        new THREE.Vector3(2.55, 0.22, -1.65),
        new THREE.Vector3(3.35, 0.3, -1.65),
      ],
    };
    const points = paths[phaseId];
    if (!points) {
      this.operationPath.visible = false;
      return;
    }
    const curve = new THREE.CatmullRomCurve3(points);
    this.operationPath.geometry.dispose();
    this.operationPath.geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(Math.max(8, points.length * 16)));
    this.operationPath.computeLineDistances();
    this.operationPath.visible = true;
  }

  getPayloadOperationTarget(payloadId, state) {
    const selectedId = state.selectedPayloadId ?? operationPayloads[0]?.id;
    const status = state.payloadStatuses?.[payloadId] ?? 'waiting';
    const index = operationPayloads.findIndex((payload) => payload.id === payloadId);
    const home = this.getPayloadHomePosition(payloadId, index);
    const processedIndex = Math.max(0, operationPayloads.filter((payload) => {
      const payloadStatus = state.payloadStatuses?.[payload.id];
      return ['processed', 'collected'].includes(payloadStatus) || payload.id === payloadId && ['processed', 'collected'].includes(status);
    }).findIndex((payload) => payload.id === payloadId));

    if (status === 'collected' || status === 'processed') {
      return new THREE.Vector3(3.35, 0.3 + processedIndex * 0.03, -1.65 + processedIndex * 0.18);
    }

    if (status === 'onBelt') {
      return new THREE.Vector3(2.55, 0.18, -1.65);
    }

    if (payloadId !== selectedId) return home;

    const phaseId = state.operationPhaseId ?? 'standby';
    if (status === 'carried') return this.getGripperAnchorPosition(phaseId);
    if (phaseId === 'contactTarget') return new THREE.Vector3(-2.05, 0.28, 0.98);
    if (phaseId === 'grasp') return this.getGripperAnchorPosition(phaseId);
    if (phaseId === 'releaseOnBelt') return new THREE.Vector3(1.35, 0.18, -1.65);
    if (phaseId === 'returnHome') return status === 'onBelt'
      ? new THREE.Vector3(2.55, 0.18, -1.65)
      : new THREE.Vector3(3.35, 0.3, -1.65);
    return home;
  }

  setState(state) {
    this.state = state;
    this.selectedPart = state.selectedPart;
    if (this.operationRoot) this.operationRoot.visible = state.viewMode === 'operation';
    this.controls.enabled = state.viewMode !== 'operation';
    if (state.viewMode === 'operation') {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 46, 0.18);
      this.camera.updateProjectionMatrix();
      this.camera.position.lerp(new THREE.Vector3(5.1, 3.1, 5.25), 0.18);
      this.controls.target.lerp(new THREE.Vector3(0.2, 0.55, -0.16), 0.18);
      this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, -0.08, 0.16);
    } else if (this.camera.fov !== 42) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 42, 0.18);
      this.camera.updateProjectionMatrix();
    }
    this.updateAssemblyLibrarySlots();
    const operationPhaseId = state.operationPhaseId ?? state.operationStepId ?? 'standby';
    const rigPose = this.getOperationRigPose(operationPhaseId);
    this.setVectorRotationTarget(this.turntablePivot, rigPose.turntable);
    this.setVectorRotationTarget(this.armPivot, [0, 0, 0]);
    this.setVectorRotationTarget(this.forearmPivot, [0, 0, 0]);
    this.setVectorRotationTarget(this.wristPivot, rigPose.wrist);
    this.setVectorRotationTarget(this.toolPivot, rigPose.tool);
    const currentStep = assemblySteps[state.assemblyStep];
    const currentStepPart = currentStep?.partId ?? null;
    parts.forEach((part) => {
      const group = this.partGroups.get(part.id);
      if (!group) return;
      const home = group.userData.home;
      let target = home.clone();
      let targetScale = 1;
      group.userData.assemblyRole = 'normal';
      if (state.viewMode === 'exploded') {
        const offsetScale = this.modelMode === 'glb' ? 0.38 : this.modelMode === 'obj' ? 0.28 : 1;
        target = home.clone().add(explodedOffsets[part.id].clone().multiplyScalar(offsetScale));
      }
      if (state.viewMode === 'assembly') {
        const visibleIndex = assemblySteps.findIndex((step) => step.partId === part.id);
        const assemblyStarted = Boolean(state.assemblyStarted);
        const isInitialCheck = !assemblyStarted || state.assemblyStep === 0;
        const isCurrent = part.id === currentStepPart;
        const partStatus = state.partStatuses?.[part.id] ?? (assemblyStarted ? 'inLibrary' : 'inspection');
        const customPosition = state.partPositions?.[part.id]
          ? new THREE.Vector3(...state.partPositions[part.id])
          : null;
        const isCompleted = partStatus === 'installed' || (visibleIndex > 0 && visibleIndex < state.assemblyStep);
        const isPending = assemblyStarted && partStatus === 'inLibrary';
        const isWrong = assemblyStarted && partStatus === 'placedWrong';

        target = home.clone();
        if (isPending) {
          target = this.assemblyLibrarySlots.get(part.id)?.clone()
            ?? fallbackAssemblyLibrarySlots[part.id].clone();
          targetScale = 0.82;
        } else if (customPosition && !isCompleted) {
          target = customPosition;
          targetScale = 0.72;
        }

        group.userData.assemblyRole = isInitialCheck
          ? 'inspection'
          : isCurrent
            ? 'current'
            : isCompleted
              ? 'completed'
              : isPending
                ? 'pending'
                : isWrong
                  ? 'wrong'
                  : 'normal';
      }
      if (state.viewMode === 'operation') {
        target = home.clone();
        targetScale = 1;
        group.userData.assemblyRole = part.id === 'tool' ? 'current' : 'inspection';
        group.userData.targetRotation = null;
      } else {
        group.userData.targetRotation = null;
      }
      this.targetPositions.set(part.id, target);
      this.targetScales.set(part.id, targetScale);
      group.visible = state.viewMode !== 'operation';
    });

    this.payloadGroups.forEach((group, payloadId) => {
      group.visible = state.viewMode === 'operation';
      const operationFrame = state.viewMode === 'operation'
        ? this.getOperationFrame(state.operationPlaybackTime ?? 0)
        : null;
      const target = state.viewMode === 'operation'
        ? (operationFrame.payloads?.[payloadId]
          ?? this.getPayloadHomePosition(payloadId, operationPayloads.findIndex((payload) => payload.id === payloadId)))
        : this.getPayloadOperationTarget(payloadId, state);
      this.payloadTargets.set(payloadId, target);
      const isSelected = payloadId === state.selectedPayloadId;
      const payloadStatus = state.payloadStatuses?.[payloadId] ?? 'waiting';
      group.scale.setScalar(isSelected ? 1.08 : ['processed', 'collected'].includes(payloadStatus) ? 0.94 : 1);
      group.traverse((child) => {
        if (!child.isMesh || !child.material?.emissive) return;
        child.material.emissive.setHex(isSelected ? 0x4a1c00 : 0x2d1505);
        child.material.emissiveIntensity = isSelected ? 0.3 : 0.05;
      });
    });

    if (state.viewMode === 'operation') {
      this.updateOperationCinematicObjects(0);
    } else {
      this.updateOperationPath('standby');
      if (this.operationToolProxy) this.operationToolProxy.visible = false;
    }
    if (this.gripperGuide) {
      if (state.viewMode !== 'operation') {
        this.gripperGuide.visible = false;
      }
    }
    this.updateMaterials();
    this.updateTargetMarker();
  }

  updateMaterials() {
    this.partGroups.forEach((group, partId) => {
      group.traverse((child) => {
        if (!child.isMesh) return;
        const selected = partId === this.selectedPart;
        const assemblyRole = group.userData.assemblyRole;
        const activeAssemblyPart = this.state?.viewMode === 'assembly' && assemblyRole === 'current';
        const pendingAssemblyPart = this.state?.viewMode === 'assembly' && assemblyRole === 'pending';
        const inspectionPart = this.state?.viewMode === 'assembly' && assemblyRole === 'inspection';
        const wrongAssemblyPart = this.state?.viewMode === 'assembly' && assemblyRole === 'wrong';
        const snapReady = this.dragState?.partId === partId
          && partId === (assemblySteps[this.state?.assemblyStep]?.partId ?? null)
          && this.getSnapInfo(partId).screenDistance <= snapScreenRadius;
        const highlighted = selected || activeAssemblyPart || snapReady;

        child.material.color.setHex(
          snapReady
            ? 0x7de8ff
            : highlighted
            ? 0xff315d
            : wrongAssemblyPart
              ? 0xff315d
              : pendingAssemblyPart
                ? 0xdde4ff
                : partColors[partId]
        );
        child.material.emissive.setHex(
          highlighted || wrongAssemblyPart
            ? 0x7a0524
            : inspectionPart
              ? 0x223b7a
              : 0x10162f
        );
        child.material.emissiveIntensity = highlighted ? 1.1 : wrongAssemblyPart ? 0.7 : pendingAssemblyPart ? 0.42 : inspectionPart ? 0.22 : 0.1;
        child.material.transparent = highlighted || pendingAssemblyPart || wrongAssemblyPart;
        child.material.opacity = highlighted ? 0.86 : pendingAssemblyPart ? 0.96 : wrongAssemblyPart ? 0.82 : 1;
      });
    });
  }

  applyGestureRotate(delta = 0.12) {
    this.root.rotation.y += delta;
  }

  applyGestureFlip(delta = 0.08) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + delta, 0.52, Math.PI - 0.52);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  applyGestureZoomIn(intensity = 0.16) {
    this.applyGestureZoom(1 - intensity);
  }

  applyGestureZoomOut(intensity = 0.16) {
    this.applyGestureZoom(1 + intensity);
  }

  applyGestureZoom(scale) {
    const next = this.camera.position.clone().multiplyScalar(scale);
    const distance = next.distanceTo(this.controls.target);
    if (distance < 2.2 || distance > 10.5) return;
    this.camera.position.copy(next);
  }

  updateAssemblyLibrarySlots() {
    if (!this.state || this.state.viewMode !== 'assembly') return;
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    const slotElements = document.querySelectorAll('[data-library-slot-part-id]');
    if (!slotElements.length || !canvasRect.width || !canvasRect.height) return;

    const targetDistance = this.camera.position.distanceTo(this.controls.target) * 0.82;
    this.root.updateMatrixWorld(true);
    slotElements.forEach((element) => {
      const partId = element.dataset.librarySlotPartId;
      if (!partId) return;
      const group = this.partGroups.get(partId);
      const parent = group?.parent ?? this.root;
      const rect = element.getBoundingClientRect();
      const screenX = rect.left + rect.width * 0.5;
      const screenY = rect.top + rect.height * 0.55;
      const ndc = new THREE.Vector2(
        ((screenX - canvasRect.left) / canvasRect.width) * 2 - 1,
        -(((screenY - canvasRect.top) / canvasRect.height) * 2 - 1)
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const worldPoint = ray.ray.origin.clone().add(ray.ray.direction.clone().multiplyScalar(targetDistance));
      parent.updateMatrixWorld(true);
      const localPoint = parent.worldToLocal(worldPoint);
      this.assemblyLibrarySlots.set(partId, localPoint);
    });
  }

  updateFocusedPart() {
    if (this.state?.activeTab !== 'model' || this.state?.viewMode !== 'normal') return;

    const now = performance.now();
    if (now - this.lastFocusCheckAt < 180) return;
    this.lastFocusCheckAt = now;

    this.root.updateMatrixWorld(true);
    let bestPart = null;
    let bestScore = Infinity;
    let bestAnchor = null;

    this.partGroups.forEach((group, partId) => {
      if (!group.visible) return;
      this.partFocusBox.setFromObject(group);
      if (this.partFocusBox.isEmpty()) return;

      this.partFocusBox.getCenter(this.partFocusCenter);
      this.partFocusCenter.project(this.camera);

      if (
        this.partFocusCenter.z < -1 ||
        this.partFocusCenter.z > 1 ||
        Math.abs(this.partFocusCenter.x) > 1.25 ||
        Math.abs(this.partFocusCenter.y) > 1.25
      ) {
        return;
      }

      const score = Math.hypot(this.partFocusCenter.x, this.partFocusCenter.y);
      if (score < bestScore) {
        bestScore = score;
        bestPart = partId;
        bestAnchor = {
          x: (this.partFocusCenter.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth,
          y: (-this.partFocusCenter.y * 0.5 + 0.5) * this.renderer.domElement.clientHeight,
        };
      }
    });

    if (bestPart && bestScore < 0.95 && bestPart !== this.focusedPart) {
      this.focusedPart = bestPart;
      this.onPartFocused?.(bestPart, bestAnchor);
    }
  }

  resetCamera() {
    this.controls.enabled = true;
    this.camera.position.set(5.4, 3.8, 7.2);
    this.controls.target.set(0.15, 1.35, 0);
    this.root.rotation.set(0, -0.46, 0);
  }

  resize() {
    const { clientWidth, clientHeight } = this.mount;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
    this.updateAssemblyLibrarySlots();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const now = performance.now();
    const delta = Math.min(0.05, (now - this.lastAnimateAt) / 1000);
    this.lastAnimateAt = now;
    const elapsed = now * 0.001;
    this.partGroups.forEach((group, partId) => {
      const target = this.targetPositions.get(partId);
      if (target) group.position.lerp(target, 0.08);
      const targetScale = this.targetScales.get(partId) ?? 1;
      group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);
      if (group.userData.targetRotation) {
        group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, group.userData.targetRotation.x, 0.1);
        group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, group.userData.targetRotation.y, 0.1);
        group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, group.userData.targetRotation.z, 0.1);
      }
    });
    this.payloadGroups.forEach((group, payloadId) => {
      const target = this.payloadTargets.get(payloadId);
      if (target) group.position.lerp(target, 0.1);
    });
    if (this.state?.viewMode === 'operation') {
      this.updateOperationCinematicObjects(delta);
    } else if (this.state?.operationPlaying) {
      const speed = this.state.operationSpeed ?? 1;
      this.conveyorOffset = (this.conveyorOffset + delta * speed * 0.72) % 0.38;
      this.conveyorStripes.forEach((stripe) => {
        let nextX = (stripe.userData.baseX ?? stripe.position.x) + this.conveyorOffset;
        if (nextX > 3.62) nextX -= 4.94;
        stripe.position.x = nextX;
      });
      this.conveyorRollers.forEach((roller) => {
        roller.rotation.y -= delta * speed * 5.2;
      });
    }
    const shoulder = this.partGroups.get('shoulder');
    const turntable = this.partGroups.get('turntable');
    if (this.modelMode === 'procedural' && this.state?.viewMode !== 'operation') {
      if (turntable) turntable.rotation.y = elapsed * 0.18;
      if (shoulder) shoulder.rotation.y = Math.sin(elapsed * 0.8) * 0.05;
    }
    this.controls.update();
    this.updateFocusedPart();
    this.updateTargetMarker();
    this.renderer.render(this.scene, this.camera);
  }
}
