using System.Text.Json;

namespace Factory;

public record FactoryRun(string Seed, string Target, string Line)
{
    public static FactoryRun Open(string folder, string name, string? seed, string? target, string? line)
    {
        CheckName(name);
        var file = Path.Combine(folder, "runs", name, "run.json");
        if (File.Exists(file))
        {
            var saved = JsonSerializer.Deserialize<FactoryRun>(File.ReadAllText(file))!;
            foreach (var (field, supplied, original) in new[] {
                ("target", target, saved.Target), ("seed", seed, saved.Seed), ("line", line, saved.Line) })
                if (supplied != null && supplied != original)
                    throw new Exception($"Run \"{name}\" already has a {field}.");
            return saved;
        }
        if (target == null) throw new Exception("A target is required.");
        if (seed == null) throw new Exception("There is no seed.");
        if (line == null) throw new Exception("An assembly line is required.");
        CheckName(line);
        return new(seed, target, line);
    }

    public void Save(string folder, string name)
    {
        var directory = Path.Combine(folder, "runs", name);
        Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, "run.json"), JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
    }

    public static void CheckName(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name is "." or ".." || name.IndexOfAny(['/', '\\']) >= 0)
            throw new Exception("Run and line names must be single folder names.");
    }
}
