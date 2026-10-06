package com.necpa;

/**
 * Small, dependency-free 3D math for the native arcade (column-major 4x4 matrices, same layout
 * OpenGL expects). It deliberately avoids android.opengl.Matrix so every function here can be unit
 * tested on a plain JVM and reused by the CPU preview/test harness.
 */
public final class NecpraMath {
    private NecpraMath() {}

    public static float[] identity() {
        float[] m = new float[16];
        m[0] = m[5] = m[10] = m[15] = 1f;
        return m;
    }

    public static void setIdentity(float[] m) {
        for (int i = 0; i < 16; i++) m[i] = 0f;
        m[0] = m[5] = m[10] = m[15] = 1f;
    }

    public static void copy(float[] dst, float[] src) {
        System.arraycopy(src, 0, dst, 0, 16);
    }

    /** out = a * b (out may alias neither input). */
    public static void multiply(float[] out, float[] a, float[] b) {
        for (int c = 0; c < 4; c++) {
            for (int r = 0; r < 4; r++) {
                float s = 0f;
                for (int k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
                out[c * 4 + r] = s;
            }
        }
    }

    public static float[] mul(float[] a, float[] b) {
        float[] o = new float[16];
        multiply(o, a, b);
        return o;
    }

    public static float[] translation(float x, float y, float z) {
        float[] m = identity();
        m[12] = x;
        m[13] = y;
        m[14] = z;
        return m;
    }

    public static float[] scaling(float x, float y, float z) {
        float[] m = identity();
        m[0] = x;
        m[5] = y;
        m[10] = z;
        return m;
    }

    public static float[] rotationX(float rad) {
        float[] m = identity();
        float c = (float) Math.cos(rad), s = (float) Math.sin(rad);
        m[5] = c;
        m[6] = s;
        m[9] = -s;
        m[10] = c;
        return m;
    }

    public static float[] rotationY(float rad) {
        float[] m = identity();
        float c = (float) Math.cos(rad), s = (float) Math.sin(rad);
        m[0] = c;
        m[2] = -s;
        m[8] = s;
        m[10] = c;
        return m;
    }

    public static float[] rotationZ(float rad) {
        float[] m = identity();
        float c = (float) Math.cos(rad), s = (float) Math.sin(rad);
        m[0] = c;
        m[1] = s;
        m[4] = -s;
        m[5] = c;
        return m;
    }

    /** Translate * RotateY * RotateX * RotateZ * Scale composed in one call (the usual model matrix). */
    public static float[] model(float tx, float ty, float tz, float rx, float ry, float rz, float sx, float sy, float sz) {
        float[] m = translation(tx, ty, tz);
        if (ry != 0f) m = mul(m, rotationY(ry));
        if (rx != 0f) m = mul(m, rotationX(rx));
        if (rz != 0f) m = mul(m, rotationZ(rz));
        if (sx != 1f || sy != 1f || sz != 1f) m = mul(m, scaling(sx, sy, sz));
        return m;
    }

    public static float[] perspective(float fovYDeg, float aspect, float near, float far) {
        float f = (float) (1.0 / Math.tan(Math.toRadians(fovYDeg) / 2.0));
        float[] m = new float[16];
        m[0] = f / aspect;
        m[5] = f;
        m[10] = (far + near) / (near - far);
        m[11] = -1f;
        m[14] = (2f * far * near) / (near - far);
        return m;
    }

    public static float[] lookAt(float ex, float ey, float ez, float cx, float cy, float cz, float ux, float uy, float uz) {
        float fx = cx - ex, fy = cy - ey, fz = cz - ez;
        float fl = (float) Math.sqrt(fx * fx + fy * fy + fz * fz);
        if (fl == 0f) return identity();
        fx /= fl;
        fy /= fl;
        fz /= fl;
        // s = f x up
        float sx = fy * uz - fz * uy, sy = fz * ux - fx * uz, sz = fx * uy - fy * ux;
        float sl = (float) Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (sl == 0f) return identity();
        sx /= sl;
        sy /= sl;
        sz /= sl;
        // u = s x f
        float uxx = sy * fz - sz * fy, uyy = sz * fx - sx * fz, uzz = sx * fy - sy * fx;
        float[] m = new float[16];
        m[0] = sx;
        m[1] = uxx;
        m[2] = -fx;
        m[4] = sy;
        m[5] = uyy;
        m[6] = -fy;
        m[8] = sz;
        m[9] = uzz;
        m[10] = -fz;
        m[12] = -(sx * ex + sy * ey + sz * ez);
        m[13] = -(uxx * ex + uyy * ey + uzz * ez);
        m[14] = (fx * ex + fy * ey + fz * ez);
        m[15] = 1f;
        return m;
    }

    /** General 4x4 inverse; returns null for singular matrices. */
    public static float[] invert(float[] m) {
        float[] inv = new float[16];
        inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
        inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
        inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
        inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
        inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
        inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
        inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
        inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
        inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
        inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
        inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
        inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
        inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
        inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
        inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
        inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
        float det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
        if (det == 0f) return null;
        det = 1f / det;
        for (int i = 0; i < 16; i++) inv[i] *= det;
        return inv;
    }

    /** Transforms a point (w = 1) and returns xyz after the perspective divide. */
    public static float[] transformPoint(float[] m, float x, float y, float z) {
        float ox = m[0] * x + m[4] * y + m[8] * z + m[12];
        float oy = m[1] * x + m[5] * y + m[9] * z + m[13];
        float oz = m[2] * x + m[6] * y + m[10] * z + m[14];
        float ow = m[3] * x + m[7] * y + m[11] * z + m[15];
        if (ow != 0f && ow != 1f) {
            ox /= ow;
            oy /= ow;
            oz /= ow;
        }
        return new float[]{ox, oy, oz};
    }

    /**
     * Builds a world-space picking ray from a screen position.
     * @return {ox, oy, oz, dx, dy, dz} with a normalised direction, or null if the matrix is singular.
     */
    public static float[] screenRay(float[] viewProj, float sx, float sy, int width, int height) {
        float[] inv = invert(viewProj);
        if (inv == null || width <= 0 || height <= 0) return null;
        float nx = (2f * sx / width) - 1f;
        float ny = 1f - (2f * sy / height);
        float[] a = transformPoint(inv, nx, ny, -1f);
        float[] b = transformPoint(inv, nx, ny, 1f);
        float dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        float l = (float) Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (l == 0f) return null;
        return new float[]{a[0], a[1], a[2], dx / l, dy / l, dz / l};
    }

    /** Intersects a ray with the horizontal plane y = planeY. Returns {x, z} or null when parallel/behind. */
    public static float[] rayHitPlaneY(float[] ray, float planeY) {
        if (ray == null) return null;
        float dy = ray[4];
        if (Math.abs(dy) < 1e-6f) return null;
        float t = (planeY - ray[1]) / dy;
        if (t < 0f) return null;
        return new float[]{ray[0] + ray[3] * t, ray[2] + ray[5] * t};
    }

    /** Ray / axis-aligned box. Returns the entry distance or -1 when missed. */
    public static float rayHitBox(float[] ray, float minX, float minY, float minZ, float maxX, float maxY, float maxZ) {
        if (ray == null) return -1f;
        float tmin = 0f, tmax = Float.MAX_VALUE;
        float[] o = {ray[0], ray[1], ray[2]};
        float[] d = {ray[3], ray[4], ray[5]};
        float[] lo = {minX, minY, minZ};
        float[] hi = {maxX, maxY, maxZ};
        for (int i = 0; i < 3; i++) {
            if (Math.abs(d[i]) < 1e-8f) {
                if (o[i] < lo[i] || o[i] > hi[i]) return -1f;
            } else {
                float inv = 1f / d[i];
                float t1 = (lo[i] - o[i]) * inv, t2 = (hi[i] - o[i]) * inv;
                if (t1 > t2) {
                    float t = t1;
                    t1 = t2;
                    t2 = t;
                }
                tmin = Math.max(tmin, t1);
                tmax = Math.min(tmax, t2);
                if (tmin > tmax) return -1f;
            }
        }
        return tmin;
    }

    public static float clamp(float v, float lo, float hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    public static float lerp(float a, float b, float t) {
        return a + (b - a) * t;
    }

    public static float smoothstep(float t) {
        t = clamp(t, 0f, 1f);
        return t * t * (3f - 2f * t);
    }

    public static float easeInOutCubic(float t) {
        t = clamp(t, 0f, 1f);
        return t < .5f ? 4f * t * t * t : 1f - (float) Math.pow(-2f * t + 2f, 3) / 2f;
    }

    public static float easeOutBack(float t) {
        t = clamp(t, 0f, 1f);
        float c1 = 1.70158f, c3 = c1 + 1f;
        float u = t - 1f;
        return 1f + c3 * u * u * u + c1 * u * u;
    }

    public static float easeOutCubic(float t) {
        t = clamp(t, 0f, 1f);
        float u = 1f - t;
        return 1f - u * u * u;
    }
}
