export type LatestRequestToken = {
  id: number;
  signal: AbortSignal;
};

export class LatestRequestController {
  private sequence = 0;
  private activeController: AbortController | null = null;

  start(): LatestRequestToken {
    this.activeController?.abort();
    this.activeController = new AbortController();

    return {
      id: ++this.sequence,
      signal: this.activeController.signal
    };
  }

  isCurrent(token: LatestRequestToken) {
    return token.id === this.sequence && !token.signal.aborted;
  }

  finish(token: LatestRequestToken) {
    if (this.isCurrent(token)) {
      this.activeController = null;
    }
  }

  cancel() {
    this.activeController?.abort();
    this.activeController = null;
    this.sequence += 1;
  }
}
