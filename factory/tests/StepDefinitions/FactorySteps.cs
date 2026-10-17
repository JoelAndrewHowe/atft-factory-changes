using System.Diagnostics;
using System.Text.Json;

namespace Factory.Tests;

[Binding]
public sealed partial class FactorySteps
{
    private string workspace = null!, repo = null!, target = null!, seed = null!;
    private string? harness, doerHarness, plannerHarness;
    private bool defaultValidator, capturedConfiguredFiles;
    private int maxAttempts = 3, targetCount;
    private string runName = "tetris", lineName = "careful";
    private bool nameOnly;
    private record RunSettings(string Target, string Seed, string Line);
    private readonly Dictionary<string, RunSettings> runs = new();
    private readonly Dictionary<string, string> runPlans = new();
    private const string Careful = """
        digraph assembly_line {
          start -> planner
          planner -> doer [label="not complete"]
          planner -> finish [label="complete"]
          doer -> validator
          validator -> doer [label="not satisfied"]
          validator -> planner [label="satisfied"]
        }
        """;
    private string lens = "testability";
    private bool includeSeed = true, includeTarget = true;
    private string baseline = "", repoBaseline = "", unrelated = "";
    private Result result = new(0, "", "");
    private readonly Dictionary<string, string> environment = new();
    private readonly Dictionary<string, string> snapshots = new();
    private static string FactoryRoot => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../.."));
    private static string Dotnet => Environment.GetEnvironmentVariable("DOTNET_HOST_PATH")
        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".dotnet", "dotnet");
    private record Result(int Code, string Out, string Error);

    private Result Run(string command, string cwd, params string[] args)
    {
        var info = new ProcessStartInfo(command) { WorkingDirectory = cwd, RedirectStandardOutput = true,
            RedirectStandardError = true, UseShellExecute = false };
        foreach (var arg in args) info.ArgumentList.Add(arg);
        foreach (var pair in environment) info.Environment[pair.Key] = pair.Value;
        using var process = Process.Start(info)!;
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(30_000))
        {
            process.Kill(entireProcessTree: true);
            process.WaitForExit();
            Assert.Fail($"{command} timed out");
        }
        return new(process.ExitCode, output.GetAwaiter().GetResult(), error.GetAwaiter().GetResult());
    }

    private string Git(params string[] args) => GitAt(repo, args);
    private string GitAt(string cwd, params string[] args)
    {
        var git = Run("git", cwd, args);
        Assert.That(git.Code, Is.Zero, git.Error);
        return git.Out.Trim();
    }

    [Given("a copy of the factory")]
    public void CopyFactory()
    {
        workspace = Path.Combine(Path.GetTempPath(), "factory-test-" + Guid.NewGuid());
        repo = Path.Combine(workspace, "repo");
        Directory.CreateDirectory(Path.Combine(repo, "factory"));
        // Only the compiled factory itself is copied, not specs, bindings or dependencies.
        foreach (var file in Directory.GetFiles(Path.Combine(FactoryRoot, "src/bin/Debug/net8.0"), "Factory.*"))
            File.Copy(file, Path.Combine(repo, "factory", Path.GetFileName(file)));
        File.WriteAllText(Path.Combine(repo, ".gitignore"), "/factory/runs/\n");
        environment["GIT_CONFIG_GLOBAL"] = Path.Combine(workspace, "gitconfig");
        environment["GIT_CONFIG_NOSYSTEM"] = "1";
        File.WriteAllText(environment["GIT_CONFIG_GLOBAL"], "[user]\n name = Factory Tests\n email = factory@example.test\n[commit]\n gpgsign = false\n");
        Git("init", "-q");
        Git("add", "factory", ".gitignore");
        Git("commit", "-qm", "Initial factory");
        repoBaseline = baseline = Git("rev-parse", "HEAD");
    }

    [Given("a new target")]
    public void NewTarget()
    {
        target = Path.Combine(repo, "output" + ++targetCount);
        Directory.CreateDirectory(target);
        TargetMachines();
        ValidatedLine("careful");
    }

    [Given("a seed describing a game of Tetris")]
    public void Seed()
    {
        seed = Path.Combine(workspace, $"seed {targetCount} with spaces.md");
        File.WriteAllText(seed, "Build a terminal game of Tetris. Start with npm start. Fit within 24 rows.");
    }

    [Given("the factory has staged and unstaged changes")]
    public void UnrelatedChanges()
    {
        File.WriteAllText(Path.Combine(repo, "unrelated.txt"), "staged\n");
        Git("add", "unrelated.txt");
        File.AppendAllText(Path.Combine(repo, "unrelated.txt"), "unstaged\n");
        File.WriteAllText(Path.Combine(repo, "untracked.txt"), "leave me alone");
        // Changing a factory file must not cause it to enter a generated-work commit.
        File.AppendAllText(Path.Combine(repo, "factory/Factory.runtimeconfig.json"), "\n");
        unrelated = UnrelatedSnapshot();
    }

    private string UnrelatedSnapshot() => Git("diff", "--", "factory", "unrelated.txt", ":(exclude)factory/runs")
        + Git("diff", "--cached", "--", "factory", "unrelated.txt", ":(exclude)factory/runs")
        + Git("status", "--porcelain", "--", "factory", "unrelated.txt", "untracked.txt")
        + File.ReadAllText(Path.Combine(repo, "untracked.txt"));

    [Given("the planner plans the tasks alpha and beta")]
    public void Agent()
    {
        var bin = Path.Combine(workspace, "agents");
        Directory.CreateDirectory(bin);
        foreach (var name in new[] { "pi", "chosen-agent" })
        {
            var file = Path.Combine(bin, name);
            var assembly = Path.Combine(FactoryRoot, "tests/Doubles/bin/Debug/net8.0/AgentDouble.dll");
            static string Quote(string value) => "'" + value.Replace("'", "'\\''") + "'";
            File.WriteAllText(file, $"#!/bin/sh\nexec {Quote(Dotnet)} {Quote(assembly)} {Quote(name)} \"$@\"\n");
            if (OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("The test launchers require Bash on Unix.");
            File.SetUnixFileMode(file, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        }
        harness = Path.Combine(bin, "chosen-agent");
        environment["PATH"] = bin + Path.PathSeparator + Environment.GetEnvironmentVariable("PATH");
        environment["DOUBLE_WORKSPACE"] = workspace;
    }

    [Given("the doer does the next task in the plan")]
    public void Doer() { } // The external double implements this behavior by default.

    [Given("the validator is always satisfied")]
    public void Satisfied() => environment["DOUBLE_VALIDATION"] = "satisfied";

    [Given("the target folder does not exist")]
    public void MissingTarget() => Directory.Delete(target);

    [Given("the target is outside any Git repository")]
    public void StandaloneTarget()
    {
        var previous = target;
        target = Path.Combine(workspace, "standalone");
        Directory.Move(previous, target);
        runs[runName] = new(target, seed, lineName);
        Assert.That(Run("git", target, "rev-parse", "--show-toplevel").Code, Is.Not.Zero);
    }

    [Then("the target is a Git repository")]
    public void TargetRepository()
    {
        Assert.That(result.Code, Is.Zero, result.Error);
        Assert.That(GitAt(target, "rev-parse", "--show-toplevel"), Is.EqualTo(target));
        Assert.That(GitAt(target, "status", "--porcelain", "--", ".", ":(exclude).assembly-lines"), Is.Empty);
    }

    [When("the factory runs")]
    public void OnePass() => Invoke(false);

    private void Invoke(bool all, string? targetArgument = null)
    {
        baseline = Run("git", target, "rev-parse", "--verify", "HEAD") is { Code: 0 } head ? head.Out.Trim() : "";
        var args = new List<string> { Path.Combine(repo, "factory/Factory.dll"), "--run", runName };
        if (includeSeed && !nameOnly) args.AddRange(["--seed", seed]);
        if (includeTarget && !nameOnly) args.AddRange(["--target", targetArgument ?? Path.GetRelativePath(repo, target)]);
        if (!nameOnly) args.AddRange(["--line", lineName]);
        ConfigureMachines();
        if (unrelated != "" && !capturedConfiguredFiles)
        {
            unrelated = UnrelatedSnapshot();
            capturedConfiguredFiles = true;
        }
        args.AddRange(["--max-attempts", maxAttempts.ToString()]);
        result = Run(Dotnet, repo, args.ToArray());
    }

    [When("the factory builds the target {string} to completion")]
    public void BuildTarget(string name)
    {
        target = Path.Combine(repo, name);
        Invoke(true);
        Assert.That(result.Code, Is.Zero, result.Error);
        snapshots.TryAdd(target, TargetSnapshot(target));
    }

    [When("the factory builds the same target using its absolute path")]
    public void AbsoluteTarget()
    {
        Invoke(true, target);
        Assert.That(result.Code, Is.Zero, result.Error);
    }

    private string TargetSnapshot(string folder) => string.Join("\n", Directory.GetFiles(folder, "*", SearchOption.AllDirectories)
        .Order().Select(file => Path.GetRelativePath(folder, file) + ":" + Convert.ToBase64String(File.ReadAllBytes(file))))
        + Git("log", "--format=%H", "--", Path.GetRelativePath(repo, folder));

    [Then("the target {string} is unchanged")]
    public void TargetUnchanged(string name)
    {
        var folder = Path.Combine(repo, name);
        Assert.That(TargetSnapshot(folder), Is.EqualTo(snapshots[folder]));
    }

    [Then("the targets {string} and {string} each have their own completed plan and committed work")]
    public void IndependentTargets(string first, string second)
    {
        foreach (var name in new[] { first, second })
        {
            var folder = Path.Combine(repo, name);
            var planPath = Path.Combine(folder, ".factory/plan.md");
            var tasks = JsonSerializer.Deserialize<Dictionary<string, bool>>(File.ReadAllText(planPath))!;
            Assert.That(tasks.Keys, Is.EquivalentTo(new[] { "alpha", "beta" }));
            Assert.That(tasks.Values.All(done => done), Is.True);
            foreach (var task in tasks.Keys)
            {
                Assert.That(File.ReadAllText(Path.Combine(folder, task + ".txt")), Is.EqualTo($"Work for {task}\n"));
                Assert.That(Git("show", $"HEAD:{name}/{task}.txt"), Is.EqualTo($"Work for {task}"));
            }
            Assert.That(Git("status", "--porcelain", "--", name), Is.Empty);
        }
    }

    [Then("there are no new commits")]
    public void NoCommits() => Assert.That(GitAt(target, "rev-parse", "HEAD"), Is.EqualTo(baseline));

    [Then("the target uses the containing repository")]
    public void ContainingRepo()
    {
        Assert.That(result.Code, Is.Zero, result.Error);
        Assert.That(GitAt(target, "rev-parse", "--show-toplevel"), Is.EqualTo(repo));
        Assert.That(Directory.Exists(Path.Combine(target, ".git")), Is.False);
        Assert.That(Calls().All(c => c.GetProperty("cwd").GetString() == target), Is.True);
    }

    private JsonElement[] Calls() => Directory.Exists(Path.Combine(workspace, "calls"))
        ? Directory.GetFiles(Path.Combine(workspace, "calls"), "*.json").Order().Select(f => JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(f))).ToArray()
        : [];

    [Given("no target is chosen")]
    public void NoTarget() => includeTarget = false;

    [Then("it reports that a target is required")]
    public void TargetRequired() => ErrorContains("target is required");

    private void ErrorContains(string message)
    {
        Assert.That(result.Code, Is.Not.Zero);
        Assert.That(result.Error.ToLowerInvariant(), Does.Contain(message));
    }

    [Then("no agent has been called")]
    public void NoAgentCalls() => Assert.That(Calls(), Is.Empty);

    [Then("the plan has the tasks {string} and {string}, and no others")]
    public void ExactTasks(string first, string second) => Assert.That(ReadPlan().Keys, Is.EqualTo(new[] { first, second }));

    [Given("the doer writes a file called SENTINEL")]
    public void SentinelAgent() => environment["DOUBLE_PRODUCT"] = "SENTINEL";

    [Then("its only product file is SENTINEL")]
    public void SentinelCommit()
    {
        Assert.That(ProductFiles(WorkCommits().Single()).Select(Path.GetFileName), Is.EqualTo(new[] { "SENTINEL" }));
        Assert.That(GitAt(target, "show", "HEAD:./SENTINEL"), Is.EqualTo("Work for alpha"));
    }

    [Given("no harness is chosen for the validator")]
    public void DefaultAgent() => defaultValidator = true;

    [Then("pi has been called")]
    public void PiCalled() => Assert.That(Calls().Select(c => c.GetProperty("agent").GetString()), Does.Contain("pi"));

    [Then("the doer's chosen harness has been called")]
    public void ChosenCalled() => Assert.That(RoleCalls("doer").Select(c => c.GetProperty("agent").GetString()), Does.Contain("chosen-agent"));

    [Then("pi has not been called")]
    public void PiNotCalled() => Assert.That(Calls().Select(c => c.GetProperty("agent").GetString()), Does.Not.Contain("pi"));

    [Given("the validator says {string} before its result")]
    public void Preamble(string text) => environment["DOUBLE_PREAMBLE"] = text;

    [Given("the doer cannot be run")]
    public void MissingAgent() => doerHarness = Path.Combine(workspace, "missing-agent");

    [Then("it reports that it could not run the doer")]
    public void AgentError() => ErrorContains("could not run the doer");

    private JsonElement[] RoleCalls(string role) => Calls().Where(c => c.GetProperty("role").GetString() == role).ToArray();

    private string Prompt(string role)
    {
        var call = RoleCalls(role).First();
        Assert.That(call.GetProperty("cwd").GetString(), Is.EqualTo(target));
        var arguments = call.GetProperty("args").EnumerateArray().Select(a => a.GetString()).ToArray();
        Assert.That(arguments[..2], Is.EqualTo(new[] { "--print", "--no-session" }));
        return arguments.Last()!;
    }

    [Then("the doer was pointed at the plan and at the seed")]
    public void PromptPaths() => Assert.That(Prompt("doer"), Does.Contain("Seed: " + seed).And.Contain("Plan: " + PlanPath));

    [Then("the planner was asked for a result with the field {string}")]
    public void PromptResult(string field) => Assert.That(Prompt("planner"), Does.Contain("JSON").And.Contain($"\"{field}\"").And.Contain("no tasks remain"));

    [Given("the validator answers in prose, with no result")]
    public void ProseResult() => environment["DOUBLE_PROSE_RESULT"] = "1";

    [Then("it reports that it could not read the validator's result")]
    public void UnreadableResult() => ErrorContains("could not read the validator's result");

    private string PlanPath => Path.Combine(repo, "factory", "runs", runName, "plan.md");
    private Dictionary<string, bool> ReadPlan() => JsonSerializer.Deserialize<Dictionary<string, bool>>(File.ReadAllText(PlanPath))!;

    private void ExistingPlan(params bool[] done)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(PlanPath)!);
        var tasks = new[] { "alpha", "beta", "gamma" }.Zip(done).ToDictionary(t => t.First, t => t.Second);
        File.WriteAllText(PlanPath, JsonSerializer.Serialize(tasks) + (done.All(d => d) ? "\n" : ""));

    }

    [Given("a plan in which every task is done")]
    public void CompletedPlan() => ExistingPlan(true, true, true);

    [Given("a plan whose first task is done")]
    public void PartlyDonePlan()
    {
        ExistingPlan(true, false, false);
        File.WriteAllText(Path.Combine(target, "alpha.txt"), "Work for alpha\n");
        Git("add", "--", Path.GetRelativePath(repo, target));
        Git("commit", "--only", "-qm", "Existing first task", "--", Path.GetRelativePath(repo, target));
    }

    [Given("a plan with three tasks, none of them done")]
    public void UnfinishedPlan() => ExistingPlan(false, false, false);

    [Then("the plan still has those three tasks")]
    public void SameTasks() => Assert.That(ReadPlan().Keys, Is.EqualTo(new[] { "alpha", "beta", "gamma" }));

    [Given("the planner keeps its plan in prose")]
    [Given("the doer keeps its plan in prose")]
    public void ProsePlan() => environment["DOUBLE_PROSE_PLAN"] = "1";

    [Given("no plan")]
    public void NoPlan() => Assert.That(File.Exists(PlanPath), Is.False);

    [Then("there is a plan")]
    public void HasPlan()
    {
        Assert.That(result.Code, Is.Zero, result.Error);
        Assert.That(File.Exists(PlanPath), Is.True);
    }

    [Then("the plan shows every task as not done")]
    public void NoneDone() => Assert.That(ReadPlan().Values, Is.Not.Empty.And.All.False);

    [Then("there are no new work commits")]
    public void NoWorkCommits() => Assert.That(WorkCommits(), Is.Empty);

    [Then("the committed plan matches the plan on disk")]
    public void CommittedPlan()
    {
        var saved = Run("git", target, "show", "HEAD:./.factory/plan.md");
        Assert.That(saved.Code, Is.Zero, saved.Error);
        Assert.That(saved.Out, Is.EqualTo(File.ReadAllText(PlanPath)));
    }

    [Then("the target has no uncommitted changes")]
    public void CleanTarget() => Assert.That(GitAt(target, "status", "--porcelain", "--", "."), Is.Empty);

    [Given("no seed is chosen")]
    public void NoSeedArgument() => includeSeed = false;

    [Given("the seed has been deleted")]
    public void MissingSeed() => File.Delete(seed);

    [Then("it reports that there is no seed")]
    public void SeedRequired() => ErrorContains("there is no seed");

    [Then("there is no plan")]
    public void StillNoPlan() => Assert.That(File.Exists(PlanPath), Is.False);

    [Then("there is no plan in the factory's folder")]
    public void NoFactoryPlan() => Assert.That(Directory.GetFiles(Path.Combine(repo, "factory"), "plan.md", SearchOption.AllDirectories), Is.Empty);

    [Then("the plan shows the first two tasks as done")]
    public void FirstTwoDone() => Assert.That(ReadPlan().Values, Is.EqualTo(new[] { true, true, false }));

    [Then("the work for alpha and beta has been committed")]
    public void ProseWorkCommitted()
    {
        Assert.That(result.Code, Is.Zero, result.Error);
        foreach (var task in new[] { "alpha", "beta" })
            Assert.That(GitAt(target, "show", $"HEAD:./{task}.txt"), Is.EqualTo($"Work for {task}"));
        Assert.That(WorkCommits(), Has.Length.EqualTo(2));
        if (environment.ContainsKey("DOUBLE_PROSE_PLAN"))
            Assert.That(File.ReadAllText(PlanPath), Does.Contain("Task alpha is finished.").And.Contain("Task beta is finished."));
    }

    [Then("the plan shows the first task as done")]
    public void FirstDone() => Assert.That(ReadPlan()["alpha"], Is.True);

    [Then("the plan shows the other two as not done")]
    public void OthersNotDone() => Assert.That(ReadPlan().Where(t => t.Key != "alpha").Select(t => t.Value), Is.EqualTo(new[] { false, false }));

    [Then("the plan shows every task as done")]
    public void AllDone() => Assert.That(ReadPlan().Values, Is.Not.Empty.And.All.True);

    [Then("each new work commit contains the work for one task")]
    public void OneTaskPerCommit()
    {
        foreach (var commit in WorkCommits())
        {
            var files = ProductFiles(commit);
            Assert.That(files, Has.Length.EqualTo(1));
            var task = Path.GetFileNameWithoutExtension(files.Single());
            Assert.That(GitAt(target, "show", $"{commit}:./{task}.txt"), Is.EqualTo($"Work for {task}"));
        }
    }

    [Then("there are two new work commits")]
    public void TwoWorkCommits()
    {
        Assert.That(result.Code, Is.Zero, result.Error);
        Assert.That(WorkCommits(), Has.Length.EqualTo(2));
    }

    [Then("no new commit contains the work for the first task")]
    public void NoFirstTaskCommit() => Assert.That(WorkCommits().SelectMany(ProductFiles)
        .Select(Path.GetFileName), Does.Not.Contain("alpha.txt"));

    [Then("there are three new work commits")]
    public void ThreeWorkCommits()
    {
        Assert.That(result.Code, Is.Zero, result.Error);
        Assert.That(WorkCommits(), Has.Length.EqualTo(3));
        var files = WorkCommits().SelectMany(ProductFiles).Select(Path.GetFileName);
        Assert.That(files, Is.EquivalentTo(new[] { "alpha.txt", "beta.txt", "gamma.txt" }));
    }

    private string[] WorkCommits() => GitAt(target, "rev-list", baseline == "" ? "HEAD" : $"{baseline}..HEAD")
        .Split('\n', StringSplitOptions.RemoveEmptyEntries)
        .Where(commit => ProductFiles(commit).Length > 0).ToArray();

    private string[] ProductFiles(string commit) => GitAt(target, "diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commit, "--", ".")
        .Split('\n', StringSplitOptions.RemoveEmptyEntries).Where(n => !n.Contains(".factory/")).ToArray();

    [Then("there is one new work commit")]
    public void OneWorkCommit()
    {
        Assert.That(result.Code, Is.Zero, result.Error);
        Assert.That(WorkCommits(), Has.Length.EqualTo(1));
    }

    [Then("it contains the work for the first task")]
    public void FirstWork() => CommittedTask("alpha");

    [Then("it contains the work for the second task")]
    public void SecondWork() => CommittedTask("beta");

    private void CommittedTask(string task)
    {
        var relative = Path.GetRelativePath(repo, target).Replace(Path.DirectorySeparatorChar, '/');
        Assert.That(ProductFiles(WorkCommits().Single()), Is.EqualTo(new[] { $"{relative}/{task}.txt" }));
        Assert.That(GitAt(target, "show", $"HEAD:./{task}.txt"), Is.EqualTo($"Work for {task}"));
    }

    [When("the factory runs to completion")]
    public void AllPasses() => Invoke(true);

    [Then("the doer has been called once")]
    public void OneCall() => Assert.That(RoleCalls("doer"), Has.Length.EqualTo(1));

    [Then("the doer has been called twice")]
    public void TwoCalls() => Assert.That(RoleCalls("doer"), Has.Length.EqualTo(2));

    [Then("the doer has been called three times")]
    public void ThreeCalls() => Assert.That(RoleCalls("doer"), Has.Length.EqualTo(3));

    [Then("the doer has not been called")]
    public void NoDoer() => Assert.That(RoleCalls("doer"), Is.Empty);

    [Given("the factory allows at most three attempts at a task")]
    public void AttemptLimit() => maxAttempts = 3;

    [Given("the validator is never satisfied")]
    public void NeverSatisfied() => environment["DOUBLE_VALIDATION"] = "never";

    [Given("the validator is not satisfied the first time")]
    public void RetryValidation() => environment["DOUBLE_VALIDATION"] = "retry";

    [Then("it reports that a task hit its limit")]
    public void HitLimit() => ErrorContains("task hit its limit");

    [Given("the validator's lens is testability")]
    public void Testability() => lens = "testability";

    [Then("the validator was given {string}")]
    public void ValidatorInput(string text) => Assert.That(Prompt("validator"), Does.Contain(text));

    [Then("the validator was asked for a result with the fields {string} and {string}")]
    public void ValidatorFields(string first, string second) => Assert.That(Prompt("validator"),
        Does.Contain("JSON").And.Contain($"\"{first}\"").And.Contain($"\"{second}\""));

    [Then("the validator was given the work for the second task")]
    public void SecondTaskValidation() => Assert.That(Prompt("validator"), Does.Contain("+Work for beta"));

    [Then("it was not given the work for the first task")]
    public void NoFirstTaskValidation()
    {
        foreach (var role in lastInspectedMachines)
            Assert.That(Prompt(role), Does.Not.Contain("Work for alpha"));
    }

    [Then("the doer was given the validator's findings")]
    public void FindingsReturned()
    {
        var prompts = RoleCalls("doer").Select(c => c.GetProperty("args").EnumerateArray().Last().GetString()).ToArray();
        Assert.That(prompts, Has.Length.EqualTo(4));
        Assert.That(prompts[0], Does.Not.Contain("Extract the task logic into a testable function."));
        Assert.That(prompts[1], Does.Contain("Extract the task logic into a testable function."));
        Assert.That(prompts[1], Does.Contain("subtask of the current task"));
    }

    [Then("the factory has stopped")]
    public void Stopped()
    {
        // Run waits for exit and kills the whole process tree if it times out.
        Assert.That(result.Code, Is.EqualTo(0).Or.EqualTo(1));
        if (result.Code == 0) Assert.That(result.Out, Does.Contain("factory stopped"));
    }

    [Then(@"^the plan is \.factory/plan\.md in the target$")]
    public void PlanInTarget() => Assert.That(File.Exists(Path.Combine(target, ".factory/plan.md")), Is.True);

    [Then("the factory's own files and unrelated uncommitted changes are as they were")]
    public void UnrelatedUntouched()
    {
        Assert.That(UnrelatedSnapshot(), Is.EqualTo(unrelated));
        var names = Git("diff", "--name-only", repoBaseline, "HEAD").Split('\n', StringSplitOptions.RemoveEmptyEntries);
        Assert.That(names.All(n => !n.StartsWith("factory/") && !n.StartsWith("unrelated") && n != "untracked.txt"), Is.True);
    }

    [TestCase(false)]
    [TestCase(true)]
    public void LargeValidationPromptUsesTemporaryFile(bool failValidator)
    {
        try
        {
            CopyFactory();
            NewTarget();
            Seed();
            Agent();
            Satisfied();
            ExistingPlan(false);
            var largeContent = string.Concat(Enumerable.Repeat("Vaccination fixture é漢字\n", 12000)) + "END-OF-LARGE-DIFF\n";
            File.WriteAllText(Path.Combine(target, "large.txt"), largeContent);
            if (failValidator) environment["DOUBLE_FAIL_VALIDATOR"] = "1";
            OnePass();
            Assert.That(result.Code, Is.EqualTo(failValidator ? 1 : 0), result.Error);
            var call = RoleCalls("validator").Single();
            var argument = call.GetProperty("promptArgument").GetString()!;
            Assert.That(argument, Does.StartWith("@"));
            Assert.That(File.Exists(argument[1..]), Is.False, "Temporary prompt must be deleted on success and failure.");
            Assert.That(Prompt("validator"), Does.Contain("+" + largeContent.TrimEnd().Replace("\n", "\n+")));
            if (failValidator) Assert.That(result.Error, Does.Contain("Validator failed deliberately."));
        }
        finally { Cleanup(); }
    }

    [Test]
    public void SmallValidationPromptDoesNotUseTemporaryFile()
    {
        try
        {
            CopyFactory();
            NewTarget();
            Seed();
            Agent();
            Satisfied();
            ExistingPlan(false);
            // No large file; diff stays small.
            OnePass();
            Assert.That(result.Code, Is.Zero, result.Error);
            var call = RoleCalls("validator").Single();
            var argument = call.GetProperty("promptArgument").GetString()!;
            Assert.That(argument, Does.Not.StartWith("@"), "Small prompts must be passed inline.");
        }
        finally { Cleanup(); }
    }

    [TestCase(null)]
    [TestCase("ux_validator")]
    [TestCase("oo_validator")]
    public void SequentialReviewsPassFindingsBackBeforeCommit(string? rejectedReviewer)
    {
        try
        {
            CopyFactory();
            NewTarget();
            Seed();
            Agent();
            Satisfied();
            ExistingPlan(false);
            foreach (var name in new[] { "ux_validator", "oo_validator" })
            {
                var folder = Path.Combine(target, ".assembly-lines", ".machines", name);
                Directory.CreateDirectory(folder);
                File.WriteAllText(Path.Combine(folder, "config.json"), JsonSerializer.Serialize(new {
                    harness, role = "validator", lens = name + " lens", instructions = name + " instructions"
                }));
            }
            AssemblyLine(Careful.Replace("validator -> planner [label=\"satisfied\"]", """
                validator -> ux_validator [label="satisfied"]
                ux_validator -> doer [label="not satisfied"]
                ux_validator -> oo_validator [label="satisfied"]
                oo_validator -> doer [label="not satisfied"]
                oo_validator -> planner [label="satisfied"]
                """));
            if (rejectedReviewer != null) environment["DOUBLE_REJECT_REVIEWER"] = rejectedReviewer;
            OnePass();
            Assert.That(result.Code, Is.Zero, result.Error);
            foreach (var name in new[] { "ux_validator", "oo_validator" })
            {
                Assert.That(Prompt(name), Does.Contain(name + " lens").And.Contain(name + " instructions")
                    .And.Contain("Change neither the plan nor the product files.").And.Contain("+Work for"));
            }
            Assert.That(RoleCalls("doer").Count(), Is.EqualTo(rejectedReviewer == null ? 1 : 2));
            if (rejectedReviewer != null)
                Assert.That(RoleCalls("doer").Last().GetProperty("args").EnumerateArray().Last().GetString(),
                    Does.Contain($"Fix finding from {rejectedReviewer}."));
            var roles = Calls().Select(c => c.GetProperty("role").GetString()).ToArray();
            Assert.That(roles.TakeLast(4), Is.EqualTo(new[] { "validator", "ux_validator", "oo_validator", "planner" }));
        }
        finally { Cleanup(); }
    }

    private string LinePath => Path.Combine(target, ".assembly-lines", lineName + ".dot");

    private void ConfigureMachines()
    {
        foreach (var role in new[] { "planner", "doer", "validator" })
            File.WriteAllText(Path.Combine(target, ".assembly-lines", ".machines", role, "config.json"),
                JsonSerializer.Serialize(new { harness = role == "validator" && defaultValidator ? null
                    : role == "doer" ? doerHarness ?? harness : role == "planner" ? plannerHarness ?? harness : harness, lens }));
    }

    [Given("this assembly line:")]
    public void AssemblyLine(string graph) => File.WriteAllText(LinePath, graph);

    [Given("the validator has been taken out, so the doer goes straight to the planner")]
    public void RemoveValidator() => AssemblyLine("""
        digraph assembly_line {
          start -> planner
          planner -> doer [label="not complete"]
          planner -> finish [label="complete"]
          doer -> planner
        }
        """);

    [Given("{string} is misspelt {string} throughout the assembly line")]
    public void Misspell(string from, string to) => AssemblyLine(File.ReadAllText(LinePath).Replace(from, to));

    [Given("the edge from validator to planner has been taken out")]
    public void RemoveExit() => AssemblyLine(string.Join("\n", File.ReadAllLines(LinePath)
        .Where(line => !line.Contains("validator -> planner"))));

    [When("the factory reads the assembly line")]
    public void ReadLine() => result = Run(Dotnet, repo, Path.Combine(repo, "factory/Factory.dll"),
        "--check-line", "--target", target, "--line", lineName);

    [Then("it accepts it")]
    public void AcceptLine() => Assert.That(result.Code, Is.Zero, result.Error);

    [Then("it refuses it")]
    public void RefuseLine() => Assert.That(result.Code, Is.Not.Zero);

    [Then("it reports that it has no machine called {string}")]
    public void MissingMachine(string name) => ErrorContains($"no machine called \"{name}\"");

    [Then("it reports that finish cannot be reached from validator")]
    public void NoFinish() => ErrorContains("finish cannot be reached from validator");

    [Given("the edges from validator are labelled {string} and {string}")]
    public void Relabel(string yes, string no) => AssemblyLine(File.ReadAllText(LinePath)
        .Replace("not satisfied", no).Replace("\"satisfied\"", $"\"{yes}\""));

    [Then("it reports that the result of validator has no field {string}")]
    public void MissingField(string field) => ErrorContains($"result of validator has no field \"{field}\"");

    [Then("the validator has not been called")]
    public void NoValidator() => Assert.That(RoleCalls("validator"), Is.Empty);

    [Then("the doer has been called four times")]
    public void FourCalls() => Assert.That(RoleCalls("doer"), Has.Length.EqualTo(4));

    [Then("the planner was called before the doer")]
    public void PlannerFirst() => Assert.That(Calls().First().GetProperty("role").GetString(), Is.EqualTo("planner"));

    [Given("a new target, with a seed describing a game of Tetris")]
    public void TetrisTarget() { NewTarget(); Seed(); }

    [Given("a new target, with a seed describing a game of Snake")]
    public void SnakeTarget()
    {
        NewTarget(); Seed();
        File.WriteAllText(seed, "Build a terminal game of Snake.");
    }

    [Given("the target has the machines planner, doer and validator")]
    public void TargetMachines()
    {
        foreach (var role in new[] { "planner", "doer", "validator" })
        {
            var directory = Path.Combine(target, ".assembly-lines", ".machines", role);
            Directory.CreateDirectory(directory);
            File.WriteAllText(Path.Combine(directory, "config.json"), "{}");
        }
    }

    [Given("the target has an assembly line {string} on which the doer's work is validated")]
    public void ValidatedLine(string name)
    {
        lineName = name;
        AssemblyLine(Careful);
    }

    [Given("the target has an assembly line {string} on which the doer goes straight to the planner")]
    public void QuickLine(string name) { lineName = name; RemoveValidator(); }

    [Given("a run named {string}, on the {string} line, with that seed and target")]
    public void NamedRun(string name, string line)
    {
        runName = name; lineName = line;
        runs[name] = new(target, seed, line);
    }

    private void SelectRun(string name)
    {
        runName = name;
        (target, seed, lineName) = runs[name];
    }

    [When("the factory runs the {string} run")]
    public void RunNamed(string name)
    {
        SelectRun(name); Invoke(true);
        if (File.Exists(PlanPath)) runPlans[name] = File.ReadAllText(PlanPath);
    }

    [When("the factory runs the {string} run, given only its name")]
    public void ResumeNamed(string name) { SelectRun(name); nameOnly = true; Invoke(true); }

    [Given("the {string} run has been started")]
    public void StartNamed(string name)
    {
        SelectRun(name); CompletedPlan(); Invoke(true);
        Assert.That(result.Code, Is.Zero, result.Error);
        File.Delete(PlanPath);
    }

    [When("the factory runs the {string} run with that target")]
    public void ChangeTarget(string name) { runName = name; Invoke(true); }

    [Then("the factory refuses")]
    public void Refused() => RefuseLine();

    [Then("it says the {string} run already has a target")]
    public void FixedTarget(string name) => ErrorContains($"run \"{name}\" already has a target");

    [Then("the validator has been called twice")]
    public void TwoValidations() => Assert.That(RoleCalls("validator"), Has.Length.EqualTo(2));

    [Then("the plan is plan.md in the factory's runs folder, under tetris")]
    public void RunPlan()
    {
        Assert.That(File.Exists(Path.Combine(repo, "factory/runs/tetris/plan.md")), Is.True);
        Assert.That(Git("ls-files", "factory/runs"), Is.Empty);
        Assert.That(Git("check-ignore", "factory/runs/tetris/plan.md"), Is.Not.Empty);
    }

    [Then("there is no plan in the target")]
    public void NoTargetPlan() => Assert.That(Directory.GetFiles(target, "plan.md", SearchOption.AllDirectories), Is.Empty);

    [Given("the validator has been taken out of the {string} line, so the doer goes straight to the planner")]
    public void RemoveNamedValidator(string name) { lineName = name; RemoveValidator(); }

    [Given("{string} is misspelt {string} throughout the {string} line")]
    public void MisspellNamed(string from, string to, string name) { lineName = name; Misspell(from, to); }

    [Given("the {string} line has been copied into the target")]
    public void CopyLine(string name)
    {
        lineName = name;
        File.Copy(Path.Combine(runs.First().Value.Target, ".assembly-lines", name + ".dot"), LinePath, true);
    }

    [Given("a plan for each run with three tasks of its own, none of them done")]
    public void SeparatePlans()
    {
        foreach (var name in runs.Keys)
        {
            SelectRun(name);
            Directory.CreateDirectory(Path.GetDirectoryName(PlanPath)!);
            var tasks = new[] { "alpha", "beta", "gamma" }.ToDictionary(t => name + "-" + t, _ => false);
            File.WriteAllText(PlanPath, JsonSerializer.Serialize(tasks));
        }
    }

    private JsonElement[] RunCalls(string name) => Calls().Where(c => c.GetProperty("args")
        .EnumerateArray().Last().GetString()!.Contains($"runs/{name}/plan.md")).ToArray();

    [Then("the validator was called for the {string} run")]
    public void RunValidated(string name) => Assert.That(RunCalls(name)
        .Count(c => c.GetProperty("role").GetString() == "validator"), Is.EqualTo(3));

    [Then("the validator was not called for the {string} run")]
    public void RunUnchecked(string name) => Assert.That(RunCalls(name)
        .Count(c => c.GetProperty("role").GetString() == "validator"), Is.Zero);

    [Then("each run has its own plan")]
    public void IndependentPlans()
    {
        foreach (var name in runs.Keys)
        {
            SelectRun(name);
            Assert.That(ReadPlan().Values, Is.Not.Empty.And.All.True);
            Assert.That(File.ReadAllText(PlanPath), Is.EqualTo(runPlans[name]));
            NoTargetPlan();
        }
    }

    [Then("each target holds only its own run's work")]
    public void IndependentWork()
    {
        foreach (var name in runs.Keys)
        {
            SelectRun(name);
            Assert.That(Directory.GetFiles(target, "*.txt").Select(Path.GetFileNameWithoutExtension),
                Is.EquivalentTo(ReadPlan().Keys));
            foreach (var task in ReadPlan().Keys)
                Assert.That(GitAt(target, "show", $"HEAD:./{task}.txt"), Is.EqualTo($"Work for {task}"));
            Assert.That(RunCalls(name).All(c => c.GetProperty("cwd").GetString() == target), Is.True);
        }
    }

    [TestCase("seed")]
    [TestCase("line")]
    public void SavedSettingsCannotChange(string setting)
    {
        try
        {
            CopyFactory(); TetrisTarget(); NamedRun("tetris", "careful"); Agent(); Satisfied();
            StartNamed("tetris");
            var settings = Path.Combine(repo, "factory/runs/tetris/run.json");
            var original = File.ReadAllText(settings);
            var calls = Calls().Length;
            result = Run(Dotnet, repo, Path.Combine(repo, "factory/Factory.dll"),
                "--run", "tetris", "--" + setting, setting == "seed" ? seed + ".other" : "quick");
            ErrorContains($"already has a {setting}");
            Assert.That(File.ReadAllText(settings), Is.EqualTo(original));
            Assert.That(Calls(), Has.Length.EqualTo(calls));
        }
        finally { Cleanup(); }
    }

    [Test]
    public void StagedAndUnstagedLineSettingsStayOutOfProductCommits()
    {
        try
        {
            CopyFactory(); TetrisTarget(); NamedRun("tetris", "careful"); Agent(); Satisfied();
            ConfigureMachines();
            Git("add", "--", Path.GetRelativePath(repo, Path.Combine(target, ".assembly-lines")));
            File.AppendAllText(LinePath, "\n");
            string Snapshot() => GitAt(target, "diff", "--cached", "--", ".assembly-lines")
                + GitAt(target, "diff", "--", ".assembly-lines");
            var original = Snapshot();
            RunNamed("tetris");
            Assert.That(result.Code, Is.Zero, result.Error);
            Assert.That(Snapshot(), Is.EqualTo(original));
            Assert.That(GitAt(target, "ls-tree", "-r", "--name-only", "HEAD", "--", ".assembly-lines"), Is.Empty);
            Assert.That(Prompt("validator"), Does.Not.Contain("digraph assembly_line").And.Not.Contain("config.json"));
            RunPlan(); NoTargetPlan();
        }
        finally { Cleanup(); }
    }

    [AfterScenario]
    public void Cleanup()
    {
        if (workspace != null && Directory.Exists(workspace)) Directory.Delete(workspace, true);
        environment.Clear();
        plannerHarness = null;
        doerHarness = null;
    }
}
