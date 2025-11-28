import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

/**
 * 手势识别类
 * 负责调用摄像头，使用 MediaPipe 识别手部关键点，并计算手势数据。
 */
export class HandTracker {
    /**
     * @param {HTMLVideoElement} videoElement - 隐藏的 video 标签，用于读取摄像头流
     * @param {HTMLCanvasElement} canvasElement - 用于绘制摄像头画面和骨架的 canvas
     * @param {Function} onGestureCallback - 当识别到手势时的回调函数，接收 openness (0-1)
     */
    constructor(videoElement, canvasElement, onGestureCallback) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.canvasCtx = canvasElement.getContext('2d');
        this.onGestureCallback = onGestureCallback;
        
        this.hands = null;
        this.camera = null;
        this.isReady = false;

        this.init();
    }

    init() {
        // 初始化 MediaPipe Hands
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.hands.onResults(this.onResults.bind(this));

        // 初始化摄像头
        this.camera = new Camera(this.videoElement, {
            onFrame: async () => {
                await this.hands.send({image: this.videoElement});
            },
            width: 320,
            height: 240
        });
    }

    start() {
        this.camera.start()
            .then(() => {
                console.log('Camera started');
                this.isReady = true;
            })
            .catch(err => {
                console.error('Error starting camera:', err);
                alert('无法启动摄像头，请允许摄像头权限。');
            });
    }

    onResults(results) {
        // 清空画布
        this.canvasCtx.save();
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        this.canvasCtx.drawImage(results.image, 0, 0, this.canvasElement.width, this.canvasElement.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];

            // 绘制骨架 (调试用)
            drawConnectors(this.canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 2});
            drawLandmarks(this.canvasCtx, landmarks, {color: '#FF0000', lineWidth: 1});

            // 计算手势张合度
            const openness = this.calculateHandOpenness(landmarks);
            
            // 获取手掌中心位置 (使用中指指根 landmarks[9] 作为参考)
            // MediaPipe 的 x 坐标是归一化的 0.0 - 1.0
            const handX = landmarks[9].x;

            // 回调传出数据
            if (this.onGestureCallback) {
                this.onGestureCallback(openness, handX);
            }
        } else {
            // 没有检测到手，保持上次状态或重置
            // if (this.onGestureCallback) this.onGestureCallback(0.5);
        }
        
        this.canvasCtx.restore();
    }

    // 计算手掌张开程度 (0.0 - 1.0)
    calculateHandOpenness(landmarks) {
        // 关键点索引:
        // 0: 手腕 (Wrist)
        // 9: 中指指根 (Middle Finger MCP)
        // 4, 8, 12, 16, 20: 指尖 (Tips)

        // 1. 计算基准距离 (手掌大小): 手腕到中指指根
        const p0 = landmarks[0];
        const p9 = landmarks[9];
        const palmSize = Math.sqrt(
            Math.pow(p9.x - p0.x, 2) + 
            Math.pow(p9.y - p0.y, 2) + 
            Math.pow(p9.z - p0.z, 2)
        );

        // 2. 计算所有指尖到手腕的平均距离
        const tips = [4, 8, 12, 16, 20];
        let totalTipDist = 0;

        tips.forEach(index => {
            const tip = landmarks[index];
            const dist = Math.sqrt(
                Math.pow(tip.x - p0.x, 2) + 
                Math.pow(tip.y - p0.y, 2) + 
                Math.pow(tip.z - p0.z, 2)
            );
            totalTipDist += dist;
        });

        const avgTipDist = totalTipDist / 5;

        // 3. 归一化比率
        // 通常握拳时，avgTipDist ≈ palmSize * 0.8
        // 张开时，avgTipDist ≈ palmSize * 1.8
        // 我们设定一个范围来映射到 0-1

        const minRatio = 0.8; // 握拳
        const maxRatio = 2.2; // 张开

        const currentRatio = avgTipDist / palmSize;
        
        // 限制在 0-1 之间
        let normalized = (currentRatio - minRatio) / (maxRatio - minRatio);
        normalized = Math.max(0, Math.min(1, normalized));

        return normalized;
    }
}

