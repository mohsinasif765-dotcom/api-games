/**
 * NTP-style client↔server clock offset.
 *
 * `skewMs = Date.now() - serverNow`. A naive `Date.now() - server_now` taken
 * when a response *arrives* bakes the whole network latency into the skew, and
 * re-sampling it on every poll makes countdowns jitter by ±1s. Instead we use
 * the request midpoint and only trust low-latency samples.
 */
export class ClockSync {
  skewMs = 0;
  private bestRtt = Number.POSITIVE_INFINITY;
  private hasRttSample = false;

  /** Sample from an HTTP request we timed ourselves (preferred). */
  sample(sentAt: number, receivedAt: number, serverIso: string | null | undefined) {
    const serverMs = serverIso ? Date.parse(serverIso) : NaN;
    if (!Number.isFinite(serverMs)) return;
    const rtt = Math.max(0, receivedAt - sentAt);
    const skew = (sentAt + receivedAt) / 2 - serverMs;

    if (!this.hasRttSample) {
      this.hasRttSample = true;
      this.bestRtt = rtt;
      this.skewMs = skew;
      return;
    }

    // Let the bar drift up slowly so a permanently slower network still syncs.
    this.bestRtt += 2;
    if (rtt > this.bestRtt + 40) return; // congested sample: ignore

    this.bestRtt = Math.min(this.bestRtt, rtt);
    // Smooth to avoid visible 1s hops on the countdown.
    this.skewMs = this.skewMs * 0.7 + skew * 0.3;
  }

  /** Socket push: one-way, unknown send time. Only used until an HTTP sample exists. */
  samplePush(serverIso: string | null | undefined) {
    if (this.hasRttSample) return;
    const serverMs = serverIso ? Date.parse(serverIso) : NaN;
    if (!Number.isFinite(serverMs)) return;
    this.skewMs = Date.now() - serverMs;
  }

  /** Current server time estimate (ms). */
  serverNow() {
    return Date.now() - this.skewMs;
  }
}
