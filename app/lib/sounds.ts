// Programmatic sound effects using Web Audio API — no external deps
function tone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.07,
  delay = 0
) {
  if (typeof window === "undefined") return;
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  } catch {
    /* audio blocked — ignore */
  }
}

export const sounds = {
  // Soft double-tap — new message on the floor
  message: () => {
    tone(900, 0.08, "sine", 0.05);
    tone(720, 0.08, "sine", 0.04, 0.09);
  },

  // Rising three-note — agent response posted
  agentReply: () => {
    tone(480, 0.12, "sine", 0.06);
    tone(600, 0.12, "sine", 0.06, 0.13);
    tone(720, 0.18, "sine", 0.07, 0.26);
  },

  // Urgent double-blip — critical/hazard event
  alert: () => {
    tone(440, 0.14, "square", 0.09);
    tone(380, 0.14, "square", 0.09, 0.18);
    tone(440, 0.14, "square", 0.09, 0.36);
  },

  // Clean success chime — approval sent
  approve: () => {
    tone(528, 0.1, "sine", 0.07);
    tone(660, 0.1, "sine", 0.07, 0.11);
    tone(792, 0.2, "sine", 0.06, 0.22);
  },

  // Dismiss soft thud
  dismiss: () => {
    tone(320, 0.12, "sine", 0.05);
  },

  // Ascending spawn sound — new agent deployed
  spawn: () => {
    tone(320, 0.1, "sine", 0.06);
    tone(480, 0.1, "sine", 0.07, 0.12);
    tone(640, 0.1, "sine", 0.07, 0.24);
    tone(800, 0.25, "sine", 0.08, 0.36);
  },

  // Soft join — captain joined
  join: () => {
    tone(600, 0.1, "sine", 0.05);
    tone(750, 0.15, "sine", 0.05, 0.12);
  },
};
