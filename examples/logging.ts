import Baker, { Logger } from "../lib/index";

/**
 * Custom logger with colored output and timestamps.
 * You can replace this with any logger that implements the Logger interface,
 * such as pino, winston, bunyan, or logtape.
 */
const createColoredLogger = (prefix: string): Logger => {
  const colors = {
    reset: "\x1b[0m",
    dim: "\x1b[2m",
    blue: "\x1b[34m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
  };

  const timestamp = () => new Date().toISOString();

  return {
    info: (message, ...args) => {
      console.log(
        `${colors.dim}${timestamp()}${colors.reset} ${colors.blue}[INFO]${
          colors.reset
        } ${colors.cyan}[${prefix}]${colors.reset}`,
        message,
        ...args
      );
    },
    warn: (message, ...args) => {
      console.warn(
        `${colors.dim}${timestamp()}${colors.reset} ${colors.yellow}[WARN]${
          colors.reset
        } ${colors.cyan}[${prefix}]${colors.reset}`,
        message,
        ...args
      );
    },
    error: (message, ...args) => {
      console.error(
        `${colors.dim}${timestamp()}${colors.reset} ${colors.red}[ERROR]${
          colors.reset
        } ${colors.cyan}[${prefix}]${colors.reset}`,
        message,
        ...args
      );
    },
    debug: (message, ...args) => {
      console.debug(
        `${colors.dim}${timestamp()}${colors.reset} ${colors.dim}[DEBUG]${
          colors.reset
        } ${colors.cyan}[${prefix}]${colors.reset}`,
        message,
        ...args
      );
    },
  };
};

async function main() {
  // Create a custom logger for the Baker instance
  const bakerLogger = createColoredLogger("cronbake");

  const baker = Baker.create({
    autoStart: true,
    logger: bakerLogger,
  });

  // This job uses the Baker's logger (bakerLogger)
  baker.add({
    name: "heartbeat",
    cron: "@every_5_seconds",
    immediate: true,
    callback: () => {
      console.log("💓 Heartbeat job executed successfully");
    },
  });

  // This job has its own dedicated logger
  const paymentLogger = createColoredLogger("payments");
  baker.add({
    name: "process-payments",
    cron: "@every_10_seconds",
    logger: paymentLogger, // Override with job-specific logger
    immediate: true,
    callback: () => {
      console.log("💰 Processing payments...");
    },
  });

  // This job will fail, demonstrating error logging
  baker.add({
    name: "flaky-job",
    cron: "@every_15_seconds",
    immediate: true,
    delay: "2s",
    callback: () => {
      // Simulate a random failure
      if (Math.random() > 0.5) {
        throw new Error("Random failure occurred!");
      }
      console.log("🎲 Flaky job succeeded this time!");
    },
  });

  console.log("\n🚀 Logging example started!");
  console.log("   - heartbeat: runs every 5 seconds (uses Baker logger)");
  console.log(
    "   - process-payments: runs every 10 seconds (uses custom payments logger)"
  );
  console.log(
    "   - flaky-job: runs every 15 seconds, fails randomly to demo error logging"
  );
  console.log("\nPress Ctrl+C to stop.\n");

  const shutdown = () => {
    console.log("\n👋 Stopping all jobs...");
    baker.destroyAll();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Logging example failed:", error);
  process.exit(1);
});
