using System.Text;
using System.Text.Json;

namespace Factory;

public static class MachineResult
{
    public static JsonElement Parse(string output, string machine)
    {
        JsonElement result = default;
        var lineOffset = 0;
        var lastJsonOffset = -1;
        foreach (var line in output.Split('\n'))
        {
            try
            {
                result = JsonSerializer.Deserialize<JsonElement>(line);
                lastJsonOffset = lineOffset;
            }
            catch (JsonException) { }
            lineOffset += line.Length + 1;
        }

        // Preserve the last-JSON-line contract; tolerate pretty-printed objects
        // when their contents were mistaken for standalone JSON lines.
        if (result.ValueKind != JsonValueKind.Object)
        {
            var offset = 0;
            var consumedUntil = 0;
            foreach (var line in output.Split('\n'))
            {
                if (offset >= consumedUntil && line.TrimStart().StartsWith('{'))
                {
                    try
                    {
                        var candidate = output[offset..];
                        var trimmed = candidate.TrimStart();
                        var bytes = Encoding.UTF8.GetBytes(trimmed);
                        var reader = new Utf8JsonReader(bytes);
                        using var document = JsonDocument.ParseValue(ref reader);
                        consumedUntil = offset + candidate.Length - trimmed.Length
                            + Encoding.UTF8.GetCharCount(bytes.AsSpan(0, (int)reader.BytesConsumed));
                        if (consumedUntil > lastJsonOffset)
                            result = document.RootElement.Clone();
                    }
                    catch (JsonException) { }
                }
                offset += line.Length + 1;
            }
        }
        if (result.ValueKind != JsonValueKind.Object)
            throw new Exception($"Could not read the {machine}'s result. Expected a JSON object with boolean routing fields.");
        return result;
    }
}
