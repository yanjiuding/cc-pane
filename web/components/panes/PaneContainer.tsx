import { memo } from "react";
import type { PaneNode } from "@/types";
import Panel from "./Panel";
import SplitContainer from "./SplitContainer";

interface PaneContainerProps {
  pane: PaneNode;
  isVisible?: boolean;
}

const PaneContainer = memo(function PaneContainer({ pane, isVisible = true }: PaneContainerProps) {
  if (pane.type === "panel") {
    return <Panel pane={pane} isVisible={isVisible} />;
  }
  return <SplitContainer pane={pane} isVisible={isVisible} />;
});

export default PaneContainer;
