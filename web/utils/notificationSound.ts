type AudioContextConstructor = typeof AudioContext;

let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const audioWindow = window as Window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  const AudioContextClass = window.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextClass) return null;

  audioContext ??= new AudioContextClass();
  return audioContext;
}

export async function playNotificationSound(now = Date.now()): Promise<boolean> {
  if (now - lastPlayedAt < 250) return false;

  const context = getAudioContext();
  if (!context) return false;

  if (context.state === "suspended") {
    await context.resume();
  }

  const startAt = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(1174.66, startAt + 0.08);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.2);

  lastPlayedAt = now;
  return true;
}

export function _resetNotificationSoundForTest(): void {
  audioContext = null;
  lastPlayedAt = 0;
}
