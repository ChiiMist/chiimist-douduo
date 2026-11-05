"use client";
import { useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import PatternCanvas from "./pattern-canvas";
import { PALETTE, COLOR_NOTICE } from "@/lib/palette";
import { statistics, changeGrid } from "@/lib/pattern";
import { downloadCsv, downloadPng } from "@/lib/export";
import type { Pattern, Cell, Crop, PatternStyle } from "@/lib/types";
const modes: [PatternStyle, string, string][] = [
  ["easy", "易拼", "48 格 · 12 色"],
  ["refined", "精致", "64 格 · 24 色 · 保留五官"],
  ["outline", "轮廓", "64 格 · 24 色 · 深色线"],
  ["faithful", "原图", "96 格 · 36 色"],
];
const presets: Record<PatternStyle, { edge: number; colors: number }> = {
  easy: { edge: 48, colors: 12 },
  refined: { edge: 64, colors: 24 },
  outline: { edge: 64, colors: 24 },
  faithful: { edge: 96, colors: 36 },
};
export default function Studio({ patternId }: { patternId?: string }) {
  const [file, setFile] = useState<File>(),
    [patternName, setPatternName] = useState("我的拼豆图纸"),
    [image, setImage] = useState<string>(),
    [latest, setLatest] = useState<Pattern>(),
    [manual, setManual] = useState<Pattern>(),
    [selected, setSelected] = useState<"latest" | "manual">("latest"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [style, setStyle] = useState<PatternStyle>("refined"),
    [edge, setEdge] = useState(64),
    [colors, setColors] = useState(24),
    [square, setSquare] = useState(false),
    [ratio, setRatio] = useState(1),
    [position, setPosition] = useState({ x: 0, y: 0 }),
    [cropZoom, setCropZoom] = useState(1),
    [crop, setCrop] = useState<Crop>({ x: 0, y: 0, width: 1, height: 1 }),
    [zoom, setZoom] = useState(20),
    [tool, setTool] = useState("move"),
    [color, setColor] = useState(0),
    [all, setAll] = useState(true),
    [past, setPast] = useState<Cell[][]>([]),
    [future, setFuture] = useState<Cell[][]>([]);
  const input = useRef<HTMLInputElement>(null);
  const pattern = selected === "manual" ? manual : latest;
  const stats = pattern ? statistics(pattern.grid) : [];
  useEffect(() => {
    if (!patternId) return;
    let cancelled = false;
    void fetch(`/api/patterns/${patternId}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "图纸读取失败");
      if (cancelled) return;
      const loaded: Pattern = { width: data.width, height: data.height, grid: data.grid, paletteVersion: "mard221-community-2026-11-04", params: data.params ?? {}, path: "cv", warnings: data.warnings ?? [], complexity: data.complexity ?? "medium" };
      setLatest(loaded); setManual(undefined); setSelected("latest"); setPast([]); setFuture([]); setError("已打开历史图纸，可以继续改色或下载。");
    }).catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "图纸读取失败"); });
    return () => { cancelled = true; };
  }, [patternId]);
  useEffect(() => {
    setEdge(presets[style].edge);
    setColors(presets[style].colors);
  }, [style]);
  async function upload(next?: File) {
    if (!next) return;
    if ((latest || manual) && !confirm("换图将清空当前版本，继续吗？")) return;
    if (next.size > 10485760) return setError("图片不能超过 10 MB");
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type))
      return setError("请选择 JPEG、PNG 或 WebP");
    const b = await createImageBitmap(next);
    if (b.width * b.height > 20000000) {
      b.close();
      return setError("图片不能超过 2000 万像素");
    }
    setRatio(b.width / b.height);
    b.close();
    if (image) URL.revokeObjectURL(image);
    setImage(URL.createObjectURL(next));
    setFile(next);
    setLatest(undefined);
    setManual(undefined);
    setPast([]);
    setFuture([]);
    setError("");
  }
  async function generate() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("image", file);
      form.set(
        "params",
        JSON.stringify({
          longEdge: edge,
          maxColors: colors,
          style,
          crop,
          background: { remove: false, color: "#ffffff", tolerance: 35 },
        }),
      );
      const r = await fetch("/api/convert", { method: "POST", body: form }),
        data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setLatest(data);
      setSelected("latest");
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }
  function edit(i: number) {
    if (!pattern) return;
    if (selected !== "manual" && manual && !confirm("会替换手工版本，继续吗？"))
      return;
    const target = tool === "erase" ? null : color;
    if (
      target !== null &&
      !stats.some((x) => x.index === target) &&
      !confirm(`添加 ${PALETTE[target].code}？`)
    )
      return;
    if (selected === "manual") setPast((v) => [...v, pattern.grid].slice(-50));
    else {
      setPast([]);
      setFuture([]);
    }
    setManual({
      ...pattern,
      grid: changeGrid(pattern.grid, i, target, tool === "replace"),
    });
    setSelected("manual");
    setFuture([]);
  }
  function history(redo = false) {
    if (!manual) return;
    const source = redo ? future : past;
    if (!source.length) return;
    const grid = source.at(-1)!;
    if (redo) {
      setFuture(source.slice(0, -1));
      setPast((v) => [...v, manual.grid].slice(-50));
    } else {
      setPast(source.slice(0, -1));
      setFuture((v) => [...v, manual.grid]);
    }
    setManual({ ...manual, grid });
  }
  async function savePattern() {
    if (!pattern || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/patterns/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: patternName,
          width: pattern.width,
          height: pattern.height,
          grid: pattern.grid,
          params: pattern.params,
          warnings: pattern.warnings,
          complexity: pattern.complexity,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "图纸保存失败");
      setError("图纸已保存到我的图纸。");
      alert("图纸已保存到我的图纸");
    } catch (e) {
      const message = e instanceof Error ? e.message : "图纸保存失败";
      setError(message);
      alert(`保存失败：${message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header>
        <a className="brand" href="/">
          ▦ <b>豆朵</b>
        </a>
        <span className="badge">MARD 221 色</span>
      </header>
      <main>
        <section className="hero">
          <h1>
            把喜欢，<em>拼在一起。</em>
          </h1>
          <p>Make something happy.</p>
          <div className="pills">
            <span>✿ 新手友好</span>
            <span>▦ 221 色参考色板</span>
            <span>↓ 免费下载图纸</span>
          </div>
        </section>
        <section className="workspace">
          <aside>
            <div className="section-title">
              <i>01</i>
              <h2>放点灵感</h2>
            </div>
            <small>本机 CV 处理，图片不会发送到第三方服务。</small>
            <input
              ref={input}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              className="upload"
              onClick={() => input.current?.click()}
              disabled={busy}
            >
              <strong>＋</strong>
              <b>{file ? "换张图片" : "上传图片"}</b>
              <span>JPEG / PNG / WebP · 最大 10 MB</span>
            </button>
            <small className="retention-note">为保护隐私，原图最长保存 7 天；你下次生成时会自动清理过期原图，图纸和下载文件不受影响。</small>
            {image && (
              <>
                <div className="crop">
                  <Cropper
                    image={image}
                    crop={position}
                    zoom={cropZoom}
                    aspect={square ? 1 : ratio}
                    onCropChange={setPosition}
                    onZoomChange={setCropZoom}
                    onCropComplete={(a) =>
                      setCrop({
                        x: a.x / 100,
                        y: a.y / 100,
                        width: a.width / 100,
                        height: a.height / 100,
                      })
                    }
                  />
                </div>
                <label>
                  裁剪缩放
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step=".05"
                    value={cropZoom}
                    onChange={(e) => setCropZoom(+e.target.value)}
                  />
                </label>
              </>
            )}
            <div className="section-title">
              <i>02</i>
              <h2>轻松开拼</h2>
            </div>
            <label>
              图纸长边 <b>{edge} 格</b>
            </label>
            <div className="options">
              {[32, 48, 64, 96].map((n) => (
                <button
                  key={n}
                  className={edge === n ? "active" : ""}
                  onClick={() => setEdge(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <label>图纸风格</label>
            <div className="style-options">
              {modes.map(([id, name, note]) => (
                <button
                  key={id}
                  className={style === id ? "active" : ""}
                  onClick={() => setStyle(id)}
                >
                  <b>{name}</b>
                  <small>{note}</small>
                </button>
              ))}
            </div>
            <label>
              最多用色 <b>{colors} 色</b>
            </label>
            <div className="options">
              {[12, 24, 36, 48].map((n) => (
                <button
                  key={n}
                  className={colors === n ? "active" : ""}
                  onClick={() => setColors(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={square}
                onChange={(e) => setSquare(e.target.checked)}
              />
              正方形裁剪
            </label>
            <button
              className="primary"
              disabled={!file || busy}
              onClick={generate}
            >
              {busy ? "正在生成…" : "✦ 开始生成"}
            </button>
            {error && <p className="error">{error}</p>}
          </aside>
          <article>
            <div className="result-heading">
              <div>
                <span className="eyebrow">你的图纸</span>
                <h2>拼点小快乐</h2>
              </div>
              <span className="status">
                {pattern ? "✿ 图纸已就绪" : "等你开拼"}
              </span>
            </div>
            {pattern ? (
              <>
                <div className="toolbar">
                  <button
                    className={selected === "latest" ? "active" : ""}
                    onClick={() => setSelected("latest")}
                  >
                    最新生成
                  </button>
                  <button
                    disabled={!manual}
                    className={selected === "manual" ? "active" : ""}
                    onClick={() => setSelected("manual")}
                  >
                    手工版本
                  </button>
                  <span>
                    {pattern.width} × {pattern.height} 格 · {stats.length} 色 ·{" "}
                    {stats.reduce((s, x) => s + x.count, 0)} 颗
                  </span>
                </div>
                {tool === "replace" && (
                  <p className="notice">全图替色：点击画布中的任意格子，会把整张图中同一颜色的格子全部替换成当前选中的颜色。</p>
                )}
                <div className="toolbar">
                  {[
                    ["move", "移动"],
                    ["paint", "改色"],
                    ["erase", "擦除"],
                    ["replace", "全图替色"],
                  ].map(([v, t]) => (
                    <button
                      key={v}
                      className={tool === v ? "active" : ""}
                      onClick={() => setTool(v)}
                    >
                      {t}
                    </button>
                  ))}
                  <button
                    disabled={!past.length || selected !== "manual"}
                    onClick={() => history()}
                  >
                    ↶ 撤销
                  </button>
                  <button
                    disabled={!future.length || selected !== "manual"}
                    onClick={() => history(true)}
                  >
                    ↷ 重做
                  </button>
                  <label>
                    缩放
                    <input
                      type="range"
                      min="10"
                      max="40"
                      value={zoom}
                      onChange={(e) => setZoom(+e.target.value)}
                    />
                  </label>
                </div>
                <PatternCanvas
                  pattern={pattern}
                  zoom={zoom}
                  tool={tool}
                  onCell={edit}
                />
                <div className="downloads">
                  <label className="pattern-name-label">图纸名称<input value={patternName} maxLength={120} onChange={(e) => setPatternName(e.target.value)} placeholder="例如：小熊头像" /></label>
                  <button
                    className="primary"
                    onClick={() =>
                      downloadPng(
                        pattern,
                        selected === "manual" ? "手工版本" : "最新生成",
                      ).catch((e) => setError(e.message))
                    }
                  >
                    ↓ 下载 PNG 图纸
                  </button>
                  <button
                    onClick={() => {
                      alert(COLOR_NOTICE);
                      downloadCsv(pattern);
                    }}
                  >
                    下载 CSV 用豆清单
                  </button>
                  <button className="primary" onClick={savePattern} disabled={busy}>
                    {busy ? "保存中…" : "保存图纸"}
                  </button>
                </div>
                {pattern.warnings.map((w) => (
                  <p className="notice" key={w}>
                    {w}
                  </p>
                ))}
                <div className="palette-heading">
                  <h3>选择改色 · MARD 221 色</h3>
                  <button onClick={() => setAll(!all)}>
                    {all ? "仅看当前用色" : "展开全部 221 色"}
                  </button>
                </div>
                <div className="swatches">
                  {(all
                    ? PALETTE.map((x, index) => ({
                        ...x,
                        index,
                        count: stats.find((s) => s.index === index)?.count || 0,
                      }))
                    : stats
                  ).map((x) => (
                    <button
                      key={x.code}
                      className={color === x.index ? "chosen" : ""}
                      onClick={() => {
                        setColor(x.index);
                        setTool("paint");
                      }}
                    >
                      <i style={{ background: x.hex }} />
                      <b>{x.code}</b>
                      <small>{x.count} 颗</small>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty">
                <div className="pixel-flower">✿</div>
                <span className="tiny">动手拼吧</span>
                <h3>
                  小小豆子，
                  <br />
                  大大快乐。
                </h3>
                <p>上传图片，剩下的交给灵感。</p>
              </div>
            )}
            <p className="color-notice">
              {COLOR_NOTICE}
              <br />
              玩家整理参考色板 · 非官方认证
            </p>
          </article>
        </section>
      </main>
      <footer>
        豆朵 <span>把喜欢拼出来。</span>
      </footer>
    </>
  );
}
