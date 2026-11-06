export function playEngineRev(type: "v8" | "v6" | "hybrid" = "v8") {
  if (typeof window === "undefined") return;
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return;
  const ctx = new AudioContextClass();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type === "hybrid" ? "sine" : "sawtooth";
  const baseFreq = type === "v8" ? 44 : 58;

  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 3.4, now + 0.35);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.15, now + 1.25);

  gain.gain.setValueAtTime(0.01, now);
  gain.gain.linearRampToValueAtTime(0.22, now + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(260, now);
  filter.frequency.linearRampToValueAtTime(750, now + 0.35);
  filter.frequency.linearRampToValueAtTime(220, now + 1.2);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 1.4);
}
