using System.Text.Json;

namespace Factory.Tests;

public sealed partial class FactorySteps
{
    private static readonly string[] PlanCheckMachines = ["task_extractor", "plan_review_gpt", "plan_review_opus", "plan_synthesiser"];
    private const string PlanCheck = """
        digraph assembly_line {
          start -> planner
          planner -> plan_gate [label="not complete"]
          planner -> finish [label="complete"]
          plan_gate -> task_extractor [label="plan_check"]
          plan_gate -> doer [label="not plan_check"]
          task_extractor -> plan_review_gpt
          task_extractor -> plan_review_opus
          plan_review_gpt -> plan_synthesiser
          plan_review_opus -> plan_synthesiser
          plan_synthesiser -> planner [label="not satisfied"]
          plan_synthesiser -> doer [label="satisfied"]
          doer -> validator
          validator -> doer [label="not satisfied"]
          validator -> planner [label="satisfied"]
        }
        """;

    private void PlanCheckLine(string name, string? setting)
    {
        lineName = name;
        AssemblyLine(PlanCheck);
        var machines = new Dictionary<string, object>
        {
            ["plan_gate"] = new { setting = "PlanCheck:Enabled", field = "plan_check" },
            ["task_extractor"] = new { role = "extractor" },
            ["plan_review_gpt"] = new { role = "plan-validator", provider = "openrouter", model = "openai/review-model" },
            ["plan_review_opus"] = new { role = "plan-validator", provider = "openrouter", model = "anthropic/review-model" },
            ["plan_synthesiser"] = new { role = "validator" }
        };
        foreach (var (machine, config) in machines)
        {
            var directory = Path.Combine(target, ".assembly-lines", ".machines", machine);
            Directory.CreateDirectory(directory);
            File.WriteAllText(Path.Combine(directory, "config.json"), JsonSerializer.Serialize(config));
        }
        if (setting != null)
            File.WriteAllText(Path.Combine(repo, "factory", "appsettings.json"), setting);
    }

    private void PlanCheckRun(string? setting)
    {
        CopyFactory(); TetrisTarget(); NamedRun("tetris", "careful"); Agent();
        PlanCheckLine("careful", setting); ExistingPlan(false);
        environment.TryAdd("DOUBLE_VALIDATION", "satisfied");
        RunNamed("tetris");
    }

    private string PromptAt(string role, int call)
        => RoleCalls(role)[call].GetProperty("args").EnumerateArray().Last().GetString()!;

    [TestCase("""{ "PlanCheck": { "Enabled": false } }""")]
    [TestCase("""{ }""")]
    [TestCase(null)]
    public void PlanCheckOffGoesStraightToTheDoer(string? setting)
    {
        try
        {
            PlanCheckRun(setting);
            Assert.That(result.Code, Is.Zero, result.Error);
            foreach (var machine in PlanCheckMachines.Append("plan_gate"))
                Assert.That(RoleCalls(machine), Is.Empty, machine);
            Assert.That(RoleCalls("doer"), Has.Length.EqualTo(1));
            Assert.That(Prompt("doer"), Does.Contain("Read the seed and the plan").And.Not.Contain("Extracted task"));
        }
        finally { Cleanup(); }
    }

    [Test]
    public void PlanCheckOnReviewsOnlyTheExtractedTask()
    {
        try
        {
            PlanCheckRun("""{ "PlanCheck": { "Enabled": true } }""");
            Assert.That(result.Code, Is.Zero, result.Error);
            Assert.That(RoleCalls("plan_gate"), Is.Empty);
            foreach (var machine in PlanCheckMachines) Assert.That(RoleCalls(machine), Has.Length.EqualTo(1), machine);
            Assert.That(Prompt("task_extractor"), Does.Contain("Plan: " + PlanPath));
            foreach (var reviewer in new[] { "plan_review_gpt", "plan_review_opus" })
                Assert.That(Prompt(reviewer), Does.Contain("Extracted task: alpha")
                    .And.Not.Contain("Plan:").And.Not.Contain("Seed:").And.Contain("JSON"), reviewer);
            Assert.That(Prompt("plan_synthesiser"), Does.Not.Contain("Plan:").And.Not.Contain("Seed:"));
            Assert.That(Prompt("doer"), Does.Contain("Extracted task: alpha").And.Not.Contain("Read the seed and the plan"));
            var arguments = RoleCalls("plan_review_opus").Single().GetProperty("args").EnumerateArray().Select(a => a.GetString()).ToArray();
            Assert.That(arguments.Take(6), Is.EqualTo(new[] { "--print", "--no-session", "--provider", "openrouter", "--model", "anthropic/review-model" }));
        }
        finally { Cleanup(); }
    }

    [Test]
    public void RejectedTaskGoesBackToThePlannerWithTheFindings()
    {
        try
        {
            environment["DOUBLE_PLAN_SYNTHESIS"] = "retry";
            PlanCheckRun("""{ "PlanCheck": { "Enabled": true } }""");
            Assert.That(result.Code, Is.Zero, result.Error);
            Assert.That(RoleCalls("task_extractor"), Has.Length.EqualTo(2));
            Assert.That(RoleCalls("doer"), Has.Length.EqualTo(1));
            Assert.That(PromptAt("planner", 1), Does.Contain("failed its plan check").And.Contain("Resolve the plan finding."));
            Assert.That(PromptAt("planner", 0), Does.Not.Contain("failed its plan check"));
            Assert.That(PromptAt("planner", 2), Does.Not.Contain("failed its plan check"));
        }
        finally { Cleanup(); }
    }

    [Test]
    public void TaskThatNeverPassesThePlanCheckStopsTheRun()
    {
        try
        {
            environment["DOUBLE_PLAN_SYNTHESIS"] = "never";
            PlanCheckRun("""{ "PlanCheck": { "Enabled": true } }""");
            ErrorContains("limit of 3 plan checks");
            Assert.That(RoleCalls("doer"), Is.Empty);
            NoCommits();
        }
        finally { Cleanup(); }
    }

    [Test]
    public void RunLogRecordsEveryMachineAndTheirFindings()
    {
        try
        {
            environment["DOUBLE_VALIDATION"] = "retry";
            PlanCheckRun("""{ "PlanCheck": { "Enabled": true }, "Logging": { "Console": true } }""");
            Assert.That(result.Code, Is.Zero, result.Error);
            var runFolder = Path.Combine(repo, "factory", "runs", runName);
            var log = File.ReadAllText(Path.Combine(runFolder, "factory.log"));
            Assert.That(log, Does.Contain("switch plan_gate: PlanCheck:Enabled is true")
                .And.Contain("plan_review_gpt started (openrouter/openai/review-model")
                .And.Contain("fan out from task_extractor to plan_review_gpt, plan_review_opus, joining at plan_synthesiser")
                .And.Contain("validator result:").And.Contain("Extract the task logic into a testable function.")
                .And.Contain("route validator -> doer").And.Contain("doer attempt 2 of 3")
                .And.Contain("committed the validated work").And.Contain("factory stopped"));
            Assert.That(result.Error, Does.Contain("route validator -> doer"));
            var saved = Directory.GetFiles(Path.Combine(runFolder, "history"), "*-validator.response.txt");
            Assert.That(saved, Has.Length.EqualTo(2));
        }
        finally { Cleanup(); }
    }

    [Test]
    public void RunLogStaysOffTheConsoleUnlessAsked()
    {
        try
        {
            PlanCheckRun("""{ "PlanCheck": { "Enabled": false } }""");
            Assert.That(result.Code, Is.Zero, result.Error);
            Assert.That(result.Error, Is.Empty);
            Assert.That(File.Exists(Path.Combine(repo, "factory", "runs", runName, "factory.log")), Is.True);
        }
        finally { Cleanup(); }
    }

    [TestCase(true)]
    [TestCase(false)]
    public void ValidatorsReceiveTaskBoundariesAndAttemptBaseline(bool planCheck)
    {
        try
        {
            CopyFactory(); TetrisTarget(); NamedRun("tetris", "careful"); Agent();
            PlanCheckLine("careful", planCheck ? "{\"PlanCheck\":{\"Enabled\":true}}" : "{}");
            ExistingPlan(false);
            File.WriteAllText(Path.Combine(target, "existing.txt"), "Pre-existing work");
            environment["DOUBLE_VALIDATION"] = "retry";
            RunNamed("tetris");
            Assert.That(result.Code, Is.Zero, result.Error);
            var first = PromptAt("validator", 0);
            Assert.That(first, Does.Contain(planCheck ? "Extracted task: alpha" : File.ReadAllText(PlanPath).Replace("true", "false").Trim()));
            Assert.That(first, Does.Contain("work explicitly deferred to later tasks")
                .And.Contain("regressions introduced by this work").And.Contain("suggestions array"));
            var baseline = first.Split("Target diff before the latest doer attempt")[1].Split("Full target diff now")[0];
            Assert.That(baseline, Does.Contain("Pre-existing work").And.Not.Contain("Work for alpha"));
            Assert.That(first.Split("Full target diff now")[1], Does.Contain("Work for alpha"));
            Assert.That(PromptAt("validator", 1).Split("Full target diff now")[0], Does.Contain("Work for alpha"));
            Assert.That(RoleCalls("doer"), Has.Length.EqualTo(2), "Real blocking defects still retry the doer.");
        }
        finally { Cleanup(); }
    }

    [TestCase(true)]
    [TestCase(false)]
    public void ScopeConflictReplansWithoutCommittingRejectedWork(bool planCheck)
    {
        try
        {
            environment["DOUBLE_SCOPE_CONFLICT"] = "once";
            PlanCheckRun(planCheck ? "{\"PlanCheck\":{\"Enabled\":true}}" : "{}");
            Assert.That(result.Code, Is.Zero, result.Error);
            Assert.That(PromptAt("planner", 1), Does.Contain("Implementation review found a scope conflict")
                .And.Contain("UI wiring is explicitly deferred")
                .And.Not.Contain("The current task's validated work has been committed."));
            Assert.That(RoleCalls("doer"), Has.Length.EqualTo(2));
            Assert.That(PromptAt("planner", 2), Does.Contain("The current task's validated work has been committed."));
            Assert.That(Git("rev-list", "--count", baseline + "..HEAD"), Is.EqualTo("1"));
        }
        finally { Cleanup(); }
    }

    [Test]
    public void DeferredSuggestionsDoNotTriggerAnotherAttempt()
    {
        try
        {
            environment["DOUBLE_SUGGESTIONS"] = "1";
            PlanCheckRun("{\"PlanCheck\":{\"Enabled\":true}}");
            Assert.That(result.Code, Is.Zero, result.Error);
            Assert.That(RoleCalls("doer"), Has.Length.EqualTo(1));
            Assert.That(PromptAt("planner", 1), Does.Contain("The current task's validated work has been committed."));
        }
        finally { Cleanup(); }
    }

    [Test]
    public void ScopeConflictsCannotResetTheAttemptLimit()
    {
        try
        {
            environment["DOUBLE_SCOPE_CONFLICT"] = "always";
            PlanCheckRun("{\"PlanCheck\":{\"Enabled\":true}}");
            ErrorContains("limit of 3 attempts");
            Assert.That(RoleCalls("doer"), Has.Length.EqualTo(3));
            NoCommits();
        }
        finally { Cleanup(); }
    }

    private string Script(string name, string body)
    {
        var path = Path.Combine(workspace, name);
        File.WriteAllText(path, "#!/bin/sh\n" + body + "\n");
        File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        return path;
    }

    private void GuardedRun(string guards, string plannerBody, string doerBody)
    {
        CopyFactory(); TetrisTarget(); NamedRun("tetris", "careful"); Agent();
        Directory.CreateDirectory(Path.GetDirectoryName(PlanPath)!);
        File.WriteAllText(PlanPath, "- [ ] alpha\n");
        plannerHarness = Script("planner.sh", plannerBody.Replace("__PLAN_PATH__", PlanPath));
        doerHarness = Script("doer.sh", doerBody);
        File.WriteAllText(Path.Combine(repo, "factory", "appsettings.json"), $$"""{ "Guards": {{guards}} }""");
        environment.TryAdd("DOUBLE_VALIDATION", "satisfied");
        RunNamed("tetris");
    }

    private const string GrowingPlanner = "printf -- '- [ ] extra\\n' >> \"__PLAN_PATH__\"\necho '{\"complete\":false}'";
    private const string ChangingDoer = "date +%s%N > work.txt\necho '{}'";

    [Test]
    public void FrozenTaskListStopsAPlanThatKeepsGrowing()
    {
        try
        {
            GuardedRun("""{ "FreezeTaskList": true }""", GrowingPlanner, ChangingDoer);
            ErrorContains("grew from 2 to 3 tasks");
        }
        finally { Cleanup(); }
    }

    [Test]
    public void TaskLimitStopsAPlanThatIsTooLong()
    {
        try
        {
            GuardedRun("""{ "MaxTasks": 1 }""", GrowingPlanner, ChangingDoer);
            ErrorContains("over the limit of 1");
            Assert.That(RoleCalls("doer"), Is.Empty);
        }
        finally { Cleanup(); }
    }

    [Test]
    public void TasksThatKeepChangingNothingStopTheRun()
    {
        try
        {
            GuardedRun("""{ "StopAfterNoChangeTasks": 2 }""", "echo '{\"complete\":false}'", "echo '{}'");
            ErrorContains("2 tasks in a row finished without changing any files");
        }
        finally { Cleanup(); }
    }

    [Test]
    public void GuardsAreOffWithoutSettings()
    {
        try
        {
            GuardedRun("{}", "echo '{\"complete\":true}'", "echo '{}'");
            Assert.That(result.Code, Is.Zero, result.Error);
        }
        finally { Cleanup(); }
    }

    [Test]
    public void SettingSwitchMustRouteOnItsField()
    {
        try
        {
            CopyFactory(); TetrisTarget(); NamedRun("tetris", "careful"); Agent();
            PlanCheckLine("careful", null);
            File.WriteAllText(Path.Combine(target, ".assembly-lines/.machines/plan_gate/config.json"),
                JsonSerializer.Serialize(new { setting = "PlanCheck:Enabled", field = "other_field" }));
            ExistingPlan(false);
            RunNamed("tetris");
            ErrorContains("setting switch");
            NoAgentCalls();
        }
        finally { Cleanup(); }
    }
}
