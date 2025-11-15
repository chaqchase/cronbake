import Baker from "../lib/index";

async function main() {
  const baker = Baker.create({
    autoStart: true,
  });

  baker.add({
    name: "log-every-minute",
    cron: "@every_minute",
    callback: () => {
      console.log(`[${new Date().toISOString()}] Hello from Cronbake!`);
    },
  });

  baker.add({
    name: "at-noon",
    cron: "0 0 12 * * *",
    callback: () => {
      console.log("It's noon somewhere! Time to stretch.");
    },
  });

  const shutdown = () => {
    console.log("Stopping all jobs...");
    baker.stopAll();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Example failed:", error);
  process.exit(1);
});
