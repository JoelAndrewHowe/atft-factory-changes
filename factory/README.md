# C# factory

Requires the .NET 8 SDK, Git and Bash on Linux. The launchers use `dotnet`
from `PATH`, falling back to `~/.dotnet/dotnet`.

From the repository root:

```sh
bin/factory --help
bin/factory --seed tetris/spec.md --target tetris/tetris-001
bin/factory --seed tetris/spec.md --target tetris/tetris-001 --all
```

One pass asks the agent to create a plan or implement its next task. `--all`
repeats until the agent reports `"complete": true`. The factory reads the last
JSON line in the agent's output and commits the target's changes, including
its `.factory/plan.md`. It never reads the plan itself. Relative paths are
resolved from the caller's working directory.

Pi is the default agent and must be installed and authenticated for real
runs. `--agent <executable>` selects another executable or wrapper with the
same command-line contract: `--print --no-session <prompt>`, output on stdout,
and a final JSON result with a boolean `complete` field. Paths with spaces
are supported; quote them in your shell. Failures exit with status 1 and an
error on stderr. The factory leaves agent edits uncommitted if the agent
fails or its result cannot be read.

## Checks

From `factory/`:

```sh
./test
```

Reqnroll/NUnit runs the unmodified features in `spec/features/`, excluding
`@real-agent`. Missing step definitions fail the run. Every example gets a
temporary Git workspace and a copy of the compiled factory. The external
C# agent double in `tests/Doubles/` records calls and implements only the
behaviors requested by the examples. It is never shipped in the factory.

`./test --real-agent` explicitly selects the three real-agent examples.
Their integration bindings are not implemented by the default homework
suite; real Tetris generation is the optional follow-up in the homework.

The factory is in `src/Program.cs`; bindings are in
`tests/StepDefinitions/FactorySteps.cs`. Generated binaries and Reqnroll
code stay in ignored build directories.
