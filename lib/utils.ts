const resolveIfPromise = async (value: any) =>
  value instanceof Promise ? await value : value;

/**
 * Resolves a callback function, handling both sync and async functions
 * @param callback - The callback function to execute
 * @param onError - Optional error handler
 */
const CBResolver = async (callback?: () => void, onError?: (error: Error) => void) => {
  try {
    if (callback) {
      await resolveIfPromise(callback());
    }
  } catch (error) {
    if (onError) {
      onError(error as Error);
    } else {
      console.warn('Callback execution failed:', error);
    }
  }
};

export { resolveIfPromise, CBResolver };
