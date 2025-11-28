import * as THREE from 'three';

/**
 * 粒子系统类
 * 负责创建 3D 场景，生成粒子，并控制粒子的运动和交互。
 */
export class ParticleSystem {
    constructor(container) {
        this.container = container; // 渲染容器 DOM 元素
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.particleCount = 15000; // 粒子总数量，越多越密集但性能消耗越大
        this.particles = null;      // 存储粒子对象
        this.originalPositions = []; // 存储每个粒子构成图案时的"目标位置"
        this.currentPattern = 'sphere'; // 当前显示的图案类型
        this.baseColor = new THREE.Color(0x00ffff); // 粒子基础颜色
        
        // 交互参数
        // expansion 控制粒子的扩散程度：
        // 1.0 = 原始图案大小
        // 0.0 = 收缩成一个点
        // >1.0 = 向外扩散爆炸
        this.expansion = 1.0; 
        this.targetExpansion = 1.0;
        this.targetRotationY = 0; // 目标旋转角度 (由手势左右位置控制)
        
        this.init();
    }

    // 初始化 Three.js 场景
    init() {
        // 1. 创建场景 (整个 3D 世界)
        this.scene = new THREE.Scene();
        
        // 2. 创建相机 (观众的眼睛)
        // 参数: 视野角度, 长宽比, 近平面, 远平面
        this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
        this.camera.position.z = 30; // 将相机向后拉，以便看到物体

        // 3. 创建渲染器 (负责把 3D 场景画到屏幕上)
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // 4. 初始化粒子
        this.createParticles();

        // 5. 监听窗口大小变化 (自适应屏幕)
        window.addEventListener('resize', () => this.onWindowResize(), false);

        // 6. 开始动画循环
        this.animate();
    }

    createParticles() {
        // 如果已有粒子，先移除
        if (this.particles) {
            this.scene.remove(this.particles);
        }

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        
        // 初始化位置（先随机分布）
        for (let i = 0; i < this.particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 100;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // 材质
        const material = new THREE.PointsMaterial({
            color: this.baseColor,
            size: 0.15,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);

        // 生成目标形状的目标位置
        this.generateTargetPositions(this.currentPattern);
    }

    // 根据图案名称生成目标位置
    generateTargetPositions(pattern) {
        this.originalPositions = [];
        
        for (let i = 0; i < this.particleCount; i++) {
            let x, y, z;

            if (pattern === 'sphere') {
                // 球体方程
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos((Math.random() * 2) - 1);
                const r = 10;
                
                x = r * Math.sin(phi) * Math.cos(theta);
                y = r * Math.sin(phi) * Math.sin(theta);
                z = r * Math.cos(phi);

            } else if (pattern === 'cube') {
                // 立方体
                const side = 12;
                x = (Math.random() - 0.5) * side;
                y = (Math.random() - 0.5) * side;
                z = (Math.random() - 0.5) * side;

            } else if (pattern === 'heart') {
                // 心形方程
                // x = 16sin^3(t)
                // y = 13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)
                // z = random thickness
                const t = Math.random() * Math.PI * 2;
                const scale = 0.5;
                x = scale * 16 * Math.pow(Math.sin(t), 3);
                y = scale * (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
                z = (Math.random() - 0.5) * 5; // 一定厚度
            }

            this.originalPositions.push({x, y, z});
        }
    }

    // 切换图案
    setPattern(patternName) {
        this.currentPattern = patternName;
        this.generateTargetPositions(patternName);
    }

    // 设置颜色
    setColor(hexColor) {
        this.baseColor.set(hexColor);
        if (this.particles) {
            this.particles.material.color.set(hexColor);
        }
    }

    // 更新扩张系数 (由手势控制)
    // factor: 0.0 (收缩) -> 1.0 (正常) -> 2.0 (扩散)
    setExpansion(factor) {
        // 使用平滑插值，避免跳变
        this.targetExpansion = factor;
    }

    // 设置目标旋转角度
    setRotation(angle) {
        this.targetRotationY = angle;
    }

    // 动画循环函数：每一帧都会调用
    animate() {
        // 请求下一帧动画
        requestAnimationFrame(this.animate.bind(this));

        if (!this.particles) return;

        // 平滑过渡扩张系数 (让交互更自然，不突兀)
        // 每次只移动当前值与目标值差值的 10%
        if (this.targetExpansion !== undefined) {
            this.expansion += (this.targetExpansion - this.expansion) * 0.1;
        }

        // 获取粒子当前位置数组
        const positions = this.particles.geometry.attributes.position.array;
        
        // 旋转控制
        // 使用平滑插值让旋转跟随手势
        if (this.targetRotationY !== undefined) {
             // 0.1 是平滑系数，值越小越平滑但延迟越高
            this.particles.rotation.y += (this.targetRotationY - this.particles.rotation.y) * 0.1;
        }

        // 更新每个粒子的位置
        for (let i = 0; i < this.particleCount; i++) {
            // 获取该粒子的目标位置（根据当前图案和扩张系数计算）
            const target = this.originalPositions[i];
            if (!target) continue;

            // 计算目标坐标：原始坐标 * 扩张系数
            // 当 expansion 变大时，粒子向外跑；变小时，向中心聚。
            const targetX = target.x * this.expansion;
            const targetY = target.y * this.expansion;
            const targetZ = target.z * this.expansion;

            // 获取粒子当前坐标
            const currentX = positions[i * 3];
            const currentY = positions[i * 3 + 1];
            const currentZ = positions[i * 3 + 2];

            // 移动速度 (0.1 表示每次移动距离的 10%)
            const speed = 0.1;

            // 线性插值移动：让粒子飞向目标位置
            positions[i * 3] += (targetX - currentX) * speed;
            positions[i * 3 + 1] += (targetY - currentY) * speed;
            positions[i * 3 + 2] += (targetZ - currentZ) * speed;
        }

        // 告诉 Three.js 位置数据已更新，需要重新渲染
        this.particles.geometry.attributes.position.needsUpdate = true;
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
    }
}

