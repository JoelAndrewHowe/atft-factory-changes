using System.Text.Json;

namespace Factory;

public sealed class FactorySettings
{
    private readonly JsonElement root;

    private FactorySettings(JsonElement root) => this.root = root;

    public static FactorySettings Load(string folder)
    {
        var path = Path.Combine(folder, "appsettings.json");
        if (!File.Exists(path)) return new(default);
        try { return new(JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(path))); }
        catch (JsonException error) { throw new Exception($"Could not read appsettings.json: {error.Message}"); }
    }

    public bool GetBool(string key, bool fallback = false)
    {
        if (!TryFind(key, out var node)) return fallback;
        return node.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => throw new Exception($"The setting {key} in appsettings.json must be true or false.")
        };
    }

    public int GetInt(string key, int fallback = 0)
    {
        if (!TryFind(key, out var node)) return fallback;
        if (node.ValueKind != JsonValueKind.Number || !node.TryGetInt32(out var value) || value < 0)
            throw new Exception($"The setting {key} in appsettings.json must be a whole number, 0 or more.");
        return value;
    }

    private bool TryFind(string key, out JsonElement node)
    {
        node = root;
        foreach (var part in key.Split(':'))
        {
            if (node.ValueKind != JsonValueKind.Object || !node.TryGetProperty(part, out var child)) return false;
            node = child;
        }
        return true;
    }
}
