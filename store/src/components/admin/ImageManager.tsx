"use client";

import { useState, useEffect, useRef } from "react";
import type { ProductImage } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface ImageManagerProps {
  productId: string;
}

export function ImageManager({ productId }: ImageManagerProps) {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchImages() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/products/${productId}/images`);
      const data = await res.json();
      setImages(data.images ?? []);
    } catch {
      setError("Error al cargar imágenes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function handleUpload(files: FileList) {
    setUploading(true);
    setError("");

    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append("file", files[i]);

      try {
        const res = await fetch(`/api/admin/products/${productId}/images`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json();
          setError(body.error ?? "Error al subir imagen");
        }
      } catch {
        setError("Error de red al subir imagen");
      }
    }

    setUploading(false);
    fetchImages();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDelete(imageId: string) {
    if (!window.confirm("¿Eliminar esta imagen?")) return;
    setError("");

    const res = await fetch(
      `/api/admin/products/${productId}/images?image_id=${imageId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Error al eliminar");
      return;
    }
    fetchImages();
  }

  async function handleSetPrimary(imageId: string) {
    setError("");
    const updated = images.map((img, idx) => ({
      id: img.id,
      sort_order: idx,
      is_primary: img.id === imageId,
    }));

    const res = await fetch(`/api/admin/products/${productId}/images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: updated }),
    });
    if (!res.ok) {
      setError("Error al actualizar");
      return;
    }
    fetchImages();
  }

  async function handleMoveUp(index: number) {
    if (index === 0) return;
    const reordered = [...images];
    [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];

    const updated = reordered.map((img, idx) => ({
      id: img.id,
      sort_order: idx,
      is_primary: img.is_primary,
    }));

    await fetch(`/api/admin/products/${productId}/images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: updated }),
    });
    fetchImages();
  }

  async function handleMoveDown(index: number) {
    if (index >= images.length - 1) return;
    const reordered = [...images];
    [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];

    const updated = reordered.map((img, idx) => ({
      id: img.id,
      sort_order: idx,
      is_primary: img.is_primary,
    }));

    await fetch(`/api/admin/products/${productId}/images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: updated }),
    });
    fetchImages();
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Imágenes del producto
      </label>

      {/* Upload area */}
      <div
        className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-orange-300 transition-colors"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add("border-orange-400", "bg-orange-50");
        }}
        onDragLeave={(e) => {
          e.currentTarget.classList.remove("border-orange-400", "bg-orange-50");
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("border-orange-400", "bg-orange-50");
          if (e.dataTransfer.files.length > 0) {
            handleUpload(e.dataTransfer.files);
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleUpload(e.target.files);
            }
          }}
        />
        {uploading ? (
          <p className="text-sm text-orange-600">Subiendo...</p>
        ) : (
          <p className="text-sm text-gray-400">
            Arrastrá imágenes o hacé clic para subir
            <br />
            <span className="text-xs">JPG, PNG, WebP, GIF — máx 5MB</span>
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Image grid */}
      {loading ? (
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-20 h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <p className="text-sm text-gray-400">Sin imágenes</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className={`relative group rounded-lg overflow-hidden border-2 ${
                img.is_primary ? "border-orange-400" : "border-transparent"
              }`}
            >
              <img
                src={img.url}
                alt={`Imagen ${idx + 1}`}
                className="w-full aspect-square object-cover"
              />

              {/* Primary badge */}
              {img.is_primary && (
                <span className="absolute top-1 left-1 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                  Principal
                </span>
              )}

              {/* Overlay controls */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                {!img.is_primary && (
                  <button
                    onClick={() => handleSetPrimary(img.id)}
                    className="text-[10px] bg-white text-gray-800 px-2 py-0.5 rounded font-medium hover:bg-orange-100"
                  >
                    Hacer principal
                  </button>
                )}
                <div className="flex gap-1">
                  {idx > 0 && (
                    <button
                      onClick={() => handleMoveUp(idx)}
                      className="text-[10px] bg-white/90 text-gray-800 px-1.5 py-0.5 rounded hover:bg-white"
                    >
                      ←
                    </button>
                  )}
                  {idx < images.length - 1 && (
                    <button
                      onClick={() => handleMoveDown(idx)}
                      className="text-[10px] bg-white/90 text-gray-800 px-1.5 py-0.5 rounded hover:bg-white"
                    >
                      →
                    </button>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(img.id)}
                  className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded font-medium hover:bg-red-600"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
