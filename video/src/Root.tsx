import { Composition } from "remotion";
import { FPS, SIZE, fontsReady } from "./brand";
import { Story, storyDuration } from "./Story";

void fontsReady;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="story-9x16" component={Story} defaultProps={{ format: "9x16" as const }} durationInFrames={storyDuration("9x16")} fps={FPS} {...SIZE["9x16"]} />
    <Composition id="story-4x5" component={Story} defaultProps={{ format: "4x5" as const }} durationInFrames={storyDuration("4x5")} fps={FPS} {...SIZE["4x5"]} />
  </>
);
