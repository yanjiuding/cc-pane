import { invokeOrApi } from "./apiClient";

export interface VoiceTranscribeRequest {
  audioBase64: string;
  mimeType: string;
  language?: string | null;
  enableItn?: boolean;
}

export interface VoiceTranscribeResponse {
  text: string;
  language: string | null;
  emotion: string | null;
  duration: number | null;
}

export const voiceService = {
  async transcribe(request: VoiceTranscribeRequest): Promise<VoiceTranscribeResponse> {
    return invokeOrApi<VoiceTranscribeResponse>("transcribe_voice_input", { request }, async () => {
      throw new Error("Voice transcription is only available in the desktop app");
    });
  },
};
