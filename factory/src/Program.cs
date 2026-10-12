using System.Diagnostics;
using System.Text.Json;

try
{
    if (args is ["--help"] or ["-h"])
    {
        Console.WriteLine("Usage: factory --seed <file> --target <folder> [--all] [--agent <executable>] [--doer <executable>] [--max-attempts <number>] [--lens <focus>]");
        return 0;
    }
    string? seed = null, target = null;
    var agent = "pi";
    string? doer = null;
    var lens = "testability";
    var maxAttempts = 3;
    var all = false;
    for (var i = 0; i < args.Length; i++)
    {
        if (args[i] == "--all") { all = true; continue; }
        if (i + 1 >= args.Length) throw new Exception("Expected an option value.");
        switch (args[i])
        {
            case "--seed": seed = Path.GetFullPath(args[++i]); break;
            case "--target": target = Path.GetFullPath(args[++i]); break;
            case "--agent": agent = args[++i]; break;
            case "--doer": doer = args[++i]; break;
            case "--lens": lens = args[++i]; break;
            case "--max-attempts":
                if (!int.TryParse(args[++i], out maxAttempts) || maxAttempts < 1)
                    throw new Exception("The attempt limit must be a positive integer.");
                break;
            default: throw new Exception($"Unknown option: {args[i]}");
        }
    }
    if (seed == null || !File.Exists(seed)) throw new Exception("There is no seed.");
    if (target == null) throw new Exception("A target is required.");
    if (agent.Contains(Path.DirectorySeparatorChar)) agent = Path.GetFullPath(agent);
    if (doer != null && doer.Contains(Path.DirectorySeparatorChar)) doer = Path.GetFullPath(doer);
    Directory.CreateDirectory(target);
    if ((await Run("git", target, "rev-parse", "--show-toplevel")).Code != 0)
        await Git(target, "init");
    var plan = Path.Combine(target, ".factory", "plan.md");
    async Task<JsonElement> Machine(string role, string instructions)
    {
        var executable = role == "doer" ? doer ?? agent : agent;
        var prompt = $"""
            Machine: {role}
            Work only in the current target directory.
            Seed: {seed}
            Plan: {plan}
            Do not stage or commit: the factory handles Git.
            {instructions}
            Finish with a single line of JSON. Do not wrap it in Markdown.
            """;
        (int Code, string Out, string Error) response;
        try { response = await Run(executable, target, "--print", "--no-session", prompt); }
        catch (System.ComponentModel.Win32Exception error)
        {
            throw new Exception($"Could not run the {role}: " + error.Message);
        }
        if (response.Code != 0) throw new Exception($"Could not run the {role}: " + response.Error.Trim());
        JsonElement result = default;
        foreach (var line in response.Out.Split('\n'))
        {
            try { result = JsonSerializer.Deserialize<JsonElement>(line); }
            catch (JsonException) { }
        }
        return result;
    }

    async Task<bool> Planner(bool committed = false)
    {
        var result = await Machine("planner", $"""
            Read the seed and maintain the plan. If it is missing, create tasks from the seed only.
            {(committed ? "The current task's validated work has been committed. Mark that task and its resolved subtasks done." : "Inspect the plan without marking unfinished tasks done. Do not perform product work.")}
            Return the boolean field "complete": true only when no tasks remain.
            """);
        return BooleanResult(result, "planner", "complete");
    }

    do
    {
        var hadPlan = File.Exists(plan);
        var complete = await Planner();
        if (complete || !hadPlan)
        {
            await Commit(target, "Factory plan");
            if (complete || !all) break;
            continue;
        }
        var findings = "[]";
        for (var attempt = 1; ; attempt++)
        {
            await Machine("doer", $"""
                Read the seed and the plan. Implement only the first unfinished task.
                Do not mark the task done; the planner does that after the work is committed.
                Validator findings: {findings}
                Record each finding as a subtask of the current task, not as a new top-level task,
                and fix it before asking for validation again.
                Return a JSON result describing the work performed.
                """);
            // A temporary index includes untracked files in the diff without changing
            // the real index or disturbing unrelated staged changes.
            var work = await WorkDiff(target);
            var verdict = await Machine("validator", $"""
                Check only the current task's work below using this lens: {lens}.
                Report findings only. Change neither the plan nor the product files.
                Return boolean "satisfied" and an array "findings" explaining any problems.
                Current task's work (Git diff against HEAD):
                {work}
                """);
            var satisfied = BooleanResult(verdict, "validator", "satisfied");
            if (!verdict.TryGetProperty("findings", out var reported) || reported.ValueKind != JsonValueKind.Array)
                throw new Exception("Could not read the validator's result.");
            if (satisfied) break;
            if (attempt >= maxAttempts) throw new Exception($"The pass hit its limit of {maxAttempts} attempts.");
            findings = reported.GetRawText();
        }
        await Commit(target, "Factory work");
        complete = await Planner(committed: true);
        await Commit(target, "Factory plan");
        if (complete) break;
    } while (all);
    Console.WriteLine("factory stopped");
    return 0;
}
catch (Exception error)
{
    Console.Error.WriteLine(error.Message);
    return 1;
}

static bool BooleanResult(JsonElement result, string role, string field)
{
    if (result.ValueKind != JsonValueKind.Object || !result.TryGetProperty(field, out var value)
        || value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
        throw new Exception($"Could not read the {role}'s result.");
    return value.GetBoolean();
}

static async Task Commit(string target, string message)
{
    await Git(target, "add", "--all", "--", ".");
    var changes = await Run("git", target, "diff", "--cached", "--quiet", "--", ".");
    if (changes.Code == 1) await Git(target, "commit", "--only", "-m", message, "--", ".");
    else if (changes.Code != 0) throw new Exception(changes.Error);
}

static async Task<string> WorkDiff(string target)
{
    var index = Path.Combine(Path.GetTempPath(), "factory-index-" + Guid.NewGuid());
    try
    {
        async Task<string> IndexedGit(params string[] arguments)
        {
            var result = await RunWithIndex("git", target, index, arguments);
            if (result.Code != 0) throw new Exception(result.Error.Trim());
            return result.Out;
        }
        await IndexedGit("read-tree", "HEAD");
        await IndexedGit("add", "--all", "--", ".");
        return await IndexedGit("diff", "--cached", "--no-ext-diff", "--no-color", "HEAD", "--", ".", ":(exclude).factory/plan.md");
    }
    finally { File.Delete(index); File.Delete(index + ".lock"); }
}

static async Task Git(string cwd, params string[] arguments)
{
    var result = await Run("git", cwd, arguments);
    if (result.Code != 0) throw new Exception(result.Error.Trim());
}

static Task<(int Code, string Out, string Error)> Run(string command, string cwd, params string[] arguments)
    => RunWithIndex(command, cwd, null, arguments);

static async Task<(int Code, string Out, string Error)> RunWithIndex(string command, string cwd, string? index, params string[] arguments)
{
    var info = new ProcessStartInfo(command)
    {
        WorkingDirectory = cwd, UseShellExecute = false,
        RedirectStandardOutput = true, RedirectStandardError = true
    };
    if (index != null) info.Environment["GIT_INDEX_FILE"] = index;
    foreach (var argument in arguments) info.ArgumentList.Add(argument);
    using var process = Process.Start(info) ?? throw new Exception($"Could not start {command}.");
    var output = process.StandardOutput.ReadToEndAsync();
    var error = process.StandardError.ReadToEndAsync();
    await process.WaitForExitAsync();
    return (process.ExitCode, await output, await error);
}
