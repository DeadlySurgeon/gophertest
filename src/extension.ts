// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { exec, spawn } from "child_process";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "go" },
      new SubtestLensProvider()
    )
  );

  vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.languageId === "go") {
      vscode.commands.executeCommand("editor.action.codeLens.refresh");
    }
  });

  bindCommand(context, "gopher-test.install-tooling", installTooling);
}

// This method is called when your extension is deactivated
export function deactivate() {}

function bindCommand(
  context: vscode.ExtensionContext,
  name: string,
  command: (context: vscode.ExtensionContext) => void
) {
  const disposable = vscode.commands.registerCommand(name, () => {
    command(context);
  });
  context.subscriptions.push(disposable);
}

function installTooling() {
  const output = vscode.window.createOutputChannel("Gopher Test");
  output.appendLine("go install github.com/deadlysurgeon/testfinder@latest");
  output.show(true);

  const child = spawn("go", [
    "install",
    "github.com/deadlysurgeon/testfinder@latest",
  ]);

  child.stdout.on("data", (data) => {
    output.append(data.toString());
  });

  child.stderr.on("data", (data) => {
    output.append(data.toString());
  });

  child.on("close", (code) => {
    if (code === 0) {
      output.appendLine(`testfinder installed`);
    } else {
      output.appendLine(`Process exited with code ${code}`);
    }
  });
}

interface TestMeta {
  testFunc: string;
  subTest: string;
  line: number;
}

export class SubtestLensProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(
    document: vscode.TextDocument
  ): Promise<vscode.CodeLens[]> {
    const lenses: vscode.CodeLens[] = [];

    const output = await this.runTestFinder(document.fileName);
    if (!output) {
      return lenses;
    }
    if (!document.fileName || !document.fileName.endsWith("_test.go")) {
      return lenses;
    }

    for (const entry of output) {
      const pos = new vscode.Position(entry.line - 1, 0);
      const range = new vscode.Range(pos, pos);

      lenses.push(
        new vscode.CodeLens(range, {
          title: "run test",
          command: "go.subtest.cursor",
          arguments: [
            {
              functionName: entry.testFunc,
              subTestName: entry.subTest,
            },
          ],
        })
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: "debug tests",
          command: "go.debug.subtest.cursor",
          arguments: [
            {
              functionName: entry.testFunc,
              subTestName: entry.subTest,
            },
          ],
        })
      );
    }

    return lenses;
  }

  async runTestFinder(filePath: string): Promise<TestMeta[] | null> {
    return new Promise((resolve) => {
      exec(
        `testfinder -ignorelit -fulltests=false "${filePath}"`,
        (err, stdout, stderr) => {
          if (err) {
            console.error("Failed to run test finder:", stderr);
            resolve(null);
          } else {
            try {
              const parsed = JSON.parse(stdout);
              resolve(parsed);
            } catch (e) {
              console.error("Invalid JSON:", stdout);
              resolve(null);
            }
          }
        }
      );
    });
  }
}
