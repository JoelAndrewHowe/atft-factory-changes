using Factory;
using System.Diagnostics;
using System.Text.Json;

try
{
    if (args is ["--help"] or ["-h"])
    {
        Console.WriteLine("Usage: factory --run <name> [--seed <file> --target <folder> --line <name>] [--max-attempts <number>] | --check-line --target <folder> --line <name>");
        return 0;
    }
    var folder = AppContext.BaseDirectory;
    // The public launcher supplies the factory folder; copied builds keep config beside the DLL.
    folder = Environment.GetEnvironmentVariable("FACTORY_CONFIG_DIR") ?? folder;
    string? seed = null, target = null, runName = null, lineName = null;
    var checkLine = false;
    var maxAttempts = 3;
    for (var i = 0; i < args.Length; i++)
    {
        if (args[i] == "--check-line") { checkLine = true; continue; }
        if (i + 1 >= args.Length) throw new Exception("Expected an option value.");
        switch (args[i])
        {
            case "--run": runName = args[++i]; break;
            case "--line": lineName = args[++i]; break;
            case "--seed": seed = Path.GetFullPath(args[++i]); break;
            case "--target": target = Path.GetFullPath(args[++i]); break;
            case "--max-attempts":
                if (!int.TryParse(args[++i], out maxAttempts) || maxAttempts < 1)
                    throw new Exception("The attempt limit must be a positive integer.");
                break;
            default: throw new Exception($"Unknown option: {args[i]}");
        }
    }
    if (checkLine)
    {
        if (target == null || lineName == null) throw new Exception("A target and line are required.");
        FactoryRun.CheckName(lineName);
        _ = new AssemblyLine(target, lineName);
        Console.WriteLine("assembly line accepted");
        return 0;
    }
    if (runName == null) throw new Exception("A run name is required.");
    var run = FactoryRun.Open(folder, runName, seed, target, lineName);
    (seed, target, lineName) = run;
    if (!File.Exists(seed)) throw new Exception("There is no seed.");
    var line = new AssemblyLine(target, lineName);
    if ((await Run("git", target, "rev-parse", "--show-toplevel")).Code != 0)
        await Git(target, "init");
    run.Save(folder, runName);
    var plan = Path.Combine(folder, "runs", runName, "plan.md");
    async Task<JsonElement> Machine(string role, string instructions, bool reportsOnly = false, CancellationToken cancellation = default)
    {
        var executable = line.Machines[role].Harness ?? "pi";
        if (executable.Contains(Path.DirectorySeparatorChar) && !Path.IsPathRooted(executable))
            executable = Path.GetFullPath(executable, Path.Combine(target, ".assembly-lines", ".machines", role));
        var fields = line.Edges.Where(e => e.From == role && e.Field != null)
            .Select(e => $"\"{e.Field}\"").Distinct();
        var context = reportsOnly ? "Use only the branch results below. Do not read or modify files." : $"""
            Write product work only in the current target directory.
            The planner and doer may also update the run plan at the path below.
            Do not modify .assembly-lines/ or the run settings.
            Seed: {seed}
            Plan: {plan}
            Do not stage or commit: the factory handles Git.
            """;
        var prompt = $"""
            {context}
            {instructions}
            {line.Machines[role].Instructions}
            Return boolean result fields: {string.Join(", ", fields)}.
            {(role == "validator" || line.Machines[role].Role == "validator" ? "Include a findings array in the same JSON object: [] on success, or strings describing problems on failure. Use JSON booleans, not quoted strings." : "")}
            Finish with a single line of JSON. Do not wrap it in Markdown.
            """;
        (int Code, string Out, string Error) response;
        var input = prompt;
        try
        {
            var arguments = new List<string> { "--print", "--no-session" };
            if (line.Machines[role].Provider is { } provider) arguments.AddRange(["--provider", provider]);
            if (line.Machines[role].Model is { } model) arguments.AddRange(["--model", model]);
            arguments.Add(input);
            response = await RunProcess(executable, target, null, cancellation, role, arguments.ToArray());
        }
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
        if ((role == "validator" || line.Machines[role].Role == "validator") &&
            (!result.TryGetProperty("findings", out var reported) || reported.ValueKind != JsonValueKind.Array))
            throw new Exception($"Could not read the {role}'s result.");
        return result;
    }

    var findings = "[]";
    async Task<string> Instructions(string machine, bool committed = false) => machine switch
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
        _ when machine == "validator" || line.Machines[machine].Role == "validator" => $"""
            Check only the current task's work below using this lens: {line.Machines[machine].Lens}.
            Report findings only. Change neither the plan nor the product files.
            Return an array "findings" explaining any problems, alongside the routing fields.
            Current task's work (Git diff against HEAD):
            {await WorkDiff(target)}
            """,
        _ => "Read the seed and plan and perform your machine's work."
    };

    var current = line.Next("start", default);
    var attempts = 0;
    var pendingWork = false;
    string? branchReports = null;
    while (current != "finish")
    {
        var isValidator = current == "validator" || line.Machines[current].Role == "validator";
        var committed = current == "planner" && pendingWork;
        if (committed) await Commit(target, "Factory work");
        if (current == "doer" && ++attempts > maxAttempts)
            throw new Exception($"The task hit its limit of {maxAttempts} attempts.");
        var result = await Machine(current, branchReports ?? await Instructions(current, committed), branchReports != null);
        branchReports = null;
        if (current == "planner")
        {
            pendingWork = false;
            attempts = 0;
            findings = "[]";
        }
        if (current == "doer") pendingWork = true;
        if (isValidator)
        {
            findings = result.GetProperty("findings").GetRawText();
        }
        if (line.FanOuts.TryGetValue(current, out var fanOut))
        {
            using var cancellation = new CancellationTokenSource();
            async Task<(string Name, JsonElement Result)> Branch(string name)
            {
                try { return (name, await Machine(name, await Instructions(name), cancellation: cancellation.Token)); }
                catch { cancellation.Cancel(); throw; }
            }
            var branches = fanOut.Branches.Select(Branch).ToArray();
            try { await Task.WhenAll(branches); }
            catch
            {
                // Await all exits after cancellation, then preserve the branch's original failure.
                var failure = branches.FirstOrDefault(t => t.IsFaulted);
                if (failure != null) throw failure.Exception!.InnerException!;
                throw;
            }
            branchReports = "Branch results:\n" + JsonSerializer.Serialize(
                branches.Select(t => t.Result).ToDictionary(r => r.Name, r => r.Result));
            current = fanOut.Join;
        }
        else current = line.Next(current, result);
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
    await Git(target, "add", "--all", "--", ".", ":(exclude).assembly-lines");
    var changes = await Run("git", target, "diff", "--cached", "--quiet", "--", ".", ":(exclude).assembly-lines");
    if (changes.Code == 1) await Git(target, "commit", "--only", "-m", message, "--", ".", ":(exclude).assembly-lines");
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
        var hasHead = (await Run("git", target, "rev-parse", "--verify", "HEAD")).Code == 0;
        await IndexedGit("read-tree", hasHead ? "HEAD" : "--empty");
        await IndexedGit("add", "--all", "--", ".", ":(exclude).assembly-lines");
        var arguments = new List<string> { "diff", "--cached", "--no-ext-diff", "--no-color" };
        if (hasHead) arguments.Add("HEAD");
        arguments.AddRange(["--", ".", ":(exclude).assembly-lines"]);
        return await IndexedGit(arguments.ToArray());
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

static Task<(int Code, string Out, string Error)> RunWithIndex(string command, string cwd, string? index, params string[] arguments)
    => RunProcess(command, cwd, index, default, null, arguments);

static async Task<(int Code, string Out, string Error)> RunProcess(string command, string cwd, string? index,
    CancellationToken cancellation, string? machine, params string[] arguments)
{
    var info = new ProcessStartInfo(command)
    {
        WorkingDirectory = cwd, UseShellExecute = false,
        RedirectStandardOutput = true, RedirectStandardError = true
    };
    cancellation.ThrowIfCancellationRequested();
    if (machine != null) info.Environment["FACTORY_MACHINE"] = machine;
    if (index != null) info.Environment["GIT_INDEX_FILE"] = index;
    foreach (var argument in arguments) info.ArgumentList.Add(argument);
    using var process = Process.Start(info) ?? throw new Exception($"Could not start {command}.");
    var output = process.StandardOutput.ReadToEndAsync();
    var error = process.StandardError.ReadToEndAsync();
    try { await process.WaitForExitAsync(cancellation); }
    catch (OperationCanceledException)
    {
        if (!process.HasExited) process.Kill(entireProcessTree: true);
        await process.WaitForExitAsync();
        await Task.WhenAll(output, error);
        throw;
    }
    return (process.ExitCode, await output, await error);
}
