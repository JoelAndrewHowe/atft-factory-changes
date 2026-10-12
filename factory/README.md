# C# factory

Requires the .NET 8 SDK, Git and Bash on Linux. The launchers use `dotnet`
from `PATH`, falling back to `~/.dotnet/dotnet`.

From the repository root:

```sh
bin/factory --help
bin/factory --seed tetris/spec.md --target tetris/tetris-002
bin/factory --seed tetris/spec.md --target tetris/tetris-002 --all
```

A first pass creates and commits a plan without doing product work. With an
existing plan, the planner checks completion, the doer implements one task,
and the validator checks the current work. Rejected findings go back to the
doer to record as subtasks and fix. Accepted work is committed before the
planner marks the task done; a separate plan commit records that update.
`--all` continues until the planner reports completion. The factory never
reads the plan itself. Relative paths resolve from the caller's directory.
Commits include only the selected target, preserving unrelated staged and
unstaged edits.

## Validation

The chosen default lens is **testability**: the validator looks for work
that can be tested and reports obstacles to testing. `--lens <focus>` changes
that choice, for example `--lens internationalisation`.

`--max-attempts <number>` limits doer/validator attempts per task (default 3).
If validation still fails, the factory exits with status 1 and leaves the
work uncommitted. Harness failures and unreadable planner or validator
results also stop the run with an error on stderr.

The validator receives a Git diff of the current uncommitted product work,
including new files, excluding the plan. A temporary Git index produces
this diff without changing the real staging area. The validator is instructed
to report only and change neither the plan nor product files.

## Harness contract

Pi is the default harness and must be installed and authenticated for real
runs. `--agent <executable>` selects the harness for all three machines;
`--doer <executable>` optionally overrides only the doer. Paths with spaces
are supported; quote them in your shell.

Each invocation uses `--print --no-session <prompt>`, runs in the target,
and names its role in the prompt as `Machine: planner`, `doer`, or `validator`.
The prompt includes absolute seed and plan paths and requests a final JSON
line. The planner returns a boolean `complete`; the validator returns a
boolean `satisfied` and an array `findings`. The doer returns a description
of its work; the factory does not use that result for routing. Machines may
print commentary; the factory reads the last line that parses as JSON.
The factory handles Git commits, and machines must not stage or commit.

## Checks

From `factory/`:

```sh
./test
```

Reqnroll/NUnit runs the unmodified features in `spec/features/`, excluding
`@real-agent`. Missing step definitions fail the run. Every example gets a
temporary Git workspace and a copy of the compiled factory. The external
C# double in `tests/Doubles/` plays all three machines and records their
calls. It is never shipped in the factory.

`./test --real-agent` explicitly selects the real-agent examples.
Their integration bindings are not implemented by the default homework
suite; real Tetris generation is the optional follow-up in the homework.

The factory is in `src/Program.cs`; bindings are in
`tests/StepDefinitions/FactorySteps.cs`. Generated binaries and Reqnroll
code stay in ignored build directories.
