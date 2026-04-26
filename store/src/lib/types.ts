export interface Category {
  id: string;
  name: string;
  sort_order: number;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  thumb_url?: string | null;
  medium_url?: string | null;
  width?: number | null;
  height?: number | null;
  source?: string | null;
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
  thumb_image_url?: string | null;
  medium_image_url?: string | null;
  description: string | null;
  active: boolean;
  sort_order: number;
  stock: number | null;
  min_order: number | null;
  slug: string | null;
  tags: string[] | null;
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

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type OrderChannel = "pos" | "catalog" | "whatsapp" | "instagram" | "manual";

export type PaymentMethod =
  | "efectivo"
  | "tarjeta"
  | "transferencia"
  | "mercadopago"
  | "credito_cliente"
  | "otro";

export type PaymentStatus = "pending" | "partial" | "paid";

export interface Order {
  id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_company: string | null;
  seller_user_id: string | null;
  channel: OrderChannel;
  subtotal: number | null;
  discount_total: number;
  shipping_total: number;
  tax_total: number;
  total: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  notes: string | null;
  notes_internal: string | null;
  order_number: number | null;
  created_at: string;
  fulfilled_at: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_code: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
  discount_amount: number;
  cost_snapshot: number | null;
}

export interface OrderPayment {
  id: string;
  order_id: string;
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  paid_at: string;
  created_by: string | null;
  notes: string | null;
}

export interface Customer {
  id: string;
  name: string;
  doc_id: string | null;
  email: string | null;
  phone: string | null;
  phone_alt: string | null;
  address: string | null;
  address_complement: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  tax_condition: string | null;
  allow_pay_later: boolean;
  credit_limit: number | null;
  balance: number;
  user_id: string | null;
  tags: string[] | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerLedgerEntry {
  id: string;
  customer_id: string;
  entry_type:
    | "sale"
    | "payment"
    | "credit_add"
    | "credit_sub"
    | "refund"
    | "adjust";
  amount: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  payment_method: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  doc_id: string | null;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface Expense {
  id: string;
  name: string;
  supplier_id: string | null;
  category_id: string | null;
  amount: number;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  status: "pending" | "paid" | "overdue" | "cancelled";
  notes: string | null;
  attachment_url: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
  recurrence_until: string | null;
  parent_expense_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  supplier?: Supplier | null;
  category?: ExpenseCategory | null;
}

export interface UserPermissions {
  user_id: string;
  is_admin: boolean;
  allow_personal_device: boolean;
  view_other_users_transactions: boolean;
  give_discounts: boolean;
  register_products: boolean;
  manage_stock: boolean;
  enable_pay_later: boolean;
  manage_expenses: boolean;
  view_analytics: boolean;
  commission_rate: number | null;
  updated_at: string;
}
