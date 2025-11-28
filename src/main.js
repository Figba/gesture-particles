import { ParticleSystem } from './ParticleSystem.js';
import { HandTracker } from './HandTracker.js';

/**
 * 主程序入口
 */
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-camera-btn');
    const statusText = document.getElementById('status-text');
    const videoElement = document.getElementById('video-input');
    const canvasElement = document.getElementById('output-canvas');
    const statusDot = document.getElementById('status-dot');

    // 0. 按钮点击逻辑 (独立于任何类，确保点击有反应)
    startBtn.addEventListener('click', async () => {
        console.log('Button clicked!'); 
        startBtn.textContent = '正在请求...';
        startBtn.disabled = true;

        try {
            // 1. 直接尝试获取摄像头 (最原始的方法，排除 HandTracker 类的干扰)
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, facingMode: 'user' }
            });
            
            console.log('Camera success!');
            videoElement.srcObject = stream;
            videoElement.play();
            
            // 2. 摄像头成功后，再初始化手势识别和粒子系统
            // 这样即使 AI 加载失败，至少摄像头画面是有的
            startBtn.style.display = 'none';
            statusText.textContent = '摄像头已开启，正在加载 AI 模型...';
            
            initApp(videoElement, canvasElement, statusText, statusDot);

        } catch (err) {
            console.error(err);
            startBtn.disabled = false;
            startBtn.style.backgroundColor = '#ff4444';
            startBtn.textContent = '摄像头启动失败: ' + err.name;
            alert('摄像头启动失败: ' + err.message);
        }
    });

    // 初始化 3D 场景 (这个不依赖摄像头，可以先跑)
    try {
        const container = document.getElementById('canvas-container');
        const particleSystem = new ParticleSystem(container);
        setupUI(particleSystem);
        
        // 把 particleSystem 挂载到 window 上以便后续调用
        window.particleSystem = particleSystem;
    } catch (e) {
        console.error('3D Scene init failed:', e);
    }
});

// 初始化 AI 应用逻辑
function initApp(videoElement, canvasElement, statusText, statusDot) {
    const onGesture = (openness, handX) => {
        const particleSystem = window.particleSystem;
        if (!particleSystem) return;

        const minScale = 0.1;
        const maxScale = 4.0;
        const scale = minScale + openness * (maxScale - minScale);
        particleSystem.setExpansion(scale);

        if (handX !== undefined) {
            const rotationAngle = (handX - 0.5) * Math.PI * 3; 
            particleSystem.setRotation(rotationAngle);
        }

        statusDot.classList.add('ready');
        statusText.textContent = `手势控制中: ${(openness * 100).toFixed(0)}%`;
    };

    const onError = (msg) => {
        statusText.textContent = msg;
        statusText.style.color = 'red';
    };

    // 这里的 HandTracker 只需要负责 AI 识别，不需要负责启动摄像头了
    const handTracker = new HandTracker(videoElement, canvasElement, onGesture, onError);
    
    // 手动设置 ready 状态，因为我们已经在外面启动了摄像头
    handTracker.isReady = true; 
    handTracker.detectLoop(); 
}

function setupUI(particleSystem) {
    const patternBtns = document.querySelectorAll('.pattern-btn');
    patternBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            patternBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const pattern = e.target.getAttribute('data-pattern');
            particleSystem.setPattern(pattern);
        });
    });

    const colorPicker = document.getElementById('color-picker');
    colorPicker.addEventListener('input', (e) => {
        particleSystem.setColor(e.target.value);
    });

    const fullscreenBtn = document.getElementById('fullscreen-btn');
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });
}
