import { describe, it, expect, jest } from "bun:test";
import Baker from "./baker";
import Cron from "./cron";
import { Logger } from "./types";

describe("Custom Logger", () => {
  it("should use custom logger in Cron when passed via Baker", async () => {
    const mockLogger: Logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const baker = new Baker({
      logger: mockLogger,
    });

    const cron = baker.add({
      name: "test-cron-logger",
      cron: "* * * * * *",
      callback: () => {
        throw new Error("Test error");
      },
      start: true,
      immediate: true,
    });

    await new Promise((r) => setTimeout(r, 30));

    cron.stop();
    baker.destroyAll();

    // Should have logged a warning
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("should use custom logger in Cron when passed directly", async () => {
    const mockLogger: Logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const cron = new Cron({
      name: "test-cron-direct-logger",
      cron: "* * * * * *",
      callback: () => {
        throw new Error("Test error direct");
      },
      logger: mockLogger,
      start: true,
      immediate: true,
    });

    await new Promise((r) => setTimeout(r, 30));

    cron.stop();
    cron.destroy();

    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("should allow overriding logger per job in Baker", async () => {
    const bakerLogger: Logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const jobLogger: Logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const baker = new Baker({
      logger: bakerLogger,
    });

    const cron = baker.add({
      name: "test-override-logger",
      cron: "* * * * * *",
      callback: () => {
        throw new Error("Test error override");
      },
      logger: jobLogger,
      start: true,
      immediate: true,
    });

    await new Promise((r) => setTimeout(r, 30));

    cron.stop();
    baker.destroyAll();

    expect(jobLogger.warn).toHaveBeenCalled();
    expect(bakerLogger.warn).not.toHaveBeenCalled();
  });
});
