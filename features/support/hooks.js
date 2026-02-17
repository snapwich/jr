import { Before, After, setDefaultTimeout } from "@cucumber/cucumber";

setDefaultTimeout(30_000);

Before(async function () {
  await this.setup();
});

After(async function () {
  await this.teardown();
});
