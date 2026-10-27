/**
 * Adapted from gl-transitions/BurnThrough.glsl (MIT).
 * Author: liubailin2020@gmail.com; noise based on Morgan McGuire's work.
 * https://github.com/gl-transitions/gl-transitions/blob/master/transitions/BurnThrough.glsl
 * Copyright (c) 2017-present gl-transitions contributors.
 * Full license: docs/engineering/THIRD_PARTY_NOTICES.md.
 * Changes: directional field, transparent destination, char/ember zones and VFX-JS uniforms.
 */
export const WORK_RECORD_BURN_SHADER = `
precision highp float;
uniform sampler2D src;
uniform vec2 resolution;
uniform vec2 offset;
uniform float progress;
uniform float seed;
uniform vec3 burnColor;
uniform vec3 hotColor;
out vec4 outColor;

float random(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 st) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(st);
    st *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) discard;
  vec4 source = texture(src, uv);
  if (progress <= 0.0) { outColor = source; return; }
  if (progress >= 1.0 || source.a <= 0.0) { outColor = vec4(0.0); return; }

  // GL's UV origin is the bottom. A static noise field keeps grain on the card.
  vec2 grain = uv * vec2(resolution.x / resolution.y, 1.0) * 6.0 + vec2(seed);
  float field = uv.y + (fbm(grain) - 0.5) * 0.26;
  float distanceToFire = field - mix(-0.16, 1.16, progress);
  float softness = max(fwidth(field), 0.018);
  float remaining = smoothstep(0.0, softness, distanceToFire);
  float edge = (1.0 - remaining) * remaining * 5.0;
  float scorch = 1.0 - smoothstep(softness, softness + 0.065, distanceToFire);
  vec3 charcoal = vec3(0.045, 0.025, 0.015);
  vec3 color = mix(source.rgb, charcoal, scorch * 0.94);
  color += mix(burnColor, hotColor, remaining) * edge * 1.65;
  float alpha = source.a * remaining;
  outColor = vec4(color, alpha);
}
`;
