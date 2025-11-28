import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

/**
 * 手势识别类
 * 负责调用摄像头，使用 MediaPipe 识别手部关键点，并计算手势数据。
 */
export class HandTracker {
    constructor(videoElement, canvasElement, onGestureCallback, onErrorCallback) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.canvasCtx = canvasElement.getContext('2d');
        this.onGestureCallback = onGestureCallback;
        this.onErrorCallback = onErrorCallback; // 新增：错误回调
        
        this.hands = null;
        this.isReady = false;
        this.animationFrameId = null;

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
    }

    async start() {
        try {
            console.log('Starting camera flow...');
            
            // 1. 检查浏览器支持
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('浏览器不支持 getUserMedia API');
            }

            // 2. 尝试获取权限状态 (仅 Chrome 支持，但这步有助于调试)
            try {
                const permissionStatus = await navigator.permissions.query({ name: 'camera' });
                console.log('Permission status:', permissionStatus.state);
                if (permissionStatus.state === 'denied') {
                    throw new Error('权限已被拒绝，请手动重置');
                }
            } catch (e) {
                console.log('Permission query not supported or failed:', e);
            }

            // 3. 请求流
            console.log('Requesting stream...');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    width: { ideal: 320 }, 
                    height: { ideal: 240 },
                    facingMode: "user"
                },
                audio: false // 明确声明不需要音频
            });

            console.log('Stream acquired:', stream.id);

            // 4. 播放
            this.videoElement.srcObject = stream;
            this.videoElement.play(); // 直接播放，不需要等待 metadata，有些浏览器会卡在这里

            console.log('Camera started successfully');
            this.isReady = true;
            this.detectLoop();
            return true;

        } catch (err) {
            console.error('Detailed camera error:', err);
            
            // 抛出具体的错误信息给按钮显示
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                throw new Error('请点击地址栏左侧图标 -> 重置权限');
            } else if (err.name === 'NotFoundError') {
                throw new Error('未找到摄像头');
            } else {
                throw new Error(err.message || '启动失败');
            }
        }
    }

    async detectLoop() {
        // 循环调用，但要注意性能，如果 hands.send 很慢，await 会让它自动节流
        if (this.isReady && this.videoElement.readyState >= 2) {
            try {
                 await this.hands.send({image: this.videoElement});
            } catch (e) {
                console.warn('MediaPipe detection error:', e);
            }
        }
        this.animationFrameId = requestAnimationFrame(this.detectLoop.bind(this));
    }

    onResults(results) {
        // 清空画布
        this.canvasCtx.save();
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        // 绘制摄像头画面
        this.canvasCtx.drawImage(results.image, 0, 0, this.canvasElement.width, this.canvasElement.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];

            // 绘制骨架
            drawConnectors(this.canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 2});
            drawLandmarks(this.canvasCtx, landmarks, {color: '#FF0000', lineWidth: 1});

            // 计算手势张合度
            const openness = this.calculateHandOpenness(landmarks);
            
            // 获取手掌中心位置
            const handX = landmarks[9].x;

            // 回调传出数据
            if (this.onGestureCallback) {
                this.onGestureCallback(openness, handX);
            }
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
