import { When } from "@cucumber/cucumber";
import { join } from "path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

When("I run approve for {string}", async function (featureName) {
  const featureId = this.ticketIds[featureName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const result = await this.exec("just", ["--justfile", justfile, "approve", featureId], {
    env: { ...process.env, TK_PROJECT_DIR: this.projectDir },
  });
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
});
