import { World, setWorldConstructor } from "@cucumber/cucumber";
import { mkdtemp, rm, mkdir, writeFile, cp, symlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = join(import.meta.dirname, "..", "..");

class OrchestratorWorld extends World {
  constructor(options) {
    super(options);
    this.projectDir = null; // acts as TK_PROJECT_DIR — has .tickets/ and .claude/
    this.mockResponsesDir = null;
    this.outputDir = null;
    this.lastExitCode = null;
    this.lastOutput = "";
    this.ticketIds = {}; // name → actual ticket ID
    this.initTargetDirs = []; // temp dirs created by init tests
    this.lastTicketTitle = null; // for worktree-name tests
    this.lastWorktreeName = null; // for worktree-name tests
  }

  async setup() {
    const tmpBase = await mkdtemp(join(tmpdir(), "tk-test-"));
    this.projectDir = tmpBase;
    this.mockResponsesDir = join(tmpBase, "mock-responses");
    this.outputDir = join(tmpBase, "tk-output");

    await mkdir(this.mockResponsesDir, { recursive: true });
    await mkdir(this.outputDir, { recursive: true });
    await mkdir(join(this.projectDir, ".tickets"), { recursive: true });

    // Copy prompt template so the orchestrator can generate prompts
    const templateDir = join(this.projectDir, ".claude", "prompts", "tk");
    await mkdir(templateDir, { recursive: true });
    await cp(
      join(REPO_ROOT, "claude", ".claude", "prompts", "tk", "subagent-task.md"),
      join(templateDir, "subagent-task.md"),
    );

    // Copy agent definitions so launch() can read model from frontmatter
    const agentDir = join(this.projectDir, ".claude", "agents", "tk");
    await mkdir(agentDir, { recursive: true });
    await cp(join(REPO_ROOT, "claude", ".claude", "agents", "tk"), agentDir, { recursive: true });

    // Symlink bundled tk to the real tk binary
    const ticketDir = join(this.projectDir, ".agents", "ticket");
    await mkdir(ticketDir, { recursive: true });
    const { stdout: tkWhich } = await execFileAsync("which", ["tk"]);
    await symlink(tkWhich.trim(), join(ticketDir, "ticket"));

    // Initialize git repo for tk
    await this.exec("git", ["init"]);
    await this.exec("git", ["config", "user.email", "test@test.com"]);
    await this.exec("git", ["config", "user.name", "Test"]);
    await writeFile(join(this.projectDir, ".tickets", ".gitkeep"), "");
    await this.exec("git", ["add", "."]);
    await this.exec("git", ["commit", "-m", "init"]);
  }

  async teardown() {
    if (this.projectDir) {
      await rm(this.projectDir, { recursive: true, force: true });
    }
    for (const dir of this.initTargetDirs) {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async exec(cmd, args, opts = {}) {
    const options = { cwd: this.projectDir, ...opts };
    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, options);
      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (err) {
      return {
        stdout: (err.stdout || "").trim(),
        stderr: (err.stderr || "").trim(),
        exitCode: err.code || 1,
      };
    }
  }

  async createTicket(title, opts = {}) {
    const args = ["create", title];
    if (opts.type) args.push("-t", opts.type);
    if (opts.assignee) args.push("-a", opts.assignee);
    if (opts.parent) args.push("--parent", opts.parent);
    if (opts.tags) args.push("--tags", opts.tags);
    if (opts.externalRef) args.push("--external-ref", opts.externalRef);
    const result = await this.exec("tk", args);
    return result.stdout.trim();
  }

  async setMockResponse(ticketId, agent, content, sequence) {
    const suffix = sequence != null ? `.${sequence}` : "";
    const filename = `${ticketId}.${agent}${suffix}.txt`;
    await writeFile(join(this.mockResponsesDir, filename), content);
  }

  async runOrchestrator(extraEnv = {}) {
    const mockScript = join(REPO_ROOT, "features", "support", "mock-subagent.sh");
    const env = {
      ...process.env,
      CLAUDE_CMD: mockScript,
      MOCK_RESPONSES_DIR: this.mockResponsesDir,
      TK_OUTPUT_DIR: this.outputDir,
      TK_PROJECT_DIR: this.projectDir,
      TK_MAX_CONCURRENT: "3",
      ...extraEnv,
    };

    const justfile = join(REPO_ROOT, "scripts", "justfile");
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      const child = spawn("just", ["--justfile", justfile, "start-work"], {
        cwd: this.projectDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));

      const killTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 25_000);

      child.on("close", (code) => {
        clearTimeout(killTimer);
        this.lastExitCode = code ?? 1;
        this.lastOutput = stdout.trim() + "\n" + stderr.trim();
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: this.lastExitCode });
      });
    });
  }

  async setupSingleRepo() {
    // Idempotency: skip if already set up
    const defaultDir = join(this.projectDir, "default");
    try {
      await execFileAsync("git", ["-C", defaultDir, "rev-parse", "--git-dir"]);
      return; // Already initialized
    } catch {
      // Not initialized yet, continue
    }

    // Create a bare "remote" repo so origin/HEAD resolves
    const bareDir = join(this.projectDir, "bare-remote");
    await mkdir(bareDir, { recursive: true });
    await execFileAsync("git", ["init", "--bare"], { cwd: bareDir });

    await mkdir(defaultDir, { recursive: true });
    await execFileAsync("git", ["init"], { cwd: defaultDir });
    await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: defaultDir });
    await execFileAsync("git", ["config", "user.name", "Test"], { cwd: defaultDir });
    await execFileAsync("git", ["remote", "add", "origin", bareDir], { cwd: defaultDir });
    await writeFile(join(defaultDir, ".gitkeep"), "");
    await execFileAsync("git", ["add", "."], { cwd: defaultDir });
    await execFileAsync("git", ["commit", "-m", "init"], { cwd: defaultDir });
    await execFileAsync("git", ["push", "-u", "origin", "HEAD"], { cwd: defaultDir });
    await execFileAsync("git", ["remote", "set-head", "origin", "--auto"], { cwd: defaultDir });
  }

  async setupMultiRepo(repoName) {
    // Create a bare "remote" repo so origin/HEAD resolves
    const bareDir = join(this.projectDir, `${repoName}-bare`);
    await mkdir(bareDir, { recursive: true });
    await execFileAsync("git", ["init", "--bare"], { cwd: bareDir });

    const repoDir = join(this.projectDir, repoName, "default");
    await mkdir(repoDir, { recursive: true });
    await execFileAsync("git", ["init"], { cwd: repoDir });
    await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: repoDir });
    await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repoDir });
    await execFileAsync("git", ["remote", "add", "origin", bareDir], { cwd: repoDir });
    await writeFile(join(repoDir, ".gitkeep"), "");
    await execFileAsync("git", ["add", "."], { cwd: repoDir });
    await execFileAsync("git", ["commit", "-m", "init"], { cwd: repoDir });
    await execFileAsync("git", ["push", "-u", "origin", "HEAD"], { cwd: repoDir });
    await execFileAsync("git", ["remote", "set-head", "origin", "--auto"], { cwd: repoDir });
  }

  async getTicketStatus(ticketId) {
    const result = await this.exec("tk", ["query", `select(.id == "${ticketId}")`]);
    if (!result.stdout) return null;
    const ticket = JSON.parse(result.stdout);
    return ticket.status;
  }

  async addNote(ticketId, text) {
    await this.exec("tk", ["add-note", ticketId, text]);
  }

  async addDep(ticketId, depId) {
    await this.exec("tk", ["dep", ticketId, depId]);
  }

  async closeTicket(ticketId) {
    await this.exec("tk", ["close", ticketId]);
  }

  async assignTicket(ticketId, assignee) {
    await this.exec("tk", ["assign", ticketId, assignee]);
  }
}

setWorldConstructor(OrchestratorWorld);
