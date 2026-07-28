export class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequestsPerWindow: number;
  private readonly windowMs: number;

  constructor(maxRequestsPerWindow: number = 12, windowMs: number = 60000) {
    this.maxRequestsPerWindow = maxRequestsPerWindow;
    this.windowMs = windowMs;
  }

  tryAcquire(): boolean {
    const now = Date.now();
    // Evict timestamps older than current window
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequestsPerWindow) {
      return false;
    }

    this.requests.push(now);
    return true;
  }
}
