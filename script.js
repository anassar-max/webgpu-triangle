// script.js - مشروع WebGPU الكامل

class WebGPUTriangle {
    constructor() {
        this.canvas = document.getElementById('gpuCanvas');
        this.statusDiv = document.getElementById('status');
        this.colorPicker = document.getElementById('colorPicker');
        this.speedSlider = document.getElementById('rotationSpeed');
        this.resetButton = document.getElementById('resetButton');
        
        this.device = null;
        this.context = null;
        this.pipeline = null;
        this.uniformBuffer = null;
        this.bindGroup = null;
        
        this.rotationAngle = 0;
        this.speed = 0.01;
        this.color = [1.0, 0.0, 0.0];
        
        this.init();
        this.setupControls();
    }
    
    async init() {
        try {
            this.updateStatus('جاري التحقق من دعم WebGPU...', 'info');
            
            // التحقق من دعم WebGPU
            if (!navigator.gpu) {
                throw new Error('WebGPU غير مدعوم في هذا المتصفح. يرجى استخدام Chrome 113+ أو Edge 113+');
            }
            
            this.updateStatus('جاري الاتصال بـ GPU...', 'info');
            
            // طلب adapter
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                throw new Error('لم يتم العثور على GPU adapter مناسب');
            }
            
            this.updateStatus('جاري إنشاء device...', 'info');
            
            // طلب device
            this.device = await adapter.requestDevice();
            
            // تهيئة context
            this.context = this.canvas.getContext('webgpu');
            if (!this.context) {
                throw new Error('لا يمكن الحصول على WebGPU context من canvas');
            }
            
            // تكوين canvas
            const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
            this.context.configure({
                device: this.device,
                format: canvasFormat,
                alphaMode: 'premultiplied',
            });
            
            this.updateStatus('جاري إنشاء buffers...', 'info');
            
            // إنشاء uniform buffer
            this.uniformBuffer = this.device.createBuffer({
                size: 16 * 4, // مساحة كافية للبيانات
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            
            // إنشاء bind group layout
            const bindGroupLayout = this.device.createBindGroupLayout({
                entries: [{
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' }
                }]
            });
            
            // إنشاء bind group
            this.bindGroup = this.device.createBindGroup({
                layout: bindGroupLayout,
                entries: [{
                    binding: 0,
                    resource: { buffer: this.uniformBuffer }
                }]
            });
            
            this.updateStatus('جاري إنشاء shader...', 'info');
            
            // shader module مع دعم الألوان والدوران
            const shaderModule = this.device.createShaderModule({
                code: `
                    struct Uniforms {
                        color: vec4f,
                        angle: f32,
                        speed: f32,
                        padding: vec2f
                    }
                    
                    @binding(0) @group(0) var<uniform> uniforms: Uniforms;
                    
                    struct VertexOutput {
                        @builtin(position) position: vec4f,
                        @location(0) color: vec3f
                    }
                    
                    @vertex
                    fn vertexMain(
                        @builtin(vertex_index) vertexIndex: u32
                    ) -> VertexOutput {
                        var output: VertexOutput;
                        
                        // إحداثيات المثلث الثلاثة
                        let positions = array(
                            vec2f(0.0, 0.8),    // الرأس العلوي
                            vec2f(-0.7, -0.5),  // الرأس الأيسر السفلي
                            vec2f(0.7, -0.5)    // الرأس الأيمن السفلي
                        );
                        
                        // تطبيق الدوران
                        let angle = uniforms.angle;
                        let cosAngle = cos(angle);
                        let sinAngle = sin(angle);
                        
                        var pos = positions[vertexIndex];
                        let rotatedX = pos.x * cosAngle - pos.y * sinAngle;
                        let rotatedY = pos.x * sinAngle + pos.y * cosAngle;
                        
                        output.position = vec4f(rotatedX, rotatedY, 0.0, 1.0);
                        
                        // ألوان مختلفة لكل رأس
                        let colors = array(
                            vec3f(1.0, 0.0, 0.0),  // أحمر للرأس العلوي
                            vec3f(0.0, 1.0, 0.0),  // أخضر للرأس الأيسر
                            vec3f(0.0, 0.0, 1.0)   // أزرق للرأس الأيمن
                        );
                        
                        output.color = colors[vertexIndex];
                        
                        return output;
                    }
                    
                    @fragment
                    fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
                        // مزج الألوان مع لون المستخدم
                        return vec4f(input.color * uniforms.color.rgb, 1.0);
                    }
                `
            });
            
            this.updateStatus('جاري إنشاء pipeline...', 'info');
            
            // إنشاء render pipeline
            this.pipeline = this.device.createRenderPipeline({
                layout: this.device.createPipelineLayout({
                    bindGroupLayouts: [bindGroupLayout]
                }),
                vertex: {
                    module: shaderModule,
                    entryPoint: 'vertexMain',
                },
                fragment: {
                    module: shaderModule,
                    entryPoint: 'fragmentMain',
                    targets: [{
                        format: canvasFormat,
                    }],
                },
                primitive: {
                    topology: 'triangle-list',
                },
            });
            
            this.updateStatus('✅ WebGPU يعمل بنجاح! المثلث سيظهر الآن...', 'success');
            
            // بدء حلقة الرسم
            this.render();
            
        } catch (error) {
            console.error('خطأ في التهيئة:', error);
            this.updateStatus(`❌ خطأ: ${error.message}`, 'error');
        }
    }
    
    setupControls() {
        // تغيير اللون
        this.colorPicker.addEventListener('input', (e) => {
            const hex = e.target.value;
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            this.color = [r, g, b];
        });
        
        // تغيير السرعة
        this.speedSlider.addEventListener('input', (e) => {
            this.speed = parseFloat(e.target.value);
        });
        
        // زر إعادة التعيين
        this.resetButton.addEventListener('click', () => {
            this.colorPicker.value = '#ff0000';
            this.speedSlider.value = '0.01';
            this.rotationAngle = 0;
            this.speed = 0.01;
            this.color = [1.0, 0.0, 0.0];
        });
    }
    
    render() {
        if (!this.device || !this.context || !this.pipeline) return;
        
        const frame = () => {
            // تحديث زاوية الدوران
            this.rotationAngle += this.speed;
            
            // تحديث uniform buffer
            const uniformData = new Float32Array([
                this.color[0], this.color[1], this.color[2], 1.0,
                this.rotationAngle,
                this.speed,
                0, 0
            ]);
            this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer);
            
            // إنشاء command encoder
            const commandEncoder = this.device.createCommandEncoder();
            
            // الحصول على texture الحالي
            const textureView = this.context.getCurrentTexture().createView();
            
            // إنشاء render pass
            const renderPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: textureView,
                    clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });
            
            // تنفيذ pipeline
            renderPass.setPipeline(this.pipeline);
            renderPass.setBindGroup(0, this.bindGroup);
            renderPass.draw(3, 1, 0, 0); // رسم 3 رؤوس (مثلث واحد)
            renderPass.end();
            
            // إرسال الأوامر إلى GPU
            this.device.queue.submit([commandEncoder.finish()]);
            
            // طلب الإطار التالي
            requestAnimationFrame(frame);
        };
        
        frame();
    }
    
    updateStatus(message, type) {
        if (this.statusDiv) {
            this.statusDiv.innerHTML = `<p>${message}</p>`;
            this.statusDiv.className = `status ${type}`;
        }
    }
}

// بدء المشروع عند تحميل الصفحة
window.addEventListener('DOMContentLoaded', () => {
    new WebGPUTriangle();
});