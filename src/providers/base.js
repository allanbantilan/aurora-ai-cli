/**
 * Base provider interface for AI model providers.
 * Each provider must implement: id, name, fetchModels, createClient
 */
export class BaseProvider {
  constructor(config = {}) {
    this.config = config;
  }

  /** Unique provider identifier */
  get id() {
    throw new Error('Provider must implement id getter');
  }

  /** Human-readable name */
  get name() {
    throw new Error('Provider must implement name getter');
  }

  /** Whether this provider has free tier models */
  get hasFreeTier() {
    return false;
  }

  /**
   * Fetch available models from this provider.
   * Returns: [{ id, name, context, pricing, supported_parameters }]
   */
  async fetchModels() {
    throw new Error('Provider must implement fetchModels()');
  }

  /**
   * Create an OpenAI-compatible client for this provider.
   * @param {string} apiKey - Provider API key
   * @returns {OpenAI} OpenAI SDK instance configured for this provider
   */
  createClient(apiKey) {
    throw new Error('Provider must implement createClient()');
  }

  /**
   * Check if this provider is available (has API key configured).
   */
  isAvailable() {
    return false;
  }

  /**
   * Get the API key for this provider from environment or config.
   */
  getApiKey(env = process.env) {
    return null;
  }
}