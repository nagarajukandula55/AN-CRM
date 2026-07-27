"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewAssetPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("logo");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");

  const uploadAsset = async () => {
    try {
      if (!file) {
        alert("Please select a file");
        return;
      }
  
      const formData = new FormData();
  
      formData.append("file", file);
      formData.append("name", name);
      formData.append("category", category);
  
      const res = await fetch("/api/assets/upload", {
        method: "POST",
        body: formData,
      });
  
      const data = await res.json();
  
      console.log("UPLOAD RESPONSE:", data);
  
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }
  
      alert("Upload Successful");
  
      window.location.href = "/admin/assets";
  
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  return (
    <div className="max-w-xl p-6">
      <h1 className="text-2xl font-bold mb-6">
        Upload Asset
      </h1>

      <input
        type="text"
        placeholder="Asset Name"
        value={name}
        onChange={(e) =>
          setName(e.target.value)
        }
        className="w-full border rounded p-2 mb-4"
      />

      <select
        value={category}
        onChange={(e) =>
          setCategory(e.target.value)
        }
        className="w-full border rounded p-2 mb-4"
      >
        <option value="logo">Logo</option>
        <option value="icon">Icon</option>
        <option value="background">
          Background
        </option>
        <option value="product-image">
          Product Image
        </option>
        <option value="certification">
          Certification
        </option>
      </select>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const selected =
            e.target.files?.[0];

          setFile(selected);

          if (selected) {
            setPreview(
              URL.createObjectURL(selected)
            );
          }
        }}
        className="mb-4"
      />

      {preview && (
        <img
          src={preview}
          alt="Preview"
          className="w-48 border rounded mb-4"
        />
      )}

      <button
        onClick={uploadAsset}
        className="bg-blue-600 text-white px-5 py-2 rounded"
      >
        Upload Asset
      </button>
    </div>
  );
}
