// One error type for every tool. `code` decides the CLI exit status:
//   usage → 2, gate → 3, anything else → 1.
export class CairnError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CairnError";
    this.code = code;
    this.details = details;
  }
  get exitCode() {
    if (this.code === "usage") return 2;
    if (this.code === "gate") return 3;
    return 1;
  }
}

export function usage(message) { return new CairnError("usage", message); }
export function invalid(message, details) { return new CairnError("invalid", message, details); }
