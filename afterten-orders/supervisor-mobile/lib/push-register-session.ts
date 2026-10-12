const THROTTLE_MS = 6 * 60 * 60 * 1000;
let lastSuccessAt = 0;

export function shouldSkipPushRegistration(): boolean {
  return lastSuccessAt > 0 && Date.now() - lastSuccessAt < THROTTLE_MS;
}

export function markPushRegistrationSuccess(): void {
  lastSuccessAt = Date.now();
}
