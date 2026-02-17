import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";

function signalBlock(signal, ticketId, summary, details) {
  let block = `---\nsignal: ${signal}\nticket: ${ticketId}\nsummary: ${summary}`;
  if (details) block += `\ndetails: ${details}`;
  return block;
}

// --- Background ---

Given("a project with tk initialized", async function () {
  // setup() in Before hook already handles this
  const result = await this.exec("tk", ["list"]);
  // Just verify tk works (may exit 2 for empty list, that's fine)
});

// --- Ticket setup ---

Given("a task {string} assigned to {string}", async function (name, assignee) {
  const id = await this.createTicket(name, { type: "task", assignee });
  this.ticketIds[name] = id;
});

Given("a feature {string} with closed child task {string}", async function (featureName, taskName) {
  const featureId = await this.createTicket(featureName, { type: "feature", assignee: "tk:architect-reviewer" });
  this.ticketIds[featureName] = featureId;

  const taskId = await this.createTicket(taskName, { type: "task", assignee: "tk:coder", parent: featureId });
  this.ticketIds[taskName] = taskId;

  // Feature depends on its child task
  await this.addDep(featureId, taskId);

  // Close the child task so the feature becomes ready
  await this.closeTicket(taskId);
});

Given("ticket {string} has {int} code-reviewer notes", async function (name, count) {
  const id = this.ticketIds[name];
  for (let i = 0; i < count; i++) {
    await this.addNote(id, `[code-reviewer] Review round ${i + 1}: changes requested`);
  }
});

Given("ticket {string} depends on nonexistent {string}", async function (name, depName) {
  // Create the dependency ticket but make it depend on something that blocks it
  const depId = await this.createTicket(depName, { type: "task", assignee: "tk:coder" });
  this.ticketIds[depName] = depId;
  const id = this.ticketIds[name];
  await this.addDep(id, depId);
  // Make depName also blocked — create a circular or unresolvable dep
  // Actually, just make both depend on each other for a true deadlock
  await this.addDep(depId, id);
});

// --- Mock responses ---

Given("the mock subagent always returns {string} for {string} as {string}", async function (signal, name, agent) {
  const id = this.ticketIds[name];
  const content = signalBlock(signal, id, `${signal} for ${name}`);
  await this.setMockResponse(id, agent, content);
});

Given(
  "the mock subagent returns {string} then {string} for {string} as {string}",
  async function (signal1, signal2, name, agent) {
    const id = this.ticketIds[name];
    await this.setMockResponse(id, agent, signalBlock(signal1, id, `${signal1} for ${name}`), 1);
    await this.setMockResponse(id, agent, signalBlock(signal2, id, `${signal2} for ${name}`), 2);
  },
);

Given(
  "the mock subagent returns {string} for {string} as {string} with details {string}",
  async function (signal, name, agent, details) {
    const id = this.ticketIds[name];
    // Resolve detail ticket names to IDs
    const resolvedDetails = details
      .split(/\s+/)
      .map((d) => this.ticketIds[d] || d)
      .join(" ");
    const content = signalBlock(signal, id, `${signal} for ${name}`, resolvedDetails);
    await this.setMockResponse(id, agent, content, 1);
  },
);

Given("the mock subagent returns {string} for {string} as {string} after rework", async function (signal, name, agent) {
  const id = this.ticketIds[name];
  const content = signalBlock(signal, id, `${signal} for ${name}`);
  // This is the second response (after the first task-rework response)
  await this.setMockResponse(id, agent, content, 2);
});

// --- Actions ---

When("I run the orchestrator", async function () {
  await this.runOrchestrator();
});

// --- Assertions ---

Then("ticket {string} should be closed", async function (name) {
  const id = this.ticketIds[name];
  const status = await this.getTicketStatus(id);
  assert.strictEqual(
    status,
    "closed",
    `Expected ticket ${name} (${id}) to be closed, got ${status}.\nOutput:\n${this.lastOutput}`,
  );
});

Then("the orchestrator should exit with code {int}", async function (code) {
  assert.strictEqual(
    this.lastExitCode,
    code,
    `Expected exit code ${code}, got ${this.lastExitCode}.\nOutput:\n${this.lastOutput}`,
  );
});

Then("the output should contain {string}", async function (text) {
  assert.ok(this.lastOutput.includes(text), `Expected output to contain "${text}".\nOutput:\n${this.lastOutput}`);
});
