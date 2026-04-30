export interface AlternateBufferTransition {
  mode: string;
  action: "enter" | "exit";
}

const ALTERNATE_BUFFER_SEQUENCE_SOURCE = "\\x1b\\[\\?(1049|1047|47)(h|l)";

export function detectAlternateBufferTransitions(data: string): AlternateBufferTransition[] {
  const transitions: AlternateBufferTransition[] = [];
  const regex = new RegExp(ALTERNATE_BUFFER_SEQUENCE_SOURCE, "g");

  for (const match of data.matchAll(regex)) {
    transitions.push({
      mode: match[1],
      action: match[2] === "h" ? "enter" : "exit",
    });
  }

  return transitions;
}

export function stripAlternateBufferSequences(data: string): string {
  return data.replace(new RegExp(ALTERNATE_BUFFER_SEQUENCE_SOURCE, "g"), "");
}

export function shouldKeepCliOutputInNormalBuffer(cliToolId: string): boolean {
  return cliToolId === "claude" || cliToolId === "codex";
}
