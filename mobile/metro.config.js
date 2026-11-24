const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const shared = path.resolve(__dirname, "../shared");
const pricingDomain = path.resolve(__dirname, "../backend/src/domain");
config.watchFolders = [...config.watchFolders, shared, pricingDomain];
// The shared estimator imports pure domain modules using NodeNext .js specifiers.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath;
  const sharedDomainImport = moduleName.startsWith("../../backend/src/domain/") && origin.startsWith(shared + path.sep);
  if (moduleName.endsWith(".js") && (sharedDomainImport || origin.startsWith(pricingDomain + path.sep) && moduleName.startsWith("./"))) {
    return context.resolveRequest(context, moduleName.slice(0, -3) + ".ts", platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
