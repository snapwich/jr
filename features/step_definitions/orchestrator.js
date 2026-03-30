import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";

function signalBlock(signal, ticketId, summary, details) {
  let block = `---\nsignal: ${signal}\nticket: ${ticketId}\nsummary: ${summary}`;
  if (details) block += `\ndetails: ${details}`;
  return block;
}

// --- Background ---

Given("a project with jr initialized", async function () {
  // setup() in Before hook already handles this
  const result = await this.exec("tk", ["list"]);
  // Just verify tk works (may exit 2 for empty list, that's fine)
});

// --- Feature with linear task chain ---

Given("a feature {string} with a linear task chain: {string}", async function (featureName, taskNamesCsv) {
  // Set up single-repo worktree structure (needed for orchestrator to create worktrees)
  await this.setupSingleRepo();

  // Create the feature with architect assignee (feature-level review)
  const featureId = await this.createTicket(featureName, { type: "feature", assignee: "jr:architect-reviewer" });
  this.ticketIds[featureName] = featureId;

  // Parse task names
  const taskNames = taskNamesCsv.split(",").map((s) => s.trim());

  // Create implementation tasks
  let prevTaskId = null;
  for (const taskName of taskNames) {
    const taskId = await this.createTicket(taskName, { type: "task", assignee: "jr:coder", parent: featureId });
    this.ticketIds[taskName] = taskId;
    await this.addDep(featureId, taskId);
    if (prevTaskId) {
      await this.addDep(taskId, prevTaskId);
    }
    prevTaskId = taskId;
  }
});

Given("a feature {string} with all tasks closed", async function (featureName) {
  // Set up single-repo worktree structure (needed for orchestrator to create worktrees)
  await this.setupSingleRepo();

  // Create feature with a single task, all closed — feature has human assignee (post-architect approval)
  const featureId = await this.createTicket(featureName, { type: "feature", assignee: "human" });
  this.ticketIds[featureName] = featureId;

  const taskId = await this.createTicket("impl-task", { type: "task", assignee: "jr:coder", parent: featureId });
  this.ticketIds["impl-task"] = taskId;
  await this.addDep(featureId, taskId);

  // Close task
  await this.closeTicket(taskId);
});

Given("all tasks in {string} are closed", async function (featureName) {
  // Close all impl tasks — feature becomes ready for architect review
  for (const [name, id] of Object.entries(this.ticketIds)) {
    if (name !== featureName) {
      await this.closeTicket(id);
    }
  }
});

// --- Ticket setup ---

Given("a task {string} assigned to {string}", async function (name, assignee) {
  const id = await this.createTicket(name, { type: "task", assignee });
  this.ticketIds[name] = id;
});

Given("ticket {string} is assigned to {string}", async function (name, assignee) {
  const id = this.ticketIds[name];
  await this.assignTicket(id, assignee);
});

Given("ticket {string} has {int} code-reviewer notes", async function (name, count) {
  const id = this.ticketIds[name];
  for (let i = 0; i < count; i++) {
    await this.addNote(id, `[signal:code-reviewer] CHANGES REQUESTED. Review round ${i + 1}`);
  }
});

Given("ticket {string} has {int} architect notes", async function (name, count) {
  const id = this.ticketIds[name];
  // Add "Run started" first so architect notes count from current run (simulates mid-run iterations)
  await this.addNote(id, `[orchestrator] Run started`);
  for (let i = 0; i < count; i++) {
    await this.addNote(id, `[signal:architect] CHANGES REQUESTED. Review round ${i + 1}`);
  }
});

Given("ticket {string} depends on nonexistent {string}", async function (name, depName) {
  // Create the dependency ticket but make it depend on something that blocks it
  const depId = await this.createTicket(depName, { type: "task", assignee: "jr:coder" });
  this.ticketIds[depName] = depId;
  const id = this.ticketIds[name];
  await this.addDep(id, depId);
  // Make depName also blocked — create a circular dep for a true deadlock
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
  // This is the second response (after the first response)
  await this.setMockResponse(id, agent, content, 2);
});

// --- Actions ---

When("I run the orchestrator", async function () {
  await this.runOrchestrator();
});

When("I run the orchestrator with no-human-review", async function () {
  await this.runOrchestrator({ JR_NO_HUMAN_REVIEW: "1" });
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

Then("ticket {string} should have a note containing {string}", async function (name, text) {
  const id = this.ticketIds[name];
  const result = await this.exec("tk", ["show", id]);
  assert.ok(
    result.stdout.includes(text),
    `Expected ticket ${name} (${id}) to have a note containing "${text}".\nTicket:\n${result.stdout}`,
  );
});
