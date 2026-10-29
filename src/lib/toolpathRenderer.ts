import type { ModelGeometry } from "./types";

export interface PreviewCamera {
  pitch: number;
  yaw: number;
  zoom: number;
}

const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location=0) in vec3 start;
layout(location=1) in vec3 end;
layout(location=2) in vec3 color;
layout(location=3) in vec2 size;
uniform vec3 camera;
uniform vec2 aspect;
uniform float layerLimit;
out vec3 surfaceColor;
out vec3 surfaceNormal;
out float segmentTop;
vec3 rotate(vec3 point) {
  point = vec3(point.x, point.z, -point.y);
  float cy = cos(camera.y), sy = sin(camera.y);
  float cp = cos(camera.x), sp = sin(camera.x);
  vec3 turned = vec3(point.x*cy+point.z*sy, point.y, -point.x*sy+point.z*cy);
  return vec3(turned.x, turned.y*cp-turned.z*sp, turned.y*sp+turned.z*cp);
}
void main() {
  // Eight-sided elliptical strands. Every segment is an instanced solid sidewall.
  int corner = gl_VertexID % 6;
  int side = gl_VertexID / 6;
  float along = (corner == 1 || corner == 2 || corner == 4) ? 1.0 : 0.0;
  float angle = float(side + ((corner == 2 || corner == 4 || corner == 5) ? 1 : 0)) * 0.7853981634;
  vec3 direction = end - start;
  vec2 perpendicular = length(direction.xy) > 0.0000001
    ? normalize(vec2(-direction.y, direction.x)) : vec2(1.0, 0.0);
  vec3 horizontal = vec3(perpendicular, 0.0);
  vec3 offset = horizontal * cos(angle) * size.x * 0.5;
  offset.z = (sin(angle) - 1.0) * size.y * 0.5;
  vec3 point = rotate(mix(start, end, along) + offset);
  segmentTop = max(start.z, end.z);
  gl_Position = vec4(point.xy * aspect * camera.z * 1.52, -point.z * 0.25, 1.0);
  surfaceNormal = rotate(normalize(horizontal * cos(angle) * size.y + vec3(0,0,sin(angle)*size.x)));
  surfaceColor = color;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 surfaceColor;
in vec3 surfaceNormal;
in float segmentTop;
uniform float layerLimit;
out vec4 outputColor;
void main() {
  if (segmentTop > layerLimit) discard;
  float light = 0.45 + 0.55 * abs(dot(normalize(surfaceNormal), normalize(vec3(-0.35,0.65,0.68))));
  outputColor = vec4(surfaceColor * light, 1.0);
}`;

export function createToolpathRenderer(canvas: HTMLCanvasElement, geometry: ModelGeometry) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
  if (!gl) throw new Error("WebGL2 is required for the complete toolpath preview.");
  const shaders: WebGLShader[] = [];
  const buffers: WebGLBuffer[] = [];
  const program = gl.createProgram();
  const vao = gl.createVertexArray();
  const dispose = () => {
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    for (const shader of shaders) gl.deleteShader(shader);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
  };
  try {
    if (!program || !vao) throw new Error("Could not allocate toolpath renderer.");
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX_SHADER], [gl.FRAGMENT_SHADER, FRAGMENT_SHADER]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Could not allocate preview shader.");
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "Preview shader compilation failed.");
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Preview shader linking failed.");
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    geometry.positions.forEach((value, index) => {
      min[index % 3] = Math.min(min[index % 3], value);
      max[index % 3] = Math.max(max[index % 3], value);
    });
    const center = min.map((value, axis) => (value + max[axis]) / 2);
    const span = Math.max(...max.map((value, axis) => value - min[axis]), 0.001);
    const count = geometry.positions.length / 6;
    const data = new Float32Array(count * 11);
    const colorCache = new Map<string, number[]>();
    for (let index = 0; index < count; index++) {
      for (let axis = 0; axis < 6; axis++) {
        data[index * 11 + axis] = (geometry.positions[index * 6 + axis] - center[axis % 3]) / span;
      }
      const color = geometry.colors[index];
      let channels = colorCache.get(color);
      if (!channels) {
        let hex = color.replace(/^#/, "");
        if (hex.length === 8) hex = hex.slice(2);
        if (hex.length === 3) hex = hex.split("").map((part) => part + part).join("");
        if (!/^[\da-f]{6}$/i.test(hex)) hex = "94a3b8";
        channels = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
        colorCache.set(color, channels);
      }
      data.set(channels, index * 11 + 6);
      data[index * 11 + 9] = (geometry.widths?.[index] ?? 0.4) / span;
      data[index * 11 + 10] = (geometry.heights?.[index] ?? 0.2) / span;
    }
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Could not allocate toolpath geometry buffer.");
    buffers.push(buffer);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    for (const [location, size, offset] of [[0, 3, 0], [1, 3, 3], [2, 3, 6], [3, 2, 9]]) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 44, offset * 4);
      gl.vertexAttribDivisor(location, 1);
    }
    if (gl.getError() !== gl.NO_ERROR) throw new Error("Could not upload complete toolpath geometry to the GPU.");
    const cameraUniform = gl.getUniformLocation(program, "camera");
    const aspectUniform = gl.getUniformLocation(program, "aspect");
    const layerLimitUniform = gl.getUniformLocation(program, "layerLimit");
    return {
      draw(camera: PreviewCamera, maxLayerHeight?: number) {
        const ratio = window.devicePixelRatio || 1;
        const width = Math.round(canvas.clientWidth * ratio);
        const height = Math.round(canvas.clientHeight * ratio);
        if (!width || !height) return;
        if (gl.isContextLost()) throw new Error("Toolpath graphics context was lost.");
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.useProgram(program);
        gl.bindVertexArray(vao);
        gl.uniform3f(cameraUniform, camera.pitch, camera.yaw, camera.zoom);
        gl.uniform2f(aspectUniform, Math.min(width, height) / width, Math.min(width, height) / height);
        gl.uniform1f(
          layerLimitUniform,
          maxLayerHeight === undefined ? 2 : (maxLayerHeight - center[2]) / span
        );
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 48, count);
        if (gl.getError() !== gl.NO_ERROR) throw new Error("Complete toolpath rendering failed.");
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
