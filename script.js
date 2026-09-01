// Smooth rotating particle starfield / galaxy effect
// + hand-gesture morph: closed fist -> heart, open hand / no hands -> galaxy
//
// Uses MediaPipe Tasks Vision (current, actively-maintained API) instead of
// the old @mediapipe/hands + camera_utils packages, which are legacy and
// frequently fail to load reliably from CDN.

const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');

let width, height, centerX, centerY;

function resize() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
  centerX = width / 2;
  centerY = height / 2;
}
window.addEventListener('resize', resize);
resize();

// ---- Config ----
const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia('(max-width: 768px)').matches;
const PARTICLE_COUNT = IS_MOBILE ? 500 : 900;
const ROTATION_SPEED = IS_MOBILE ? 0.0007 : 0.0009;      // radians per frame, base speed
const DEPTH = IS_MOBILE ? 1000 : 1200;                 // max z depth
const FOCAL_LENGTH = 400;           // projection focal length
const GALAXY_ARMS = 3;              // spiral arm count
const GALAXY_TWIST = IS_MOBILE ? 4.1 : 4.5;           // how tightly arms spiral
const MAX_RADIUS = Math.min(window.innerWidth, window.innerHeight) * 0.55;

// Morph config
const MORPH_LERP = 0.06;            // how fast particles ease toward their target shape (0-1)
const HEART_SCALE = Math.min(window.innerWidth, window.innerHeight) * 0.026;

let particles = [];
let globalAngle = 0;
let heartSpin = 0;
let mouseX = 0, mouseY = 0;
let targetTiltX = 0, targetTiltY = 0;
let tiltX = 0, tiltY = 0;

// Rotation state driven by hand gesture: normal spin, slow spin, pause, or reverse.
let rotationVelocity = 1;
let targetRotationVelocity = 1;
let rotationMode = 'normal';

// morphState: 0 = full galaxy, 1 = full heart. We ease toward morphTarget every frame.
let morphState = 0;
let morphTarget = 0;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

// Parametric heart curve (2D), extruded slightly in z for a bit of volume
function heartPoint(t, jitter) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
  return {
    x: x * HEART_SCALE + rand(-jitter, jitter),
    y: y * HEART_SCALE + rand(-jitter, jitter),
    z: rand(-40, 40)
  };
}

function createParticle(i) {
  const arm = i % GALAXY_ARMS;
  const armOffset = (arm / GALAXY_ARMS) * Math.PI * 2;
  const t = Math.random();
  const radius = t * MAX_RADIUS * rand(0.85, 1.15);
  const spiralAngle = armOffset + t * GALAXY_TWIST + rand(-0.35, 0.35);

  const gx = Math.cos(spiralAngle) * radius;
  const gy = Math.sin(spiralAngle) * radius;
  const gz = rand(-DEPTH / 2, DEPTH / 2);
  const thickness = rand(-40, 40) * (1 - t * 0.5);

  const heartT = rand(0, Math.PI * 2);
  const fillBias = Math.random() < 0.65 ? 1 : rand(0.4, 0.95);
  const hp = heartPoint(heartT, 6);
  const heart = {
    x: hp.x * fillBias,
    y: hp.y * fillBias,
    z: hp.z
  };

  return {
    x: gx, y: gy, z: gz,
    galaxy: { x: gx, y: gy, z: gz },
    heart,
    thickness,
    t,
    size: rand(0.6, 2.2),
    twinkleSpeed: rand(0.01, 0.04),
    twinklePhase: rand(0, Math.PI * 2),
    hueShift: rand(-15, 15)
  };
}

function initParticles() {
  particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(createParticle(i));
  }
}
initParticles();

window.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / width) * 2 - 1;
  mouseY = (e.clientY / height) * 2 - 1;
  targetTiltX = mouseY * 0.15;
  targetTiltY = mouseX * 0.15;
});

function project(x, y, z) {
  const scale = FOCAL_LENGTH / (FOCAL_LENGTH + z);
  return {
    x: centerX + x * scale,
    y: centerY + y * scale,
    scale
  };
}

function rotateY(x, z, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos - z * sin, z: x * sin + z * cos };
}

function rotateX(y, z, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { y: y * cos - z * sin, z: y * sin + z * cos };
}

function rotateZ(x, y, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

let lastTime = performance.now();

function animate(now) {
  const dt = Math.min((now - lastTime) / 16.6667, 3);
  lastTime = now;

  const mobileEase = IS_MOBILE ? 0.025 : 0.04;
  tiltX += (targetTiltX - tiltX) * mobileEase;
  tiltY += (targetTiltY - tiltY) * mobileEase;

  morphState += (morphTarget - morphState) * MORPH_LERP * dt;

  rotationVelocity += (targetRotationVelocity - rotationVelocity) * 0.08 * dt;
  globalAngle += ROTATION_SPEED * dt * rotationVelocity * (1 - morphState * 0.85);
  heartSpin += ROTATION_SPEED * dt * (0.25 + morphState * 1.2) * (0.55 + Math.abs(rotationVelocity));

  ctx.fillStyle = 'rgba(5, 6, 20, 0.28)';
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'lighter';

  const drawList = [];

  for (let p of particles) {
    const heartAligned = rotateZ(p.heart.x, p.heart.y, Math.PI / 2);
    const heartRotated = rotateZ(heartAligned.x, heartAligned.y, heartSpin * (0.5 + morphState));
    const bx = p.galaxy.x + (heartRotated.x - p.galaxy.x) * morphState;
    const by = p.galaxy.y + (heartRotated.y - p.galaxy.y) * morphState;
    const bz = (p.galaxy.z + p.thickness) + (p.heart.z - (p.galaxy.z + p.thickness)) * morphState;

    let rx = bx, ry = by, rz = bz;

    const ry1 = rotateY(rx, rz, globalAngle);
    rx = ry1.x; rz = ry1.z;

    const rx2 = rotateX(ry, rz, tiltX);
    ry = rx2.y; rz = rx2.z;

    const ry2 = rotateY(rx, rz, tiltY);
    rx = ry2.x; rz = ry2.z;

    const proj = project(rx, ry, rz);
    if (proj.scale <= 0) continue;

    drawList.push({ p, proj, z: rz });
  }

  drawList.sort((a, b) => a.z - b.z);

  const time = now * 0.001;

  for (const { p, proj } of drawList) {
    const depthFade = Math.max(0, Math.min(1, (proj.scale - 0.25) / 0.9));
    const twinkle = 0.55 + 0.45 * Math.sin(time * (1 / p.twinkleSpeed * 0.02) + p.twinklePhase);
    const alpha = depthFade * twinkle;
    const radius = Math.max(0.3, p.size * proj.scale);

    const galaxyHue = 220 - (p.t * 60) + p.hueShift;
    const heartHue = 340 + p.hueShift * 0.5;
    const hue = galaxyHue + (heartHue - galaxyHue) * morphState;
    const lightness = 55 + twinkle * 20;
    const sat = 85 + morphState * 5;

    ctx.beginPath();
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lightness}%, ${alpha})`;
    ctx.arc(proj.x, proj.y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (proj.scale > 0.9 && Math.random() < 0.02) {
      ctx.beginPath();
      ctx.fillStyle = `hsla(${hue}, 90%, 85%, ${alpha * 0.5})`;
      ctx.arc(proj.x, proj.y, radius * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = 'source-over';

  requestAnimationFrame(animate);
}

ctx.fillStyle = '#050614';
ctx.fillRect(0, 0, width, height);

requestAnimationFrame(animate);

// =====================================================================
// Hand gesture detection (MediaPipe Tasks Vision — HandLandmarker)
// Closed fist -> morphTarget = 1 (heart)
// Open hand / no hands -> morphTarget = 0 (galaxy)
// =====================================================================

const videoEl = document.getElementById('webcamVideo');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');

const GESTURE_HOLD_FRAMES = 5;
let closedStreak = 0;
let openStreak = 0;
let currentGesture = 'none'; // 'closed' | 'open' | 'none'

function setStatus(mode, label) {
  statusBadge.classList.remove('open', 'closed', 'slow', 'paused', 'reverse');
  if (mode === 'closed') statusBadge.classList.add('closed');
  if (mode === 'open') statusBadge.classList.add('open');
  if (mode === 'slow') statusBadge.classList.add('slow');
  if (mode === 'paused') statusBadge.classList.add('paused');
  if (mode === 'reverse') statusBadge.classList.add('reverse');
  statusText.textContent = label;
}

// MediaPipe Hands landmark indices (21 points/hand)
const FINGERTIPS = [8, 12, 16, 20];
const FINGER_PIPS = [6, 10, 14, 18];
const THUMB_TIP = 4;
const WRIST = 0;
const MIDDLE_MCP = 9;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFist(landmarks) {
  const wrist = landmarks[WRIST];
  const palmRef = landmarks[MIDDLE_MCP];
  const handScale = dist(wrist, palmRef) || 0.001;

  let curledCount = 0;
  for (let i = 0; i < FINGERTIPS.length; i++) {
    const tip = landmarks[FINGERTIPS[i]];
    const pip = landmarks[FINGER_PIPS[i]];
    const tipToWrist = dist(tip, wrist);
    const pipToWrist = dist(pip, wrist);
    if (tipToWrist <= pipToWrist * 1.15) curledCount++;
  }

  const thumbTip = landmarks[THUMB_TIP];
  const thumbCurled = dist(thumbTip, palmRef) < handScale * 1.3;

  return curledCount >= 3 && (thumbCurled || curledCount === 4);
}

function isOpenHand(landmarks) {
  const wrist = landmarks[WRIST];

  let extendedCount = 0;
  for (let i = 0; i < FINGERTIPS.length; i++) {
    const tip = landmarks[FINGERTIPS[i]];
    const pip = landmarks[FINGER_PIPS[i]];
    const tipToWrist = dist(tip, wrist);
    const pipToWrist = dist(pip, wrist);
    if (tipToWrist > pipToWrist * 1.3) extendedCount++;
  }

  return extendedCount >= 3;
}

function getHandClosureStrength(landmarks) {
  const wrist = landmarks[WRIST];
  const palmRef = landmarks[MIDDLE_MCP];
  const handScale = dist(wrist, palmRef) || 0.001;
  let curledCount = 0;

  for (let i = 0; i < FINGERTIPS.length; i++) {
    const tip = landmarks[FINGERTIPS[i]];
    const pip = landmarks[FINGER_PIPS[i]];
    const tipToWrist = dist(tip, wrist);
    const pipToWrist = dist(pip, wrist);
    if (tipToWrist <= pipToWrist * 1.15) curledCount++;
  }

  const thumbTip = landmarks[THUMB_TIP];
  const thumbCurled = dist(thumbTip, palmRef) < handScale * 1.3 ? 1 : 0;
  const score = (curledCount + thumbCurled) / 5;
  return Math.max(0, Math.min(1, score));
}

function updateRotationFromGesture(gestureStrength, hasHands) {
  if (!hasHands || gestureStrength < 0.2) {
    targetRotationVelocity = 1;
    rotationMode = 'normal';
    setStatus('open', 'Open hand — normal spin');
    return;
  }

  if (gestureStrength < 0.5) {
    targetRotationVelocity = 0.35;
    rotationMode = 'slow';
    setStatus('slow', 'Hand closing — slow spin');
    return;
  }

  if (gestureStrength < 0.82) {
    targetRotationVelocity = 0;
    rotationMode = 'paused';
    setStatus('paused', 'Fist closed — spin paused');
    return;
  }

  targetRotationVelocity = -0.9;
  rotationMode = 'reverse';
  setStatus('reverse', 'Tighter fist — rotation reversed');
}

function handleGestureFrame(handLandmarksList) {
  const hasHands = handLandmarksList && handLandmarksList.length > 0;

  let frameIsClosed = false;
  let frameIsOpen = false;
  let gestureStrength = 0;

  if (hasHands) {
    let strengthTotal = 0;
    for (const landmarks of handLandmarksList) {
      const closure = getHandClosureStrength(landmarks);
      strengthTotal += closure;
      if (isFist(landmarks)) frameIsClosed = true;
      else if (isOpenHand(landmarks)) frameIsOpen = true;
    }
    gestureStrength = strengthTotal / handLandmarksList.length;
  }

  if (frameIsClosed) {
    closedStreak++;
    openStreak = 0;
  } else if (frameIsOpen || !hasHands) {
    openStreak++;
    closedStreak = 0;
  } else {
    closedStreak = Math.max(0, closedStreak - 1);
    openStreak = Math.max(0, openStreak - 1);
  }

  if (closedStreak >= GESTURE_HOLD_FRAMES && currentGesture !== 'closed') {
    currentGesture = 'closed';
    morphTarget = 1;
  } else if (openStreak >= GESTURE_HOLD_FRAMES && currentGesture !== 'open') {
    currentGesture = hasHands ? 'open' : 'none';
    morphTarget = 0;
  }

  if (currentGesture === 'closed') {
    updateRotationFromGesture(Math.max(gestureStrength, 0.75), hasHands);
  } else if (currentGesture === 'open') {
    updateRotationFromGesture(Math.min(gestureStrength, 0.35), hasHands);
  } else {
    updateRotationFromGesture(0, hasHands);
  }
}

async function startHandTracking() {
  setStatus('none', 'Loading hand model…');

  let HandLandmarker, FilesetResolver;
  try {
    const vision = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
    );
    HandLandmarker = vision.HandLandmarker;
    FilesetResolver = vision.FilesetResolver;
  } catch (err) {
    console.error('Failed to load MediaPipe Tasks Vision module:', err);
    setStatus('none', 'Failed to load hand-tracking library (check console/network)');
    return;
  }

  let handLandmarker;
  try {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 2
    });
  } catch (err) {
    console.error('Failed to initialize HandLandmarker:', err);
    setStatus('none', 'Failed to load hand model (check console)');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('none', 'Camera API not available (need https:// or localhost)');
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });
  } catch (err) {
    console.error('Camera error:', err);

    const isEmulation = !!window.navigator.userAgent.match(/(?:Android|iPhone|iPad|iPod)/i) && window.innerWidth <= 768 && !window.matchMedia('(display-mode: standalone)').matches;
    if (isEmulation || (typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')) {
      setStatus('none', 'Camera not detected in browser emulation — use a real device or localhost/HTTPS');
    } else {
      setStatus('none', 'Camera access denied or unavailable');
    }

    videoEl.classList.remove('visible');
    return;
  }

  videoEl.srcObject = stream;
  videoEl.classList.add('visible');
  await new Promise((resolve) => {
    videoEl.onloadedmetadata = () => {
      videoEl.play();
      resolve();
    };
  });

  setStatus('none', 'Show your hand — fist = heart');

  let lastVideoTime = -1;

  function detectFrame() {
    if (videoEl.readyState >= 2 && videoEl.currentTime !== lastVideoTime) {
      lastVideoTime = videoEl.currentTime;
      const nowMs = performance.now();
      try {
        const results = handLandmarker.detectForVideo(videoEl, nowMs);
        handleGestureFrame(results.landmarks);
      } catch (err) {
        console.error('Detection error:', err);
      }
    }

    if (IS_MOBILE && Math.random() < 0.35) {
      return requestAnimationFrame(detectFrame);
    }
    requestAnimationFrame(detectFrame);
  }

  detectFrame();
}

startHandTracking().catch((err) => {
  console.error('Hand tracking failed to start:', err);
  setStatus('none', 'Hand tracking failed to start (see console)');
});