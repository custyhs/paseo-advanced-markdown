# Device checklist: official Electron desktop and iPhone

Use this on devices that run the official Paseo 0.8.0 clients. Record the app
version from Settings → About, the host you connected to, and one screenshot or
screen recording per row. Paste the samples in `docs/qa/samples/` into an agent
prompt as: "Reply with the following Markdown verbatim, not wrapped in a code
fence:" followed by the sample. The message must come back as an assistant row.

## Before you start

- The daemon that hosts the conversation has the plugin installed and running
  (`paseo plugin ls` shows `advanced-markdown` with status `running`).
- The client version is exactly 0.8.0 (App Store build 0.8.0 released
  2026-09-10; desktop release v0.8.0). Another version shows the plugin as
  incompatible in Settings → Plugins; report that instead of testing further.
- Settings → Plugins → Advanced Markdown opens on this host and shows
  "Mermaid runtime … ready".

## Sample 1 (`sample-1-mixed.md`)

| Check | Expected |
| --- | --- |
| Inline `$E = mc^2$` and `\(a^2 + b^2 = c^2\)` | typeset inline, baseline aligned with the prose, bold prose still bold |
| `$5 and $10`, `$x$` in inline code | plain text and code, no images |
| `$$ … $$` block and the `math` fence with a blank line | two display formulas |
| Mermaid flowchart with Chinese labels | diagram image; light theme on a light app theme, dark on dark |
| Table cells `$\alpha$`, `$\beta$` | typeset inside the table |
| Python fence | code block with a Copy source button, no math |
| Copy source under the `$$` block | clipboard holds exactly `$$\n\int_0^1 x^2 \, dx = \frac{1}{3}\n$$` |
| Copy this message's source (top-right of the row) | clipboard holds the whole row text |
| Show source / Show formula | toggles the block between image and source |
| Expand on the diagram | modal titled Diagram with zoom 1x to 3x; scrolls both ways; Close returns |
| Rotate the phone / narrow the window | no horizontal page overflow; wide diagrams show "Scaled to fit" |

## Sample 2 (`sample-2-full-spec.md`)

| Check | Expected |
| --- | --- |
| Blockquote and ordered list with math | rendered inside the quote and list |
| Very long display formula | scrolls horizontally inside its block |
| `$\unknowncommand{x}$` | stays as source; `$\alpha + \beta$` beside it renders |
| Six diagrams (sequence, class, state, ER, Gantt, wide flowchart) | all render; the wide one is scaled with the hint |
| Invalid Mermaid fence | source with "Mermaid error: …" and a Retry button; neighbours unaffected |
| Matrix `math` fence | renders |

## Sample 3 (`sample-3-load.md`)

| Check | Expected |
| --- | --- |
| 50 inline + 50 display formulas + 5 diagrams | all render; scrolling stays smooth; note how long until the last image appears |
| Send it while watching | completed blocks render while the reply streams; the tail stays readable source |

## Settings (per host)

| Action | Expected |
| --- | --- |
| Mermaid off | diagram blocks show source with "Mermaid module is off"; formulas still render; other hosts unchanged |
| Math and Mermaid off | newly opened conversations show Paseo's own rendering (raw `$…$`) |
| Text size Large | plugin rows use larger text |
| Restore defaults | images again |

## Lifecycle

| Action | Expected |
| --- | --- |
| Disable the plugin on the host, reopen the conversation | Paseo's own rendering; re-enable restores images |
| Put the phone offline, open a conversation not seen before | formulas and diagrams show as source with "Host unreachable"; cached ones stay |
| Back online, Retry | images |

Report anything that differs, with the device model, OS version, client
version, and a screenshot.
