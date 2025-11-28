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
        this.onErrorCallback = onErrorCallback;
        
        this.hands = null;
        this.isReady = false;
        this.animationFrameId = null;

        this.init();
    }

    init() {
        // 检查全局变量是否加载
        if (!window.Hands) {
            console.error('MediaPipe Hands script not loaded!');
            if (this.onErrorCallback) this.onErrorCallback('MediaPipe 加载失败，请刷新重试');
            return;
        }

        // 使用全局 Hands 对象
        this.hands = new window.Hands({
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

    // start 方法现在只负责兼容旧逻辑，或者可以留空，因为我们在 main.js 里手动启动了
    async start() {
        console.log('HandTracker start called (legacy)');
        this.isReady = true;
        this.detectLoop();
        return true;
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

            // 绘制骨架 (使用全局 drawingUtils)
            if (window.drawConnectors && window.drawLandmarks) {
                window.drawConnectors(this.canvasCtx, landmarks, window.HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 2});
                window.drawLandmarks(this.canvasCtx, landmarks, {color: '#FF0000', lineWidth: 1});
            }

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
