# C# factory

Requires the .NET 8 SDK, Git and Bash on Linux. The launchers use `dotnet`
from `PATH`, falling back to `~/.dotnet/dotnet`.

From the repository root:

```sh
bin/factory --help
bin/factory --check-line
bin/factory --seed tetris/spec.md --target tetris/tetris-003
bin/factory --seed tetris/spec.md --target tetris/tetris-003 --max-attempts 5
```

The factory reads `factory/assembly-line.dot` before doing any work. The
Graphviz graph routes from `start` through named machines to `finish`.
An unlabelled edge always routes; `label="complete"` routes when that JSON
result field is true, and `label="not complete"` when it is false. The graph
uses one edge per line (or semicolon), with optional quoted label attributes.
Unknown machines and nodes without a path to finish are rejected.
`--check-line` checks the graph without calling agents or changing targets.

The default line runs planner → doer → validator, retries rejected work,
and returns accepted work to the planner. To skip validation, replace the
three doer/validator edges with `doer -> planner`. No C# change is needed.
The line runs to completion; the old one-pass mode and `--all` are removed.

The planner creates tasks from the seed. Each task's work is committed before
the planner marks it done, and a separate plan commit records that update.
The factory never reads the plan itself. Relative seed and target paths
resolve from the caller's directory. Commits include only the selected target,
preserving unrelated staged and unstaged edits.

## Machines and validation

`planner.json`, `doer.json` and `validator.json` live alongside the line in
`factory/`. Each may name a `"harness"`; omission or null selects `pi`.
For example, `{"harness":"/path/to/custom-agent"}` chooses another harness.
Relative harness paths containing a slash resolve from the factory folder.
The former `--agent`, `--doer` and `--lens` options are replaced by these files.

The validator's `"lens"` defaults to **testability**. Edit `validator.json`
to choose another, such as `"internationalisation"`.

`--max-attempts <number>` limits doer attempts per task (default 3).
If validation keeps routing back to the doer, the factory exits with status 1
at the limit and leaves the work uncommitted. Harness failures, unreadable
results and missing routing fields also stop the run with an error on stderr.

The validator receives a Git diff of current uncommitted product work,
including new files, excluding the plan. A temporary Git index produces
this diff without changing the real staging area. The validator is instructed
to report only and change neither the plan nor product files. Findings return
to the doer to record as subtasks and fix.

## Harness contract

Pi must be installed and authenticated for real runs. Each invocation uses
`--print --no-session <prompt>`, runs in the target, and names its machine
in the prompt. Paths with spaces are supported; quote them in your shell.
The prompt includes absolute seed and plan paths and requests a final JSON
line with the boolean fields named by outgoing edges. The validator is also
asked for an array `findings`. Machines may print commentary; the factory
reads the last line that parses as JSON. Machines must not stage or commit.

## Checks

From `factory/`:

```sh
./test
```

Reqnroll/NUnit runs the unmodified features in `spec/features/`, excluding
`@real-agent`. Every example gets a temporary Git workspace and a copy of the
compiled factory, line and machine configurations. The external double in
`tests/Doubles/` plays the machines and records their calls. It is never
shipped in the factory.

`./test --real-agent` explicitly selects the real-agent examples. Their
integration bindings are not implemented; real Tetris generation can be
tried manually using the command above, followed by:

```sh
npm --prefix tetris/tetris-003 start
```

Routing and graph checks are in `src/AssemblyLine.cs`; execution and commits
are in `src/Program.cs`; bindings are in `tests/StepDefinitions/FactorySteps.cs`.
