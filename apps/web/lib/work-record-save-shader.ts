export const SAVE_TRAIL_POINTS = 16;

/** Autonomous save motion: rounded form → orbiting tapered stroke → card. No pointer uniforms. */
export const WORK_RECORD_SAVE_SHADER = `
precision highp float;
uniform sampler2D src;
uniform vec2 screenSize;
uniform float pixelRatio;
uniform vec4 shapeRect;
uniform float corner;
uniform float textureMix;
uniform float opacity;
const int trailPoints = ${SAVE_TRAIL_POINTS};
uniform vec2 trail[trailPoints];
uniform float trailOpacity;
uniform vec4 bounds;
uniform vec3 inkColor;
uniform vec3 lightColor;
uniform float impact;
uniform float uncovered;
out vec4 outColor;

float roundedBox(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float strokeCoverage(float distanceToCenter, float radius) {
  return 1.0 - smoothstep(radius - 0.6, radius + 0.6, distanceToCenter);
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x / pixelRatio, screenSize.y - gl_FragCoord.y / pixelRatio);
  if (any(lessThan(pixel, bounds.xy)) || any(greaterThan(pixel, bounds.zw))) discard;
  vec2 delta = pixel - shapeRect.xy;
  float edge = roundedBox(delta, shapeRect.zw * 0.5, corner);
  float fill = 1.0 - smoothstep(-0.8, 0.8, edge);
  float radial = length(delta);
  const float headRadius = 8.0;
  float stroke = strokeCoverage(radial, headRadius);

  // The first segment has the head's radius and color. Use one coverage field
  // so overlapping samples form a continuous outline without bright seams.
  if (trailOpacity > 0.001) {
    for (int i = 0; i < trailPoints - 1; i++) {
      vec2 a = trail[i];
      vec2 b = trail[i + 1];
      vec2 segment = b - a;
      float segmentLengthSquared = dot(segment, segment);
      if (segmentLengthSquared < 0.01) continue;
      float along = clamp(dot(pixel - a, segment) / segmentLengthSquared, 0.0, 1.0);
      float age = (float(i) + along) / float(trailPoints - 1);
      float radius = headRadius * (1.0 - smoothstep(0.0, 1.0, age));
      float fade = 1.0 - smoothstep(0.15, 1.0, age);
      float distanceToStroke = length(pixel - mix(a, b, along));
      stroke = max(stroke, strokeCoverage(distanceToStroke, radius) * fade * trailOpacity);
    }
  }

  vec2 uv = clamp(delta / shapeRect.zw + 0.5, 0.0, 1.0);
  vec4 captured = texture(src, vec2(uv.x, 1.0 - uv.y));
  vec3 strokeColor = mix(inkColor, lightColor, mix(0.80, 0.08, uncovered));
  float strokeAlpha = stroke * opacity * (1.0 - textureMix);
  float textureAlpha = fill * captured.a * opacity * textureMix;
  float alpha = strokeAlpha + textureAlpha;
  vec3 premultiplied = strokeColor * strokeAlpha + captured.rgb * textureAlpha;

  if (impact >= 0.0 && impact < 1.0) {
    float shock = 1.0 - smoothstep(1.0, 2.5, abs(radial - mix(18.0, 50.0, impact)));
    float shockAlpha = shock * pow(1.0 - impact, 3.0) * 0.45 * (1.0 - alpha);
    alpha += shockAlpha;
    premultiplied += strokeColor * shockAlpha;
  }
  outColor = vec4(premultiplied / max(alpha, 0.0001), alpha);
}
`;
