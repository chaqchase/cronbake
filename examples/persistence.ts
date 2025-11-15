import Baker from "../lib/index";
import { FilePersistenceProvider } from "../lib/persistence/index";

async function main() {
  const baker = Baker.create({
    autoStart: true,
    persistence: {
      enabled: true,
      strategy: "file",
      provider: new FilePersistenceProvider("./.cronbake-state.json"),
      autoRestore: true,
    },
  });

  await baker.ready();

  baker.add({
    name: "daily-report",
    cron: "@daily",
    persist: true,
    callback: () => {
      console.log(`[${new Date().toISOString()}] Generating daily summary...`);
    },
  });

  baker.add({
    name: "ephemeral-debug",
    cron: "@every_10_seconds",
    persist: false,
    callback: () => {
      console.log("Debug job ran – this will not be restored after restart.");
    },
  });

  const shutdown = async () => {
    console.log("Stopping all jobs and saving state...");
    baker.stopAll();
    await baker.saveState();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Persistence example failed:", error);
  process.exit(1);
});
