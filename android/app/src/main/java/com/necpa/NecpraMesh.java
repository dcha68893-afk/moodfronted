package com.necpa;

import java.util.Arrays;

/**
 * Indexed triangle mesh with interleaved position + normal (6 floats per vertex), plus procedural
 * builders (rounded boxes, lathe/revolve profiles, spheres, tori, extruded outlines...). Pure Java so
 * the geometry can be tested on a plain JVM; the GL layer just uploads {@link #vertices} / {@link #indices}.
 */
public final class NecpraMesh {
    public static final int STRIDE = 6;

    public float[] vertices;
    public int[] indices;

    public NecpraMesh(float[] vertices, int[] indices) {
        this.vertices = vertices;
        this.indices = indices;
    }

    public int vertexCount() {
        return vertices.length / STRIDE;
    }

    public int triangleCount() {
        return indices.length / 3;
    }

    // ------------------------------------------------------------------ builder

    /** Growable mesh builder. */
    public static final class Builder {
        private float[] v = new float[1024];
        private int vn = 0; // floats used
        private int[] ix = new int[1536];
        private int in = 0;

        public int vertex(float x, float y, float z, float nx, float ny, float nz) {
            if (vn + STRIDE > v.length) v = Arrays.copyOf(v, v.length * 2);
            int id = vn / STRIDE;
            v[vn++] = x;
            v[vn++] = y;
            v[vn++] = z;
            v[vn++] = nx;
            v[vn++] = ny;
            v[vn++] = nz;
            return id;
        }

        public void tri(int a, int b, int c) {
            if (in + 3 > ix.length) ix = Arrays.copyOf(ix, ix.length * 2);
            ix[in++] = a;
            ix[in++] = b;
            ix[in++] = c;
        }

        public void quad(int a, int b, int c, int d) {
            tri(a, b, c);
            tri(a, c, d);
        }

        public int vertexCount() {
            return vn / STRIDE;
        }

        public NecpraMesh build() {
            return new NecpraMesh(Arrays.copyOf(v, vn), Arrays.copyOf(ix, in));
        }

        /** Appends another mesh transformed by m (m may contain rotation + uniform/non-uniform scale). */
        public Builder append(NecpraMesh mesh, float[] m) {
            int base = vertexCount();
            // Normal matrix = inverse-transpose of the upper 3x3; for the common rotation/uniform-scale case
            // this equals the upper 3x3, but we compute it properly for non-uniform scale.
            float[] n = normalMatrix(m);
            for (int i = 0; i < mesh.vertexCount(); i++) {
                int o = i * STRIDE;
                float x = mesh.vertices[o], y = mesh.vertices[o + 1], z = mesh.vertices[o + 2];
                float nx = mesh.vertices[o + 3], ny = mesh.vertices[o + 4], nz = mesh.vertices[o + 5];
                float px = m[0] * x + m[4] * y + m[8] * z + m[12];
                float py = m[1] * x + m[5] * y + m[9] * z + m[13];
                float pz = m[2] * x + m[6] * y + m[10] * z + m[14];
                float qx = n[0] * nx + n[3] * ny + n[6] * nz;
                float qy = n[1] * nx + n[4] * ny + n[7] * nz;
                float qz = n[2] * nx + n[5] * ny + n[8] * nz;
                float l = (float) Math.sqrt(qx * qx + qy * qy + qz * qz);
                if (l > 0f) {
                    qx /= l;
                    qy /= l;
                    qz /= l;
                }
                vertex(px, py, pz, qx, qy, qz);
            }
            // A mirroring transform flips triangle winding; keep faces outward.
            boolean flip = determinant3(m) < 0f;
            for (int i = 0; i < mesh.indices.length; i += 3) {
                int a = base + mesh.indices[i], b = base + mesh.indices[i + 1], c = base + mesh.indices[i + 2];
                if (flip) tri(a, c, b);
                else tri(a, b, c);
            }
            return this;
        }
    }

    // ------------------------------------------------------------------ helpers

    private static float determinant3(float[] m) {
        return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
    }

    /** Column-major 3x3 inverse transpose of the upper-left of m. */
    static float[] normalMatrix(float[] m) {
        float a = m[0], b = m[4], c = m[8];
        float d = m[1], e = m[5], f = m[9];
        float g = m[2], h = m[6], i = m[10];
        float det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
        if (Math.abs(det) < 1e-12f) return new float[]{1, 0, 0, 0, 1, 0, 0, 0, 1};
        float id = 1f / det;
        // cofactor matrix (this IS the inverse transpose once divided by det)
        float c00 = (e * i - f * h) * id, c01 = -(d * i - f * g) * id, c02 = (d * h - e * g) * id;
        float c10 = -(b * i - c * h) * id, c11 = (a * i - c * g) * id, c12 = -(a * h - b * g) * id;
        float c20 = (b * f - c * e) * id, c21 = -(a * f - c * d) * id, c22 = (a * e - b * d) * id;
        // column-major: columns are (c00,c01,c02), (c10,c11,c12), (c20,c21,c22)
        return new float[]{c00, c01, c02, c10, c11, c12, c20, c21, c22};
    }

    public NecpraMesh transformed(float[] m) {
        return new Builder().append(this, m).build();
    }

    public static NecpraMesh merge(NecpraMesh... meshes) {
        Builder b = new Builder();
        float[] id = NecpraMath.identity();
        for (NecpraMesh m : meshes) if (m != null) b.append(m, id);
        return b.build();
    }

    /** {minX,minY,minZ,maxX,maxY,maxZ} */
    public float[] bounds() {
        float[] r = {Float.MAX_VALUE, Float.MAX_VALUE, Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE};
        for (int i = 0; i < vertexCount(); i++) {
            for (int k = 0; k < 3; k++) {
                float x = vertices[i * STRIDE + k];
                if (x < r[k]) r[k] = x;
                if (x > r[k + 3]) r[k + 3] = x;
            }
        }
        return r;
    }

    // ------------------------------------------------------------------ primitives

    /** Axis-aligned box centred on the origin with flat shading. */
    public static NecpraMesh box(float w, float h, float d) {
        Builder b = new Builder();
        float x = w / 2f, y = h / 2f, z = d / 2f;
        // +X, -X, +Y, -Y, +Z, -Z (counter-clockwise seen from outside)
        face(b, x, -y, z, x, -y, -z, x, y, -z, x, y, z, 1, 0, 0);
        face(b, -x, -y, -z, -x, -y, z, -x, y, z, -x, y, -z, -1, 0, 0);
        face(b, -x, y, z, x, y, z, x, y, -z, -x, y, -z, 0, 1, 0);
        face(b, -x, -y, -z, x, -y, -z, x, -y, z, -x, -y, z, 0, -1, 0);
        face(b, -x, -y, z, x, -y, z, x, y, z, -x, y, z, 0, 0, 1);
        face(b, x, -y, -z, -x, -y, -z, -x, y, -z, x, y, -z, 0, 0, -1);
        return b.build();
    }

    private static void face(Builder b, float ax, float ay, float az, float bx, float by, float bz,
                             float cx, float cy, float cz, float dx, float dy, float dz, float nx, float ny, float nz) {
        int a = b.vertex(ax, ay, az, nx, ny, nz);
        int bb = b.vertex(bx, by, bz, nx, ny, nz);
        int c = b.vertex(cx, cy, cz, nx, ny, nz);
        int d = b.vertex(dx, dy, dz, nx, ny, nz);
        b.quad(a, bb, c, d);
    }

    /** Horizontal quad on y = 0 facing up. */
    public static NecpraMesh ground(float w, float d) {
        Builder b = new Builder();
        float x = w / 2f, z = d / 2f;
        face(b, -x, 0, z, x, 0, z, x, 0, -z, -x, 0, -z, 0, 1, 0);
        return b.build();
    }

    /** Box with real rounded edges and corners (smooth normals). */
    public static NecpraMesh roundedBox(float w, float h, float d, float r, int seg) {
        float hx = w / 2f, hy = h / 2f, hz = d / 2f;
        float maxR = Math.min(hx, Math.min(hy, hz)) * 0.98f;
        if (r > maxR) r = maxR;
        if (r <= 1e-5f || seg < 1) return box(w, h, d);
        float[] sx = axisSamples(hx, r, seg), sy = axisSamples(hy, r, seg), sz = axisSamples(hz, r, seg);
        Builder b = new Builder();
        // face axis, sign, and the two grid axes (chosen so (u x v) points along +face-normal for CCW winding)
        roundedFace(b, 0, 1, sy, sz, hx, hy, hz, r);
        roundedFace(b, 0, -1, sz, sy, hx, hy, hz, r);
        roundedFace(b, 1, 1, sz, sx, hx, hy, hz, r);
        roundedFace(b, 1, -1, sx, sz, hx, hy, hz, r);
        roundedFace(b, 2, 1, sx, sy, hx, hy, hz, r);
        roundedFace(b, 2, -1, sy, sx, hx, hy, hz, r);
        return b.build();
    }

    private static float[] axisSamples(float H, float r, int seg) {
        float[] s = new float[(seg + 1) * 2];
        for (int k = 0; k <= seg; k++) {
            // angle runs 45deg -> 0deg across the low rounded band; u = -H + r(1 - tan(angle))
            double a = (Math.PI / 4.0) * (1.0 - (double) k / seg);
            s[k] = -H + r * (1f - (float) Math.tan(a));
        }
        for (int k = 0; k <= seg; k++) s[(seg + 1) + k] = -s[seg - k];
        return s;
    }

    private static void roundedFace(Builder b, int faceAxis, int sign, float[] su, float[] sv,
                                    float hx, float hy, float hz, float r) {
        int uAxis = (faceAxis + 1) % 3, vAxis = (faceAxis + 2) % 3;
        // Which of (uAxis,vAxis) the caller's sample arrays belong to depends on call order above; we pass
        // them in the order (uAxis samples, vAxis samples) EXCEPT for negative faces, where the caller swapped
        // them so that winding stays counter-clockwise. Work out the real assignment.
        float[] sa = sign > 0 ? su : sv; // samples along uAxis
        float[] sb = sign > 0 ? sv : su; // samples along vAxis
        float[] half = {hx, hy, hz};
        int nu = sa.length, nv = sb.length;
        int[][] id = new int[nu][nv];
        for (int i = 0; i < nu; i++) {
            for (int j = 0; j < nv; j++) {
                float[] p = new float[3];
                p[faceAxis] = sign * half[faceAxis];
                p[uAxis] = sa[i];
                p[vAxis] = sb[j];
                float[] in = new float[3];
                for (int k = 0; k < 3; k++) {
                    float lim = half[k] - r;
                    in[k] = p[k] < -lim ? -lim : (p[k] > lim ? lim : p[k]);
                }
                float nx = p[0] - in[0], ny = p[1] - in[1], nz = p[2] - in[2];
                float l = (float) Math.sqrt(nx * nx + ny * ny + nz * nz);
                if (l < 1e-6f) {
                    nx = ny = nz = 0f;
                    if (faceAxis == 0) nx = sign;
                    else if (faceAxis == 1) ny = sign;
                    else nz = sign;
                } else {
                    nx /= l;
                    ny /= l;
                    nz /= l;
                }
                id[i][j] = b.vertex(in[0] + nx * r, in[1] + ny * r, in[2] + nz * r, nx, ny, nz);
            }
        }
        for (int i = 0; i < nu - 1; i++) {
            for (int j = 0; j < nv - 1; j++) {
                if (sign > 0) b.quad(id[i][j], id[i + 1][j], id[i + 1][j + 1], id[i][j + 1]);
                else b.quad(id[i][j], id[i][j + 1], id[i + 1][j + 1], id[i + 1][j]);
            }
        }
    }

    // ------------------------------------------------------------------ lathe (surface of revolution)

    /**
     * Revolves a profile about the Y axis. The profile is a list of (radius, y) points ordered so that the
     * OUTSIDE of the solid is on the right-hand side of the direction of travel (bottom centre -> outer wall ->
     * top -> inner), i.e. the usual "bottom to top along the outside" order. Sharp corners (more than ~40 degrees)
     * automatically get split normals, so caps stay crisp while curved bodies stay smooth.
     */
    public static NecpraMesh lathe(float[] radius, float[] y, int seg) {
        int n = radius.length;
        if (n < 2 || y.length != n || seg < 3) return new NecpraMesh(new float[0], new int[0]);
        // per-segment outward normals in the (r,y) plane
        float[] snr = new float[n - 1], sny = new float[n - 1];
        for (int i = 0; i < n - 1; i++) {
            float dr = radius[i + 1] - radius[i], dy = y[i + 1] - y[i];
            float l = (float) Math.sqrt(dr * dr + dy * dy);
            if (l < 1e-9f) {
                snr[i] = 1f;
                sny[i] = 0f;
                continue;
            }
            snr[i] = dy / l;
            sny[i] = -dr / l;
        }
        // build rows: each row = (r, y, nr, ny)
        float[][] rows = new float[n * 2][];
        int[] startRow = new int[n - 1], endRow = new int[n - 1];
        int rc = 0;
        float cosLimit = (float) Math.cos(Math.toRadians(40));
        for (int i = 0; i < n; i++) {
            boolean hasIn = i > 0, hasOut = i < n - 1;
            if (hasIn && hasOut) {
                float dot = snr[i - 1] * snr[i] + sny[i - 1] * sny[i];
                if (dot >= cosLimit) {
                    float nr = snr[i - 1] + snr[i], ny = sny[i - 1] + sny[i];
                    float l = (float) Math.sqrt(nr * nr + ny * ny);
                    if (l > 0f) {
                        nr /= l;
                        ny /= l;
                    }
                    rows[rc] = new float[]{radius[i], y[i], nr, ny};
                    endRow[i - 1] = rc;
                    startRow[i] = rc;
                    rc++;
                } else {
                    rows[rc] = new float[]{radius[i], y[i], snr[i - 1], sny[i - 1]};
                    endRow[i - 1] = rc++;
                    rows[rc] = new float[]{radius[i], y[i], snr[i], sny[i]};
                    startRow[i] = rc++;
                }
            } else if (hasOut) {
                rows[rc] = new float[]{radius[i], y[i], snr[i], sny[i]};
                startRow[i] = rc++;
            } else {
                rows[rc] = new float[]{radius[i], y[i], snr[i - 1], sny[i - 1]};
                endRow[i - 1] = rc++;
            }
        }
        Builder b = new Builder();
        int[][] vid = new int[rc][seg + 1];
        for (int r = 0; r < rc; r++) {
            for (int s = 0; s <= seg; s++) {
                double a = 2.0 * Math.PI * s / seg;
                float ca = (float) Math.cos(a), sa = (float) Math.sin(a);
                float rad = rows[r][0];
                vid[r][s] = b.vertex(rad * ca, rows[r][1], rad * sa, rows[r][2] * ca, rows[r][3], rows[r][2] * sa);
            }
        }
        for (int i = 0; i < n - 1; i++) {
            int r0 = startRow[i], r1 = endRow[i];
            // skip degenerate (zero-length) segments
            if (Math.abs(radius[i + 1] - radius[i]) < 1e-9f && Math.abs(y[i + 1] - y[i]) < 1e-9f) continue;
            boolean poleLow = radius[i] < 1e-9f, poleHigh = radius[i + 1] < 1e-9f;
            for (int s = 0; s < seg; s++) {
                int a = vid[r0][s], bb = vid[r0][s + 1], c = vid[r1][s + 1], d = vid[r1][s];
                // Winding verified by the unit tests: faces point along the stored outward normal. A ring that
                // collapses onto the axis would produce a zero-area triangle, so it is skipped.
                if (!poleLow) b.tri(a, c, bb);
                if (!poleHigh) b.tri(a, d, c);
            }
        }
        return b.build();
    }

    public static NecpraMesh cylinder(float r, float h, int seg) {
        float[] rr = {0f, r, r, 0f};
        float[] yy = {-h / 2f, -h / 2f, h / 2f, h / 2f};
        return lathe(rr, yy, seg);
    }

    public static NecpraMesh sphere(float r, int lat, int lon) {
        float[] rr = new float[lat + 1], yy = new float[lat + 1];
        for (int i = 0; i <= lat; i++) {
            double a = -Math.PI / 2.0 + Math.PI * i / lat;
            rr[i] = (float) (r * Math.cos(a));
            yy[i] = (float) (r * Math.sin(a));
        }
        rr[0] = 0f;
        rr[lat] = 0f;
        return lathe(rr, yy, lon);
    }

    public static NecpraMesh torus(float major, float minor, int segMajor, int segMinor) {
        float[] rr = new float[segMinor + 1], yy = new float[segMinor + 1];
        // circle travelling counter-clockwise so the outside is on the right-hand side
        for (int i = 0; i <= segMinor; i++) {
            double a = -Math.PI / 2.0 + 2.0 * Math.PI * i / segMinor;
            rr[i] = major + (float) (minor * Math.cos(a));
            yy[i] = (float) (minor * Math.sin(a));
        }
        return lathe(rr, yy, segMajor);
    }

    // ------------------------------------------------------------------ extrusion (for the knight etc.)

    /**
     * Extrudes a simple (possibly concave) polygon given as x,y pairs in COUNTER-CLOCKWISE order along Z.
     * The shape occupies z in [-depth/2, depth/2]. Side normals are smoothed across gentle corners.
     */
    public static NecpraMesh extrude(float[] poly, float depth) {
        int n = poly.length / 2;
        if (n < 3) return new NecpraMesh(new float[0], new int[0]);
        Builder b = new Builder();
        float z0 = -depth / 2f, z1 = depth / 2f;
        // cap triangulation by ear clipping
        int[] tris = earClip(poly);
        int front = b.vertexCount();
        for (int i = 0; i < n; i++) b.vertex(poly[i * 2], poly[i * 2 + 1], z1, 0, 0, 1);
        for (int i = 0; i < tris.length; i += 3) b.tri(front + tris[i], front + tris[i + 1], front + tris[i + 2]);
        int back = b.vertexCount();
        for (int i = 0; i < n; i++) b.vertex(poly[i * 2], poly[i * 2 + 1], z0, 0, 0, -1);
        for (int i = 0; i < tris.length; i += 3) b.tri(back + tris[i], back + tris[i + 2], back + tris[i + 1]);
        // sides
        float[] en = new float[n * 2];
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            float dx = poly[j * 2] - poly[i * 2], dy = poly[j * 2 + 1] - poly[i * 2 + 1];
            float l = (float) Math.sqrt(dx * dx + dy * dy);
            if (l < 1e-9f) l = 1f;
            en[i * 2] = dy / l;
            en[i * 2 + 1] = -dx / l;
        }
        float cosLimit = (float) Math.cos(Math.toRadians(50));
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n, p = (i + n - 1) % n;
            // normals at the start and end of this edge (smoothed if gentle with neighbours)
            float[] ns = smoothNormal(en, p, i, cosLimit), ne = smoothNormal(en, i, j, cosLimit);
            int a = b.vertex(poly[i * 2], poly[i * 2 + 1], z0, ns[0], ns[1], 0);
            int bb = b.vertex(poly[j * 2], poly[j * 2 + 1], z0, ne[0], ne[1], 0);
            int c = b.vertex(poly[j * 2], poly[j * 2 + 1], z1, ne[0], ne[1], 0);
            int d = b.vertex(poly[i * 2], poly[i * 2 + 1], z1, ns[0], ns[1], 0);
            b.quad(a, bb, c, d);
        }
        return b.build();
    }

    private static float[] smoothNormal(float[] en, int e1, int e2, float cosLimit) {
        float ax = en[e1 * 2], ay = en[e1 * 2 + 1], bx = en[e2 * 2], by = en[e2 * 2 + 1];
        // returns the normal to use for the edge e2 at its junction with e1
        if (ax * bx + ay * by >= cosLimit) {
            float x = ax + bx, y = ay + by, l = (float) Math.sqrt(x * x + y * y);
            return l > 0f ? new float[]{x / l, y / l} : new float[]{bx, by};
        }
        return new float[]{bx, by};
    }

    /** Ear clipping for a simple CCW polygon; returns triangle index triples into the vertex list. */
    public static int[] earClip(float[] poly) {
        int n = poly.length / 2;
        int[] idx = new int[n];
        for (int i = 0; i < n; i++) idx[i] = i;
        int[] out = new int[(n - 2) * 3];
        int oc = 0, count = n, guard = 0;
        while (count > 3 && guard++ < 10000) {
            boolean clipped = false;
            for (int i = 0; i < count; i++) {
                int ia = idx[(i + count - 1) % count], ib = idx[i], ic = idx[(i + 1) % count];
                float ax = poly[ia * 2], ay = poly[ia * 2 + 1], bx = poly[ib * 2], by = poly[ib * 2 + 1], cx = poly[ic * 2], cy = poly[ic * 2 + 1];
                float cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
                if (cross <= 1e-9f) continue; // reflex or collinear
                boolean inside = false;
                for (int k = 0; k < count; k++) {
                    int ip = idx[k];
                    if (ip == ia || ip == ib || ip == ic) continue;
                    if (pointInTri(poly[ip * 2], poly[ip * 2 + 1], ax, ay, bx, by, cx, cy)) {
                        inside = true;
                        break;
                    }
                }
                if (inside) continue;
                out[oc++] = ia;
                out[oc++] = ib;
                out[oc++] = ic;
                System.arraycopy(idx, i + 1, idx, i, count - i - 1);
                count--;
                clipped = true;
                break;
            }
            if (!clipped) break; // degenerate input; stop rather than loop forever
        }
        if (count == 3 && oc + 3 <= out.length) {
            out[oc++] = idx[0];
            out[oc++] = idx[1];
            out[oc++] = idx[2];
        }
        return oc == out.length ? out : Arrays.copyOf(out, oc);
    }

    private static boolean pointInTri(float px, float py, float ax, float ay, float bx, float by, float cx, float cy) {
        float d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
        float d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
        float d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
        boolean neg = d1 < 0 || d2 < 0 || d3 < 0;
        boolean pos = d1 > 0 || d2 > 0 || d3 > 0;
        return !(neg && pos);
    }
}
