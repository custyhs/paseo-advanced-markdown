# Mathematical reading candidate

The implementation targets a proposed `v0.2.0-rc.1`. This tag has not been created
or published. The current public version remains `v0.1.3`.

The candidate adds a separate 75–200% formula-size preference, measured fitting
with a 15% shrink limit, inline overflow promotion, and a formula inspector with
fit, saved reading size, temporary zoom, source view, and exact-source copy.
Density-aware images improve detail without changing logical dimensions.
`mathtools` and `cancel` expand notation coverage; MathJax stays at 3.2.2.

Read the [candidate evidence](../qa/math-reading-candidate.md),
[baseline](../qa/math-reading-baseline.md),
[host gaps](../qa/math-reading-gaps.md), and
[MathJax 4 decision](../qa/mathjax4-layout-experiment.md).

Web interaction, local checks, public 0.8.0 compiler and Hermes loading are
verified. Fixed local Git installation and rollback to v0.1.3 passed on the isolated host.
Native iPhone interaction for these new controls, Electron, cached-client
reconnect compatibility, and CI remain pending. Older release QA
must not be used to mark those rows complete. No production installation was made.

After creating and verifying the proposed release tag, installation would be:

```sh
paseo plugin add custyhs/paseo-advanced-markdown --ref v0.2.0-rc.1
```

That command is documentation for the proposed release, not a currently available
version. Keep the existing `v0.1.3` installation until candidate validation is done.
