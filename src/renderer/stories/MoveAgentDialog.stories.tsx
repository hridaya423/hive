import { MoveAgentDialog } from "@openbot/ui/features/sidebar/MoveAgentDialog";
import { fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { requireFixture, STORY_AGENTS } from "./fixtures";
import { SettledArgs } from "./settled-args";

const agent = requireFixture(STORY_AGENTS[0], "Story agent");

const meta = {
  title: "Navigation/MoveAgentDialog",
  component: MoveAgentDialog,
  render: (storyArgs) => <SettledArgs>{() => <MoveAgentDialog {...storyArgs} />}</SettledArgs>,
  args: {
    agent,
    targets: [{ id: "mini", name: "Mac mini" }],
    onMove: fn(() => new Promise<void>((resolve) => setTimeout(resolve, 1_500))),
    onClose: fn(),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof MoveAgentDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneHost: Story = {};

export const SeveralHosts: Story = {
  args: {
    targets: [
      { id: "mini", name: "Mac mini" },
      { id: "macbook", name: "MacBook" },
      { id: "windows", name: "Windows PC" },
    ],
  },
};

export const Failed: Story = {
  args: {
    onMove: fn(() => Promise.reject(new Error("Mac mini did not receive the whole agent. Nothing was moved."))),
  },
};
