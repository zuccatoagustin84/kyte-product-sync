import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { getCurrentTenant } from "@/lib/tenant";

// GET /api/admin/products/[id]/images — list images for a product
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await getCurrentTenant();
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_id", id)
    .eq("company_id", companyId)
    .order("sort_order");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ images: data });
}

// POST /api/admin/products/[id]/images — upload a new image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  const { id } = await params;
  const supabase = createServiceClient();

  // Verify the product belongs to this company before any uploads.
  const { data: ownerCheck } = await supabase
    .from("products")
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!ownerCheck) {
    return Response.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  // Parse multipart form data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    return Response.json(
      { error: "Tipo de archivo no permitido. Use JPG, PNG, WebP o GIF." },
      { status: 400 }
    );
  }

  // Max 5MB
  if (file.size > 5 * 1024 * 1024) {
    return Response.json(
      { error: "Archivo demasiado grande. Máximo 5MB." },
      { status: 400 }
    );
  }

  // Generate unique filename
  const ext = file.name.split(".").pop() || "jpg";
  const filename = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(filename, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("product-images")
    .getPublicUrl(filename);

  const url = urlData.publicUrl;

  // Check how many images exist for this product
  const { count } = await supabase
    .from("product_images")
    .select("*", { count: "exact", head: true })
    .eq("product_id", id)
    .eq("company_id", companyId);

  const isFirst = (count ?? 0) === 0;

  // Insert into product_images table
  const { data: imageRow, error: insertError } = await supabase
    .from("product_images")
    .insert({
      company_id: companyId,
      product_id: id,
      url,
      sort_order: count ?? 0,
      is_primary: isFirst,
    })
    .select()
    .single();

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  // If this is the first/primary image, also update products.image_url for backwards compat
  if (isFirst) {
    await supabase
      .from("products")
      .update({ image_url: url })
      .eq("id", id)
      .eq("company_id", companyId);
  }

  return Response.json({ image: imageRow }, { status: 201 });
}

// PUT /api/admin/products/[id]/images — reorder or set primary
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  const { id } = await params;
  const supabase = createServiceClient();

  // Verify the product belongs to this company.
  const { data: ownerCheck } = await supabase
    .from("products")
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!ownerCheck) {
    return Response.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  let body: { images: { id: string; sort_order: number; is_primary: boolean }[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  // Update each image's sort_order and is_primary
  for (const img of body.images) {
    await supabase
      .from("product_images")
      .update({ sort_order: img.sort_order, is_primary: img.is_primary })
      .eq("id", img.id)
      .eq("product_id", id)
      .eq("company_id", companyId);
  }

  // Update products.image_url with the primary image
  const primary = body.images.find((i) => i.is_primary);
  if (primary) {
    const { data: primaryImg } = await supabase
      .from("product_images")
      .select("url")
      .eq("id", primary.id)
      .eq("company_id", companyId)
      .single();

    if (primaryImg) {
      await supabase
        .from("products")
        .update({ image_url: primaryImg.url })
        .eq("id", id)
        .eq("company_id", companyId);
    }
  }

  return Response.json({ success: true });
}

// DELETE /api/admin/products/[id]/images — delete an image by image_id query param
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  const { id } = await params;
  const imageId = request.nextUrl.searchParams.get("image_id");

  if (!imageId) {
    return Response.json({ error: "image_id requerido" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Get image record first — filter by company to prevent cross-tenant deletes.
  const { data: img } = await supabase
    .from("product_images")
    .select("*")
    .eq("id", imageId)
    .eq("product_id", id)
    .eq("company_id", companyId)
    .single();

  if (!img) {
    return Response.json({ error: "Imagen no encontrada" }, { status: 404 });
  }

  // Extract storage path from URL
  const bucketUrl = supabase.storage.from("product-images").getPublicUrl("").data.publicUrl;
  const storagePath = img.url.replace(bucketUrl, "");

  // Delete from storage (best effort)
  if (storagePath) {
    await supabase.storage.from("product-images").remove([storagePath]);
  }

  // Delete from table
  await supabase
    .from("product_images")
    .delete()
    .eq("id", imageId)
    .eq("company_id", companyId);

  // If it was primary, promote the next image
  if (img.is_primary) {
    const { data: next } = await supabase
      .from("product_images")
      .select("*")
      .eq("product_id", id)
      .eq("company_id", companyId)
      .order("sort_order")
      .limit(1)
      .single();

    if (next) {
      await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", next.id)
        .eq("company_id", companyId);
      await supabase
        .from("products")
        .update({ image_url: next.url })
        .eq("id", id)
        .eq("company_id", companyId);
    } else {
      // No more images
      await supabase
        .from("products")
        .update({ image_url: null })
        .eq("id", id)
        .eq("company_id", companyId);
    }
  }

  return Response.json({ success: true });
}
