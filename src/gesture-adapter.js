import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export class GestureAdapter {
  constructor({ onEvent, onStatus }) {
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.video = null;
    this.stream = null;
    this.handLandmarker = null;
    this.running = false;
    this.lastVideoTime = -1;
    this.lastEmitAt = 0;
    this.lastContinuousEmitAt = 0;
    this.lastHandsDistance = null;
    this.lastHandsCenterX = null;
    this.lastHandsCenterY = null;
    this.lastPalmX = null;
    this.lastPalmY = null;
    this.stableGesture = null;
    this.stableCount = 0;
    this.rafId = null;
  }

  emit(type, metadata = {}) {
    this.onEvent({
      type,
      source: metadata.source ?? 'prototype-simulator',
      confidence: metadata.confidence ?? 1,
      timestamp: performance.now(),
    });
  }

  async startCamera(video) {
    this.video = video;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器环境不支持摄像头访问，请使用 http://127.0.0.1:5173 或 localhost 打开');
    }

    this.setStatus('initializing', '正在请求摄像头权限');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
      },
      audio: false,
    });

    this.video.srcObject = this.stream;
    await this.video.play();
    this.setStatus('initializing', '摄像头已启动，正在加载手势识别模型');

    try {
      if (!this.handLandmarker) {
        const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm');
        this.handLandmarker = await this.createHandLandmarker(vision, 'GPU');
      }
    } catch (error) {
      this.setStatus('initializing', 'GPU 初始化失败，正在切换 CPU 识别');
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm');
      this.handLandmarker = await this.createHandLandmarker(vision, 'CPU');
    }

    this.running = true;
    this.setStatus('tracking', '摄像头识别已启动');
    this.detectLoop();
  }

  async createHandLandmarker(vision, delegate) {
    return HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate,
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.58,
      minHandPresenceConfidence: 0.58,
      minTrackingConfidence: 0.52,
    });
  }

  stopCamera() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.lastHandsDistance = null;
    this.lastHandsCenterX = null;
    this.lastHandsCenterY = null;
    this.lastPalmX = null;
    this.lastPalmY = null;
    this.setStatus('idle', '摄像头识别已停止');
  }

  detectLoop() {
    if (!this.running || !this.video || !this.handLandmarker) return;

    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const result = this.handLandmarker.detectForVideo(this.video, performance.now());
      this.handleHands(result.landmarks ?? []);
    }

    this.rafId = requestAnimationFrame(() => this.detectLoop());
  }

  handleHands(hands) {
    if (!hands.length) {
      this.setStatus('tracking', '等待手部进入画面');
      this.lastHandsDistance = null;
      this.lastHandsCenterX = null;
      this.lastHandsCenterY = null;
      this.lastPalmX = null;
      this.lastPalmY = null;
      return;
    }

    this.setStatus('active', `识别到 ${hands.length} 只手`);

    if (hands.length >= 2) {
      this.handleTwoHands(hands[0], hands[1]);
      return;
    }

    this.lastHandsDistance = null;
    this.lastHandsCenterX = null;
    this.lastHandsCenterY = null;
    this.handleSingleHand(hands[0]);
  }

  handleTwoHands(leftHand, rightHand) {
    const distance = Math.abs(leftHand[0].x - rightHand[0].x);
    const centerX = (leftHand[0].x + rightHand[0].x) * 0.5;
    const centerY = (leftHand[0].y + rightHand[0].y) * 0.5;
    if (
      this.lastHandsDistance === null ||
      this.lastHandsCenterX === null ||
      this.lastHandsCenterY === null
    ) {
      this.lastHandsDistance = distance;
      this.lastHandsCenterX = centerX;
      this.lastHandsCenterY = centerY;
      return;
    }

    const deltaDistance = distance - this.lastHandsDistance;
    const deltaX = centerX - this.lastHandsCenterX;
    const deltaY = centerY - this.lastHandsCenterY;
    const absDistance = Math.abs(deltaDistance);
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const dominantMotion = Math.max(absX, absY);

    this.lastHandsDistance = distance;
    this.lastHandsCenterX = centerX;
    this.lastHandsCenterY = centerY;

    if (absY > 0.008 && absY > absX * 1.08 && absY > absDistance * 0.82) {
      this.emitContinuous('flip', {
        delta: deltaY,
        direction: deltaY < 0 ? 'up' : 'down',
        intensity: clamp(absY * 10, 0.04, 0.34),
        confidence: 0.84,
      });
      return;
    }

    if (absDistance > 0.012 && absDistance > dominantMotion * 1.35) {
      this.emitContinuous(deltaDistance > 0 ? 'zoomIn' : 'zoomOut', {
        delta: deltaDistance,
        intensity: clamp(absDistance * 18, 0.05, 0.45),
        confidence: 0.9,
      });
      return;
    }

    if (absX > 0.007 && absX > absY * 1.12) {
      this.emitContinuous('rotate', {
        delta: deltaX,
        direction: deltaX > 0 ? 'clockwise' : 'counterClockwise',
        intensity: clamp(absX * 12, 0.05, 0.46),
        confidence: 0.82,
      });
      return;
    }

    if (absY > 0.007 && absY > absX * 1.12) {
      this.emitContinuous('flip', {
        delta: deltaY,
        direction: deltaY < 0 ? 'up' : 'down',
        intensity: clamp(absY * 10, 0.04, 0.34),
        confidence: 0.82,
      });
    }
  }

  handleSingleHand(hand) {
    const fingers = getExtendedFingers(hand);
    const palmX = hand[0].x;
    const palmY = hand[0].y;

    if (fingers.extendedCount === 0) {
      this.emitStable('pause', 6, 1500, 0.84);
      this.lastPalmX = palmX;
      this.lastPalmY = palmY;
      return;
    }

    if (fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) {
      this.emitStable('select', 5, 1300, 0.82);
      this.lastPalmX = palmX;
      this.lastPalmY = palmY;
      return;
    }

    if (fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) {
      this.emitStable('toggleAssembly', 8, 1800, 0.8);
      this.lastPalmX = palmX;
      this.lastPalmY = palmY;
      return;
    }

    this.lastPalmX = palmX;
    this.lastPalmY = palmY;
  }

  emitStable(type, requiredFrames, cooldown, confidence) {
    if (this.stableGesture === type) {
      this.stableCount += 1;
    } else {
      this.stableGesture = type;
      this.stableCount = 1;
    }

    if (this.stableCount >= requiredFrames) {
      this.emitThrottled(type, cooldown, confidence);
      this.stableCount = 0;
    }
  }

  emitThrottled(type, cooldown, confidence) {
    const now = performance.now();
    if (now - this.lastEmitAt < cooldown) return;
    this.lastEmitAt = now;
    this.emit(type, {
      source: 'camera-hand-tracking',
      confidence,
    });
  }

  emitContinuous(type, metadata) {
    const now = performance.now();
    if (now - this.lastContinuousEmitAt < 32) return;
    this.lastContinuousEmitAt = now;
    this.emit(type, {
      source: 'camera-hand-tracking',
      continuous: true,
      ...metadata,
    });
  }

  setStatus(mode, message) {
    this.onStatus?.({ mode, message });
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getExtendedFingers(hand) {
  const fingerOpen = (tip, pip) => hand[tip].y < hand[pip].y - 0.018;
  const index = fingerOpen(8, 6);
  const middle = fingerOpen(12, 10);
  const ring = fingerOpen(16, 14);
  const pinky = fingerOpen(20, 18);
  const thumb = Math.abs(hand[4].x - hand[2].x) > 0.055;
  const extendedCount = [thumb, index, middle, ring, pinky].filter(Boolean).length;

  return {
    thumb,
    index,
    middle,
    ring,
    pinky,
    extendedCount,
  };
}
