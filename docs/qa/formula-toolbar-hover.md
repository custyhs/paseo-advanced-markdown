# Formula toolbar hover — 2026-09-16

Official Paseo 0.8.0 web UI on isolated daemon 6790, Chrome on macOS, device
scale 2. Production 6767 was not changed. The implementation is an unreleased
addition to the `math-reading-parity` candidate.

`scripts/qa/formula-hover-web.mjs` verified:

- At 1280px with fine-pointer hover support, default toolbar opacity is 0.
- Hovering the image and then Copy TeX keeps opacity 1; copying returns the exact
  original Chinese Delta(S) body. Moving outside and blurring hides the toolbar.
- Formula geometry stays exactly 760×98 CSS pixels throughout these transitions.
- Keyboard focus reveals the toolbar; Enter opens the inspector. Closing it and
  moving outside hides the toolbar again. The modal stays independent of hover.
- At 390px compact layout, controls remain visible. A wide touch-browser
  emulation with hover=false/pointer-fine=false also keeps them visible.
- No page errors occurred. Source/error/inspector/Mermaid components retain their
  own unchanged action bars; the CSS selector targets only normal formula frames.

[Raw report](evidence/formula-hover-web.json),
[default](evidence/formula-hover-default.png),
[revealed](evidence/formula-hover-revealed.png).

Build/typecheck/lint, official compiler smoke and Hermes bundle evaluation
(default and ES6-class flags) passed; neither Hermes nor touch-browser emulation proves native
layout or touch behavior. A new iPhone device session has not been run.
