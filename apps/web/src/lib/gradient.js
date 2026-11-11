/*
 * Degradê fluido do fundo, o mesmo shader do AWS Hub / Pomodoro (lib/gl/gradient.ts):
 * ruído suave com domain warping e camadas que derivam em diagonais. O granulado vem por cima
 * em CSS (`.grain`). Roda num canvas pequeno (o degradê é liso, não precisa de resolução).
 */
const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;
const FRAGMENT = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash(i), f), dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.12;

  vec2 downRight = vec2(t, -t);
  vec2 upRight = vec2(t * 0.7, t * 0.9);
  vec2 upLeft = vec2(-t * 0.6, t * 0.5);

  vec2 q = vec2(noise(p * 1.1 - downRight), noise(p * 1.1 - upRight + 4.7));
  float n = noise(p * 0.9 + q * 1.8 - upLeft);
  float n2 = noise(p * 1.7 - upRight * 1.3 + 9.1) * 0.35;

  float sway = sin(t * 0.7) * 0.08;
  float d = (1.0 - uv.x) * (0.55 + sway) + uv.y * (0.45 - sway) + (n + n2) * 0.6;
  // d alto = canto de cima à esquerda (cor 1, lavada); d baixo = embaixo à direita (cor 2, viva)
  vec3 col = mix(uC2, uC3, smoothstep(0.15, 0.6, d));
  col = mix(col, uC1, smoothstep(0.55, 1.0, d));

  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
export function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function compile(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader)
        throw new Error('shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error('shader');
    return shader;
}
/** Prepara o shader no canvas; `null` sem WebGL (aí vale o degradê em CSS). */
export function createGradientRenderer(canvas) {
    // Sem WebGL nenhum (navegador antigo, testes): nem tenta.
    if (typeof WebGLRenderingContext === 'undefined')
        return null;
    let gl = null;
    try {
        gl = canvas.getContext('webgl', {
            antialias: false,
            depth: false,
            stencil: false,
            alpha: false,
            powerPreference: 'low-power',
        });
    }
    catch {
        return null;
    }
    if (!gl)
        return null;
    let program;
    try {
        program = gl.createProgram();
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
        gl.linkProgram(program);
        gl.useProgram(program);
    }
    catch {
        return null;
    }
    // Um triângulo que cobre a tela inteira.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(program, 'uRes');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uColors = ['uC1', 'uC2', 'uC3'].map((name) => gl.getUniformLocation(program, name));
    const ctx = gl;
    // Tamanho aplicado a ESTE programa (o canvas pode já ter o tamanho certo).
    let width = 0;
    let height = 0;
    return {
        resize(w, h) {
            if (w === width && h === height)
                return;
            width = canvas.width = w;
            height = canvas.height = h;
            ctx.viewport(0, 0, w, h);
            ctx.uniform2f(uRes, w, h);
        },
        setColors(colors) {
            colors.forEach((rgb, i) => ctx.uniform3fv(uColors[i] ?? null, rgb));
        },
        draw(time) {
            ctx.uniform1f(uTime, time);
            ctx.drawArrays(ctx.TRIANGLES, 0, 3);
        },
    };
}
