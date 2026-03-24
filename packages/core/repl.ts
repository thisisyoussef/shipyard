import readline from "node:readline/promises";
import process from "node:process";

interface ShipyardSession {
  targetPath: string;
  startedAt: string;
  instructions: string[];
}

interface RunShipyardReplOptions {
  targetPath: string;
}

function createSession(targetPath: string): ShipyardSession {
  return {
    targetPath,
    startedAt: new Date().toISOString(),
    instructions: [],
  };
}

function printHelp(): void {
  console.log("Available commands:");
  console.log("  help    Show this menu");
  console.log("  status  Show the active target and instruction count");
  console.log("  exit    Close the Shipyard session");
  console.log("  quit    Close the Shipyard session");
  console.log("");
  console.log("Any other input is stored as an instruction so the process stays alive.");
}

function printBootMessage(session: ShipyardSession): void {
  console.log("Shipyard booted.");
  console.log(`Target: ${session.targetPath}`);
  console.log(`Started: ${session.startedAt}`);
  console.log('Type "help" for commands.');
}

function printStatus(session: ShipyardSession): void {
  console.log(`Target: ${session.targetPath}`);
  console.log(`Started: ${session.startedAt}`);
  console.log(`Captured instructions: ${session.instructions.length}`);
}

function storeInstruction(session: ShipyardSession, instruction: string): void {
  session.instructions.push(instruction);
  console.log(
    `Captured instruction #${session.instructions.length}: ${instruction}`,
  );
}

export async function runShipyardRepl(
  options: RunShipyardReplOptions,
): Promise<void> {
  const session = createSession(options.targetPath);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  printBootMessage(session);

  try {
    while (true) {
      const line = (await rl.question("shipyard> ")).trim();

      if (!line) {
        continue;
      }

      if (line === "help") {
        printHelp();
        continue;
      }

      if (line === "status") {
        printStatus(session);
        continue;
      }

      if (line === "exit" || line === "quit") {
        console.log("Shipyard session closed.");
        break;
      }

      storeInstruction(session, line);
    }
  } finally {
    rl.close();
  }
}
