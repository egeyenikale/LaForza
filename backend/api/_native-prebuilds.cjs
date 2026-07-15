// sodium-native resolves its addon dynamically, so Vercel's Node file tracer
// cannot discover the Linux binary from the package's normal import graph.
// A literal CommonJS require.resolve keeps the prebuild in node_modules at the
// exact path where sodium-native looks for it during a serverless cold start.
require.resolve("sodium-native/prebuilds/linux-x64/sodium-native.node");
