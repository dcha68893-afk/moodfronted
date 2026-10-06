package com.necpa;

import android.content.Context;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.view.MotionEvent;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.ShortBuffer;

import javax.microedition.khronos.egl.EGL10;
import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.egl.EGLDisplay;
import javax.microedition.khronos.opengles.GL10;

/**
 * Shared OpenGL ES 2.0 layer for the native games: one lit shader (hemisphere ambient + sun + specular + rim +
 * fresnel glass), a gradient backdrop, soft blob shadows, soft particles, a perspective camera with picking, and a
 * GLSurfaceView with 4x MSAA when the device offers it. Every Scene callback runs on the GL thread.
 */
public final class NecpraGl {

    /** A game scene. All callbacks arrive on the GL thread. */
    public interface Scene {
        void onGlReady(NecpraGl gl);

        void onSize(NecpraGl gl, int w, int h);

        void update(NecpraGl gl, float dt);

        void render(NecpraGl gl);

        /** action: MotionEvent.ACTION_*, x/y in view pixels, pointer is the pointer id. */
        void onTouch(NecpraGl gl, int action, float x, float y, int pointer);
    }

    /** Uploaded mesh. */
    public static final class Mesh {
        int vbo, ibo, count;
        boolean shorts;
    }

    // ------------------------------------------------------------------ state

    public int width = 1, height = 1;
    public final float[] view = NecpraMath.identity();
    public final float[] proj = NecpraMath.identity();
    public final float[] viewProj = NecpraMath.identity();
    public float eyeX, eyeY, eyeZ;
    /** Vertical shift of the whole picture in normalised device units (+ moves up); lets scenes centre inside the HUD. */
    public float ndcShiftY;
    /** Direction towards the sun (normalised in the shader). */
    public float sunX = -0.45f, sunY = 0.85f, sunZ = 0.5f;
    public float sunR = 1.0f, sunG = 0.96f, sunB = 0.9f;
    public float skyR = 0.62f, skyG = 0.7f, skyB = 0.85f;
    public float groundR = 0.32f, groundG = 0.3f, groundB = 0.36f;
    public float ambient = 0.62f;

    private int progLit, progBg, progBlob, progPart;
    private int uVP, uModel, uColor, uSun, uSunCol, uSky, uGround, uEye, uAmb, uSpec, uEmis, uRim, uFres, uClipLoc;
    /** World-space height above which lit fragments are discarded (liquid level plane). Reset with clipY(1000). */
    private float clip = 1000f;
    private int aPos, aNor;
    private int bgTop, bgBottom, bgGlowA, bgGlowB, bgAspect, bgPos;
    private int blobVP, blobModel, blobAlpha, blobPos, blobTint;
    private int partVP, partPos, partColor, partSize, partScale;
    private int quadVbo;
    private final float[] tmp = new float[16];

    // ------------------------------------------------------------------ shaders

    private static final String LIT_VS =
            "uniform mat4 uVP; uniform mat4 uModel; attribute vec3 aPos; attribute vec3 aNor;\n"
                    + "varying vec3 vN; varying vec3 vW;\n"
                    + "void main(){ vec4 w = uModel * vec4(aPos,1.0); vW = w.xyz; vN = (uModel * vec4(aNor,0.0)).xyz; gl_Position = uVP * w; }";

    private static final String LIT_FS =
            "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n"
                    + "varying vec3 vN; varying vec3 vW;\n"
                    + "uniform vec4 uColor; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uEye;\n"
                    + "uniform float uAmb; uniform float uSpec; uniform float uEmis; uniform float uRim; uniform float uFres; uniform float uClip;\n"
                    + "void main(){\n"
                    + " if (vW.y > uClip) discard;\n"
                    + " vec3 n = normalize(vN); vec3 l = normalize(uSun); vec3 v = normalize(uEye - vW);\n"
                    + " if (!gl_FrontFacing) n = -n;\n"
                    + " float diff = max(dot(n,l),0.0);\n"
                    + " float hemi = 0.5 + 0.5*n.y;\n"
                    + " vec3 amb = mix(uGround, uSky, hemi) * uAmb;\n"
                    + " vec3 col = uColor.rgb * (amb + uSunCol * diff * 0.62) + uColor.rgb * uEmis;\n"
                    + " vec3 h = normalize(l + v);\n"
                    + " float sp = pow(max(dot(n,h),0.0), 56.0) * uSpec;\n"
                    + " float fr = pow(1.0 - max(dot(n,v),0.0), 3.0);\n"
                    + " col += uSunCol * sp + uSky * fr * uRim;\n"
                    + " float a = clamp(uColor.a + fr * uFres + sp * uFres, 0.0, 1.0);\n"
                    + " gl_FragColor = vec4(col, a);\n"
                    + "}";

    private static final String BG_VS =
            "attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.999,1.0); }";

    private static final String BG_FS =
            "precision mediump float; varying vec2 vUv; uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uGlowA; uniform vec3 uGlowB; uniform float uAspect;\n"
                    + "void main(){\n"
                    + " vec3 c = mix(uBottom, uTop, smoothstep(0.0,1.0,vUv.y));\n"
                    + " vec2 p = (vUv - vec2(0.5)) * vec2(uAspect,1.0);\n"
                    + " c += uGlowA * exp(-dot(p - vec2(-0.25,0.28), p - vec2(-0.25,0.28)) * 4.5);\n"
                    + " c += uGlowB * exp(-dot(p - vec2(0.3,-0.2), p - vec2(0.3,-0.2)) * 5.5);\n"
                    + " float vg = 1.0 - smoothstep(0.25, 1.05, length(p * vec2(1.0,0.85)));\n"
                    + " c *= mix(0.72, 1.0, vg);\n"
                    + " gl_FragColor = vec4(c,1.0);\n"
                    + "}";

    private static final String BLOB_VS =
            "uniform mat4 uVP; uniform mat4 uModel; attribute vec3 aPos; varying vec2 vP;\n"
                    + "void main(){ vP = aPos.xz; gl_Position = uVP * (uModel * vec4(aPos,1.0)); }";

    private static final String BLOB_FS =
            "precision mediump float; varying vec2 vP; uniform float uAlpha; uniform vec3 uTint;\n"
                    + "void main(){ float d = length(vP); float a = (1.0 - smoothstep(0.0,1.0,d)); a *= a; gl_FragColor = vec4(uTint, a * uAlpha); }";

    private static final String PART_VS =
            "uniform mat4 uVP; uniform float uScale; attribute vec4 aPos; attribute vec4 aColor; varying vec4 vC;\n"
                    + "void main(){ vC = aColor; vec4 p = uVP * vec4(aPos.xyz,1.0); gl_Position = p; gl_PointSize = max(2.0, aPos.w * uScale / max(p.w, 0.1)); }";

    private static final String PART_FS =
            "precision mediump float; varying vec4 vC;\n"
                    + "void main(){ vec2 q = gl_PointCoord - vec2(0.5); float d = length(q) * 2.0; float a = (1.0 - smoothstep(0.35, 1.0, d)); gl_FragColor = vec4(vC.rgb, vC.a * a); }";

    private static int compile(int type, String src) {
        int s = GLES20.glCreateShader(type);
        GLES20.glShaderSource(s, src);
        GLES20.glCompileShader(s);
        int[] ok = new int[1];
        GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0);
        if (ok[0] == 0) {
            String log = GLES20.glGetShaderInfoLog(s);
            GLES20.glDeleteShader(s);
            throw new RuntimeException("Shader compile failed: " + log);
        }
        return s;
    }

    private static int link(String vs, String fs) {
        int v = compile(GLES20.GL_VERTEX_SHADER, vs), f = compile(GLES20.GL_FRAGMENT_SHADER, fs);
        int p = GLES20.glCreateProgram();
        GLES20.glAttachShader(p, v);
        GLES20.glAttachShader(p, f);
        GLES20.glLinkProgram(p);
        int[] ok = new int[1];
        GLES20.glGetProgramiv(p, GLES20.GL_LINK_STATUS, ok, 0);
        if (ok[0] == 0) {
            String log = GLES20.glGetProgramInfoLog(p);
            GLES20.glDeleteProgram(p);
            throw new RuntimeException("Program link failed: " + log);
        }
        GLES20.glDeleteShader(v);
        GLES20.glDeleteShader(f);
        return p;
    }

    void init() {
        particleVbo = 0; // buffers die with the GL context; a resumed surface needs a fresh one
        progLit = link(LIT_VS, LIT_FS);
        uVP = GLES20.glGetUniformLocation(progLit, "uVP");
        uModel = GLES20.glGetUniformLocation(progLit, "uModel");
        uColor = GLES20.glGetUniformLocation(progLit, "uColor");
        uSun = GLES20.glGetUniformLocation(progLit, "uSun");
        uSunCol = GLES20.glGetUniformLocation(progLit, "uSunCol");
        uSky = GLES20.glGetUniformLocation(progLit, "uSky");
        uGround = GLES20.glGetUniformLocation(progLit, "uGround");
        uEye = GLES20.glGetUniformLocation(progLit, "uEye");
        uAmb = GLES20.glGetUniformLocation(progLit, "uAmb");
        uSpec = GLES20.glGetUniformLocation(progLit, "uSpec");
        uEmis = GLES20.glGetUniformLocation(progLit, "uEmis");
        uRim = GLES20.glGetUniformLocation(progLit, "uRim");
        uFres = GLES20.glGetUniformLocation(progLit, "uFres");
        uClipLoc = GLES20.glGetUniformLocation(progLit, "uClip");
        aPos = GLES20.glGetAttribLocation(progLit, "aPos");
        aNor = GLES20.glGetAttribLocation(progLit, "aNor");

        progBg = link(BG_VS, BG_FS);
        bgTop = GLES20.glGetUniformLocation(progBg, "uTop");
        bgBottom = GLES20.glGetUniformLocation(progBg, "uBottom");
        bgGlowA = GLES20.glGetUniformLocation(progBg, "uGlowA");
        bgGlowB = GLES20.glGetUniformLocation(progBg, "uGlowB");
        bgAspect = GLES20.glGetUniformLocation(progBg, "uAspect");
        bgPos = GLES20.glGetAttribLocation(progBg, "aPos");

        progBlob = link(BLOB_VS, BLOB_FS);
        blobVP = GLES20.glGetUniformLocation(progBlob, "uVP");
        blobModel = GLES20.glGetUniformLocation(progBlob, "uModel");
        blobAlpha = GLES20.glGetUniformLocation(progBlob, "uAlpha");
        blobTint = GLES20.glGetUniformLocation(progBlob, "uTint");
        blobPos = GLES20.glGetAttribLocation(progBlob, "aPos");

        progPart = link(PART_VS, PART_FS);
        partVP = GLES20.glGetUniformLocation(progPart, "uVP");
        partScale = GLES20.glGetUniformLocation(progPart, "uScale");
        partPos = GLES20.glGetAttribLocation(progPart, "aPos");
        partColor = GLES20.glGetAttribLocation(progPart, "aColor");

        float[] quad = {-1, -1, 3, -1, -1, 3};
        int[] b = new int[1];
        GLES20.glGenBuffers(1, b, 0);
        quadVbo = b[0];
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, quadVbo);
        FloatBuffer fb = ByteBuffer.allocateDirect(quad.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        fb.put(quad).position(0);
        GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, quad.length * 4, fb, GLES20.GL_STATIC_DRAW);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0);
    }

    // ------------------------------------------------------------------ meshes

    public Mesh upload(NecpraMesh m) {
        Mesh out = new Mesh();
        int[] b = new int[2];
        GLES20.glGenBuffers(2, b, 0);
        out.vbo = b[0];
        out.ibo = b[1];
        FloatBuffer fb = ByteBuffer.allocateDirect(m.vertices.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        fb.put(m.vertices).position(0);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, out.vbo);
        GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, m.vertices.length * 4, fb, GLES20.GL_STATIC_DRAW);
        out.count = m.indices.length;
        // 16-bit indices are universally supported; GLES2 only guarantees them
        if (m.vertexCount() > 65535) throw new IllegalArgumentException("Mesh too large for 16-bit indices");
        out.shorts = true;
        ShortBuffer sb = ByteBuffer.allocateDirect(m.indices.length * 2).order(ByteOrder.nativeOrder()).asShortBuffer();
        for (int i : m.indices) sb.put((short) i);
        sb.position(0);
        GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, out.ibo);
        GLES20.glBufferData(GLES20.GL_ELEMENT_ARRAY_BUFFER, m.indices.length * 2, sb, GLES20.GL_STATIC_DRAW);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0);
        GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, 0);
        return out;
    }

    public void free(Mesh m) {
        if (m == null) return;
        GLES20.glDeleteBuffers(2, new int[]{m.vbo, m.ibo}, 0);
    }

    // ------------------------------------------------------------------ camera

    public void camera(float ex, float ey, float ez, float cx, float cy, float cz, float fovDeg) {
        eyeX = ex;
        eyeY = ey;
        eyeZ = ez;
        float[] v = NecpraMath.lookAt(ex, ey, ez, cx, cy, cz, 0, 1, 0);
        System.arraycopy(v, 0, view, 0, 16);
        float[] p = NecpraMath.perspective(fovDeg, width / (float) Math.max(1, height), 0.5f, 80f);
        if (ndcShiftY != 0f) p = NecpraMath.mul(NecpraMath.translation(0f, ndcShiftY, 0f), p);
        System.arraycopy(p, 0, proj, 0, 16);
        NecpraMath.multiply(viewProj, proj, view);
    }

    /** World-space picking ray {ox,oy,oz,dx,dy,dz} for a view-pixel position. */
    public float[] ray(float sx, float sy) {
        return NecpraMath.screenRay(viewProj, sx, sy, width, height);
    }

    /** Projects a world point to view pixels {x, y} (or null when behind the camera). */
    public float[] project(float x, float y, float z) {
        float cx = viewProj[0] * x + viewProj[4] * y + viewProj[8] * z + viewProj[12];
        float cy = viewProj[1] * x + viewProj[5] * y + viewProj[9] * z + viewProj[13];
        float cw = viewProj[3] * x + viewProj[7] * y + viewProj[11] * z + viewProj[15];
        if (cw <= 0.0001f) return null;
        return new float[]{(cx / cw * 0.5f + 0.5f) * width, (1f - (cy / cw * 0.5f + 0.5f)) * height};
    }

    // ------------------------------------------------------------------ drawing

    public void clear() {
        GLES20.glClearColor(0, 0, 0, 1);
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
    }

    /** Gradient backdrop with two soft glows. Colours are 0..1 RGB triples. */
    public void drawBackground(float[] top, float[] bottom, float[] glowA, float[] glowB) {
        GLES20.glDisable(GLES20.GL_DEPTH_TEST);
        GLES20.glDisable(GLES20.GL_BLEND);
        GLES20.glUseProgram(progBg);
        GLES20.glUniform3fv(bgTop, 1, top, 0);
        GLES20.glUniform3fv(bgBottom, 1, bottom, 0);
        GLES20.glUniform3fv(bgGlowA, 1, glowA, 0);
        GLES20.glUniform3fv(bgGlowB, 1, glowB, 0);
        GLES20.glUniform1f(bgAspect, width / (float) Math.max(1, height));
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, quadVbo);
        GLES20.glEnableVertexAttribArray(bgPos);
        GLES20.glVertexAttribPointer(bgPos, 2, GLES20.GL_FLOAT, false, 8, 0);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3);
        GLES20.glDisableVertexAttribArray(bgPos);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0);
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);
    }

    public void beginOpaque() {
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthFunc(GLES20.GL_LEQUAL);
        GLES20.glDepthMask(true);
        GLES20.glEnable(GLES20.GL_CULL_FACE);
        GLES20.glCullFace(GLES20.GL_BACK);
        GLES20.glDisable(GLES20.GL_BLEND);
        useLit();
    }

    public void beginTransparent() {
        GLES20.glEnable(GLES20.GL_BLEND);
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA);
        GLES20.glDepthMask(false);
        useLit();
    }

    public void endTransparent() {
        GLES20.glDepthMask(true);
        GLES20.glDisable(GLES20.GL_BLEND);
    }

    private void useLit() {
        GLES20.glUseProgram(progLit);
        GLES20.glUniformMatrix4fv(uVP, 1, false, viewProj, 0);
        GLES20.glUniform3f(uSun, sunX, sunY, sunZ);
        GLES20.glUniform3f(uSunCol, sunR, sunG, sunB);
        GLES20.glUniform3f(uSky, skyR, skyG, skyB);
        GLES20.glUniform3f(uGround, groundR, groundG, groundB);
        GLES20.glUniform3f(uEye, eyeX, eyeY, eyeZ);
        GLES20.glUniform1f(uAmb, ambient);
    }

    /** Draws a lit mesh. spec 0..1, emis 0..1 (self-light), rim 0..1, fres 0..1 (glass edge opacity). */
    public void draw(Mesh m, float[] model, float r, float g, float b, float a, float spec, float emis, float rim, float fres) {
        if (m == null) return;
        GLES20.glUniformMatrix4fv(uModel, 1, false, model, 0);
        GLES20.glUniform4f(uColor, r, g, b, a);
        GLES20.glUniform1f(uSpec, spec);
        GLES20.glUniform1f(uEmis, emis);
        GLES20.glUniform1f(uRim, rim);
        GLES20.glUniform1f(uFres, fres);
        GLES20.glUniform1f(uClipLoc, clip);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, m.vbo);
        GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, m.ibo);
        GLES20.glEnableVertexAttribArray(aPos);
        GLES20.glVertexAttribPointer(aPos, 3, GLES20.GL_FLOAT, false, NecpraMesh.STRIDE * 4, 0);
        GLES20.glEnableVertexAttribArray(aNor);
        GLES20.glVertexAttribPointer(aNor, 3, GLES20.GL_FLOAT, false, NecpraMesh.STRIDE * 4, 12);
        GLES20.glDrawElements(GLES20.GL_TRIANGLES, m.count, GLES20.GL_UNSIGNED_SHORT, 0);
        GLES20.glDisableVertexAttribArray(aPos);
        GLES20.glDisableVertexAttribArray(aNor);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0);
        GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, 0);
    }

    public void clipY(float worldY) { clip = worldY; }

    /** Matte convenience. */
    public void draw(Mesh m, float[] model, float[] c, float a) {
        draw(m, model, c[0], c[1], c[2], a, 0.25f, 0f, 0.12f, 0f);
    }

    /** Soft round contact shadow: pass the unit disc mesh scaled to the footprint. */
    public void drawBlob(Mesh disc, float[] model, float alpha) {
        GLES20.glEnable(GLES20.GL_BLEND);
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA);
        GLES20.glDepthMask(false);
        GLES20.glDisable(GLES20.GL_CULL_FACE);
        GLES20.glUseProgram(progBlob);
        GLES20.glUniformMatrix4fv(blobVP, 1, false, viewProj, 0);
        GLES20.glUniformMatrix4fv(blobModel, 1, false, model, 0);
        GLES20.glUniform1f(blobAlpha, alpha);
        GLES20.glUniform3f(blobTint, 0.02f, 0.02f, 0.06f);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, disc.vbo);
        GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, disc.ibo);
        GLES20.glEnableVertexAttribArray(blobPos);
        GLES20.glVertexAttribPointer(blobPos, 3, GLES20.GL_FLOAT, false, NecpraMesh.STRIDE * 4, 0);
        GLES20.glDrawElements(GLES20.GL_TRIANGLES, disc.count, GLES20.GL_UNSIGNED_SHORT, 0);
        GLES20.glDisableVertexAttribArray(blobPos);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0);
        GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, 0);
        GLES20.glDepthMask(true);
        GLES20.glEnable(GLES20.GL_CULL_FACE);
        GLES20.glDisable(GLES20.GL_BLEND);
    }

    /** Flat unit disc (radius 1) on y = 0 for blob shadows. */
    public static NecpraMesh discMesh() {
        return NecpraMesh.ground(2f, 2f);
    }

    // ------------------------------------------------------------------ particles

    /** Fixed-capacity particle pool drawn as soft point sprites with additive-ish alpha blending. */
    public static final class Particles {
        private final int cap;
        private final float[] px, py, pz, vx, vy, vz, life, maxLife, size, r, g, b;
        private final float gravity;
        private int next = 0;
        private final FloatBuffer buf;
        private final float[] stage;
        private int vbo;
        private final java.util.Random rnd = new java.util.Random(7);

        public Particles(int capacity, float gravity) {
            cap = capacity;
            this.gravity = gravity;
            px = new float[cap];
            py = new float[cap];
            pz = new float[cap];
            vx = new float[cap];
            vy = new float[cap];
            vz = new float[cap];
            life = new float[cap];
            maxLife = new float[cap];
            size = new float[cap];
            r = new float[cap];
            g = new float[cap];
            b = new float[cap];
            stage = new float[cap * 8];
            buf = ByteBuffer.allocateDirect(cap * 8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        }

        public void emit(float x, float y, float z, float dx, float dy, float dz, float lifeSec, float sz, float cr, float cg, float cb) {
            int i = next;
            next = (next + 1) % cap;
            px[i] = x;
            py[i] = y;
            pz[i] = z;
            vx[i] = dx;
            vy[i] = dy;
            vz[i] = dz;
            life[i] = maxLife[i] = lifeSec;
            size[i] = sz;
            r[i] = cr;
            g[i] = cg;
            b[i] = cb;
        }

        /** Radial burst. */
        public void burst(float x, float y, float z, int n, float speed, float lifeSec, float sz, float cr, float cg, float cb) {
            for (int i = 0; i < n; i++) {
                double th = rnd.nextDouble() * Math.PI * 2, ph = Math.acos(rnd.nextDouble() * 2 - 1);
                float s = speed * (0.35f + rnd.nextFloat() * 0.65f);
                emit(x, y, z, (float) (Math.sin(ph) * Math.cos(th)) * s, (float) Math.abs(Math.cos(ph)) * s + speed * 0.25f,
                        (float) (Math.sin(ph) * Math.sin(th)) * s, lifeSec * (0.6f + rnd.nextFloat() * 0.4f), sz * (0.6f + rnd.nextFloat() * 0.6f), cr, cg, cb);
            }
        }

        public void update(float dt) {
            for (int i = 0; i < cap; i++) {
                if (life[i] <= 0) continue;
                life[i] -= dt;
                vy[i] -= gravity * dt;
                px[i] += vx[i] * dt;
                py[i] += vy[i] * dt;
                pz[i] += vz[i] * dt;
            }
        }

        public boolean alive() {
            for (int i = 0; i < cap; i++) if (life[i] > 0) return true;
            return false;
        }
    }

    private int particleVbo;

    public void drawParticles(Particles p) {
        int n = 0;
        for (int i = 0; i < p.cap; i++) {
            if (p.life[i] <= 0) continue;
            float t = p.life[i] / p.maxLife[i];
            int o = n * 8;
            p.stage[o] = p.px[i];
            p.stage[o + 1] = p.py[i];
            p.stage[o + 2] = p.pz[i];
            p.stage[o + 3] = p.size[i] * (0.4f + 0.6f * t);
            p.stage[o + 4] = p.r[i];
            p.stage[o + 5] = p.g[i];
            p.stage[o + 6] = p.b[i];
            p.stage[o + 7] = Math.min(1f, t * 1.6f);
            n++;
        }
        if (n == 0) return;
        if (particleVbo == 0) {
            int[] b = new int[1];
            GLES20.glGenBuffers(1, b, 0);
            particleVbo = b[0];
        }
        p.buf.clear();
        p.buf.put(p.stage, 0, n * 8).position(0);
        GLES20.glEnable(GLES20.GL_BLEND);
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE);
        GLES20.glDepthMask(false);
        GLES20.glUseProgram(progPart);
        GLES20.glUniformMatrix4fv(partVP, 1, false, viewProj, 0);
        GLES20.glUniform1f(partScale, height * 0.5f);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, particleVbo);
        GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, n * 32, p.buf, GLES20.GL_STREAM_DRAW);
        GLES20.glEnableVertexAttribArray(partPos);
        GLES20.glVertexAttribPointer(partPos, 4, GLES20.GL_FLOAT, false, 32, 0);
        GLES20.glEnableVertexAttribArray(partColor);
        GLES20.glVertexAttribPointer(partColor, 4, GLES20.GL_FLOAT, false, 32, 16);
        GLES20.glDrawArrays(GLES20.GL_POINTS, 0, n);
        GLES20.glDisableVertexAttribArray(partPos);
        GLES20.glDisableVertexAttribArray(partColor);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0);
        GLES20.glDepthMask(true);
        GLES20.glDisable(GLES20.GL_BLEND);
    }

    // ------------------------------------------------------------------ view

    /** GLSurfaceView hosting a Scene; asks for 4x MSAA first and degrades to the default config. */
    public static final class View extends GLSurfaceView {
        private final NecpraGl gl = new NecpraGl();
        private volatile Scene scene;
        private long last;

        public View(Context ctx, Scene s) {
            super(ctx);
            scene = s;
            setEGLContextClientVersion(2);
            setEGLConfigChooser(new MsaaChooser());
            setPreserveEGLContextOnPause(false);
            setRenderer(new Renderer());
            setRenderMode(RENDERMODE_CONTINUOUSLY);
        }

        public NecpraGl gl() { return gl; }

        /** Swap to another scene (GL thread safe). */
        public void setScene(final Scene s) {
            queueEvent(new Runnable() {
                @Override public void run() {
                    scene = s;
                    if (gl.width > 1) {
                        s.onGlReady(gl);
                        s.onSize(gl, gl.width, gl.height);
                    }
                }
            });
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            final int act = e.getActionMasked();
            final int idx = e.getActionIndex();
            final float x = e.getX(idx), y = e.getY(idx);
            final int id = e.getPointerId(idx);
            final Scene s = scene;
            if (s == null) return true;
            if (act == MotionEvent.ACTION_MOVE) {
                for (int i = 0; i < e.getPointerCount(); i++) {
                    final float mx = e.getX(i), my = e.getY(i);
                    final int pid = e.getPointerId(i);
                    queueEvent(new Runnable() { @Override public void run() { s.onTouch(gl, MotionEvent.ACTION_MOVE, mx, my, pid); } });
                }
                return true;
            }
            int mapped = act == MotionEvent.ACTION_POINTER_DOWN ? MotionEvent.ACTION_DOWN
                    : act == MotionEvent.ACTION_POINTER_UP ? MotionEvent.ACTION_UP : act;
            final int fm = mapped;
            queueEvent(new Runnable() { @Override public void run() { s.onTouch(gl, fm, x, y, id); } });
            if (act == MotionEvent.ACTION_UP) performClick();
            return true;
        }

        @Override
        public boolean performClick() { return super.performClick(); }

        private final class Renderer implements GLSurfaceView.Renderer {
            @Override
            public void onSurfaceCreated(GL10 unused, EGLConfig config) {
                gl.init();
                GLES20.glEnable(GLES20.GL_DEPTH_TEST);
                last = System.nanoTime();
                Scene s = scene;
                if (s != null) s.onGlReady(gl);
            }

            @Override
            public void onSurfaceChanged(GL10 unused, int w, int h) {
                gl.width = Math.max(1, w);
                gl.height = Math.max(1, h);
                GLES20.glViewport(0, 0, w, h);
                Scene s = scene;
                if (s != null) s.onSize(gl, gl.width, gl.height);
            }

            @Override
            public void onDrawFrame(GL10 unused) {
                long now = System.nanoTime();
                float dt = Math.min(0.05f, (now - last) / 1e9f);
                last = now;
                Scene s = scene;
                if (s == null) return;
                s.update(gl, dt);
                s.render(gl);
            }
        }
    }

    private static final class MsaaChooser implements GLSurfaceView.EGLConfigChooser {
        @Override
        public EGLConfig chooseConfig(EGL10 egl, EGLDisplay display) {
            EGLConfig c = pick(egl, display, 4, 24);
            if (c == null) c = pick(egl, display, 4, 16);
            if (c == null) c = pick(egl, display, 0, 24);
            if (c == null) c = pick(egl, display, 0, 16);
            if (c == null) throw new IllegalStateException("No EGL config for OpenGL ES 2.0");
            return c;
        }

        private EGLConfig pick(EGL10 egl, EGLDisplay d, int samples, int depth) {
            int[] attrs;
            if (samples > 0) {
                attrs = new int[]{EGL10.EGL_RED_SIZE, 8, EGL10.EGL_GREEN_SIZE, 8, EGL10.EGL_BLUE_SIZE, 8, EGL10.EGL_ALPHA_SIZE, 8,
                        EGL10.EGL_DEPTH_SIZE, depth, EGL10.EGL_RENDERABLE_TYPE, 4, EGL10.EGL_SAMPLE_BUFFERS, 1, EGL10.EGL_SAMPLES, samples, EGL10.EGL_NONE};
            } else {
                attrs = new int[]{EGL10.EGL_RED_SIZE, 8, EGL10.EGL_GREEN_SIZE, 8, EGL10.EGL_BLUE_SIZE, 8, EGL10.EGL_ALPHA_SIZE, 8,
                        EGL10.EGL_DEPTH_SIZE, depth, EGL10.EGL_RENDERABLE_TYPE, 4, EGL10.EGL_NONE};
            }
            int[] n = new int[1];
            if (!egl.eglChooseConfig(d, attrs, null, 0, n) || n[0] <= 0) return null;
            EGLConfig[] cfgs = new EGLConfig[n[0]];
            if (!egl.eglChooseConfig(d, attrs, cfgs, n[0], n)) return null;
            return cfgs[0];
        }
    }

    /** Unused-but-handy shared scratch matrix to avoid per-frame allocation in scenes. */
    public float[] scratch() { return tmp; }
}
