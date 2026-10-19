const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Keep env files out of the module graph.
config.resolver.blockList = [...[config.resolver.blockList].flat(), /(^|[\\/])\.env(\..*)?$/];

module.exports = withNativeWind(config, { input: "./src/global.css", inlineRem: 16 });
