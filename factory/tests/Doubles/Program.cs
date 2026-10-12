using System.Text.Json;

var workspace = Environment.GetEnvironmentVariable("DOUBLE_WORKSPACE")!;
var calls = Path.Combine(workspace, "calls");
Directory.CreateDirectory(calls);
File.WriteAllText(Path.Combine(calls, $"{Directory.GetFiles(calls).Length:D4}.json"),
    JsonSerializer.Serialize(new { agent = args[0], cwd = Directory.GetCurrentDirectory(), args = args.Skip(1) }));
if (Environment.GetEnvironmentVariable("DOUBLE_PROSE_RESULT") == "1")
{
    Console.WriteLine("I did some work but have no structured result.");
    return;
}
var preamble = Environment.GetEnvironmentVariable("DOUBLE_PREAMBLE");
if (preamble != null)
{
    Console.WriteLine("{\"complete\":false}"); // Earlier JSON must not override the final result.
    Console.WriteLine(preamble);
}

// Test behavior lives here, never in the factory. The double answers even if
// the prompt forgot to ask for a result; separate assertions check the prompt.
var plan = Path.Combine(Directory.GetCurrentDirectory(), ".factory", "plan.md");
var prose = Environment.GetEnvironmentVariable("DOUBLE_PROSE_PLAN") == "1";
string Format(Dictionary<string, bool> tasks) => prose
    ? string.Join("\n", tasks.Select(t => $"Task {t.Key} is {(t.Value ? "finished" : "waiting")}."))
    : JsonSerializer.Serialize(tasks);
Directory.CreateDirectory(Path.GetDirectoryName(plan)!);
if (!File.Exists(plan))
{
    File.WriteAllText(plan, Format(new() { ["alpha"] = false, ["beta"] = false }));
    Console.WriteLine("{\"complete\":false}");
    return;
}
var tasks = prose
    ? File.ReadAllLines(plan).Select(line => line.Split(' ')).ToDictionary(words => words[1], words => words[3] == "finished.")
    : JsonSerializer.Deserialize<Dictionary<string, bool>>(File.ReadAllText(plan))!;
var task = tasks.FirstOrDefault(t => !t.Value).Key;
if (task == null)
{
    // Deliberately update the final plan on a separate pass from the last work.
    File.WriteAllText(plan, Format(tasks) + "\n");
    Console.WriteLine("{\"complete\":true}");
    return;
}
var product = Environment.GetEnvironmentVariable("DOUBLE_PRODUCT") ?? task + ".txt";
File.WriteAllText(Path.Combine(Directory.GetCurrentDirectory(), product), $"Work for {task}\n");
tasks[task] = true;
File.WriteAllText(plan, Format(tasks));
Console.WriteLine(JsonSerializer.Serialize(new { complete = false, task }));
