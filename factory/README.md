# C# factory

Requires the .NET 8 SDK, Git and Bash on Linux. The launchers use `dotnet`
from `PATH`, falling back to `~/.dotnet/dotnet`. Pi must be installed and
authenticated for real generation.

From the repository root:

```sh
bin/factory --help
bin/factory --check-line --target tetris/tetris-003 --line careful
bin/factory --run tetris --target tetris/tetris-003 --line careful --seed tetris/spec.md
bin/factory --run tetris --max-attempts 5
```

A new run needs a name, target, line and seed. Later invocations need only
`--run <name>`. The factory saves absolute seed and target paths and the line
name in `factory/runs/<name>/run.json`. Supplying the same settings again is
fine; changing a saved seed, target or line is refused before calling an agent.
Choose a new run name for different settings. Relative paths resolve from the
caller's directory. Run and line names are single folder names.

Each run's plan is `factory/runs/<name>/plan.md`. Run state is ignored by Git;
only product work is committed. Each accepted task is committed before the
planner marks it done. The factory never reads or writes the plan itself.

The existing Tetris 003 plan has moved into the local `tetris` run. Its game
files are unchanged. Run settings and the migrated plan are local state,
so another clone must start its own run or copy that state explicitly.

## Target lines and machines

Each target holds its configurations:

```text
.assembly-lines/
  careful.dot
  quick.dot
  .machines/
    planner/config.json
    doer/config.json
    validator/config.json
```

`careful` validates work and retries rejected attempts. `quick` routes from
the doer straight to the planner. Both refer to the same machine configurations
in that target. Lines contain no target paths, so copying `.assembly-lines/`
to another codebase makes those lines available there.

The Graphviz subset uses one edge per line (or semicolon) with optional
quoted label attributes. An unlabelled edge always routes; `label="complete"`
routes when that result field is true, and `label="not complete"` when false.
Unknown machines and nodes without a path to finish are rejected before work.
`--check-line` validates a selected line without agents or run-state changes.

A machine's `config.json` may name a `"harness"`; omission or null selects `pi`.
For example, `{"harness":"/path/to/custom-agent"}` chooses another harness.
Relative harness paths containing a slash resolve from that machine's folder.
The validator's `"lens"` defaults to **testability**; edit its configuration to
choose another lens, such as `"internationalisation"`.

`--max-attempts <number>` limits doer attempts per task (default 3). It is an
invocation option, not a saved run setting. Exhausted retries, harness failures,
unreadable results and missing routing fields stop with an error. Failed work
remains uncommitted for inspection.

Commits affect only generated work in the selected target, excluding
`.assembly-lines/`. Unrelated staged and unstaged changes are preserved.
Git is initialized only when no repository contains the target. The validator
receives the current work's diff, including new files and excluding line and
machine configurations. A temporary index leaves the real staging area alone.

## Harness contract

Each invocation uses `--print --no-session <prompt>` and runs in the target.
The prompt names the machine, supplies absolute seed and run-plan paths, and
requests JSON fields named by outgoing edges. The validator also returns an
array `findings`, which goes back to the doer to record as subtasks and fix.
Prompts larger than 32 KiB in UTF-8 are passed as `@<temporary-file>` to
avoid operating-system argument limits. Custom harnesses must support Pi's
text-file expansion syntax. The complete prompt is preserved, and the file
is removed after the harness exits, including on failure.
Machines may print commentary; the factory reads the last line that parses
as JSON. Machines must not stage or commit. Product edits stay in the target;
the planner and doer may also update the run's plan outside it.

## Another target

Write `snake/spec.md` describing Snake, then from the repository root:

```sh
mkdir -p snake/snake1
cp -r tetris/tetris-003/.assembly-lines snake/snake1/
bin/factory --run snake --target snake/snake1 --line quick --seed snake/spec.md
bin/factory --run snake
```

The Snake run has its own plan and settings; the Tetris run keeps its own.
To play the existing practice game:

```sh
npm --prefix tetris/tetris-003 start
```

## Checks

From `factory/`, run `./test`. Reqnroll/NUnit runs the unmodified features in
`spec/features/`, excluding `@real-agent`, plus focused regression tests.
Each example gets a temporary factory copy, targets, lines and machines.
The external double in `tests/Doubles/` records machine calls; it is not
shipped in the factory.

`./test --real-agent` selects the real-agent examples, whose integration
bindings remain unimplemented. Try real generation manually with Pi using
the commands above.

Execution and commits are in `src/Program.cs`, graph routing in
`src/AssemblyLine.cs`, and saved run settings in `src/FactoryRun.cs`.

For concurrent review branches and results-only synthesis, see [Iteration 5: fan out](FAN-OUT.md).
