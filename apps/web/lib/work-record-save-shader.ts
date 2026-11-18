export const SAVE_TRAIL_POINTS = 16;
export const SAVE_HEAD_RADIUS = 8;

/** The same surface condenses, flies and expands over the live card. */
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
uniform vec3 cardColor;
uniform float expansion;
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
  const float headRadius = ${SAVE_HEAD_RADIUS}.0;
  float head = expansion < 0.0
    ? strokeCoverage(length(delta), headRadius)
    : 1.0 - smoothstep(-0.6, 0.6, edge);
  float tail = 0.0;

  // The first segment has the head's radius and color. Use one coverage field
  // so overlapping samples form a continuous outline without bright seams.
  if (trailOpacity > 0.001 && head < 1.0) {
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
      tail = max(tail, strokeCoverage(distanceToStroke, radius) * fade * trailOpacity);
    }
  }

  vec3 strokeColor = mix(inkColor, lightColor, mix(0.80, 0.08, uncovered));
  vec3 headColor = mix(strokeColor, cardColor, clamp(expansion, 0.0, 1.0));
  float headAlpha = head * opacity * (1.0 - textureMix);
  float tailAlpha = max(0.0, tail - head) * opacity * (1.0 - textureMix);
  float alpha = headAlpha + tailAlpha;
  vec3 premultiplied = headColor * headAlpha + strokeColor * tailAlpha;

  if (textureMix > 0.0) {
    vec2 uv = clamp(delta / shapeRect.zw + 0.5, 0.0, 1.0);
    vec4 captured = texture(src, vec2(uv.x, 1.0 - uv.y));
    float fill = 1.0 - smoothstep(-0.8, 0.8, edge);
    float textureAlpha = fill * captured.a * opacity * textureMix;
    alpha += textureAlpha;
    premultiplied += captured.rgb * textureAlpha;
  }
  outColor = vec4(premultiplied / max(alpha, 0.0001), alpha);
}
`;
