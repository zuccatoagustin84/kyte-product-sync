-- Admin/operador pueden leer todos los pedidos (y sus relaciones) desde el panel admin.
-- Sin este policy, la página /admin/pedidos queda vacía porque RLS solo permite
-- que cada usuario vea sus propios pedidos.

CREATE POLICY "Admin/operador can read all orders"
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'operador')
    )
  );

CREATE POLICY "Admin/operador can read all order_items"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'operador')
    )
  );

CREATE POLICY "Admin/operador can read order_payments"
  ON order_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'operador')
    )
  );

CREATE POLICY "Admin/operador can read order_status_history"
  ON order_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'operador')
    )
  );
