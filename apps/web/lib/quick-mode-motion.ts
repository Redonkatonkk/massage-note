export interface CapsuleBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Underdamped spring step response: the leading edge moves first, then the tail catches up.
function spring(time: number): number {
  return 1 - Math.exp(-8 * time) * (Math.cos(11 * time) + 8 / 11 * Math.sin(11 * time));
}

export function quickModeMotion(from: CapsuleBounds, to: CapsuleBounds) {
  const distance = Math.abs(to.left + to.width / 2 - from.left - from.width / 2);
  const movingRight = to.left + to.width / 2 >= from.left + from.width / 2;
  const keyframes: Keyframe[] = Array.from({ length: 61 }, (_, index) => {
    const time = index / 60;
    const lead = spring(time / 0.8);
    const tail = spring(Math.max(0, (time - 0.14) / 0.86));
    const leftProgress = movingRight ? tail : lead;
    const rightProgress = movingRight ? lead : tail;
    const left = from.left + (to.left - from.left) * leftProgress;
    const right = from.left + from.width + (to.left + to.width - from.left - from.width) * rightProgress;
    return {
      offset: time,
      left: `${left}px`,
      width: `${Math.max(1, right - left)}px`,
      top: `${from.top + (to.top - from.top) * spring(time)}px`,
      height: `${from.height + (to.height - from.height) * spring(time)}px`,
    };
  });
  keyframes[0] = { offset: 0, left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` };
  keyframes[60] = { offset: 1, left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` };
  return { keyframes, duration: Math.min(800, 380 + Math.sqrt(distance) * 18) };
}
