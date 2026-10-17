using Factory;
using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;

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
    var settings = FactorySettings.Load(folder);
    var log = new RunLog(Path.Combine(folder, "runs", runName), settings.GetBool("Logging:Console"));
    log.Write($"run {runName}: line {lineName}, target {target}, seed {seed}, max attempts {maxAttempts}");
    var maxTasks = settings.GetInt("Guards:MaxTasks");
    var freezeTasks = settings.GetBool("Guards:FreezeTaskList");
    var noChangeLimit = settings.GetInt("Guards:StopAfterNoChangeTasks");
    var timeoutMinutes = settings.GetInt("Guards:MachineTimeoutMinutes");
    (int Done, int Total) PlanProgress()
    {
        if (!File.Exists(plan)) return (0, 0);
        var items = File.ReadLines(plan).Select(l => Regex.Match(l, @"^- \[( |x|X)\]")).Where(m => m.Success).ToArray();
        return (items.Count(m => m.Groups[1].Value != " "), items.Length);
    }
    bool IsValidator(string name) => name == "validator" || line.Machines[name].Role is "validator" or "plan-validator";
    async Task<JsonElement> Machine(string role, string instructions, bool reportsOnly = false, CancellationToken cancellation = default)
    {
        if (line.Machines[role].Setting is { } setting)
        {
            var enabled = settings.GetBool(setting) ? "true" : "false";
            log.Write($"switch {role}: {setting} is {enabled}");
            return JsonSerializer.Deserialize<JsonElement>($"{{\"{line.Machines[role].Field}\":{enabled}}}");
        }
        var taskOnly = line.Machines[role].Role == "plan-validator";
        var executable = line.Machines[role].Harness ?? "pi";
        if (executable.Contains(Path.DirectorySeparatorChar) && !Path.IsPathRooted(executable))
            executable = Path.GetFullPath(executable, Path.Combine(target, ".assembly-lines", ".machines", role));
        var fields = line.Edges.Where(e => e.From == role && e.Field != null)
            .Select(e => $"\"{e.Field}\"").Distinct();
        var context = taskOnly ? "Use only the task below. Do not read or modify files."
            : reportsOnly ? "Use only the branch results below. Do not read or modify files." : $"""
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
            {(IsValidator(role) ? "Include a findings array in the same JSON object: [] on success, or strings describing problems on failure. Use JSON booleans, not quoted strings." : "")}
            Finish with a single line of JSON. Do not wrap it in Markdown.
            """;
        (int Code, string Out, string Error) response;
        var (input, promptFile) = await PromptInput.PrepareAsync(prompt);
        var call = log.NextCall();
        var timer = Stopwatch.StartNew();
        log.Write($"#{call} {role} started ({line.Machines[role].Provider ?? "default provider"}/{line.Machines[role].Model ?? "default model"}, prompt {System.Text.Encoding.UTF8.GetByteCount(prompt)} bytes)");
        try
        {
            var arguments = new List<string> { "--print", "--no-session" };
            if (line.Machines[role].Provider is { } provider) arguments.AddRange(["--provider", provider]);
            if (line.Machines[role].Model is { } model) arguments.AddRange(["--model", model]);
            arguments.Add(input);
            using var timeout = new CancellationTokenSource();
            if (timeoutMinutes > 0) timeout.CancelAfter(TimeSpan.FromMinutes(timeoutMinutes));
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, timeout.Token);
            try { response = await RunProcess(executable, target, null, linked.Token, role, arguments.ToArray()); }
            catch (OperationCanceledException) when (timeout.IsCancellationRequested && !cancellation.IsCancellationRequested)
            {
                log.Write($"#{call} {role} stopped: no finish after {timeoutMinutes} minutes");
                throw new Exception($"The {role} did not finish within {timeoutMinutes} minutes and was stopped.");
            }
        }
        catch (System.ComponentModel.Win32Exception error)
        {
            log.Write($"#{call} {role} could not start after {timer.Elapsed.TotalSeconds:F1}s: {error.Message}");
            throw new Exception($"Could not run the {role}: " + error.Message);
        }
        catch (OperationCanceledException)
        {
            log.Write($"#{call} {role} cancelled after {timer.Elapsed.TotalSeconds:F1}s because another branch failed");
            throw;
        }
        finally
        {
            if (promptFile != null) File.Delete(promptFile);
        }
        var savedResponse = log.SaveResponse(call, role, response.Out);
        log.Write($"#{call} {role} exited {response.Code} after {timer.Elapsed.TotalSeconds:F1}s ({response.Out.Length} chars out; full response {savedResponse})");
        if (response.Code != 0)
        {
            log.Write($"#{call} {role} stderr: {response.Error.Trim().ReplaceLineEndings(" ")}");
            throw new Exception($"Could not run the {role}: " + response.Error.Trim());
        }
        var responsePath = Path.Combine(folder, "runs", runName, $"{role}.response.txt");
        await File.WriteAllTextAsync(responsePath, response.Out);
        try
        {
            var result = MachineResult.Parse(response.Out, role);
            log.Write($"#{call} {role} result: {RunLog.Summarise(result)}");
            if (line.Machines[role].Role == "extractor" &&
                (!result.TryGetProperty("task", out var extracted) || extracted.ValueKind != JsonValueKind.String
                    || string.IsNullOrWhiteSpace(extracted.GetString())))
                throw new Exception($"Could not read the {role}'s result. The task field must be a non-empty string.");
            if (IsValidator(role) &&
                (!result.TryGetProperty("findings", out var reported) || reported.ValueKind != JsonValueKind.Array))
                throw new Exception($"Could not read the {role}'s result. The findings field must be a JSON array (use [] when there are no findings).");
            return result;
        }
        catch (Exception error)
        {
            log.Write($"#{call} {role} result rejected: {error.Message}");
            throw new Exception($"{error.Message} Raw response: {responsePath}", error);
        }
    }

    var findings = "[]";
    string? currentTask = null;
    var planRejected = false;
    var scopeRejected = false;
    var scopeRevisions = 0;
    string? taskPlanSnapshot = null;
    string attemptBaseline = "";
    async Task<string> Instructions(string machine, bool committed = false) => machine switch
    {
        "planner" => $"""
            Read the seed and maintain the plan. If it is missing, create tasks from the seed only.
            {(!File.Exists(plan) && maxTasks > 0 ? $"Create at most {maxTasks} top-level tasks, each a line starting \"- [ ] \" with no indentation. Group related work instead of listing every step." : "")}
            {(freezeTasks && File.Exists(plan) ? "The task list is frozen. Do not add, remove or reorder top-level tasks. Only mark finished tasks done. Record anything new as a subtask of the current task." : "")}
            {(committed ? "The current task's validated work has been committed. Mark that task and its resolved subtasks done." : "Inspect the plan without marking unfinished tasks done. Do not perform product work.")}
            {(planRejected ? $"The next task failed its plan check. Revise that task in the plan to resolve these findings: {findings}" : "")}
            {(scopeRejected ? $"Implementation review found a scope conflict. Resolve these findings by clarifying the current task or assigning deferred work to its existing later task: {findings}. Do not mark the current task done: its work is unvalidated and uncommitted. Preserve its acceptance criteria and real regression fixes." : "")}
            Return "complete": true only when no tasks remain.
            """,
        _ when line.Machines[machine].Role == "extractor" => """
            Read the plan and extract only the first unfinished task, with its unresolved subtasks, exactly as written.
            Do not include finished tasks, later tasks or any other part of the plan. Do not modify files.
            Return the extracted text as the JSON string field "task".
            """,
        _ when line.Machines[machine].Role == "plan-validator" => $"""
            Check only the task below. Report whether it is clear, appropriately scoped, testable and ready to implement.
            Return an array "findings" explaining any problems, alongside the routing fields.
            Task:
            {currentTask}
            """,
        "doer" when currentTask != null => $"""
            Implement only the task below. It has been extracted from the plan; do not read the rest of the plan.
            Do not mark the task done; the planner does that after the work is committed.
            Validator findings: {findings}
            Record each finding as a subtask of the current task, not as a new top-level task,
            and fix it before asking for validation again.
            Do not implement suggestions or deferred work. If a required fix contradicts the task scope,
            return scopeConflict: true with a findings array explaining the conflict instead of expanding scope.
            Return a JSON result describing the work performed.
            Task:
            {currentTask}
            """,
        "doer" => $"""
            Read the seed and the plan. Implement only the first unfinished task.
            Use this plan snapshot as the task boundary shared with validators:
            {taskPlanSnapshot}
            Do not mark the task done; the planner does that after the work is committed.
            Validator findings: {findings}
            Record each finding as a subtask of the current task, not as a new top-level task,
            and fix it before asking for validation again.
            Do not implement suggestions or deferred work. If a required fix contradicts the task scope,
            return scopeConflict: true with a findings array explaining the conflict instead of expanding scope.
            Return a JSON result describing the work performed.
            """,
        _ when IsValidator(machine) => $"""
            Check only the current task's work below using this lens: {line.Machines[machine].Lens}.
            Report findings only. Change neither the plan nor the product files.
            Return an array "findings" explaining any problems, alongside the routing fields.
            Block only for unmet current-task acceptance criteria or regressions introduced by this work.
            Do not block for unrelated pre-existing problems or work explicitly deferred to later tasks.
            The baseline can include earlier attempts of this task; their unresolved defects still block.
            Return only blocking defects in findings; optional improvements belong in a separate suggestions array.
            If a necessary fix conflicts with the task's explicit scope, return scopeConflict: true,
            satisfied: false and explain the conflict in findings. Otherwise return scopeConflict: false.
            Task context shared with the doer (the extracted task, or the plan snapshot whose first unfinished task is current):
            {currentTask ?? taskPlanSnapshot}
            Target diff before the latest doer attempt (baseline, not all attributable to this attempt):
            {attemptBaseline}
            Full target diff now (compare with the baseline to identify this attempt's changes; retain for regression review):
            {await WorkDiff(target)}
            """,
        _ => "Read the seed and plan and perform your machine's work."
    };

    var current = line.Next("start", default);
    var attempts = 0;
    var pendingWork = false;
    var planChecks = 0;
    var noChangeTasks = 0;
    int? initialTasks = null;
    string? branchReports = null;
    while (current != "finish")
    {
        var isValidator = IsValidator(current);
        var isExtractor = line.Machines.TryGetValue(current, out var machineConfig) && machineConfig.Role == "extractor";
        var committed = current == "planner" && pendingWork;
        if (committed)
        {
            if (await Commit(target, "Factory work"))
            {
                noChangeTasks = 0;
                log.Write("committed the validated work");
            }
            else
            {
                noChangeTasks++;
                log.Write($"the validated work changed no files ({noChangeTasks} task{(noChangeTasks == 1 ? "" : "s")} in a row)");
                if (noChangeLimit > 0 && noChangeTasks >= noChangeLimit)
                {
                    log.Write("stopping: tasks keep finishing without changing any files");
                    throw new Exception($"{noChangeTasks} tasks in a row finished without changing any files. The factory stopped; check the run log: {log.FilePath}");
                }
            }
        }
        if (current == "doer" && ++attempts > maxAttempts)
        {
            log.Write($"stopping: the task hit its limit of {maxAttempts} attempts");
            throw new Exception($"The task hit its limit of {maxAttempts} attempts.");
        }
        if (isExtractor && ++planChecks > maxAttempts)
        {
            log.Write($"stopping: the task hit its limit of {maxAttempts} plan checks");
            throw new Exception($"The task hit its limit of {maxAttempts} plan checks.");
        }
        if (current == "doer")
        {
            taskPlanSnapshot ??= File.Exists(plan) ? await File.ReadAllTextAsync(plan) : "Read the first unfinished task from the plan.";
            attemptBaseline = await WorkDiff(target);
        }
        if (current == "doer") log.Write($"doer attempt {attempts} of {maxAttempts}");
        if (isExtractor) log.Write($"plan check {planChecks} of {maxAttempts}");
        var result = await Machine(current, branchReports ?? await Instructions(current, committed), branchReports != null);
        branchReports = null;
        if (current == "planner" && scopeRejected &&
            result.TryGetProperty("complete", out var prematurelyComplete) && prematurelyComplete.ValueKind == JsonValueKind.True)
            throw new Exception("Planner cannot finish while a scope conflict leaves work unvalidated.");
        if (current == "planner")
        {
            pendingWork = false;
            if (committed || scopeRevisions == 0) attempts = 0;
            if (committed) scopeRevisions = 0;
            scopeRejected = false;
            taskPlanSnapshot = null;
            findings = "[]";
            planRejected = false;
            currentTask = null;
            var (done, total) = PlanProgress();
            log.Write($"plan: {done} of {total} tasks done");
            if (total > 0 && initialTasks == null) initialTasks = total;
            if (maxTasks > 0 && total > maxTasks)
            {
                log.Write($"stopping: the plan has {total} tasks, over the limit of {maxTasks}");
                throw new Exception($"The plan has {total} tasks, over the limit of {maxTasks}. The factory stopped; check the plan: {plan}");
            }
            if (freezeTasks && initialTasks != null && total > initialTasks)
            {
                log.Write($"stopping: the plan grew from {initialTasks} to {total} tasks");
                throw new Exception($"The plan grew from {initialTasks} to {total} tasks while its task list was frozen. The factory stopped; check the plan: {plan}");
            }
        }
        if (isExtractor) currentTask = result.GetProperty("task").GetString();
        if (current == "doer")
        {
            pendingWork = true;
            planChecks = 0;
        }
        if (isValidator)
        {
            findings = result.GetProperty("findings").GetRawText();
        }
        if ((current == "doer" || isValidator) &&
            result.TryGetProperty("scopeConflict", out var conflict) && conflict.ValueKind == JsonValueKind.True)
        {
            if (!result.TryGetProperty("findings", out var conflictFindings) ||
                conflictFindings.ValueKind != JsonValueKind.Array || conflictFindings.GetArrayLength() == 0)
                throw new Exception("A scope conflict requires non-empty findings.");
            if (++scopeRevisions > maxAttempts)
                throw new Exception($"The task hit its limit of {maxAttempts} scope revisions.");
            if (!line.Machines.ContainsKey("planner"))
                throw new Exception("A scope conflict requires a planner to revise the task.");
            findings = conflictFindings.GetRawText();
            pendingWork = false; // Never commit rejected work on the way back to the planner.
            scopeRejected = true;
            log.Write($"route {current} -> planner (scope conflict; work remains uncommitted)");
            current = "planner";
            continue;
        }
        if (line.FanOuts.TryGetValue(current, out var fanOut))
        {
            using var cancellation = new CancellationTokenSource();
            async Task<(string Name, JsonElement Result)> Branch(string name)
            {
                try { return (name, await Machine(name, await Instructions(name), cancellation: cancellation.Token)); }
                catch { cancellation.Cancel(); throw; }
            }
            log.Write($"fan out from {current} to {string.Join(", ", fanOut.Branches)}, joining at {fanOut.Join}");
            var branches = fanOut.Branches.Select(Branch).ToArray();
            try { await Task.WhenAll(branches); }
            catch
            {
                // Await all exits after cancellation, then preserve the branch's original failure.
                var failure = branches.FirstOrDefault(t => t.IsFaulted);
                if (failure != null) throw failure.Exception!.InnerException!;
                throw;
            }
            branchReports = "Preserve any scopeConflict reported by a branch: return scopeConflict: true, satisfied: false and its findings so the planner can resolve it. Suggestions alone must not block.\nBranch results:\n" + JsonSerializer.Serialize(
                branches.Select(t => t.Result).ToDictionary(r => r.Name, r => r.Result));
            current = fanOut.Join;
        }
        else
        {
            var previous = current;
            current = line.Next(current, result);
            log.Write($"route {previous} -> {current}");
            planRejected = isValidator && current == "planner" &&
                result.TryGetProperty("satisfied", out var satisfied) && satisfied.ValueKind == JsonValueKind.False;
        }
    }
    log.Write("factory stopped");
    Console.WriteLine("factory stopped");
    return 0;
}
catch (Exception error)
{
    Console.Error.WriteLine(error.Message);
    return 1;
}

static async Task<bool> Commit(string target, string message)
{
    await Git(target, "add", "--all", "--", ".", ":(exclude).assembly-lines");
    var changes = await Run("git", target, "diff", "--cached", "--quiet", "--", ".", ":(exclude).assembly-lines");
    if (changes.Code == 1) await Git(target, "commit", "--only", "-m", message, "--", ".", ":(exclude).assembly-lines");
    else if (changes.Code != 0) throw new Exception(changes.Error);
    return changes.Code == 1;
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
