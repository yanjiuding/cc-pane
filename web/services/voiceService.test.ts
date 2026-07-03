import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { voiceService, type VoiceTranscribeRequest } from "./voiceService";
import {
  mockTauriInvoke,
  resetTauriInvoke,
} from "@/test/utils/mockTauriInvoke";

const originalTauriInternals = window.__TAURI_INTERNALS__;

function createRequest(): VoiceTranscribeRequest {
  return {
    audioBase64: "QUJD",
    mimeType: "audio/wav",
    language: "zh",
    enableItn: true,
  };
}

describe("voiceService", () => {
  beforeEach(() => {
    resetTauriInvoke();
  });

  afterEach(() => {
    window.__TAURI_INTERNALS__ = originalTauriInternals;
  });

  describe("transcribe", () => {
    it("应该调用 transcribe_voice_input 并返回识别结果", async () => {
      const request = createRequest();
      const response = {
        text: "你好",
        language: "zh",
        emotion: null,
        duration: 1.5,
      };
      mockTauriInvoke({ transcribe_voice_input: response });

      const result = await voiceService.transcribe(request);

      expect(invoke).toHaveBeenCalledWith("transcribe_voice_input", { request });
      expect(result).toEqual(response);
    });

    it("应该在 Web 运行时抛出仅桌面可用的错误", async () => {
      delete window.__TAURI_INTERNALS__;

      await expect(voiceService.transcribe(createRequest())).rejects.toThrow(
        "only available in the desktop app",
      );
      expect(invoke).not.toHaveBeenCalled();
    });
  });
});
