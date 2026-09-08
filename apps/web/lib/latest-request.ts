// A response may update the page only while its scope and request are current.
export class LatestRequest {
  private scope = "";
  private generation = 0;

  setScope(scope: string) {
    if (scope !== this.scope) {
      this.scope = scope;
      this.generation += 1;
    }
  }

  begin() {
    const generation = ++this.generation;
    return () => generation === this.generation;
  }
}
