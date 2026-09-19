import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const packageName = process.env.LISNO_ANDROID_PACKAGE ?? "com.lisno.mobile.dev";
function adb(...args) {
  const result = spawnSync("adb", args, { encoding: "utf8" });
  if (result.error?.code === "ENOENT") throw new Error("adb is not installed. Install Android platform-tools and start an emulator or connect a device.");
  if (result.status !== 0) throw new Error(result.stderr.trim() || `adb ${args.join(" ")} failed.`);
  return result.stdout.trim();
}

async function waitForProcess(timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = spawnSync("adb", ["shell", "pidof", packageName], { encoding: "utf8" });
    const pid = result.stdout.trim();

    if (result.status === 0 && pid) return pid;
    await delay(250);
  }

  return "";
}

const devices = adb("devices").split("\n").slice(1).filter((line) => /\tdevice$/u.test(line));
if (devices.length !== 1) throw new Error(`Expected exactly one ready Android target; found ${devices.length}.`);
if (!adb("shell", "pm", "path", packageName)) throw new Error(`${packageName} is not installed on the selected Android target.`);

adb("logcat", "-c");
adb("shell", "am", "force-stop", packageName);
adb("shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1");
const pid = await waitForProcess();
if (!pid) throw new Error(`${packageName} did not stay running after launch.`);
const crashes = adb("logcat", "-d", "-t", "300", "AndroidRuntime:E", "ReactNativeJS:E", "*:S");
if (/FATAL EXCEPTION|Unable to load script|Invariant Violation/u.test(crashes)) throw new Error(`Android startup reported a fatal error:\n${crashes}`);
process.stdout.write(`Android launch smoke passed for ${packageName} on ${devices[0]?.split("\t")[0]}.\n`);
