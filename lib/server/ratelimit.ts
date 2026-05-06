export class RateLimiter {
  private requests: Map<string, number[]>;
  private limit: number;
  private windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.requests = new Map();
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /**
   * Vérifie si la limite est atteinte pour une clé donnée (ex: IP)
   */
  check(key: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    
    // Nettoyer les requêtes trop anciennes
    const validTimestamps = timestamps.filter(timestamp => now - timestamp < this.windowMs);
    
    if (validTimestamps.length >= this.limit) {
      // Limite atteinte
      this.requests.set(key, validTimestamps);
      return false;
    }
    
    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    return true;
  }
}

// Limiteur global pour le checkout (ex: 5 requêtes par minute par IP)
export const checkoutRateLimiter = new RateLimiter(5, 60 * 1000);
