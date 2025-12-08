import { Logger } from "./types";

const resolveIfPromise = async (value: any) =>
  value instanceof Promise ? await value : value;

/**
 * Resolves a callback function, handling both sync and async functions
 * @param callback - The callback function to execute
 * @param onError - Optional error handler
 * @param logger - Optional logger
 */
const CBResolver = async (
  callback?: () => void | Promise<void>,
  onError?: (error: Error) => void,
  logger: Logger = console
) => {
  try {
    if (callback) {
      await resolveIfPromise(callback());
    }
  } catch (error) {
    if (onError) {
      onError(error as Error);
    } else {
      logger.warn('Callback execution failed:', error);
    }
  }
};

export { resolveIfPromise, CBResolver };
