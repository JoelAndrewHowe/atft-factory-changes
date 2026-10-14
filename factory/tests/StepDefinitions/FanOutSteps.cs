using System.Text.Json;

namespace Factory.Tests;

public sealed partial class FactorySteps
{
    private static readonly string[] Reviewers = ["reviewer_1", "reviewer_2", "reviewer_3"];
    private string[] lastInspectedMachines = ["validator"];
    private const string FanOut = """
        digraph assembly_line {
          start -> planner
          planner -> doer [label="not complete"]
          planner -> finish [label="complete"]
          doer -> reviewer_1
          doer -> reviewer_2
          doer -> reviewer_3
          reviewer_1 -> synthesiser
          reviewer_2 -> synthesiser
          reviewer_3 -> synthesiser
          synthesiser -> doer [label="not satisfied"]
          synthesiser -> planner [label="satisfied"]
        }
        """;

    [Given("a plan with one task, not done")]
    public void OneUnfinishedTask() => ExistingPlan(false);
    [Given("the target has the three big brains")]
    public void BigBrains()
    {
        foreach (var name in Reviewers.Append("synthesiser"))
        {
            var directory = Path.Combine(target, ".assembly-lines", ".machines", name);
            Directory.CreateDirectory(directory);
            File.WriteAllText(Path.Combine(directory, "config.json"), JsonSerializer.Serialize(new {
                role = "validator", lens = "testability", instructions = name == "synthesiser"
                    ? "Decide from the branch reports. Return satisfied and findings."
                    : "Review the current work and report satisfied and findings."
            }));
        }
    }

    [Given("the three big brains has replaced the validator on the {string} line")]
    public void ReplaceValidator(string name) { lineName = name; BigBrains(); AssemblyLine(FanOut); }

    [Then("it reports that the branches from doer do not meet")]
    public void BranchesDoNotMeet() => ErrorContains("branches from doer do not meet");

    [Given("every reviewer is always satisfied")]
    public void ReviewersSatisfied() => environment["DOUBLE_REVIEWERS"] = "satisfied";
    [Given("the synthesiser is always satisfied")]
    public void SynthesiserSatisfied() => environment["DOUBLE_SYNTHESIS"] = "satisfied";
    [Given("the synthesiser is never satisfied")]
    public void SynthesiserNeverSatisfied() => environment["DOUBLE_SYNTHESIS"] = "never";
    [Given("the synthesiser is not satisfied the first time")]
    public void SynthesiserRetries() => environment["DOUBLE_SYNTHESIS"] = "retry";
    [Given("no reviewer finishes until all three have begun")]
    public void ReviewersWait() => environment["DOUBLE_REVIEW_BARRIER"] = "1";
    [Given("every reviewer is not satisfied, with a finding of its own: {string}, {string} or {string}")]
    public void ReviewerFindings(string first, string second, string third)
        => environment["DOUBLE_REPORTS"] = JsonSerializer.Serialize(new[] { first, second, third });
    [Given("the second reviewer is not satisfied, with the finding {string}")]
    public void SecondReviewerFinding(string finding)
        => environment["DOUBLE_REPORTS"] = JsonSerializer.Serialize(new[] { "", finding, "" });
    [Given("the second reviewer answers in prose, with no result")]
    public void ReviewerProse() => environment["DOUBLE_REVIEW_FAILURE"] = "prose";
    [Given("the second reviewer cannot be run")]
    public void ReviewerCannotRun()
    {
        File.WriteAllText(Path.Combine(target, ".assembly-lines/.machines/reviewer_2/config.json"),
            JsonSerializer.Serialize(new { harness = Path.Combine(workspace, "missing-reviewer") }));
    }
    [Given("the reviewers' lens is testability")]
    public void ReviewerLens() { } // BigBrains configures all reviewers with this lens.

    [Then("every reviewer has been called once")]
    public void ReviewersOnce()
    {
        Assert.That(result.Code, Is.Zero, result.Error);
        foreach (var name in Reviewers) Assert.That(RoleCalls(name), Has.Length.EqualTo(1));
    }
    [Then("the synthesiser has been called once")]
    public void SynthesiserOnce() => Assert.That(RoleCalls("synthesiser"), Has.Length.EqualTo(1));
    [Then("the synthesiser has not been called")]
    public void NoSynthesiser() => Assert.That(RoleCalls("synthesiser"), Is.Empty);
    [Then("every reviewer was asked for a result")]
    public void ReviewerResults()
    {
        foreach (var name in Reviewers) Assert.That(Prompt(name), Does.Contain("result").And.Contain("JSON"));
    }
    [Then("the synthesiser was given {string}, {string} and {string}")]
    public void SynthesisReports(string first, string second, string third)
    { foreach (var report in new[] { first, second, third }) SynthesisReport(report); }
    [Then("the synthesiser was given {string}")]
    public void SynthesisReport(string report)
    {
        lastInspectedMachines = ["synthesiser"];
        Assert.That(Prompt("synthesiser"), Does.Contain(report).And.Not.Contain("Seed:").And.Not.Contain("Plan:"));
    }
    [Then("every reviewer was given the work for the second task")]
    public void ReviewSecondTask()
    {
        lastInspectedMachines = Reviewers;
        foreach (var name in Reviewers) Assert.That(Prompt(name), Does.Contain("+Work for beta"));
    }
    [Then("every reviewer was given the same prompt")]
    public void IdenticalReviewPrompts()
    {
        var prompts = Reviewers.Select(name => Prompt(name)).ToArray();
        Assert.That(prompts.Distinct().Count(), Is.EqualTo(1));
    }
    [Then("every reviewer was given {string}")]
    public void ReviewersGiven(string text)
    { foreach (var name in Reviewers) Assert.That(Prompt(name), Does.Contain(text)); }
    [Then("the doer was given the synthesiser's findings")]
    public void SynthesisFeedback()
    {
        Assert.That(RoleCalls("doer"), Has.Length.EqualTo(2));
        Assert.That(RoleCalls("doer").Last().GetProperty("args").EnumerateArray().Last().GetString(),
            Does.Contain("Resolve the synthesiser finding."));
    }
    [Then("it was not given {string}")]
    public void NoRawReport(string report)
    {
        foreach (var call in RoleCalls("doer"))
            Assert.That(call.GetProperty("args").EnumerateArray().Last().GetString(), Does.Not.Contain(report));
    }
    [Then("it reports that it could not read reviewer_2's result")]
    public void UnreadableReviewer() => ErrorContains("reviewer_2's result");
    [Then("it reports that it could not run reviewer_2")]
    public void FailedReviewer() => ErrorContains("could not run the reviewer_2");
    [TestCase("prose")]
    [TestCase("crash")]
    public void FailedBranchStopsBlockedSiblings(string failure)
    {
        try
        {
            CopyFactory(); TetrisTarget(); NamedRun("tetris", "careful"); Agent();
            ReplaceValidator("careful"); ExistingPlan(false);
            environment["DOUBLE_REVIEW_BARRIER"] = "1";
            environment["DOUBLE_HOLD_REVIEWERS"] = "1";
            environment["DOUBLE_REVIEW_FAILURE"] = failure;
            RunNamed("tetris");
            ErrorContains(failure == "prose" ? "reviewer_2's result" : "could not run the reviewer_2");
            NoSynthesiser(); NoCommits();
            Assert.That(RoleCalls("planner"), Has.Length.EqualTo(1));
            foreach (var reviewer in Reviewers)
            {
                var pid = int.Parse(File.ReadAllText(Path.Combine(workspace, reviewer + ".pid")));
                try
                {
                    using var process = System.Diagnostics.Process.GetProcessById(pid);
                    Assert.That(process.HasExited, Is.True, reviewer + " must be stopped");
                }
                catch (ArgumentException) { } // The OS has already reaped the process.
            }
        }
        finally { Cleanup(); }
    }

    [Test]
    public void BranchesUseTheirOwnConfiguration()
    {
        try
        {
            CopyFactory(); TetrisTarget(); NamedRun("tetris", "careful"); Agent();
            ReplaceValidator("careful"); ExistingPlan(false);
            var config = Path.Combine(target, ".assembly-lines/.machines/reviewer_2/config.json");
            File.WriteAllText(config, JsonSerializer.Serialize(new {
                harness, instructions = "Inspect accessibility independently.", provider = "chosen-provider", model = "chosen-model"
            }));
            RunNamed("tetris");
            Assert.That(result.Code, Is.Zero, result.Error);
            Assert.That(Prompt("reviewer_2"), Does.Contain("Inspect accessibility independently."));
            Assert.That(Prompt("reviewer_1"), Does.Not.Contain("Inspect accessibility independently."));
            var call = RoleCalls("reviewer_2").Single();
            Assert.That(call.GetProperty("agent").GetString(), Is.EqualTo("chosen-agent"));
            Assert.That(call.GetProperty("args").EnumerateArray().Select(a => a.GetString()).Take(6),
                Is.EqualTo(new[] { "--print", "--no-session", "--provider", "chosen-provider", "--model", "chosen-model" }));
        }
        finally { Cleanup(); }
    }

}
