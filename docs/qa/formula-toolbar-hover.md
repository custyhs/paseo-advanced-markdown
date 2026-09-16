# Formula toolbar hover and tap — 2026-09-16

Official Paseo 0.8.0 web UI on isolated daemon 6790, Chrome on macOS, device
scale 2. Production 6767 was not changed. This is an unreleased addition to
the `math-reading-parity` candidate.

`scripts/qa/formula-hover-web.mjs` verifies the current interaction:

- At 1280px with fine-pointer hover support, default toolbar opacity is 0.
  Hovering the image and then Copy TeX keeps opacity 1. Moving outside and
  blurring hides it. Formula geometry stays 760×98 CSS pixels.
- Keyboard focus reveals the desktop toolbar; Enter opens the inspector.
  Closing it and moving outside hides the toolbar again.
- Compact 390px, emulated phone touch at 390px, and wide touch at 1280px start
  with the action row absent. Activating the image exposes the row and changes
  its accessible expanded state. Activating it again removes the row.
- In all three tap modes, Copy TeX returns the Chinese Delta(S) body. Expand
  opens the inspector; closing it leaves the toolbar expanded. Keyboard Enter
  can expand and collapse the same entry. Merely revealing buttons does not
  open the inspector.
- A touch drag scrolls the wide formula by 71 CSS pixels without revealing its
  toolbar. This browser check does not establish native gesture behavior.
- No page errors occurred. Source/error/inspector/Mermaid action bars retain
  their behavior. Inline formulas retain their direct inspection entry.

[Raw report](evidence/formula-hover-web.json),
[desktop default](evidence/formula-hover-default.png),
[desktop revealed](evidence/formula-hover-revealed.png),
[phone collapsed](evidence/formula-tap-collapsed.png),
[phone expanded](evidence/formula-tap-expanded.png).

The touch interaction supersedes the earlier always-visible mobile toolbar.
The test waits for the host's compact modal animation before clicking Close;
DOM presence alone precedes the control's final hit target.

Build/typecheck/lint, official compiler smoke and Hermes bundle evaluation
(default and ES6-class flags) passed. Hermes and touch-browser emulation do
not prove native layout or gestures. iPhone device validation, including
horizontal and conversation scrolling, remains outstanding.
