"use client";

import { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import AssetLibrary from "./AssetLibrary";
import { DesignEngine } from "@/lib/designEngine";

const uid = () => crypto.randomUUID();

export default function DesignerCanvas({
  labelWidth,
  labelHeight,
  designId,
  initialCanvas,
}) {
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const engineRef = useRef(null);

  const [objects, setObjects] = useState([]);
  const [active, setActive] = useState(null);

  /* ================= INIT ================= */
  useEffect(() => {
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 1200,
      height: 800,
      backgroundColor: "#f8fafc",
      preserveObjectStacking: true,
    });

    fabricRef.current = canvas;
    engineRef.current = new DesignEngine(canvas);

    /* CANVA-LIKE ARTBOARD */
    const artboard = new fabric.Rect({
      left: 100,
      top: 100,
      width: labelWidth * 4,
      height: labelHeight * 4,
      fill: "#ffffff",
      stroke: "#111",
      strokeWidth: 2,
      selectable: false,
    });

    canvas.add(artboard);
    canvas.sendObjectToBack(artboard);

    /* OBJECT SYNC */
    const sync = () => {
      setObjects(
        canvas.getObjects().filter((o) => o !== artboard)
      );
    };

    canvas.on("object:added", sync);
    canvas.on("object:removed", sync);
    canvas.on("object:modified", sync);

    /* SELECTION */
    canvas.on("selection:created", (e) =>
      setActive(e.selected?.[0])
    );

    canvas.on("selection:updated", (e) =>
      setActive(e.selected?.[0])
    );

    canvas.on("selection:cleared", () => setActive(null));

    return () => canvas.dispose();
  }, []);

  /* ================= LOAD ================= */
  useEffect(() => {
    if (!fabricRef.current || !initialCanvas) return;

    fabricRef.current.loadFromJSON(initialCanvas, () => {
      fabricRef.current.renderAll();
    });
  }, [initialCanvas]);

  const canvas = () => fabricRef.current;
  const engine = () => engineRef.current;

  /* ================= SAFE OBJECT WRAPPER ================= */
  const attachMeta = (obj, name) => {
    obj.id = uid();
    obj.name = name;
    obj.lockMovementX = false;
    obj.lockMovementY = false;
    return obj;
  };

  /* ================= ADD ELEMENTS ================= */
  const addText = () => {
    const obj = attachMeta(
      new fabric.Textbox("Text", {
        left: 120,
        top: 120,
        fontSize: 28,
        fill: "#111",
      }),
      "Text"
    );

    canvas().add(obj);
    engine().snapshot();
  };

  const addRect = () => {
    const obj = attachMeta(
      new fabric.Rect({
        left: 150,
        top: 150,
        width: 220,
        height: 120,
        fill: "#dbeafe",
      }),
      "Rectangle"
    );

    canvas().add(obj);
    engine().snapshot();
  };

  const addCircle = () => {
    const obj = attachMeta(
      new fabric.Circle({
        left: 180,
        top: 180,
        radius: 60,
        fill: "#dcfce7",
      }),
      "Circle"
    );

    canvas().add(obj);
    engine().snapshot();
  };

  /* ================= LAYERS ================= */
  const bringForward = () => active && canvas().bringForward(active);
  const sendBackward = () => active && canvas().sendBackwards(active);

  const remove = () => {
    if (!active) return;
    canvas().remove(active);
    setActive(null);
    engine().snapshot();
  };

  /* ================= ASSETS ================= */
  const addAsset = async (asset) => {
    const img = await fabric.Image.fromURL(asset.fileUrl);
    img.scaleToWidth(180);

    attachMeta(img, "Image");

    canvas().add(img);
    engine().snapshot();
  };

  /* ================= HISTORY ================= */
  const undo = () => engine().undo();
  const redo = () => engine().redo();

  /* ================= SAVE ================= */
  const save = async () => {
    const json = engine().save();

    await fetch(
      designId ? `/api/designs/${designId}` : "/api/designs",
      {
        method: designId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Design",
          width: labelWidth,
          height: labelHeight,
          canvasJson: json,
        }),
      }
    );

    alert("Design Saved (Final System)");
  };

  /* ================= UI ================= */
  return (
    <div className="grid grid-cols-5 gap-3">

      {/* TOOLBAR */}
      <div className="bg-white border p-3">
        <button onClick={addText}>Text</button>
        <button onClick={addRect}>Rect</button>
        <button onClick={addCircle}>Circle</button>

        <hr />

        <button onClick={undo}>Undo</button>
        <button onClick={redo}>Redo</button>

        <hr />

        <button onClick={bringForward}>Forward</button>
        <button onClick={sendBackward}>Back</button>

        <hr />

        <button onClick={remove}>Delete</button>
        <button onClick={save}>Save</button>
      </div>

      {/* LAYERS */}
      <div className="bg-white border p-3">
        <h3>Layers</h3>

        {objects.map((o, i) => (
          <div
            key={o.id || i}
            onClick={() => canvas().setActiveObject(o)}
            className="p-2 border mb-1 cursor-pointer"
          >
            {o.name || o.type}
          </div>
        ))}
      </div>

      {/* CANVAS */}
      <div className="col-span-2 bg-gray-100 border p-3">
        <canvas ref={canvasRef} />
      </div>

      {/* ASSETS */}
      <div className="bg-white border p-3">
        <AssetLibrary onSelect={addAsset} />
      </div>

    </div>
  );
}
