using Factory;
using System.Diagnostics;
using System.Text.Json;

try
{
    if (args is ["--help"] or ["-h"])
    {
        Console.WriteLine("Usage: factory --seed <file> --target <folder> [--max-attempts <number>] | --check-line");
        return 0;
    }
    var folder = AppContext.BaseDirectory;
    // The public launcher supplies the factory folder; copied builds keep config beside the DLL.
    folder = Environment.GetEnvironmentVariable("FACTORY_CONFIG_DIR") ?? folder;
    if (args is ["--check-line"])
    {
        _ = new AssemblyLine(folder);
        Console.WriteLine("assembly line accepted");
        return 0;
    }
    string? seed = null, target = null;
    var maxAttempts = 3;
    for (var i = 0; i < args.Length; i++)
    {
        if (i + 1 >= args.Length) throw new Exception("Expected an option value.");
        switch (args[i])
        {
            case "--seed": seed = Path.GetFullPath(args[++i]); break;
            case "--target": target = Path.GetFullPath(args[++i]); break;
            case "--max-attempts":
                if (!int.TryParse(args[++i], out maxAttempts) || maxAttempts < 1)
                    throw new Exception("The attempt limit must be a positive integer.");
                break;
            default: throw new Exception($"Unknown option: {args[i]}");
        }
    }
    if (seed == null || !File.Exists(seed)) throw new Exception("There is no seed.");
    if (target == null) throw new Exception("A target is required.");
    var line = new AssemblyLine(folder);
    Directory.CreateDirectory(target);
    if ((await Run("git", target, "rev-parse", "--show-toplevel")).Code != 0)
        await Git(target, "init");
    var plan = Path.Combine(target, ".factory", "plan.md");
    async Task<JsonElement> Machine(string role, string instructions)
    {
        var executable = line.Machines[role].Harness ?? "pi";
        if (executable.Contains(Path.DirectorySeparatorChar) && !Path.IsPathRooted(executable))
            executable = Path.GetFullPath(executable, folder);
        var fields = line.Edges.Where(e => e.From == role && e.Field != null)
            .Select(e => $"\"{e.Field}\"").Distinct();
        var prompt = $"""
            Machine: {role}
            Work only in the current target directory.
            Seed: {seed}
            Plan: {plan}
            Do not stage or commit: the factory handles Git.
            {instructions}
            Return boolean result fields: {string.Join(", ", fields)}.
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
        if (result.ValueKind != JsonValueKind.Object)
            throw new Exception($"Could not read the {role}'s result.");
        return result;
    }

    var current = line.Next("start", default);
    var attempts = 0;
    var pendingWork = false;
    var findings = "[]";
    while (current != "finish")
    {
        var hadPlan = File.Exists(plan);
        var committed = current == "planner" && pendingWork;
        if (committed) await Commit(target, "Factory work");
        if (current == "doer" && ++attempts > maxAttempts)
            throw new Exception($"The task hit its limit of {maxAttempts} attempts.");
        var instructions = current switch
        {
            "planner" => $"""
                Read the seed and maintain the plan. If it is missing, create tasks from the seed only.
                {(committed ? "The current task's validated work has been committed. Mark that task and its resolved subtasks done." : "Inspect the plan without marking unfinished tasks done. Do not perform product work.")}
                Return "complete": true only when no tasks remain.
                """,
            "doer" => $"""
                Read the seed and the plan. Implement only the first unfinished task.
                Do not mark the task done; the planner does that after the work is committed.
                Validator findings: {findings}
                Record each finding as a subtask of the current task, not as a new top-level task,
                and fix it before asking for validation again.
                Return a JSON result describing the work performed.
                """,
            "validator" => $"""
                Check only the current task's work below using this lens: {line.Machines[current].Lens}.
                Report findings only. Change neither the plan nor the product files.
                Return an array "findings" explaining any problems, alongside the routing fields.
                Current task's work (Git diff against HEAD):
                {await WorkDiff(target)}
                """,
            _ => "Read the seed and plan and perform your machine's work."
        };
        var result = await Machine(current, instructions);
        var next = line.Next(current, result);
        if (current == "planner")
        {
            if (!hadPlan || committed || next == "finish") await Commit(target, "Factory plan");
            pendingWork = false;
            attempts = 0;
            findings = "[]";
        }
        if (current == "doer") pendingWork = true;
        if (current == "validator")
        {
            if (!result.TryGetProperty("findings", out var reported) || reported.ValueKind != JsonValueKind.Array)
                throw new Exception("Could not read the validator's result.");
            findings = reported.GetRawText();
        }
        current = next;
    }
    Console.WriteLine("factory stopped");
    return 0;
}
catch (Exception error)
{
    Console.Error.WriteLine(error.Message);
    return 1;
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
