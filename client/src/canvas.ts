export interface DrawData {
  action: string; // "start" | "move" | "end" | "clear" | "undo"
  x: number;
  y: number;
  color: string;
  width: number;
}

export class DrawingCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private drawing = false;
  private color = '#000000';
  private width = 3;
  private undoStack: ImageData[] = [];
  private onDrawCb: ((data: DrawData) => void) | null = null;
  private readOnly = false;

  constructor(container: HTMLElement, private onDraw?: (data: DrawData) => void) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 800;
    this.canvas.height = 500;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.cursor = 'crosshair';
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, 800, 500);
    container.appendChild(this.canvas);
    this.onDrawCb = onDraw || null;
    this.setupEvents();
  }

  private setupEvents() {
    const getPos = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.readOnly) return;
      this.drawing = true;
      this.canvas.setPointerCapture(e.pointerId);
      const p = getPos(e);
      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y);
      this.emit('start', p.x, p.y);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.drawing || this.readOnly) return;
      const p = getPos(e);
      this.ctx.lineTo(p.x, p.y);
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = this.width;
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y);
      this.emit('move', p.x, p.y);
    });

    const endStroke = () => {
      if (!this.drawing) return;
      this.drawing = false;
      this.saveUndo();
      this.emit('end', 0, 0);
    };
    this.canvas.addEventListener('pointerup', endStroke);
    this.canvas.addEventListener('pointerleave', endStroke);
  }

  private emit(action: string, x: number, y: number) {
    this.onDrawCb?.({ action, x, y, color: this.color, width: this.width });
  }

  private saveUndo() {
    this.undoStack.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)!);
    if (this.undoStack.length > 50) this.undoStack.shift();
  }

  setColor(c: string) { this.color = c; }
  setWidth(w: number) { this.width = w; }

  remoteDraw(data: DrawData) {
    if (data.action === 'start') {
      this.ctx.beginPath();
      this.ctx.moveTo(data.x, data.y);
    } else if (data.action === 'move') {
      this.ctx.lineTo(data.x, data.y);
      this.ctx.strokeStyle = data.color;
      this.ctx.lineWidth = data.width;
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(data.x, data.y);
    } else if (data.action === 'end') {
      this.ctx.beginPath();
    } else if (data.action === 'clear') {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.beginPath();
    } else if (data.action === 'undo') {
      if (this.undoStack.length > 0) {
        this.ctx.putImageData(this.undoStack.pop()!, 0, 0);
        this.ctx.beginPath();
      }
    }
  }

  clear() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.undoStack = [];
    this.ctx.beginPath();
    this.emit('clear', 0, 0);
  }

  undo() {
    if (this.undoStack.length > 0) {
      this.ctx.putImageData(this.undoStack.pop()!, 0, 0);
      this.ctx.beginPath();
      this.emit('undo', 0, 0);
    }
  }

  setReadOnly(ro: boolean) {
    this.readOnly = ro;
    this.canvas.style.cursor = ro ? 'default' : 'crosshair';
  }

  getCanvas() { return this.canvas; }
}
