// Fetches the pinned official Paseo hosts the reply-actions pipeline check
// (scripts/qa/reply-actions.mjs) runs against: the two supported releases and
// the head of getpaseo/paseo#9253, the host-footer opt-in the plugin targets.
// The PR head is fetched by ref name but must still reach the pinned commit.
import { fileURLToPath } from "node:url";
import { ensurePaseoCheckout } from "./lib/paseo-checkout.mjs";

export const hosts = [
  {
    label: "v0.15.3",
    revision: "d91ae138cb931447635e94296023414a58bedcc5",
    directory: ".paseo-host-0.15.3",
  },
  {
    label: "v0.16.0",
    revision: "c54bc39e7997c03a07402c09df2e825889432557",
    directory: ".paseo-host-0.16.0",
  },
  {
    label: "pr-9253",
    revision: "ffa02c5d81970c6ffbda9d3802287ed9f06648d6",
    directory: ".paseo-host-pr-9253",
    ref: "refs/pull/9253/head",
  },
];

for (const host of hosts) {
  ensurePaseoCheckout({
    revision: host.revision,
    directory: fileURLToPath(new URL(`../${host.directory}`, import.meta.url)),
    paths: ["packages/app/src", "packages/protocol/src"],
    label: host.label,
    ...(host.ref ? { ref: host.ref } : {}),
  });
}
