using System.Text.Json;
using System.Text.RegularExpressions;

namespace Factory;

public record MachineConfig(string? Harness = null, string Lens = "testability");
public record Edge(string From, string To, string? Label)
{
    public string? Field => Label?.StartsWith("not ") == true ? Label[4..] : Label;
    public bool Expected => Label?.StartsWith("not ") != true;
}

public sealed class AssemblyLine
{
    public List<Edge> Edges { get; } = new();
    public Dictionary<string, MachineConfig> Machines { get; } = new();

    public AssemblyLine(string target, string name)
    {
        var folder = Path.Combine(target, ".assembly-lines");
        var graph = File.ReadAllText(Path.Combine(folder, name + ".dot"));
        var body = Regex.Match(graph, @"\Adigraph\s+\w+\s*\{([\s\S]*)\}\s*\z");
        if (!body.Success) throw new Exception("Expected a Graphviz digraph.");
        foreach (var statement in body.Groups[1].Value.Split(['\n', ';'], StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            var edge = Regex.Match(statement, "^([A-Za-z_][A-Za-z_0-9]*)\\s*->\\s*([A-Za-z_][A-Za-z_0-9]*)(?:\\s*\\[\\s*label\\s*=\\s*\"([^\"]+)\"\\s*\\])?$");
            if (!edge.Success) throw new Exception($"Unsupported assembly line statement: {statement}");
            Edges.Add(new(edge.Groups[1].Value, edge.Groups[2].Value,
                edge.Groups[3].Success ? edge.Groups[3].Value : null));
        }
        var nodes = Edges.SelectMany(e => new[] { e.From, e.To }).Distinct().ToArray();
        foreach (var node in nodes.Where(n => n is not ("start" or "finish")))
        {
            var path = Path.Combine(folder, ".machines", node, "config.json");
            if (!File.Exists(path)) throw new Exception($"No machine called \"{node}\".");
            Machines[node] = JsonSerializer.Deserialize<MachineConfig>(File.ReadAllText(path),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        }
        if (Edges.Count(e => e.From == "start") != 1 || Edges.Any(e => e.To == "start" || e.From == "finish")
            || Edges.Any(e => e.To == "finish" && e.From != "planner"))
            throw new Exception("The line must start at start and finish through the planner.");
        var reachable = new HashSet<string> { "finish" };
        while (true)
        {
            var count = reachable.Count;
            foreach (var edge in Edges.Where(e => reachable.Contains(e.To))) reachable.Add(edge.From);
            if (count == reachable.Count) break;
        }
        foreach (var node in nodes.Reverse())
            if (!reachable.Contains(node)) throw new Exception($"Finish cannot be reached from {node}.");
    }

    public string Next(string machine, JsonElement result)
    {
        foreach (var edge in Edges.Where(e => e.From == machine))
        {
            if (edge.Field == null) return edge.To;
            if (!result.TryGetProperty(edge.Field, out var value))
                throw new Exception($"The result of {machine} has no field \"{edge.Field}\".");
            if (value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                throw new Exception($"Could not read the {machine}'s result.");
            if (value.GetBoolean() == edge.Expected) return edge.To;
        }
        throw new Exception($"No matching edge from {machine}.");
    }
}
