using System.Text.Json;
using System.Text.RegularExpressions;

namespace Factory;

public record MachineConfig(string? Harness = null, string Lens = "testability", string? Instructions = null, string? Role = null, string? Provider = null, string? Model = null, string? Setting = null, string? Field = null);
public record Edge(string From, string To, string? Label)
{
    public string? Field => Label?.StartsWith("not ") == true ? Label[4..] : Label;
    public bool Expected => Label?.StartsWith("not ") != true;
}

public sealed class AssemblyLine
{
    public List<Edge> Edges { get; } = new();
    public Dictionary<string, MachineConfig> Machines { get; } = new();
    public Dictionary<string, (string[] Branches, string Join)> FanOuts { get; } = new();

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
        foreach (var (switchName, machine) in Machines.Where(m => m.Value.Setting != null))
            if (string.IsNullOrWhiteSpace(machine.Field) || Edges.Any(e => e.From == switchName && e.Field != machine.Field))
                throw new Exception($"The setting switch \"{switchName}\" must name a field, and route only on it.");
        if (Edges.Count(e => e.From == "start") != 1 || Edges.Any(e => e.To == "start" || e.From == "finish")
            || Edges.Any(e => e.To == "finish" && e.From != "planner"))
            throw new Exception("The line must start at start and finish through the planner.");
        foreach (var group in Edges.GroupBy(e => e.From).Where(g => g.Count() > 1 && g.All(e => e.Label == null)))
        {
            var branches = group.Select(e => e.To).ToArray();
            var exits = branches.Select(branch => Edges.Where(e => e.From == branch).ToArray()).ToArray();
            if (branches.Distinct().Count() != branches.Length
                || exits.Any(edges => edges.Length != 1 || edges[0].Label != null)
                || exits.Select(edges => edges[0].To).Distinct().Count() != 1
                || !Machines.ContainsKey(exits[0][0].To))
                throw new Exception($"The branches from {group.Key} do not meet.");
            FanOuts[group.Key] = (branches, exits[0][0].To);
        }
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
