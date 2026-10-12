using System.Diagnostics;
using System.Text.Json;

try
{
    if (args is ["--help"] or ["-h"])
    {
        Console.WriteLine("Usage: factory --seed <file> --target <folder> [--all] [--agent <executable>]");
        return 0;
    }
    string? seed = null, target = null;
    var agent = "pi";
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
            default: throw new Exception($"Unknown option: {args[i]}");
        }
    }
    if (seed == null || !File.Exists(seed)) throw new Exception("There is no seed.");
    if (target == null) throw new Exception("A target is required.");
    if (agent.Contains(Path.DirectorySeparatorChar)) agent = Path.GetFullPath(agent);
    Directory.CreateDirectory(target);
    if ((await Run("git", target, "rev-parse", "--show-toplevel")).Code != 0)
        await Git(target, "init");
    var plan = Path.Combine(target, ".factory", "plan.md");
    var prompt = $"""
        Work only in the current target directory.
        Seed: {seed}
        Plan: {plan}
        Read the seed. If there is no plan, write a few tasks to the plan and stop without building.
        Otherwise read the plan, implement only its first unfinished task, and mark that task done.
        Do not stage or commit: the factory handles Git.
        Finish with a single line of JSON containing the boolean field "complete": true only when no tasks remain.
        You may include a "task" field describing the task performed. Do not wrap the JSON in Markdown.
        """;
    do
    {
        (int Code, string Out, string Error) response;
        try { response = await Run(agent, target, "--print", "--no-session", prompt); }
        catch (System.ComponentModel.Win32Exception error)
        {
            throw new Exception("Could not run the agent: " + error.Message);
        }
        if (response.Code != 0) throw new Exception("Could not run the agent: " + response.Error.Trim());
        JsonElement result = default;
        foreach (var line in response.Out.Split('\n'))
        {
            try { result = JsonSerializer.Deserialize<JsonElement>(line); }
            catch (JsonException) { }
        }
        if (result.ValueKind != JsonValueKind.Object || !result.TryGetProperty("complete", out var complete)
            || complete.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new Exception("Could not read the agent's result.");

        await Git(target, "add", "--all", "--", ".");
        var changes = await Run("git", target, "diff", "--cached", "--quiet", "--", ".");
        if (changes.Code == 1)
            await Git(target, "commit", "--only", "-m", "Factory pass", "--", ".");
        else if (changes.Code != 0) throw new Exception(changes.Error);
        Console.WriteLine(result.GetRawText());
        if (complete.GetBoolean()) break;
    } while (all);
    Console.WriteLine("factory stopped");
    return 0;
}
catch (Exception error)
{
    Console.Error.WriteLine(error.Message);
    return 1;
}

static async Task Git(string cwd, params string[] arguments)
{
    var result = await Run("git", cwd, arguments);
    if (result.Code != 0) throw new Exception(result.Error.Trim());
}

static async Task<(int Code, string Out, string Error)> Run(string command, string cwd, params string[] arguments)
{
    var info = new ProcessStartInfo(command)
    {
        WorkingDirectory = cwd, UseShellExecute = false,
        RedirectStandardOutput = true, RedirectStandardError = true
    };
    foreach (var argument in arguments) info.ArgumentList.Add(argument);
    using var process = Process.Start(info) ?? throw new Exception($"Could not start {command}.");
    var output = process.StandardOutput.ReadToEndAsync();
    var error = process.StandardError.ReadToEndAsync();
    await process.WaitForExitAsync();
    return (process.ExitCode, await output, await error);
}
