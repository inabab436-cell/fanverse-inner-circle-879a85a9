import { useEffect, useRef, useState } from "react";
import { Crosshair, Eye, Footprints, Minus, Plus, RotateCcw, Settings2, X, MoveUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { advance, analogInput, zoomAt, type Vec } from "@/lib/movement";

export function MovementSurface() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const model = useRef({ position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, input: { x: 0, y: 0 }, camera: { x: 0, y: 0 }, zoom: 1, follow: true, fast: false, angle: -Math.PI / 2, looking: false });
  const [fast, setFast] = useState(false);
  const [follow, setFollow] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [settings, setSettings] = useState(false);
  const [moving, setMoving] = useState(false);
  const [hand, setHand] = useState<"left" | "right">("left");
  const [sensitivity, setSensitivity] = useState(1);
  const sensitivityRef = useRef(1);
  const resetInput = () => { model.current.input = { x: 0, y: 0 }; model.current.velocity = { x: 0, y: 0 }; };
  function changeZoom(next: number) { model.current.zoom = Math.max(0.65, Math.min(1.8, next)); setZoom(model.current.zoom); }
  function center() { model.current.follow = true; setFollow(true); model.current.camera = { ...model.current.position }; }
  function reset() { resetInput(); model.current.position = { x: 0, y: 0 }; model.current.camera = { x: 0, y: 0 }; model.current.angle = -Math.PI / 2; center(); }

  useEffect(() => {
    const zone = stickRef.current;
    if (!zone) return;
    let disposed = false;
    let destroy: (() => void) | undefined;
    import("nipplejs").then(({ create }) => {
      if (disposed) return;
      const joystick = create({ zone, mode: "static", position: { left: "50%", top: "50%" }, size: 112, color: { front: "var(--primary)", back: "var(--secondary)" }, fadeTime: 100, dynamicPage: true });
      joystick.on("move", (event) => { model.current.input = analogInput({ x: event.data.vector.x, y: -event.data.vector.y }); });
      joystick.on("end", () => { model.current.input = { x: 0, y: 0 }; });
      destroy = () => joystick.destroy();
    });
    return () => { disposed = true; destroy?.(); resetInput(); };
  }, [hand]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    const canvas: HTMLCanvasElement = element;
    const ctx: CanvasRenderingContext2D = context;
    let width = 0, height = 0, frame = 0, previous = 0, lastUi = 0;
    const css = getComputedStyle(document.documentElement);
    const colors = { background: css.getPropertyValue("--background"), grid: css.getPropertyValue("--movement-grid"), primary: css.getPropertyValue("--primary"), accent: css.getPropertyValue("--accent"), white: css.getPropertyValue("--card"), ink: css.getPropertyValue("--foreground"), muted: css.getPropertyValue("--muted-foreground"), trail: css.getPropertyValue("--movement-trail") };
    const resize = () => { const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height; const dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    const keys = new Set<string>();
    const keydown = (event: KeyboardEvent) => { if (event.target instanceof HTMLInputElement) return; if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault(); keys.add(event.key.toLowerCase()); };
    const keyup = (event: KeyboardEvent) => { keys.delete(event.key.toLowerCase()); };
    const clear = () => { keys.clear(); resetInput(); model.current.looking = false; };
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", clear); document.addEventListener("visibilitychange", clear);
    const trails: Vec[] = [];
    let trailClock = 0;
    function draw(time: number) {
      const m = model.current;
      const dt = previous ? Math.min((time - previous) / 1000, 0.05) : 0; previous = time;
      const keyInput = { x: Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft")), y: Number(keys.has("s") || keys.has("arrowdown")) - Number(keys.has("w") || keys.has("arrowup")) };
      const input = Math.hypot(keyInput.x, keyInput.y) ? analogInput(keyInput) : m.input;
      const next = advance(m.position, m.velocity, input, m.fast || keys.has("shift"), dt);
      m.position = next.position; m.velocity = next.velocity;
      const speed = Math.hypot(m.velocity.x, m.velocity.y);
      if (speed > 8 && !m.looking) {
        const target = Math.atan2(m.velocity.y, m.velocity.x);
        m.angle += Math.atan2(Math.sin(target - m.angle), Math.cos(target - m.angle)) * (1 - Math.exp(-18 * dt));
      }
      if (m.follow) { const smoothing = 1 - Math.exp(-7 * dt); m.camera.x += (m.position.x - m.camera.x) * smoothing; m.camera.y += (m.position.y - m.camera.y) * smoothing; }
      if (time - lastUi > 180) { setMoving(speed > 8); lastUi = time; }
      trailClock += dt;
      if (speed > 15 && trailClock > 0.09) { trails.push({ ...m.position }); if (trails.length > 16) trails.shift(); trailClock = 0; }
      if (speed < 10 && trails.length && trailClock > 0.12) { trails.shift(); trailClock = 0; }
      ctx.fillStyle = colors.background; ctx.fillRect(0, 0, width, height);
      ctx.save(); ctx.translate(width / 2, height * 0.44); ctx.scale(m.zoom, m.zoom); ctx.translate(-m.camera.x, -m.camera.y);
      const left = m.camera.x - width / 2 / m.zoom, top = m.camera.y - height * 0.44 / m.zoom;
      ctx.strokeStyle = colors.grid; ctx.lineWidth = 1 / m.zoom; ctx.beginPath();
      for (let x = Math.floor(left / 64) * 64; x < left + width / m.zoom; x += 64) { ctx.moveTo(x, top); ctx.lineTo(x, top + height / m.zoom); }
      for (let y = Math.floor(top / 64) * 64; y < top + height / m.zoom; y += 64) { ctx.moveTo(left, y); ctx.lineTo(left + width / m.zoom, y); } ctx.stroke();
      ctx.strokeStyle = colors.grid; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 54, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
      trails.forEach((point, i) => { ctx.globalAlpha = (i + 1) / trails.length * 0.4; ctx.fillStyle = colors.trail; ctx.beginPath(); ctx.arc(point.x, point.y, 3, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(m.position.x, m.position.y);
      ctx.fillStyle = colors.white; ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(-24, -57, 48, 25, 12); ctx.fill(); ctx.stroke(); ctx.fillStyle = colors.ink; ctx.font = "500 12px 'IBM Plex Sans Arabic'"; ctx.textAlign = "center"; ctx.fillText("أنت", 0, -40);
      ctx.rotate(m.angle);
      ctx.strokeStyle = colors.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(43, -5); ctx.lineTo(49, 0); ctx.lineTo(43, 5); ctx.stroke();
      const step = speed > 8 ? Math.sin(time / (m.fast ? 65 : 95)) * 4 : 0;
      ctx.fillStyle = colors.primary; ctx.beginPath(); ctx.ellipse(-6 + step, -16, 10, 7, 0, 0, Math.PI * 2); ctx.ellipse(-6 - step, 16, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = colors.white; ctx.strokeStyle = colors.primary; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = colors.primary; ctx.beginPath(); ctx.arc(3, 0, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = colors.white; ctx.beginPath(); ctx.arc(9, -5, 2, 0, Math.PI * 2); ctx.arc(9, 5, 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); ctx.restore();
      canvas.dataset["x"] = m.position.x.toFixed(1); canvas.dataset["y"] = m.position.y.toFixed(1); canvas.dataset["angle"] = m.angle.toFixed(3);
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    const wheel = (event: WheelEvent) => { event.preventDefault(); const m = model.current; const rect = canvas.getBoundingClientRect(); const next = Math.max(0.65, Math.min(1.8, m.zoom * Math.exp(-event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1) * 0.0015))); m.camera = zoomAt(m.camera, m.zoom, next, { x: event.clientX - rect.left - width / 2, y: event.clientY - rect.top - height * 0.44 }); m.zoom = next; m.follow = false; setFollow(false); setZoom(next); };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); canvas.removeEventListener("wheel", wheel); window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", clear); };
  }, []);

  const pointers = useRef(new Map<number, Vec>());
  const pinchDistance = useRef(0);
  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY }; pointers.current.set(event.pointerId, current);
    const m = model.current;
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      if (!a || !b) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance.current > 0) { const rect = event.currentTarget.getBoundingClientRect(); const next = Math.max(0.65, Math.min(1.8, m.zoom * distance / pinchDistance.current)); m.camera = zoomAt(m.camera, m.zoom, next, { x: (a.x + b.x) / 2 - rect.left - rect.width / 2, y: (a.y + b.y) / 2 - rect.top - rect.height * 0.44 }); m.zoom = next; setZoom(next); m.follow = false; setFollow(false); } pinchDistance.current = distance;
    } else if (!m.follow) { m.camera.x -= (current.x - previous.x) / m.zoom; m.camera.y -= (current.y - previous.y) / m.zoom; }
    else { const rect = event.currentTarget.getBoundingClientRect(); const x = current.x - rect.left - rect.width / 2 - (m.position.x - m.camera.x) * m.zoom; const y = current.y - rect.top - rect.height * 0.44 - (m.position.y - m.camera.y) * m.zoom; const target = Math.atan2(y, x); m.angle += Math.atan2(Math.sin(target - m.angle), Math.cos(target - m.angle)) * Math.min(1, sensitivityRef.current); m.looking = true; }
  }
  function release(event: React.PointerEvent<HTMLCanvasElement>) { pointers.current.delete(event.pointerId); pinchDistance.current = 0; if (!pointers.current.size) model.current.looking = false; }

  return (
    <div className="movement-shell relative isolate h-dvh overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} aria-label="مساحة تجربة المشي والرؤية" className="absolute inset-0 h-full w-full touch-none" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); }} onPointerMove={pointerMove} onPointerUp={release} onPointerCancel={release} />
      <header className="movement-header pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-5 pt-5">
        <div><h1 dir="ltr" className="text-3xl font-extrabold text-primary">orbit<span className="text-accent">.</span></h1><p className="mt-1 text-xs text-muted-foreground">تجربة الحركة</p></div>
        <div className="pointer-events-auto flex items-center gap-2"><span className="hidden text-xs text-muted-foreground sm:inline">{moving ? fast ? "مشي سريع" : "يتحرك" : "متوقف"}</span><Button variant="outline" size="icon" className="rounded-full bg-card" aria-label="إعدادات الحركة" title="إعدادات الحركة" onClick={() => setSettings(!settings)}><Settings2 /></Button></div>
      </header>
      <div className="absolute left-5 top-28 flex flex-col gap-2" dir="ltr"><Button variant="outline" size="icon" className="rounded-full bg-card" aria-label="تقريب" title="تقريب" onClick={() => changeZoom(zoom * 1.15)}><Plus /></Button><span className="text-center text-[10px] text-muted-foreground">{Math.round(zoom * 100)}%</span><Button variant="outline" size="icon" className="rounded-full bg-card" aria-label="إبعاد" title="إبعاد" onClick={() => changeZoom(zoom / 1.15)}><Minus /></Button></div>
      <div className="absolute right-5 top-28 flex flex-col gap-2"><Button variant={follow ? "default" : "outline"} size="icon" className="rounded-full" aria-label="تتبّع الشخصية" title="تتبّع الشخصية" onClick={center}><Crosshair /></Button><Button variant={!follow ? "default" : "outline"} size="icon" className="rounded-full" aria-label="رؤية حرة" title="رؤية حرة" onClick={() => { model.current.follow = false; setFollow(false); }}><Eye /></Button><Button variant="outline" size="icon" className="rounded-full bg-card" aria-label="العودة للبداية" title="العودة للبداية" onClick={reset}><RotateCcw /></Button></div>
      {settings && <section className="absolute right-5 top-20 z-20 w-64 rounded-lg border border-border bg-card p-4 shadow-soft" aria-label="إعدادات"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">الحركة والرؤية</h2><Button variant="ghost" size="icon" aria-label="إغلاق الإعدادات" onClick={() => setSettings(false)}><X /></Button></div><label className="mt-3 block text-xs text-muted-foreground" htmlFor="sensitivity">حساسية الرؤية</label><input id="sensitivity" type="range" min="0.25" max="1" step="0.05" value={sensitivity} className="mt-3 w-full accent-primary" onChange={(event) => { const value = Number(event.target.value); setSensitivity(value); sensitivityRef.current = value; }} /><p className="mb-2 mt-4 text-xs text-muted-foreground">يد الحركة</p><div className="flex gap-2">{(["left", "right"] as const).map((side) => <Button key={side} variant={hand === side ? "default" : "outline"} className="flex-1" onClick={() => setHand(side)}>{side === "left" ? "اليسرى" : "اليمنى"}</Button>)}</div></section>}
      <div className={`movement-stick absolute bottom-7 ${hand === "left" ? "left-5" : "right-5"}`}><div ref={stickRef} className="relative h-36 w-36 touch-none rounded-full border border-border bg-card/70" aria-label="عصا الحركة" /><span className="mt-2 block text-center text-[11px] text-muted-foreground">المشي</span></div>
      <div className={`movement-actions absolute bottom-14 flex flex-col items-center gap-3 ${hand === "left" ? "right-7" : "left-7"}`}><Button variant={fast ? "default" : "outline"} className="h-16 w-16 rounded-full border-2 bg-card text-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground" data-active={fast} aria-label="مشي سريع" aria-pressed={fast} title="مشي سريع" onClick={() => { model.current.fast = !fast; setFast(!fast); }}><Footprints className="size-6" /></Button><span className="text-[11px] text-muted-foreground">{fast ? "مشي سريع" : "مشي هادئ"}</span></div>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground"><MoveUpRight className="size-3 text-accent" /><span>{follow ? "رؤية متتبّعة" : "رؤية حرة"}</span></div>
    </div>
  );
}