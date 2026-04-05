export interface Category {
  id: string;
  name: string;
  sort_order: number;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  kyte_id: string | null;
  name: string;
  code: string | null;
  category_id: string | null;
  sale_price: number;
  cost_price: number | null;
  image_url: string | null;
  description: string | null;
  active: boolean;
  sort_order: number;
  stock: number | null;
  min_order: number | null;
  slug: string | null;
  category?: Category;
  images?: ProductImage[];
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderPayload {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_company: string;
  notes: string;
  items: {
    product_id: string;
    product_name: string;
    product_code: string | null;
    unit_price: number;
    quantity: number;
    subtotal: number;
  }[];
  total: number;
}

export interface Order {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_company: string | null;
  notes: string | null;
  status: "pending" | "confirmed" | "cancelled";
  total: number;
  created_at: string;
}
