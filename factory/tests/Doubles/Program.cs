using System.Text.Json;

var workspace = Environment.GetEnvironmentVariable("DOUBLE_WORKSPACE")!;
var calls = Path.Combine(workspace, "calls");
Directory.CreateDirectory(calls);
var promptArgument = args.Last();
var prompt = promptArgument.StartsWith('@') ? File.ReadAllText(promptArgument[1..]) : promptArgument;
var role = Environment.GetEnvironmentVariable("FACTORY_MACHINE") ?? prompt.Split('\n').First(line => line.StartsWith("Machine: "))[9..].Trim();
var priorCalls = Directory.GetFiles(calls, "*.json").Select(file =>
    JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(file))).ToArray();
var callPath = Path.Combine(calls, $"{DateTime.UtcNow.Ticks:D19}-{Guid.NewGuid()}.json");
File.WriteAllText(callPath + ".tmp",
    JsonSerializer.Serialize(new { agent = args[0], role, cwd = Directory.GetCurrentDirectory(),
        promptArgument, args = args.Skip(1).SkipLast(1).Append(prompt) }));

File.Move(callPath + ".tmp", callPath);

if (role.StartsWith("plan_review_"))
{
    Console.WriteLine(JsonSerializer.Serialize(new { satisfied = true, findings = Array.Empty<string>() }));
    return;
}
if (role == "plan_synthesiser")
{
    var mode = Environment.GetEnvironmentVariable("DOUBLE_PLAN_SYNTHESIS");
    var satisfied = mode != "never" && (mode != "retry" || priorCalls.Any(c => c.GetProperty("role").GetString() == role));
    Console.WriteLine(JsonSerializer.Serialize(new { satisfied, findings = satisfied ? Array.Empty<string>() : new[] { "Resolve the plan finding." } }));
    return;
}
if (role.StartsWith("reviewer_"))
{
    File.WriteAllText(Path.Combine(workspace, role + ".pid"), Environment.ProcessId.ToString());
    if (Environment.GetEnvironmentVariable("DOUBLE_REVIEW_BARRIER") == "1")
    {
        // An explicit IPC barrier: no reviewer can finish before all have arrived.
        using var server = new System.IO.Pipes.NamedPipeServerStream(
            Path.GetFileName(workspace) + role, System.IO.Pipes.PipeDirection.In, 2,
            System.IO.Pipes.PipeTransmissionMode.Byte, System.IO.Pipes.PipeOptions.Asynchronous);
        var accept = Task.Run(async () => {
            for (var i = 0; i < 2; i++) { await server.WaitForConnectionAsync(); server.Disconnect(); }
        });
        foreach (var other in new[] { "reviewer_1", "reviewer_2", "reviewer_3" }.Where(n => n != role))
        {
            using var client = new System.IO.Pipes.NamedPipeClientStream(".", Path.GetFileName(workspace) + other,
                System.IO.Pipes.PipeDirection.Out);
            client.Connect(10000);
        }
        await accept;
    }
    if (role != "reviewer_2" && Environment.GetEnvironmentVariable("DOUBLE_HOLD_REVIEWERS") == "1")
    {
        using var hold = new System.IO.Pipes.NamedPipeServerStream(Path.GetFileName(workspace) + role + "-hold",
            System.IO.Pipes.PipeDirection.In);
        hold.WaitForConnection();
    }
    if (role == "reviewer_2" && Environment.GetEnvironmentVariable("DOUBLE_REVIEW_FAILURE") == "crash")
    { Console.Error.WriteLine("Reviewer crashed."); Environment.ExitCode = 1; return; }
    if (role == "reviewer_2" && Environment.GetEnvironmentVariable("DOUBLE_REVIEW_FAILURE") == "prose")
    { Console.WriteLine("No structured result."); return; }
    var reports = JsonSerializer.Deserialize<string[]>(Environment.GetEnvironmentVariable("DOUBLE_REPORTS") ?? "[\"\",\"\",\"\"]")!;
    var report = reports[int.Parse(role[^1..]) - 1];
    Console.WriteLine(JsonSerializer.Serialize(new { satisfied = report == "", findings = report == "" ? Array.Empty<string>() : new[] { report } }));
    return;
}
if (role == "synthesiser")
{
    var mode = Environment.GetEnvironmentVariable("DOUBLE_SYNTHESIS");
    var satisfied = mode != "never" && (mode != "retry" || priorCalls.Any(c => c.GetProperty("role").GetString() == role));
    Console.WriteLine(JsonSerializer.Serialize(new { satisfied, findings = satisfied ? Array.Empty<string>() : new[] { "Resolve the synthesiser finding." } }));
    return;
}

// These machines implement the scenario's behavior outside the factory. Prompt
// assertions independently check that the factory actually requests each result.
if (role is "validator" or "ux_validator" or "oo_validator")
{
    if (role != "validator")
    {
        var rejected = Environment.GetEnvironmentVariable("DOUBLE_REJECT_REVIEWER") == role
            && !priorCalls.Any(c => c.GetProperty("role").GetString() == role);
        Console.WriteLine(JsonSerializer.Serialize(new { satisfied = !rejected,
            findings = rejected ? new[] { $"Fix finding from {role}." } : Array.Empty<string>() }));
        return;
    }
    if (Environment.GetEnvironmentVariable("DOUBLE_FAIL_VALIDATOR") == "1")
    {
        Console.Error.WriteLine("Validator failed deliberately.");
        Environment.ExitCode = 1;
        return;
    }
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
if (role == "task_extractor")
{
    Console.WriteLine(JsonSerializer.Serialize(new { task = $"Extracted task: {task}" }));
    return;
}
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
