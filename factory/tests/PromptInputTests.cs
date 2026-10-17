using System.Text;
using Factory;

namespace Factory.Tests;

public class PromptInputTests
{
    [Test]
    public void SmallPromptIsPassedInline()
    {
        var prompt = "short prompt";
        var (input, file) = PromptInput.PrepareAsync(prompt).GetAwaiter().GetResult();
        Assert.That(input, Is.EqualTo(prompt));
        Assert.That(file, Is.Null);
    }

    [Test]
    public void PromptAtThresholdIsPassedInline()
    {
        var basePrompt = new string('a', 1000);
        var threshold = Encoding.UTF8.GetByteCount(basePrompt);
        var (input, file) = PromptInput.PrepareAsync(basePrompt, threshold).GetAwaiter().GetResult();
        Assert.That(input, Is.EqualTo(basePrompt));
        Assert.That(file, Is.Null);
    }

    [Test]
    public void PromptJustOverThresholdUsesTempFile()
    {
        var basePrompt = new string('a', 1000);
        var threshold = Encoding.UTF8.GetByteCount(basePrompt) - 1;
        var (input, file) = PromptInput.PrepareAsync(basePrompt, threshold).GetAwaiter().GetResult();
        Assert.That(input, Does.StartWith("@"));
        Assert.That(file, Is.Not.Null.And.Not.Empty);
        Assert.That(File.Exists(file), Is.True);
        if (file != null) File.Delete(file);
    }

    [Test]
    public void LargePromptUsesTempFileAndIsDeletedByCaller()
    {
        var prompt = new string('x', 5000);
        var threshold = 1024;
        var (input, file) = PromptInput.PrepareAsync(prompt, threshold).GetAwaiter().GetResult();
        Assert.That(input, Does.StartWith("@"));
        Assert.That(file, Is.Not.Null);
        Assert.That(File.Exists(file), Is.True);
        if (file != null) File.Delete(file);
        Assert.That(File.Exists(file), Is.False);
    }
}
