import './styles.css';
import { MechanicalScene } from './mechanical-scene.js';
import { GestureAdapter } from './gesture-adapter.js';
import {
  parts,
  assemblySteps,
  gestureActions,
  partConstraints,
  operationSteps,
  operationPayloads,
} from './prototype-data.js';

const state = {
  viewMode: 'normal',
  selectedPart: null,
  focusAnchor: null,
  manualSelectionUntil: 0,
  gestureMode: 'idle',
  assemblyStep: 0,
  assemblyStarted: false,
  partStatuses: Object.fromEntries(parts.map((part) => [part.id, 'inspection'])),
  partPositions: {},
  isPlaying: false,
  activeTab: 'model',
  operationCount: 0,
  errorCount: 0,
  lastWarning: '机械模型首页：拖拽或使用手势旋转模型，视角靠近的部件会自动显示信息。',
  lastGesture: '未触发',
  gestureSource: '模拟输入',
  gestureConfidence: '--',
  cameraStatus: '摄像头未启动',
  isCameraRunning: false,
  operationStarted: false,
  operationPlaying: false,
  operationRunState: 'idle',
  operationPlaybackTime: 0,
  operationDuration: 27,
  operationLastTick: 0,
  operationUiTick: 0,
  operationStep: 0,
  operationStepId: 'standby',
  operationPhaseIndex: 0,
  operationPhaseId: 'standby',
  operationSpeed: 1,
  selectedPayloadId: operationPayloads[0]?.id ?? null,
  queuedPayloadId: null,
  activeCycleId: 0,
  payloadStatuses: Object.fromEntries(operationPayloads.map((payload) => [payload.id, 'waiting'])),
  commandLog: ['Standby'],
  operationMetrics: {
    cycleCount: 0,
    speed: 0,
    force: 0,
    jointAngles: [0, -35, 92],
    gripper: '打开',
  },
};

const app = document.querySelector('#app');
app.innerHTML = `
  <main class="dashboard-shell">
    <header class="topbar">
      <section class="brand-block">
        <div class="brand-mark"><span></span></div>
        <div>
          <h1>Mechanical Assembly</h1>
          <p>Web3D Interaction Prototype</p>
        </div>
      </section>
      <nav class="top-tabs" aria-label="View tabs">
        <button data-tab="model" class="active">机械模型</button>
        <button data-tab="assembly">装配验证</button>
        <button data-tab="operation">机械作业</button>
      </nav>
      <section class="system-status">
        <span>2026.06.19</span>
        <span>12:00:23</span>
        <span>Cloud Sync</span>
        <span class="user-dot"></span>
        <strong>Prototype.lab</strong>
      </section>
    </header>

    <aside class="left-panel panel-glass">
      <div class="breadcrumb">机械模型 / Web3D 原型</div>
      <h2>结构树</h2>
      <div class="tree-group">
        <h3>机械装配件</h3>
        <div class="part-tree" id="partTree"></div>
      </div>
      <div class="gesture-card">
        <div>
          <span class="pulse-dot"></span>
          <strong id="gestureStatus">Gesture Idle</strong>
        </div>
        <p id="cameraStatus">摄像头未启动</p>
        <p class="gesture-rule">旋转：单手张开，右→左为逆时针，左→右为顺时针。</p>
        <video id="cameraPreview" class="camera-preview" playsinline muted></video>
        <div class="camera-controls">
          <button id="cameraToggle">启用摄像头识别</button>
        </div>
      </div>
    </aside>

    <section class="scene-wrap">
      <div class="scene-toolbar panel-glass">
        <div>
          <span class="label-dot"></span>
          <strong id="sceneTitle">Mechanical Model</strong>
        </div>
      </div>
      <div id="sceneMount" class="scene-mount" aria-label="Interactive 3D mechanical assembly"></div>
      <div id="modelPartOverlay" class="model-part-overlay" aria-live="polite"></div>
      <div class="scene-hints panel-glass">
        <span>鼠标拖拽旋转</span>
        <span>滚轮缩放</span>
        <span>点击零件选中</span>
      </div>
    </section>

    <aside class="right-panel panel-glass">
      <div class="panel-heading">
        <span class="mini-cube"></span>
        <div>
          <h2 id="partName">未选择零件</h2>
          <p id="partStatus">点击模型零件查看结构信息</p>
        </div>
      </div>
      <div id="partDetails" class="part-details"></div>
    </aside>

    <footer class="bottom-panel">
      <section class="metric-card panel-glass" id="actionPanel">
        <h2>设备参数</h2>
        <div class="metric-layout">
          <div class="device-thumb"></div>
          <div class="metrics">
            <label>当前电流 (A)<strong id="currentValue">150</strong></label>
            <label>运行总时长 (H)<strong id="durationValue">210</strong></label>
            <label>当前电压 (V)<strong id="voltageValue">24</strong></label>
            <label>有效运行时长 (H)<strong id="validValue">197</strong></label>
          </div>
        </div>
      </section>
      <section class="timeline-card panel-glass">
        <div class="timeline-head">
          <h2 id="timelineTitle">装配流程控制</h2>
          <div class="play-controls">
            <button id="playButton">播放</button>
            <button id="resetButton">重置</button>
          </div>
        </div>
        <div class="step-timeline" id="stepTimeline"></div>
      </section>
      <section class="chart-card panel-glass">
        <h2>操作评估与错误提示</h2>
        <div id="assessmentPanel" class="assessment-panel"></div>
      </section>
    </footer>
  </main>
`;

const partTree = document.querySelector('#partTree');
const dashboardShell = document.querySelector('.dashboard-shell');
const leftPanel = document.querySelector('.left-panel');
const topTabs = document.querySelector('.top-tabs');
const stepTimeline = document.querySelector('#stepTimeline');
const playButton = document.querySelector('#playButton');
const resetButton = document.querySelector('#resetButton');
const assessmentPanel = document.querySelector('#assessmentPanel');
const actionPanel = document.querySelector('#actionPanel');
const modelPartOverlay = document.querySelector('#modelPartOverlay');
const cameraToggle = document.querySelector('#cameraToggle');
const cameraPreview = document.querySelector('#cameraPreview');
const cameraStatus = document.querySelector('#cameraStatus');

const scene = new MechanicalScene(document.querySelector('#sceneMount'), {
  onPartSelected: (partId, anchor) => {
    setSelectedPart(partId, anchor);
  },
  onPartDropped: (result) => {
    handlePartDropped(result);
  },
  onPayloadSelected: (payloadId) => {
    selectOperationPayload(payloadId);
  },
  onPartFocused: (partId, anchor) => {
    if (state.activeTab !== 'model' || state.viewMode !== 'normal') return;
    if (performance.now() < state.manualSelectionUntil) return;
    if (!partId || partId === state.selectedPart) return;
    state.selectedPart = partId;
    state.focusAnchor = anchor;
    state.lastWarning = (selectedPart()?.name ?? '零件') + ' 已聚焦，右侧已同步显示部件信息。';
    renderState();
  },
});

const gestureAdapter = new GestureAdapter({
  onEvent: (event) => handleGestureEvent(event),
  onStatus: ({ mode, message }) => {
    state.gestureMode = mode === 'initializing' ? 'tracking' : mode;
    state.cameraStatus = message;
    state.isCameraRunning = mode !== 'idle';
    renderState();
  },
});

let playTimer = null;
let operationTimer = null;

const legacyOperationCinematicStages = [];

const operationCinematicStages = [
  { id: 'standby', step: 0, start: 0, end: 0.5, command: 'Standby', name: 'Standby', description: 'Switch to current payload; conveyor keeps constant speed.' },
  { id: 'moveToTarget', step: 1, start: 0.5, end: 1.8, command: 'Move to Target', name: 'Move to Target', description: 'Move gripper above the current payload.' },
  { id: 'grasp', step: 2, start: 1.8, end: 2.7, command: 'Clamp engaged', name: 'Clamp', description: 'Lower the gripper and clamp the payload.' },
  { id: 'transfer', step: 3, start: 2.7, end: 4.7, command: 'Transfer', name: 'Transfer', description: 'Carry the payload to the conveyor release point.' },
  { id: 'release', step: 4, start: 4.7, end: 5.4, command: 'Payload released', name: 'Release', description: 'Release the payload onto the conveyor centerline.' },
  { id: 'conveyor', step: 5, start: 5.4, end: 7.8, command: 'Conveyor running', name: 'Conveyor', description: 'Move the payload to the collection bin entrance.' },
  { id: 'drop', step: 5, start: 7.8, end: 8.5, command: 'Drop into bin', name: 'Drop', description: 'Drop the payload down into the collection bin.' },
  { id: 'returnHome', step: 6, start: 8.5, end: 9, command: 'Reposition', name: 'Return', description: 'Return home and switch to the next payload.' },
];

const operationPhases = [];
function resetAssemblyParts(status = 'inspection') {
  state.partStatuses = Object.fromEntries(parts.map((part) => [part.id, status]));
  state.partPositions = {};
}

function startManualAssembly() {
  state.viewMode = 'assembly';
  state.activeTab = 'assembly';
  state.assemblyStarted = true;
  state.assemblyStep = 1;
  state.selectedPart = assemblySteps[1]?.partId ?? null;
  state.focusAnchor = null;
  resetAssemblyParts('inLibrary');
}

function currentAssemblyPart() {
  if (state.assemblyStarted && parts.every((part) => state.partStatuses[part.id] === 'installed')) return null;
  const partId = assemblySteps[state.assemblyStep]?.partId;
  return parts.find((part) => part.id === partId) ?? null;
}

function installedCount() {
  return parts.filter((part) => state.partStatuses[part.id] === 'installed').length;
}

function isAssemblyComplete() {
  return installedCount() >= parts.length;
}

function currentOperationStep() {
  return currentOperationPhase();
}

function operationCycleInfo(time = state.operationPlaybackTime) {
  const payloadIds = ['payloadA', 'payloadB', 'payloadC'];
  const cycleDuration = 9;
  const clampedTime = Math.min(state.operationDuration, Math.max(0, time));
  const cycleIndex = Math.min(payloadIds.length - 1, Math.floor(clampedTime / cycleDuration));
  const localTime = clampedTime >= state.operationDuration
    ? cycleDuration
    : clampedTime - cycleIndex * cycleDuration;
  return {
    cycleDuration,
    cycleIndex,
    localTime,
    payloadId: payloadIds[cycleIndex],
    payloadLabel: 'Payload ' + String.fromCharCode(65 + cycleIndex),
  };
}

function currentOperationPhase() {
  const { localTime } = operationCycleInfo();
  return operationCinematicStages.find((stage) => (
    localTime >= stage.start && localTime < stage.end
  )) ?? operationCinematicStages[operationCinematicStages.length - 1];
}

function getOperationToggleLabel() {
  if (state.operationRunState === 'playing') return '暂停';
  if (state.operationRunState === 'paused') return '继续';
  if (state.operationRunState === 'ended') return '重播';
  return '播放';
}

function getOperationModeLabel() {
  const labels = {
    idle: '待命',
    playing: '流程展示中',
    paused: '暂停中',
    ended: '作业完成',
  };
  return labels[state.operationRunState] ?? '待命';
}

function getOperationProgress() {
  return Math.min(100, Math.max(0, Math.round((state.operationPlaybackTime / state.operationDuration) * 100)));
}

function getOperationTimeLabel() {
  return state.operationPlaybackTime.toFixed(1) + 's / ' + state.operationDuration.toFixed(2) + 's';
}

function currentPayload() {
  return operationPayloads.find((payload) => payload.id === state.selectedPayloadId) ?? operationPayloads[0] ?? null;
}

function formatPayloadStatus(status) {
  const labels = {
    waiting: '待处理',
    queued: '下一目标',
    active: '处理中',
    carried: '搬运中',
    onBelt: '传送中',
    dropping: '落料中',
    collected: '已收料',
    processed: '已完成',
  };
  return labels[status] ?? '待处理';
}

function getPayloadResultLabel(payloadId) {
  const status = state.payloadStatuses[payloadId] ?? 'waiting';
  if (status === 'collected' || status === 'processed') return '已收料';
  if (status === 'dropping') return '落料中';
  if (status === 'onBelt') return '传送中';
  if (status === 'carried') return '夹持中';
  if (status === 'active') return '夹取准备';
  if (state.operationMetrics.gripper === '闭合') return '夹取成功';
  return '等待夹取';
}

function legacyUpdateOperationMetrics() {}

function updateOperationMetrics() {
  const phase = currentOperationPhase();
  const cycle = operationCycleInfo();
  const metricsByPhase = {
    standby: { speed: 0.85, force: 0, jointAngles: [0, -35, 92], gripper: '打开' },
    moveToTarget: { speed: 0.85, force: 4, jointAngles: [32, -18, 104], gripper: '打开' },
    grasp: { speed: 0.85, force: 46, jointAngles: [48, -26, 116], gripper: '闭合' },
    transfer: { speed: 0.85, force: 42, jointAngles: [76, 10, 86], gripper: '闭合' },
    release: { speed: 0.85, force: 8, jointAngles: [88, 8, 74], gripper: '打开' },
    conveyor: { speed: 0.85, force: 0, jointAngles: [88, 8, 74], gripper: '打开' },
    drop: { speed: 0.85, force: 0, jointAngles: [55, -8, 88], gripper: '打开' },
    returnHome: { speed: 0.85, force: 0, jointAngles: [0, -35, 92], gripper: '打开' },
  };
  state.operationMetrics = {
    ...state.operationMetrics,
    ...(metricsByPhase[phase.id] ?? metricsByPhase.standby),
  };
  state.operationStep = phase.step;
  state.operationStepId = phase.id;
  state.operationPhaseId = phase.id;
  state.operationPhaseIndex = cycle.cycleIndex;
  state.selectedPayloadId = cycle.payloadId;

  const logs = [];
  for (let index = 0; index <= cycle.cycleIndex; index += 1) {
    const label = 'Payload ' + String.fromCharCode(65 + index);
    const localLimit = index < cycle.cycleIndex ? cycle.cycleDuration : cycle.localTime;
    operationCinematicStages
      .filter((stage) => localLimit >= stage.start)
      .forEach((stage) => logs.push(label + ': ' + stage.command));
  }
  if (state.operationPlaybackTime >= state.operationDuration) logs.push('Complete');
  state.commandLog = logs.slice(-8);
  if (!state.commandLog.length) state.commandLog = ['Standby'];
}

function renderInitialLists() {
  partTree.innerHTML = parts.map((part) => `
    <button class="tree-item" data-part-id="${part.id}">
      <span></span>
      <strong>${part.name}</strong>
      <small>${part.level}</small>
    </button>
  `).join('');

  stepTimeline.innerHTML = assemblySteps.map((step, index) => `
    <button class="step-item" data-step="${index}">
      <span>${index === 0 ? '00' : String(index).padStart(2, '0')}</span>
      <strong>${step.name}</strong>
      <small>${step.description}</small>
    </button>
  `).join('');
}

function renderTimeline() {
  const timelineTitle = document.querySelector('#timelineTitle');
  if (state.activeTab === 'operation') {
    if (timelineTitle) timelineTitle.textContent = '参考视频作业时间线';
    stepTimeline.innerHTML = operationCinematicStages.map((step, index) => `
      <button class="step-item operation-step" data-step="${index}" disabled>
        <span>${String(index + 1).padStart(2, '0')}</span>
        <strong>${step.name}</strong>
        <small>${step.start.toFixed(0)}s - ${step.end.toFixed(step.end % 1 ? 2 : 0)}s</small>
      </button>
    `).join('');
    return;
  }

  if (timelineTitle) timelineTitle.textContent = '装配流程控制';
  stepTimeline.innerHTML = assemblySteps.map((step, index) => `
    <button class="step-item" data-step="${index}">
      <span>${index === 0 ? '00' : String(index).padStart(2, '0')}</span>
      <strong>${step.name}</strong>
      <small>${step.description}</small>
    </button>
  `).join('');
}

function renderState() {
  scene.setState(state);

  dashboardShell.classList.toggle('model-mode', state.activeTab === 'model');
  dashboardShell.classList.toggle('operation-mode', state.activeTab === 'operation');
  document.querySelector('#sceneTitle').textContent = getSceneTitle();
  renderLeftPanel();
  renderTimeline();
  assessmentPanel.innerHTML = renderAssessment();
  renderActionPanel();
  renderModelPartOverlay();
  const gestureStatus = document.querySelector('#gestureStatus');
  if (gestureStatus) gestureStatus.textContent = getGestureLabel(state.gestureMode);
  if (cameraStatus) cameraStatus.textContent = state.cameraStatus;
  if (cameraToggle) cameraToggle.textContent = state.isCameraRunning ? '停止摄像头识别' : '启用摄像头识别';
  if (cameraPreview) cameraPreview.classList.toggle('active', state.isCameraRunning);
  renderRightPanel();

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === state.activeTab);
  });
  document.querySelectorAll('[data-part-id]').forEach((button) => {
    button.classList.toggle('active', button.dataset.partId === state.selectedPart);
  });
  document.querySelectorAll('[data-step]').forEach((button) => {
    if (state.activeTab === 'operation') {
      button.classList.toggle('active', Number(button.dataset.step) === operationCinematicStages.indexOf(currentOperationPhase()));
    } else {
      button.classList.toggle('active', Number(button.dataset.step) === state.assemblyStep);
    }
  });
  playButton.textContent = state.activeTab === 'operation'
    ? getOperationToggleLabel()
    : '手动装配';
  playButton.disabled = state.activeTab !== 'operation';
  const currentValue = document.querySelector('#currentValue');
  const durationValue = document.querySelector('#durationValue');
  const voltageValue = document.querySelector('#voltageValue');
  const validValue = document.querySelector('#validValue');
  if (state.activeTab === 'operation') {
    if (currentValue) currentValue.textContent = `${getOperationProgress()}%`;
    if (durationValue) durationValue.textContent = getOperationTimeLabel();
    if (voltageValue) voltageValue.textContent = state.operationRunState === 'playing' ? 'ON' : 'HOLD';
    if (validValue) validValue.textContent = state.operationMetrics.cycleCount;
  } else {
    if (currentValue) currentValue.textContent = 135 + state.assemblyStep * 6;
    if (durationValue) durationValue.textContent = 196 + state.assemblyStep * 4;
    if (voltageValue) voltageValue.textContent = 22 + state.assemblyStep;
    if (validValue) validValue.textContent = 184 + state.assemblyStep * 3;
  }
}

function renderLeftPanel() {
  const breadcrumb = leftPanel.querySelector('.breadcrumb');
  const heading = leftPanel.querySelector('h2');
  const groupHeading = leftPanel.querySelector('.tree-group h3');

  if (state.activeTab === 'operation') {
    const step = currentOperationStep();
    const [joint1, joint2, joint3] = state.operationMetrics.jointAngles;
    if (breadcrumb) breadcrumb.textContent = '机械作业 / Web3D 原型';
    if (heading) heading.textContent = '作业监控';
    if (groupHeading) groupHeading.textContent = '机械臂实时状态';
    partTree.innerHTML = `
      <div class="operation-status-stack">
        <article class="operation-state-card">
          <span>MODE</span>
          <strong>${getOperationModeLabel()}</strong>
          <p>当前阶段：${step.name}，播放：${getOperationTimeLabel()}</p>
        </article>
        <div class="joint-gauges">
          ${[
            ['Joint 1', joint1],
            ['Joint 2', joint2],
            ['Joint 3', joint3],
          ].map(([label, value]) => `
            <label>
              <span>${label}</span>
              <strong>${value}°</strong>
              <i style="--meter:${Math.min(100, Math.max(0, (Number(value) + 180) / 360 * 100))}%"></i>
            </label>
          `).join('')}
      </div>
      <div class="gripper-readout">
          <label><span>夹爪状态</span><strong>${state.operationMetrics.gripper}</strong></label>
          <label><span>夹持力</span><strong>${state.operationMetrics.force}N</strong></label>
      </div>
        <div class="force-wave" aria-label="夹持力趋势">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
      </div>
    `;
    return;
  }

  if (breadcrumb) breadcrumb.textContent = state.activeTab === 'assembly'
    ? '装配验证 / Web3D 原型'
    : '机械模型 / Web3D 原型';
  if (heading) heading.textContent = '结构树';
  if (groupHeading) groupHeading.textContent = '机械装配件';
  partTree.innerHTML = parts.map((part) => `
    <button class="tree-item" data-part-id="${part.id}">
      <span></span>
      <strong>${part.name}</strong>
      <small>${part.level}</small>
    </button>
  `).join('');
}

function renderModelPartOverlay() {
  if (state.activeTab !== 'model') {
    modelPartOverlay.innerHTML = '';
    modelPartOverlay.classList.remove('active');
    return;
  }

  const part = selectedPart();
  if (!part) {
    modelPartOverlay.innerHTML = '';
    modelPartOverlay.classList.remove('active');
    return;
  }

  const sceneWidth = modelPartOverlay.parentElement.clientWidth;
  const sceneHeight = modelPartOverlay.parentElement.clientHeight;
  const anchor = state.focusAnchor ?? scene.getPartScreenPosition(part.id) ?? {
    x: sceneWidth * 0.5,
    y: sceneHeight * 0.42,
  };
  const x = Math.min(Math.max(anchor.x + 188, 380), Math.max(420, sceneWidth - 345));
  const y = Math.min(Math.max(anchor.y - 170, 62), Math.max(90, sceneHeight - 250));

  modelPartOverlay.style.setProperty('--overlay-x', `${x}px`);
  modelPartOverlay.style.setProperty('--overlay-y', `${y}px`);
  modelPartOverlay.style.setProperty('--node-x', `${anchor.x}px`);
  modelPartOverlay.style.setProperty('--node-y', `${anchor.y}px`);
  modelPartOverlay.innerHTML = `
    <span class="spatial-node"></span>
    <span class="spatial-line"></span>
    <div class="spatial-info-stack">
      <article class="spatial-card primary">
        <span>FUNCTION</span>
        <h3>功能说明</h3>
        <p>${part.description}</p>
      </article>
      <article class="spatial-card">
        <span>SYSTEM ROLE</span>
        <h3>系统作用</h3>
        <p>${part.role}</p>
      </article>
      <article class="spatial-card compact">
        <span>STRUCTURE</span>
        <h3>结构层级</h3>
        <p>${part.level}</p>
      </article>
    </div>
  `;
  modelPartOverlay.classList.add('active');
}

function renderActionPanel() {
  if (state.activeTab === 'operation') {
    const step = currentOperationStep();
    actionPanel.innerHTML = `
      <div class="operation-control cinematic-control">
        <div class="assembly-action-copy">
          <span>Cinematic Playback</span>
          <h2>${step.name}</h2>
          <p>${step.description}。当前进度 ${getOperationProgress()}%，三物料依次完成抓取、传送和落料。</p>
        </div>
        <div class="operation-buttons">
          <button class="assembly-start-button" data-operation-action="toggle">${getOperationToggleLabel()}</button>
          <button data-operation-action="reset">重播</button>
        </div>
        <div class="cinematic-progress" style="--progress:${getOperationProgress()}%">
          <span></span>
          <strong>${getOperationTimeLabel()}</strong>
        </div>
      </div>
    `;
    return;
  }

  if (state.activeTab !== 'assembly') {
    actionPanel.innerHTML = `
      <h2>设备参数</h2>
      <div class="metric-layout">
        <div class="device-thumb"></div>
        <div class="metrics">
          <label>当前电流 (A)<strong id="currentValue">150</strong></label>
          <label>运行总时长 (H)<strong id="durationValue">210</strong></label>
          <label>当前电压 (V)<strong id="voltageValue">24</strong></label>
          <label>有效运行时长 (H)<strong id="validValue">197</strong></label>
        </div>
      </div>
    `;
    return;
  }

  const step = assemblySteps[state.assemblyStep];
  const part = currentAssemblyPart();
  const complete = isAssemblyComplete();
  const buttonLabel = state.assemblyStarted ? (complete ? '装配完成' : '手动装配中') : '开始装配';


  const buttonDisabled = state.assemblyStarted ? 'disabled' : '';

  actionPanel.innerHTML = `
    <div class="assembly-action">
      <div class="assembly-action-copy">
        <span>Assembly Control</span>
        <h2>${step.name}</h2>
        <p>${state.assemblyStarted ? '按右侧 3D 零件库顺序拖拽当前零件到安装位。' : '点击开始装配后，零件会进入右侧库位，按流程逐步完成装配验证。'}</p>
      </div>
      <button class="assembly-start-button" data-assembly-action="advance" ${buttonDisabled}>${buttonLabel}</button>
      <div class="assembly-action-meta">
        <label><span>流程状态</span><strong>${state.assemblyStarted ? (complete ? '装配完成' : '手动装配中') : '待开始'}</strong></label>
        <label><span>当前步骤</span><strong>${String(state.assemblyStep).padStart(2, '0')}</strong></label>
        <label><span>目标零件</span><strong>${part?.name ?? '完整机械臂'}</strong></label>
      </div>
    </div>
  `;
}

function renderRightPanel() {
  const part = selectedPart();

  if (state.activeTab === 'operation') {
    const step = currentOperationStep();
    document.querySelector('#partName').textContent = '作业展示';
    document.querySelector('#partStatus').textContent = '当前阶段：' + step.name;
    document.querySelector('#partDetails').innerHTML = `
      <div class="operation-monitor">
        <section class="velocity-card">
          <span>CINEMATIC</span>
          <strong>${getOperationProgress()}%</strong>
          <small>${getOperationTimeLabel()} · 3 物料循环 27s</small>
        </section>
        <div class="cinematic-readout">
          <label><span>播放状态</span><strong>${getOperationModeLabel()}</strong></label>
          <label><span>镜头模式</span><strong>固定参考视角</strong></label>
          <label><span>交互状态</span><strong>仅展示</strong></label>
          <label><span>物料状态</span><strong>${getPayloadResultLabel(state.selectedPayloadId)}</strong></label>
        </div>
        <dl>
          <dt>复刻内容</dt><dd>机械臂、物料台、传送带、收料区</dd>
          <dt>夹爪状态</dt><dd>${state.operationMetrics.gripper}</dd>
          <dt>流程提示</dt><dd>${state.operationRunState === 'ended' ? '作业完成，可重播' : step.description}</dd>
        </dl>
        <div class="command-terminal">
          <strong>COMMAND TERMINAL</strong>
          ${state.commandLog.slice(-8).map((item, index, list) => `<p class="${index === list.length - 1 ? 'latest' : ''}">&gt;&gt; ${item}</p>`).join('')}
        </div>
      </div>
    `;
    return;
  }

  if (state.activeTab === 'assembly') {
    const step = assemblySteps[state.assemblyStep];
    const stepPart = currentAssemblyPart();
    const completedCount = installedCount();
    const pendingCount = state.assemblyStarted ? Math.max(0, parts.length - completedCount) : parts.length;
    document.querySelector('#partName').textContent = '3D 零件库';
    document.querySelector('#partStatus').textContent = stepPart
      ? '当前目标：' + stepPart.name
      : '初始检查：完整机械臂';
    document.querySelector('#partDetails').innerHTML = `
      <div class="assembly-status-panel">
        <div class="library-note">
          <strong>${state.assemblyStarted ? '从库中拖拽零件进行手动装配' : '初始检查保持完整装配态'}</strong>
          <p>${state.assemblyStarted ? '请按底部流程顺序装配，正确位置会自动吸附。' : '点击开始装配后，所有部件会移动到右侧 3D 零件库。'}</p>
        </div>
        ${renderAssemblyLibraryStage(stepPart)}
        <p class="library-direction">取件路径：右侧库位 → 中央机械臂安装点</p>
        <dl>
          <dt>当前步骤</dt><dd>${step.name}</dd>
          <dt>当前目标</dt><dd>${stepPart?.name ?? '未开始'}</dd>
          <dt>已装配</dt><dd>${completedCount} / ${parts.length}</dd>
          <dt>库中待装</dt><dd>${pendingCount} / ${parts.length}</dd>
        </dl>
      </div>
    `;
    return;
  }

  document.querySelector('#partName').textContent = part?.name ?? '未选择零件';
  document.querySelector('#partStatus').textContent = part
    ? `机械模型：正在查看 ${part.level}`
    : '旋转模型时会自动识别靠近视角中心的部件';

  document.querySelector('#partDetails').innerHTML = part
    ? `
      <div class="model-focus-card">
        <span>Auto Focus</span>
        <strong>${part.name}</strong>
        <p>拖拽、滚轮或手势调整视角时，系统会自动捕捉最接近观看中心的机械部件。</p>
      </div>
      <dl>
        <dt>功能说明</dt><dd>${part.description}</dd>
        <dt>系统作用</dt><dd>${part.role}</dd>
        <dt>结构层级</dt><dd>${part.level}</dd>
        <dt>装配步骤</dt><dd>${part.stepName}</dd>
      </dl>
    `
    : `
      <div class="empty-state">
        <strong>等待聚焦</strong>
        <p>拖拽旋转模型，或直接点击 3D 模型中的零件查看信息。</p>
      </div>
    `;
}

function renderAssessment() {
  if (state.activeTab === 'operation') {
    const completion = getOperationProgress();
    const riskTone = state.errorCount > 0 ? 'risk' : 'ok';
    return `
      <div class="assessment-grid">
        <label><span>完成度</span><strong>${completion}%</strong></label>
        <label><span>展示次数</span><strong>${state.operationMetrics.cycleCount}</strong></label>
        <label><span>异常数</span><strong class="${riskTone}">${state.errorCount}</strong></label>
        <label><span>播放时间</span><strong>${getOperationTimeLabel()}</strong></label>
        <label><span>夹持力</span><strong>${state.operationMetrics.force}N</strong></label>
        <label><span>模式</span><strong>仅展示</strong></label>
      </div>
      <div class="warning-box ${riskTone}">
        <span></span>
        <p>${state.lastWarning}</p>
      </div>
    `;
  }

  const completion = state.assemblyStarted ? Math.round((installedCount() / parts.length) * 100) : 0;
  const riskTone = state.errorCount > 0 ? 'risk' : 'ok';
  const title = state.activeTab === 'model'
    ? '机械模型模式：右侧说明面板会同步显示部件信息。'
    : state.lastWarning;
  return `
    <div class="assessment-grid">
      <label><span>完成度</span><strong>${completion}%</strong></label>
      <label><span>交互次数</span><strong>${state.operationCount}</strong></label>
      <label><span>风险事件</span><strong class="${riskTone}">${state.errorCount}</strong></label>
      <label><span>最近手势</span><strong>${state.lastGesture}</strong></label>
      <label><span>输入来源</span><strong>${state.gestureSource}</strong></label>
      <label><span>识别置信度</span><strong>${state.gestureConfidence}</strong></label>
    </div>
    <div class="warning-box ${riskTone}">
      <span></span>
      <p>${title}</p>
    </div>
  `;
}

function renderPartConstraints(partId) {
  return (partConstraints[partId] ?? ['暂无约束配置'])
    .map((item) => `<span class="constraint-chip">${item}</span>`)
    .join('');
}

function renderAssemblyLibraryStage(stepPart) {
  return `
    <div class="library-stage" aria-label="3D 零件库槽位">
      ${parts.map((part) => {
        const stepIndex = assemblySteps.findIndex((step) => step.partId === part.id);
        const isCurrent = state.assemblyStarted && part.id === stepPart?.id;
        const status = state.partStatuses[part.id];
        const isInstalled = state.assemblyStarted && status === 'installed';
        const isWrong = state.assemblyStarted && status === 'placedWrong';
        const showPreview = state.assemblyStarted && !isInstalled;
        return `
          <div class="library-slot ${isCurrent ? 'current' : isInstalled ? 'installed' : isWrong ? 'wrong' : ''}" data-library-slot-part-id="${part.id}">
            <span>${String(stepIndex).padStart(2, '0')}</span>
            ${showPreview ? `<i class="library-part-preview part-preview-${part.id}" aria-hidden="true"></i>` : ''}
            <strong>${part.name}</strong>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function selectedPart() {
  return parts.find((part) => part.id === state.selectedPart);
}

function renderPartsLibrary() {
  return `
    <div class="parts-library">
      <div class="library-note">
        <strong>3D 零件库</strong>
        <p>${state.assemblyStarted ? '当前步骤零件会在库中高亮。' : '点击开始装配后，从基座开始依次抓取。'}</p>
      </div>
      <div class="library-list">
        ${parts.map((part) => {
          const stepIndex = assemblySteps.findIndex((step) => step.partId === part.id);
          const isCurrent = state.assemblyStarted && stepIndex === state.assemblyStep;
          const isCompleted = state.assemblyStarted && stepIndex > 0 && stepIndex < state.assemblyStep;
          const status = isCurrent ? '待抓取' : isCompleted ? '已装配' : '待命';
          const className = isCurrent ? 'current' : isCompleted ? 'completed' : 'pending';
          return `
            <button class="library-item ${className}" data-library-part-id="${part.id}">
              <span class="library-index">${String(stepIndex).padStart(2, '0')}</span>
              <span>
                <strong>${part.name}</strong>
                <small>${part.level}</small>
              </span>
              <em>${status}</em>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function getGestureLabel(mode) {
  const labels = {
    idle: 'Gesture Idle',
    tracking: 'Gesture Tracking',
    active: 'Gesture Active',
    paused: 'Gesture Paused',
  };
  return labels[mode] ?? 'Gesture Idle';
}

function getSceneTitle() {
  if (state.activeTab === 'assembly') return 'Assembly Validation';
  if (state.activeTab === 'operation') return 'Mechanical Operation';
  return 'Mechanical Model';
}

function setActiveTab(tab) {
  stopPlayback();
  stopOperationPlayback();
  state.activeTab = tab;

  if (tab === 'assembly') {
    state.viewMode = 'assembly';
    state.assemblyStep = 0;
    state.assemblyStarted = false;
    state.selectedPart = null;
    state.focusAnchor = null;
    resetAssemblyParts('inspection');
    state.lastWarning = '装配验证：初始检查显示完整机械臂，点击开始装配后零件进入右侧 3D 零件库。';
  }

  if (tab === 'operation') {
    state.viewMode = 'operation';
    state.selectedPart = null;
    state.focusAnchor = null;
    resetOperationState();
    state.lastWarning = '机械作业：已进入待命画面，点击播放后开始 27 秒三物料完整作业循环。';
  }

  if (tab === 'model') {
    state.viewMode = 'normal';
    state.assemblyStarted = false;
    state.assemblyStep = 0;
    resetAssemblyParts('inspection');
    state.selectedPart = state.selectedPart ?? 'base';
    state.focusAnchor = scene.getPartScreenPosition(state.selectedPart);
    state.lastWarning = '机械模型首页：拖拽或使用手势旋转模型，视角靠近的部件会自动显示信息。';
  }

  renderState();
}

function setAssemblyStep(step) {
  registerInteraction();
  state.viewMode = 'assembly';
  state.activeTab = 'assembly';
  const hintStep = Math.max(0, Math.min(step, assemblySteps.length - 1));
  const stepPart = assemblySteps[hintStep].partId;
  state.selectedPart = stepPart ?? null;
  state.focusAnchor = state.selectedPart ? scene.getPartScreenPosition(state.selectedPart) : null;
  if (!state.assemblyStarted) {
    state.assemblyStep = 0;
    state.lastWarning = '初始检查：模型保持完整装配态，点击开始装配后才能从右侧零件库拖拽装配。';
  } else {
    const current = currentAssemblyPart();
    state.lastWarning = stepPart
      ? '步骤提示：请按当前目标继续装配。'
      : '初始检查提示：当前装配仍需继续。';
  }
  renderState();
}

function setSelectedPart(partId, anchor = null) {
  registerInteraction();
  state.selectedPart = partId;
  state.focusAnchor = anchor ?? scene.getPartScreenPosition(partId);
  state.manualSelectionUntil = performance.now() + 1800;
  state.lastWarning = (selectedPart()?.name ?? '零件') + ' 已选中，约束信息已同步到右侧面板。';
  renderState();
}

function advanceAssembly() {
  registerInteraction();
  stopPlayback();
  if (state.assemblyStarted) {
    state.lastWarning = isAssemblyComplete()
      ? '装配校验完成：所有零件已吸附到正确安装位。'
      : '手动装配进行中：请继续拖拽当前目标零件。';
    renderState();
    return;
  }

  startManualAssembly();
  state.lastWarning = '开始装配：所有零件已进入右侧 3D 零件库，请先拖拽当前目标零件。';
  renderState();
}

function handlePartDropped({ partId, installed, nearTarget, expectedPartId, position }) {
  if (!state.assemblyStarted) return;

  registerInteraction();
  const part = parts.find((item) => item.id === partId);
  const expected = parts.find((item) => item.id === expectedPartId);
  state.selectedPart = partId;
  state.focusAnchor = scene.getPartScreenPosition(partId);

  if (installed) {
    state.partStatuses[partId] = 'installed';
    delete state.partPositions[partId];

    if (isAssemblyComplete()) {
      state.selectedPart = null;
      state.lastWarning = '装配完成：所有零件已按顺序安装并吸附到正确位置。';
    } else {
      const nextStep = assemblySteps.findIndex((step, index) => index > state.assemblyStep && step.partId);
      state.assemblyStep = nextStep > 0 ? nextStep : state.assemblyStep;
      state.selectedPart = assemblySteps[state.assemblyStep]?.partId ?? null;
      state.lastWarning = '安装正确：零件已吸附到安装位。请继续下一步。';
    }
    renderState();
    return;
  }

  state.errorCount += 1;
  state.partStatuses[partId] = 'placedWrong';
  state.partPositions[partId] = position;
  state.lastWarning = partId !== expectedPartId
    ? '顺序错误：请先装配当前目标零件。'
    : '位置错误：零件未放到正确安装位，请重新拖拽调整。';
  renderState();
}

function grabLibraryPart(partId) {
  const stepIndex = assemblySteps.findIndex((step) => step.partId === partId);
  if (stepIndex <= 0) return;
  registerInteraction();
  stopPlayback();
  state.viewMode = 'assembly';
  state.activeTab = 'assembly';
  state.assemblyStarted = true;
  state.assemblyStep = stepIndex;
  state.selectedPart = partId;
  state.focusAnchor = scene.getPartScreenPosition(partId);
  const part = selectedPart();
  state.lastWarning = '已从零件库抓取零件，当前装配步骤已同步。';
  renderState();
}

function resetPrototype() {
  stopPlayback();
  state.viewMode = 'assembly';
  state.activeTab = 'assembly';
  state.selectedPart = null;
  state.focusAnchor = null;
  state.manualSelectionUntil = 0;
  state.gestureMode = 'idle';
  state.assemblyStep = 0;
  state.assemblyStarted = false;
  resetAssemblyParts('inspection');
  state.operationCount = 0;
  state.errorCount = 0;
  state.lastWarning = '已重置到初始检查：点击开始装配后零件进入右侧零件库。';
  state.lastGesture = '未触发';
  scene.resetCamera();
  renderState();
}

function togglePlayback() {
  if (state.activeTab === 'operation') {
    toggleOperationPlayback();
    return;
  }
  stopPlayback();
  state.lastWarning = '自动播放已禁用：当前模块需要用户从右侧 3D 零件库手动拖拽零件完成装配。';
  renderState();
}

function stopPlayback() {
  state.isPlaying = false;
  if (playTimer) {
    window.clearInterval(playTimer);
    playTimer = null;
  }
}

function toggleOperationPlayback() {
  registerInteraction();
  if (state.operationRunState === 'playing') {
    stopOperationPlayback();
    state.operationRunState = 'paused';
    state.lastWarning = '机械作业已暂停：当前姿态已冻结。';
    renderState();
    return;
  }

  if (state.operationRunState === 'idle' || state.operationRunState === 'ended') {
    startOperation();
  } else {
    state.operationPlaying = true;
    state.operationRunState = 'playing';
    state.operationLastTick = performance.now();
    state.lastWarning = '继续作业：从当前阶段继续执行。';
    scheduleOperationTick();
  }
  renderState();
}

function resetOperationState() {
  state.operationStarted = false;
  state.operationPlaying = false;
  state.operationRunState = 'idle';
  state.operationPlaybackTime = 0;
  state.operationLastTick = 0;
  state.operationUiTick = 0;
  state.operationStep = 0;
  state.operationStepId = operationCinematicStages[0].id;
  state.operationPhaseIndex = 0;
  state.operationPhaseId = operationCinematicStages[0].id;
  state.queuedPayloadId = null;
  state.selectedPayloadId = operationPayloads[0]?.id ?? null;
  state.payloadStatuses = Object.fromEntries(operationPayloads.map((payload) => [payload.id, payload.id === 'payloadA' ? 'active' : 'waiting']));
  state.commandLog = ['Standby'];
  updateOperationMetrics();
}

function startOperation() {
  if (state.operationRunState === 'ended' || state.operationPlaybackTime >= state.operationDuration) {
    resetOperationState();
  }
  state.operationStarted = true;
  state.operationPlaying = true;
  state.operationRunState = 'playing';
  state.operationLastTick = performance.now();
  state.lastWarning = '机械作业展示开始：自动执行抓取、搬运、释放、传送、落料与复位。';
  updateOperationMetrics();
  scheduleOperationTick();
}

function stopOperationPlayback() {
  state.operationPlaying = false;
  if (operationTimer) {
    window.cancelAnimationFrame(operationTimer);
    operationTimer = null;
  }
}

function scheduleOperationTick() {
  if (!state.operationPlaying) return;
  if (operationTimer) window.cancelAnimationFrame(operationTimer);
  operationTimer = window.requestAnimationFrame((now) => {
    const delta = Math.min(0.08, Math.max(0, (now - state.operationLastTick) / 1000));
    state.operationLastTick = now;
    state.operationPlaybackTime = Math.min(state.operationDuration, state.operationPlaybackTime + delta);
    updateOperationMetrics();
    applyOperationStepEffects();
    if (state.operationPlaybackTime >= state.operationDuration) {
      state.operationPlaybackTime = state.operationDuration;
      state.operationPlaying = false;
      state.operationRunState = 'ended';
      state.operationMetrics.cycleCount += 1;
      ['payloadA', 'payloadB', 'payloadC'].forEach((payloadId) => {
        state.payloadStatuses[payloadId] = 'collected';
      });
      state.lastWarning = '作业完成：3 个物料已全部送入收料箱。点击重播可重新展示。';
      renderState();
      return;
    }
    if (now - state.operationUiTick > 180) {
      state.operationUiTick = now;
      renderState();
    }
    scheduleOperationTick();
  });
}

function advanceOperationStep({ manual = false } = {}) {
  if (manual) registerInteraction();
  stopOperationPlayback();
  state.operationPlaybackTime = Math.min(state.operationDuration, state.operationPlaybackTime + 3);
  state.operationRunState = state.operationPlaybackTime >= state.operationDuration ? 'ended' : 'paused';
  updateOperationMetrics();
  applyOperationStepEffects();
  state.lastWarning = '已跳转到下一展示阶段。';
  renderState();
}

function legacyApplyOperationStepEffects() {
  const phase = currentOperationPhase();
  state.payloadStatuses = {
    payloadA: ['transfer'].includes(phase.id) ? 'carried'
      : ['release', 'conveyor'].includes(phase.id) ? 'onBelt'
        : phase.id === 'returnHome' ? 'collected' : 'active',
    payloadB: 'waiting',
    payloadC: 'waiting',
    payloadD: 'waiting',
  };
}

function applyOperationStepEffects() {
  const phase = currentOperationPhase();
  const cycle = operationCycleInfo();
  const statuses = {
    payloadA: 'waiting',
    payloadB: 'waiting',
    payloadC: 'waiting',
    payloadD: 'waiting',
  };

  ['payloadA', 'payloadB', 'payloadC'].forEach((payloadId, index) => {
    if (index < cycle.cycleIndex || state.operationPlaybackTime >= state.operationDuration) {
      statuses[payloadId] = 'collected';
      return;
    }
    if (index > cycle.cycleIndex) {
      statuses[payloadId] = 'waiting';
      return;
    }
    if (phase.id === 'transfer') statuses[payloadId] = 'carried';
    else if (phase.id === 'release' || phase.id === 'conveyor') statuses[payloadId] = 'onBelt';
    else if (phase.id === 'drop') statuses[payloadId] = 'dropping';
    else if (phase.id === 'returnHome') statuses[payloadId] = 'collected';
    else statuses[payloadId] = 'active';
  });

  state.payloadStatuses = statuses;
}

function resetOperation() {
  stopOperationPlayback();
  state.activeTab = 'operation';
  state.viewMode = 'operation';
  resetOperationState();
  state.operationMetrics.cycleCount = 0;
  state.lastWarning = '机械作业已重置：将从 0 秒重新播放。';
  startOperation();
  renderState();
}

function selectOperationPayload(payloadId) {
  const payload = operationPayloads.find((item) => item.id === payloadId);
  if (!payload) return;
  registerInteraction();

  if (state.operationPlaying && state.selectedPayloadId !== payloadId) {
    state.queuedPayloadId = payloadId;
    state.payloadStatuses[payloadId] = 'queued';
    state.lastWarning = '已设置下一目标，当前作业完成后自动切换。';
  } else {
    state.selectedPayloadId = payloadId;
    if (!state.operationStarted) {
      state.payloadStatuses = Object.fromEntries(operationPayloads.map((item) => [item.id, item.id === payloadId ? 'active' : 'waiting']));
    }
    state.lastWarning = '目标物料已选择。';
  }
  renderState();
}

function handleGestureEvent(event) {
  state.gestureMode = event.type === 'pause' ? 'paused' : 'active';
  state.lastGesture = gestureActions.find((action) => action.type === event.type)?.label ?? event.type;
  state.gestureSource = event.source === 'camera-hand-tracking' ? '摄像头识别' : '模拟输入';
  state.gestureConfidence = typeof event.confidence === 'number' ? `${Math.round(event.confidence * 100)}%` : '--';

  if (!event.continuous) registerInteraction();

  if (event.type === 'rotate') {
    const direction = event.direction === 'counterClockwise' ? -1 : 1;
    const amount = event.continuous ? event.intensity * direction : 0.45;
    scene.applyGestureRotate(amount);
  }
  if (event.type === 'flip') {
    const direction = event.direction === 'up' ? -1 : 1;
    const amount = event.continuous ? event.intensity * direction : 0.22;
    scene.applyGestureFlip(amount);
  }
  if (event.type === 'zoomIn') scene.applyGestureZoomIn(event.continuous ? event.intensity : 0.08);
  if (event.type === 'zoomOut') scene.applyGestureZoomOut(event.continuous ? event.intensity : 0.08);
  if (event.type === 'select') {
    const nextIndex = state.selectedPart
      ? (parts.findIndex((part) => part.id === state.selectedPart) + 1) % parts.length
      : 0;
    state.selectedPart = parts[nextIndex].id;
    state.focusAnchor = scene.getPartScreenPosition(state.selectedPart);
  }
  if (event.type === 'toggleAssembly') {
    state.activeTab = 'assembly';
    state.viewMode = 'assembly';
    state.assemblyStep = 0;
    state.assemblyStarted = false;
    state.selectedPart = null;
    state.focusAnchor = null;
    resetAssemblyParts('inspection');
    state.lastWarning = '手势已切换到装配验证：当前为初始检查。';
  }
  if (event.type === 'pause') stopPlayback();
  const detail = (event.type === 'rotate' || event.type === 'flip') && event.direction
    ? `锛屾柟鍚戯細${formatGestureDirection(event)}`
    : '';
  state.lastWarning = '已接收手势：' + state.lastGesture + detail + '，并转换为标准 3D 交互事件。';

  if (event.continuous) {
    renderGestureTelemetry();
  } else {
    renderState();
  }
  if (event.type !== 'pause') {
    window.setTimeout(() => {
      if (!state.isPlaying && state.gestureMode === 'active') {
        state.gestureMode = 'tracking';
        renderState();
      }
    }, 900);
  }
}

function registerInteraction() {
  state.operationCount += 1;
}

function renderGestureTelemetry() {
  const gestureStatus = document.querySelector('#gestureStatus');
  if (gestureStatus) gestureStatus.textContent = getGestureLabel(state.gestureMode);
  if (cameraStatus) cameraStatus.textContent = state.cameraStatus;
  assessmentPanel.innerHTML = renderAssessment();
}

function formatGestureDirection(event) {
  if (event.type === 'rotate') return event.direction === 'counterClockwise' ? '逆时针' : '顺时针';
  if (event.type === 'flip') return event.direction === 'up' ? '上翻' : '下翻';
  return event.direction;
}

topTabs.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tab]');
  if (!button) return;
  setActiveTab(button.dataset.tab);
});

partTree.addEventListener('click', (event) => {
  const button = event.target.closest('[data-part-id]');
  if (button) setSelectedPart(button.dataset.partId);
});

stepTimeline.addEventListener('click', (event) => {
  const button = event.target.closest('[data-step]');
  if (!button) return;
  if (state.activeTab === 'operation') {
    return;
  }
  setAssemblyStep(Number(button.dataset.step));
});

actionPanel.addEventListener('click', (event) => {
  const button = event.target.closest('[data-assembly-action]');
  if (button?.dataset.assemblyAction === 'advance') advanceAssembly();
  const operationButton = event.target.closest('[data-operation-action]');
  if (!operationButton) return;
  const action = operationButton.dataset.operationAction;
  if (action === 'toggle') toggleOperationPlayback();
  if (action === 'step') {
    stopOperationPlayback();
    advanceOperationStep({ manual: true });
  }
  if (action === 'reset') resetOperation();
});

actionPanel.addEventListener('input', (event) => {
  const input = event.target.closest('[data-operation-speed]');
  if (!input) return;
  state.operationSpeed = Number(input.value);
  if (state.operationPlaying) scheduleOperationTick();
  renderState();
});

document.querySelector('.right-panel').addEventListener('click', (event) => {
  const button = event.target.closest('[data-library-part-id]');
  if (button) grabLibraryPart(button.dataset.libraryPartId);
  const payloadButton = event.target.closest('[data-payload-id]');
  if (payloadButton) selectOperationPayload(payloadButton.dataset.payloadId);
});

document.querySelector('.right-panel').addEventListener('pointerdown', (event) => {
  const slot = event.target.closest('[data-library-slot-part-id]');
  if (!slot || !state.assemblyStarted) return;
  const partId = slot.dataset.librarySlotPartId;
  if (state.partStatuses[partId] === 'installed') return;
  registerInteraction();
  state.selectedPart = partId;
  state.focusAnchor = scene.getPartScreenPosition(partId);
  scene.beginDragFromLibrary(partId, event);
  event.preventDefault();
  renderState();
});

playButton.addEventListener('click', togglePlayback);
resetButton.addEventListener('click', () => {
  if (state.activeTab === 'operation') {
    resetOperation();
    return;
  }
  resetPrototype();
});

cameraToggle.addEventListener('click', async () => {
  if (state.isCameraRunning) {
    gestureAdapter.stopCamera();
    return;
  }

  try {
    await gestureAdapter.startCamera(cameraPreview);
  } catch (error) {
    state.isCameraRunning = false;
    state.gestureMode = 'idle';
    state.cameraStatus = `摄像头启动失败：${error.message ?? '请检查权限或设备'}`;
    renderState();
  }
});

window.addEventListener('keydown', (event) => {
  const map = {
    Digit1: 'rotate',
    Digit2: 'zoomIn',
    Digit3: 'select',
    Digit4: 'toggleAssembly',
    Digit6: 'pause',
    Digit7: 'zoomOut',
    Digit8: 'flip',
  };
  if (map[event.code]) gestureAdapter.emit(map[event.code]);
});

renderInitialLists();
renderState();
