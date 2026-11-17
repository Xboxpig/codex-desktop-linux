# Virtualized turn measurement

This opt-in experiment limits consecutive synchronous virtualized conversation
row measurements to two before using the upstream animation-frame fallback.
It can reduce main-thread blocking but may delay layout convergence. Verify
conversation switching, scrolling, focus, and dynamically changing messages
before using it with important work. It does not change conversation data.

The patch fails closed unless exactly one current measurement contract is found.
It is specific to the upstream bundle and is not enabled by default.
