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
uniform vec3 lightColor;
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
  float ringRadius = shapeRect.z * 0.38;
  float ringDistance = abs(radial - ringRadius);
  float ring = 1.0 - smoothstep(1.0, 1.8, ringDistance);
  float glow = exp(-ringDistance * 0.55) * 0.12 * smoothstep(ringRadius - 4.0, ringRadius - 2.0, radial);
  float orbAlpha = min(1.0, ring + glow);
  float tail = 0.0;

  if (trailOpacity > 0.001) {
    for (int i = 0; i < 15; i++) {
      vec2 a = trail[i];
      vec2 b = trail[i + 1];
      vec2 segment = b - a;
      float along = clamp(dot(pixel - a, segment) / max(dot(segment, segment), 0.01), 0.0, 1.0);
      float age = (float(i) + along) / 15.0;
      float radius = mix(3.2, 0.25, age);
      float distanceToTail = length(pixel - mix(a, b, along));
      float ribbon = (1.0 - smoothstep(max(0.0, radius - 0.5), radius + 0.8, distanceToTail)) * pow(1.0 - age, 1.4) * 0.75;
      float haze = exp(-distanceToTail / max(radius, 0.75) * 1.25) * pow(1.0 - age, 2.0) * 0.09;
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
  // Join the trail at the rear rim; never draw it through the ring's hollow center.
  float tailAlpha = tail * trailOpacity * smoothstep(ringRadius - 0.5, ringRadius + 1.8, radial);
  float alpha = headAlpha + tailAlpha * (1.0 - headAlpha);
  vec3 headColor = mix(mix(inkColor, lightColor, 0.86), captured.rgb, textureMix);
  vec3 tailColor = mix(inkColor, lightColor, 0.70);
  vec3 premultiplied = headColor * headAlpha + tailColor * tailAlpha * (1.0 - headAlpha);
  outColor = vec4(premultiplied / max(alpha, 0.0001), alpha);
}
`;
