/** Autonomous save motion: rounded form → orbiting ring/trail → card. No pointer uniforms. */
export const WORK_RECORD_SAVE_SHADER = `
precision highp float;
uniform sampler2D src;
uniform vec2 screenSize;
uniform float pixelRatio;
uniform vec4 shapeRect;
uniform float corner;
uniform float textureMix;
uniform float opacity;
uniform vec2 trail[16];
uniform float trailOpacity;
uniform vec4 bounds;
uniform vec3 inkColor;
uniform float impact;
out vec4 outColor;

float roundedBox(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x / pixelRatio, screenSize.y - gl_FragCoord.y / pixelRatio);
  if (any(lessThan(pixel, bounds.xy)) || any(greaterThan(pixel, bounds.zw))) discard;
  vec2 delta = pixel - shapeRect.xy;
  float edge = roundedBox(delta, shapeRect.zw * 0.5, corner);
  float fill = 1.0 - smoothstep(-0.8, 0.8, edge);
  float radial = length(delta);
  float ring = 1.0 - smoothstep(2.0, 3.4, abs(radial - shapeRect.z * 0.38));
  float glow = exp(-abs(radial - shapeRect.z * 0.38) * 0.22) * 0.15;
  float orbAlpha = min(1.0, ring + fill * 0.12 + glow);
  float tail = 0.0;

  if (trailOpacity > 0.001) {
    for (int i = 0; i < 15; i++) {
      vec2 a = trail[i];
      vec2 b = trail[i + 1];
      vec2 segment = b - a;
      float along = clamp(dot(pixel - a, segment) / max(dot(segment, segment), 0.01), 0.0, 1.0);
      float age = (float(i) + along) / 15.0;
      float radius = mix(7.5, 0.7, age);
      float distanceToTail = length(pixel - mix(a, b, along));
      float ribbon = (1.0 - smoothstep(radius - 0.7, radius + 1.2, distanceToTail)) * pow(1.0 - age, 1.5) * 0.65;
      float haze = exp(-distanceToTail / max(radius, 1.0)) * pow(1.0 - age, 2.0) * 0.12;
      tail = max(tail, ribbon + haze);
    }
  }
  if (impact >= 0.0 && impact < 1.0) {
    float shock = 1.0 - smoothstep(1.0, 2.5, abs(radial - mix(18.0, 50.0, impact)));
    tail = max(tail, shock * pow(1.0 - impact, 2.0) * 0.7);
  }

  vec2 uv = clamp(delta / shapeRect.zw + 0.5, 0.0, 1.0);
  vec4 captured = texture(src, vec2(uv.x, 1.0 - uv.y));
  float headAlpha = mix(orbAlpha, fill * captured.a, textureMix) * opacity;
  float tailAlpha = tail * trailOpacity;
  float alpha = headAlpha + tailAlpha * (1.0 - headAlpha);
  vec3 headColor = mix(inkColor, captured.rgb, textureMix);
  vec3 premultiplied = headColor * headAlpha + inkColor * tailAlpha * (1.0 - headAlpha);
  outColor = vec4(premultiplied / max(alpha, 0.0001), alpha);
}
`;
