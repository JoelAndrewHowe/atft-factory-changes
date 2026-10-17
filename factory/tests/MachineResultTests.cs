using Factory;

namespace Factory.Tests;

public class MachineResultTests
{
    [TestCase("{\"satisfied\":true,\"findings\":[]}")]
    [TestCase("Review complete.\n{\n  \"satisfied\": true,\n  \"findings\": []\n}")]
    [TestCase("Review complete.\n```json\n{\n  \"satisfied\": true,\n  \"findings\": []\n}\n```")]
    public void AcceptsCompactAndMultilineResults(string output)
    {
        var result = MachineResult.Parse(output, "validator");
        Assert.That(result.GetProperty("satisfied").GetBoolean(), Is.True);
        Assert.That(result.GetProperty("findings").GetArrayLength(), Is.Zero);
    }

    [Test]
    public void AcceptsMultilineFindings()
    {
        var result = MachineResult.Parse("{\n\"satisfied\": false,\n\"findings\": [\n\"Improve controls\"\n]\n}", "validator");
        Assert.That(result.GetProperty("findings")[0].GetString(), Is.EqualTo("Improve controls"));
    }

    [Test]
    public void UsesLastJsonLine()
    {
        var result = MachineResult.Parse("{\"satisfied\":false}\nCommentary\n{\"satisfied\":true}", "validator");
        Assert.That(result.GetProperty("satisfied").GetBoolean(), Is.True);
    }

    [TestCase("Looks good")]
    [TestCase("{\"satisfied\": true,")]
    [TestCase("{\"satisfied\":true}\n[]")]
    public void RejectsInvalidOrNonObjectResults(string output)
    {
        var error = Assert.Throws<Exception>(() => MachineResult.Parse(output, "ux_validator"));
        Assert.That(error!.Message, Does.Contain("ux_validator").And.Contain("Expected a JSON object"));
    }
}
