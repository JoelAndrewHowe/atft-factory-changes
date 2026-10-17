using System.Text;

namespace Factory;

public static class PromptInput
{
    public const int DefaultThreshold = 32 * 1024;

    public static async Task<(string input, string? promptFile)> PrepareAsync(string prompt, int threshold = DefaultThreshold)
    {
        var input = prompt;
        string? promptFile = null;
        if (Encoding.UTF8.GetByteCount(prompt) > threshold)
        {
            promptFile = Path.Combine(Path.GetTempPath(), "factory-prompt-" + Guid.NewGuid() + ".txt");
            await File.WriteAllTextAsync(promptFile, prompt);
            input = "@" + promptFile;
        }
        return (input, promptFile);
    }
}
