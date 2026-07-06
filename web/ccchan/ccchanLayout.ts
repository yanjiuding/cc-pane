// ccchan 窗口各交互态的布局公式。窗口尺寸公式必须与
// src-tauri/src/services/ccchan_service.rs 的 `window_size_for` 保持同步：
// petSize=120 时还原历史固定值（Collapsed 120×120、Bubble 300×220、
// Menu 300×280、Chat 460×680），更大时按增量放大，更小时不低于历史下限。

export interface CCChanLayout {
  petSize: number;
  bubbleW: number;
  bubbleH: number;
  /** 气泡态下宠物本体在窗口内的偏移（宠物被压到窗口底部，上方留给气泡）。 */
  bubblePetLeft: number;
  bubblePetTop: number;
  /** 气泡文本框宽度（与后端 emit_ccchan_say 注入的手动气泡一致）。 */
  bubbleTextW: number;
  menuW: number;
  menuH: number;
  menuPanelW: number;
  menuPanelH: number;
  menuPad: number;
  chatW: number;
  chatH: number;
  chatPanelLeft: number;
  chatPanelTop: number;
  chatPanelW: number;
  chatPanelH: number;
}

export function getCCChanLayout(petSize: number): CCChanLayout {
  const s = petSize;
  const bubbleW = Math.max(s + 180, 300);
  const bubbleH = Math.max(s + 100, 220);
  const menuW = Math.max(s + 180, 300);
  const menuH = Math.max(s + 160, 280);
  const chatW = Math.max(s + 340, 460);
  const chatH = Math.max(s + 560, 680);
  const chatPanelLeft = 14;
  const chatPanelTop = s + 28;
  return {
    petSize: s,
    bubbleW,
    bubbleH,
    bubblePetLeft: 10,
    bubblePetTop: Math.max(bubbleH - s - 4, 0),
    bubbleTextW: Math.max(bubbleW - 40, 200),
    menuW,
    menuH,
    menuPanelW: 164,
    menuPanelH: 226,
    menuPad: 10,
    chatW,
    chatH,
    chatPanelLeft,
    chatPanelTop,
    chatPanelW: chatW - chatPanelLeft * 2,
    chatPanelH: chatH - chatPanelTop - 24,
  };
}
