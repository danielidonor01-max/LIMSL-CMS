// src/lib/motion-features.ts
// The animation engine, loaded after first paint rather than shipped in every
// route's initial bundle. Providers hands this to LazyMotion; components use
// the slim `m.*` elements, which render immediately and start animating once
// this chunk arrives. domMax rather than domAnimation because the sidebar,
// tabs and counters rely on layout / layoutId.
export { domMax as default } from "motion/react";
