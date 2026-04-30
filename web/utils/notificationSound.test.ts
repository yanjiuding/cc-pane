import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetNotificationSoundForTest,
  playNotificationSound,
} from "./notificationSound";

class FakeAudioContext {
  state: AudioContextState = "running";
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {
    this.state = "running";
  });
  createOscillator = vi.fn(() => ({
    type: "sine",
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));
  createGain = vi.fn(() => ({
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  }));
}

describe("notificationSound", () => {
  afterEach(() => {
    _resetNotificationSoundForTest();
    vi.unstubAllGlobals();
  });

  it("plays a short Web Audio notification sound", async () => {
    const context = new FakeAudioContext();
    vi.stubGlobal("AudioContext", vi.fn(function AudioContextStub() {
      return context;
    }));

    await expect(playNotificationSound(1000)).resolves.toBe(true);

    expect(context.createOscillator).toHaveBeenCalledOnce();
    expect(context.createGain).toHaveBeenCalledOnce();
  });

  it("throttles rapid duplicate notification sounds", async () => {
    const context = new FakeAudioContext();
    vi.stubGlobal("AudioContext", vi.fn(function AudioContextStub() {
      return context;
    }));

    await expect(playNotificationSound(1000)).resolves.toBe(true);
    await expect(playNotificationSound(1100)).resolves.toBe(false);

    expect(context.createOscillator).toHaveBeenCalledOnce();
  });
});
