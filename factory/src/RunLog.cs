using System.Text.Json;

namespace Factory;

public sealed class RunLog
{
    private const int SummaryLimit = 1500;
    private readonly string file, history;
    private readonly bool echo;
    private readonly object gate = new();
    private int calls;

    public RunLog(string runFolder, bool echo)
    {
        file = Path.Combine(runFolder, "factory.log");
        history = Path.Combine(runFolder, "history");
        this.echo = echo;
        Directory.CreateDirectory(history);
    }

    public string FilePath => file;

    public void Write(string message)
    {
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}";
        lock (gate) File.AppendAllText(file, line + Environment.NewLine);
        if (echo) Console.Error.WriteLine(line);
    }

    public int NextCall() => Interlocked.Increment(ref calls);

    public string SaveResponse(int call, string machine, string output)
    {
        var path = Path.Combine(history, $"{call:D4}-{machine}.response.txt");
        File.WriteAllText(path, output);
        return path;
    }

    public static string Summarise(JsonElement result)
    {
        var parts = new List<string>();
        foreach (var property in result.EnumerateObject())
        {
            var value = property.Value.ValueKind == JsonValueKind.String
                ? property.Value.GetString()!
                : property.Value.GetRawText();
            parts.Add($"{property.Name}={Trim(value)}");
        }
        return string.Join(" ", parts);
    }

    private static string Trim(string value)
    {
        value = value.ReplaceLineEndings(" ");
        return value.Length <= SummaryLimit ? value : value[..SummaryLimit] + "…(truncated)";
    }
}
