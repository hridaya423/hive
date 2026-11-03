import { ServerStatusDialog, type ServerStatusDialogProps } from "@openbot/ui/features/servers/ServerStatusDialog";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

type StoryArgs = Omit<ServerStatusDialogProps, "open" | "onClose" | "since">;

function StatusStory(props: StoryArgs) {
  const since = Date.now() - 95_000;
  return <ServerStatusDialog {...props} open since={since} onClose={() => {}} />;
}

const meta = {
  title: "Team/ServerStatusDialog",
  component: StatusStory,
  args: { name: "HuskyTail", title: "Updating HuskyTail", phase: "updating", initial: false, updateVersion: "0.38.2" },
  parameters: { layout: "centered", a11y: { test: "error" } },
} satisfies Meta<typeof StatusStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The server restarts into an update. */
export const Updating: Story = {};

/** The app lost its connection and tries again. */
export const Reconnecting: Story = {
  args: {
    title: "Reconnecting to HuskyTail",
    phase: "waiting",
    remainingSeconds: 12,
    reference: "transport/data_channel_error",
  },
};

/** The connection failed and needs the user. */
export const Blocked: Story = {
  args: { title: "HuskyTail is not reachable", phase: "blocked", detail: "The host is not available." },
};
