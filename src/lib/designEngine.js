export class DesignEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.history = [];
    this.redoStack = [];
    this.isRestoring = false;
  }

  snapshot() {
    if (this.isRestoring) return;

    this.history.push(this.canvas.toJSON());
    this.redoStack = [];

    if (this.history.length > 50) {
      this.history.shift();
    }
  }

  undo() {
    if (this.history.length === 0) return;

    this.isRestoring = true;

    const prev = this.history.pop();
    this.redoStack.push(this.canvas.toJSON());

    this.canvas.loadFromJSON(prev, () => {
      this.canvas.renderAll();
      this.isRestoring = false;
    });
  }

  redo() {
    if (this.redoStack.length === 0) return;

    this.isRestoring = true;

    const next = this.redoStack.pop();
    this.history.push(this.canvas.toJSON());

    this.canvas.loadFromJSON(next, () => {
      this.canvas.renderAll();
      this.isRestoring = false;
    });
  }

  save() {
    return this.canvas.toJSON(["id", "name", "lock", "meta"]);
  }
}
