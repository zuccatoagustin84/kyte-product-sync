/**
 * Kyte Token Extractor
 * --------------------
 * Pegar este script en la consola del navegador (F12 > Console)
 * estando logueado en https://web.kyteapp.com
 *
 * Muestra el token, uid, aid y el comando listo para copiar y pegar.
 */
(async function() {
  const token = localStorage.getItem('kyte_token');
  if (!token) {
    console.error('ERROR: No kyte_token encontrado. Asegurate de estar logueado en https://web.kyteapp.com');
    return;
  }

  // Decodificar token
  const decoded = atob(token);
  const parts = decoded.split('.');
  const aid = parts[0].replace('kyte_', '');
  let uid = '?', exp = '?';
  try {
    let payload_b64 = parts[2];
    payload_b64 += '='.repeat(4 - payload_b64.length % 4);
    const payload = JSON.parse(atob(payload_b64));
    uid = payload.uid;
    exp = new Date(payload.exp * 1000).toLocaleDateString();
  } catch(e) {}

  // Extraer refresh token de IndexedDB (Firebase)
  let refreshToken = null;
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('firebaseLocalStorageDb');
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = reject;
    });
    const tx = db.transaction('firebaseLocalStorage', 'readonly');
    const store = tx.objectStore('firebaseLocalStorage');
    const items = await new Promise(resolve => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
    });
    for (const item of items) {
      if (item.value?.stsTokenManager?.refreshToken) {
        refreshToken = item.value.stsTokenManager.refreshToken;
        break;
      }
    }
  } catch(e) {
    console.warn('No se pudo leer IndexedDB para refresh token:', e);
  }

  // Output
  console.log('\n=== KYTE TOKEN ===');
  console.log('Token:', token);
  console.log('UID:', uid);
  console.log('AID:', aid);
  console.log('Expira:', exp);
  if (refreshToken) {
    console.log('\n=== REFRESH TOKEN (para renovación automática) ===');
    console.log('Refresh Token:', refreshToken);
  }
  console.log('\n=== COMANDO LISTO ===');
  console.log(`python sync_prices_api.py --source "LISTA DISTRIBUCION.xlsx" --token "${token}" --dry-run`);
  console.log('\n=== PARA GUARDAR EN ARCHIVO ===');
  console.log(`echo ${token} > .kyte_token`);

  // Copiar token al clipboard
  navigator.clipboard.writeText(token).then(
    () => console.log('\n>> Token copiado al portapapeles!'),
    () => console.log('\n>> No se pudo copiar al portapapeles, copia manualmente el token de arriba.')
  );
})();
