import { ParticleSystem } from './ParticleSystem.js';
import { HandTracker } from './HandTracker.js';

/**
 * 主程序入口
 * 负责连接 UI、粒子系统和手势识别模块。
 */

// 等待 DOM (HTML 结构) 加载完成
document.addEventListener('DOMContentLoaded', () => {
    // 1. 初始化粒子系统 (3D 场景)
    const container = document.getElementById('canvas-container');
    const particleSystem = new ParticleSystem(container);

    // 2. 处理 UI 交互 (按钮点击、颜色选择)
    setupUI(particleSystem);

    // 3. 初始化手势识别
    const videoElement = document.getElementById('video-input');
    const canvasElement = document.getElementById('output-canvas');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    // 手势回调函数：当 HandTracker 计算出手张合度时调用
    const onGesture = (openness, handX) => {
        // openness: 0.0 (握拳) ~ 1.0 (张开)
        // handX: 0.0 (左边) ~ 1.0 (右边)
        
        // 1. 处理缩放
        // 将其映射到粒子系统的扩张系数 (expansion)
        // 设定最小缩放为 0.1 (收缩)，最大为 4.0 (扩散 - 已增大)
        const minScale = 0.1;
        const maxScale = 4.0;
        
        // 线性映射公式
        const scale = minScale + openness * (maxScale - minScale);
        particleSystem.setExpansion(scale);

        // 2. 处理旋转
        // 将 handX 映射到旋转角度 -180度 ~ +180度 (-PI ~ PI)
        // 0.5 是中心点，对应 0 度
        // 乘以 3 是为了让旋转更灵敏，不仅限于一圈，可以多转一点
        if (handX !== undefined) {
            // 这里的符号可能需要根据镜像情况微调，目前假设正常逻辑
            const rotationAngle = (handX - 0.5) * Math.PI * 3; 
            particleSystem.setRotation(rotationAngle);
        }

        // 更新 UI 上的状态指示灯和文字
        statusDot.classList.add('ready');
        statusText.textContent = `手势控制中: ${(openness * 100).toFixed(0)}%`;
    };

    // 错误处理回调
    const onError = (errorMsg) => {
        statusText.textContent = errorMsg;
        statusText.style.color = '#ff4444';
        statusDot.style.backgroundColor = '#ff4444';
    };

    // 启动手势识别
    // 传入 onGesture 和 onError 两个回调
    const handTracker = new HandTracker(videoElement, canvasElement, onGesture, onError);
    
    // 修改：绑定按钮事件，点击后才启动
    const startBtn = document.getElementById('start-camera-btn');
    startBtn.addEventListener('click', () => {
        statusText.textContent = '正在请求摄像头...';
        startBtn.disabled = true; // 防止重复点击
        startBtn.textContent = '启动中...';
        
        handTracker.start().then(() => {
            startBtn.style.display = 'none'; // 成功后隐藏按钮
            statusText.textContent = '摄像头已启动';
        }).catch((err) => {
            console.error(err);
            startBtn.disabled = false;
            // 直接把错误原因写在按钮上
            startBtn.textContent = err.message || '启动失败，点此重试';
            startBtn.style.backgroundColor = '#ff4444';
        });
    });
});

function setupUI(particleSystem) {
    // 1. 图案切换
    const patternBtns = document.querySelectorAll('.pattern-btn');
    patternBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // 移除所有 active 类
            patternBtns.forEach(b => b.classList.remove('active'));
            // 添加当前 active 类
            e.target.classList.add('active');
            
            // 获取图案名称并设置
            const pattern = e.target.getAttribute('data-pattern');
            particleSystem.setPattern(pattern);
        });
    });

    // 2. 颜色选择
    const colorPicker = document.getElementById('color-picker');
    colorPicker.addEventListener('input', (e) => {
        particleSystem.setColor(e.target.value);
    });

    // 3. 全屏控制
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

