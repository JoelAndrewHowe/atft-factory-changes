using System.Text.Json;

var workspace = Environment.GetEnvironmentVariable("DOUBLE_WORKSPACE")!;
var calls = Path.Combine(workspace, "calls");
Directory.CreateDirectory(calls);
var prompt = args.Last();
var role = prompt.Split('\n').First(line => line.StartsWith("Machine: "))[9..].Trim();
var priorCalls = Directory.GetFiles(calls).Select(file =>
    JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(file))).ToArray();
File.WriteAllText(Path.Combine(calls, $"{priorCalls.Length:D4}.json"),
    JsonSerializer.Serialize(new { agent = args[0], role, cwd = Directory.GetCurrentDirectory(), args = args.Skip(1) }));

// These machines implement the scenario's behavior outside the factory. Prompt
// assertions independently check that the factory actually requests each result.
if (role == "validator")
{
    if (Environment.GetEnvironmentVariable("DOUBLE_PROSE_RESULT") == "1")
    {
        Console.WriteLine("I did some work but have no structured result.");
        return;
    }
    var preamble = Environment.GetEnvironmentVariable("DOUBLE_PREAMBLE");
    if (preamble != null)
    {
        Console.WriteLine("{\"satisfied\":false,\"findings\":[\"Earlier verdict\"]}");
        Console.WriteLine(preamble);
    }
    var mode = Environment.GetEnvironmentVariable("DOUBLE_VALIDATION");
    var satisfied = mode != "never" && (mode != "retry" || priorCalls.Any(c => c.GetProperty("role").GetString() == "validator"));
    Console.WriteLine(JsonSerializer.Serialize(new { satisfied, findings = satisfied ? Array.Empty<string>() : new[] { "Extract the task logic into a testable function." } }));
    return;
}
var plan = prompt.Split('\n').First(line => line.StartsWith("Plan: "))[6..].Trim();
var prose = Environment.GetEnvironmentVariable("DOUBLE_PROSE_PLAN") == "1";
string Format(Dictionary<string, bool> items) => prose
    ? string.Join("\n", items.Select(t => $"Task {t.Key} is {(t.Value ? "finished" : "waiting")}."))
    : JsonSerializer.Serialize(items);
if (role == "planner" && !File.Exists(plan))
{
    Directory.CreateDirectory(Path.GetDirectoryName(plan)!);
    File.WriteAllText(plan, Format(new() { ["alpha"] = false, ["beta"] = false }));
    Console.WriteLine("{\"complete\":false}");
    return;
}
var tasks = prose
    ? File.ReadAllLines(plan).Select(line => line.Split(' ')).ToDictionary(words => words[1], words => words[3] == "finished.")
    : JsonSerializer.Deserialize<Dictionary<string, bool>>(File.ReadAllText(plan))!;
var task = tasks.FirstOrDefault(t => !t.Value).Key;
if (role == "planner")
{
    if (prompt.Contains("The current task's validated work has been committed.") && task != null)
    {
        // Verify the factory really committed before asking the planner to mark done.
        var product = Environment.GetEnvironmentVariable("DOUBLE_PRODUCT") ?? task + ".txt";
        var info = new System.Diagnostics.ProcessStartInfo("git") { RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var arg in new[] { "show", "HEAD:./" + product }) info.ArgumentList.Add(arg);
        using var git = System.Diagnostics.Process.Start(info)!;
        var committed = git.StandardOutput.ReadToEnd();
        git.WaitForExit();
        if (git.ExitCode != 0 || committed != File.ReadAllText(product))
            throw new Exception("Planner was asked to mark work done before its commit.");
        tasks[task] = true;
        File.WriteAllText(plan, Format(tasks) + (tasks.Values.All(done => done) ? "\n" : ""));
    }
    Console.WriteLine(JsonSerializer.Serialize(new { complete = tasks.Values.All(done => done) }));
    return;
}
if (task == null) throw new Exception("Doer called with no unfinished task.");
var file = Environment.GetEnvironmentVariable("DOUBLE_PRODUCT") ?? task + ".txt";
File.WriteAllText(Path.Combine(Directory.GetCurrentDirectory(), file), $"Work for {task}\n");
Console.WriteLine(JsonSerializer.Serialize(new { task }));
