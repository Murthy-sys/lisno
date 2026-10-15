import { execFileSync } from "node:child_process";
import path from "node:path";

const mobileRoot = path.resolve(__dirname, "..");
// Jest's Expo transform does not enable the React Compiler used by Metro.
// Run the installed Metro transformer in a clean process for the native path.
const inspectCompiledScreen = String.raw`
  const fs = require("node:fs");
  const transformer = require("@expo/metro-config/babel-transformer");
  const generate = require("@babel/generator").default;
  const parser = require("@babel/parser");
  const traverse = require("@babel/traverse").default;
  const filename = process.argv[1];
  const { ast } = transformer.transform({
    filename, src: fs.readFileSync(filename, "utf8"), plugins: [],
    options: {
      dev: process.argv[2] === "development", platform: "android",
      projectRoot: process.cwd(), type: "module", enableBabelRCLookup: true,
      customTransformOptions: { engine: "hermes", reactCompiler: true, routerRoot: "src/app" }
    }
  });
  const code = generate(ast).code;
  const unbound = [];
  // Reparse emitted code: the transform's own AST retains obsolete scope data.
  traverse(parser.parse(code, { sourceType: "unambiguous" }), {
    ReferencedIdentifier(reference) {
      if (reference.node.name === "send" && !reference.scope.getBinding("send")) {
        unbound.push(reference.node.loc.start.line);
      }
    }
  });
  console.log(JSON.stringify({ compiled: code.includes("react/compiler-runtime"), unbound }));
`;

it.each(["development", "production"] as const)("keeps the Ask Lisno send handler bound in the %s native bundle", mode => {
  const output = execFileSync(process.execPath, ["-e", inspectCompiledScreen,
    path.join(mobileRoot, "src/features/ask-lisno/AskLisnoWorkspace.tsx"), mode], {
    cwd: mobileRoot, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, NODE_ENV: mode }
  });
  expect(JSON.parse(output)).toEqual({ compiled: true, unbound: [] });
});
