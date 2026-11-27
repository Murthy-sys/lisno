const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const shared = path.resolve(__dirname, "../shared");
const pricingDomain = path.resolve(__dirname, "../backend/src/domain");
const contracts = path.resolve(__dirname, "../backend/src/contracts");
config.watchFolders = [...config.watchFolders, shared, pricingDomain, contracts];
// Shared pure domain and contract modules use NodeNext .js specifiers.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath;
  const sharedDomainImport = moduleName.startsWith("../../backend/src/domain/") && origin.startsWith(shared + path.sep);
  if (moduleName.endsWith(".js") && (sharedDomainImport || (origin.startsWith(pricingDomain + path.sep) || origin.startsWith(contracts + path.sep)) && moduleName.startsWith("./"))) {
    return context.resolveRequest(context, moduleName.slice(0, -3) + ".ts", platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
