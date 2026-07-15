function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function enableAdminPush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, message: 'هذا الجهاز لا يدعم الإشعارات' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, message: 'لم يتم السماح بالإشعارات' };

  const reg = await navigator.serviceWorker.register('/admin-sw.js', { scope: '/' });
  await reg.update().catch(() => null);

  const keyRes = await fetch('/api/employee/push/public-key', {
    headers: { Authorization: `Bearer ${localStorage.getItem('cc_token') || localStorage.getItem('token') || ''}` },
  });
  const keyData = await keyRes.json();
  if (!keyData.publicKey) return { ok: false, message: 'مفتاح الإشعارات غير موجود' };

  const oldSub = await reg.pushManager.getSubscription();
  if (oldSub) await oldSub.unsubscribe().catch(() => null);

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
  });

  const saveRes = await fetch('/api/employee/push/subscribe', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('cc_token') || localStorage.getItem('token') || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subscription: sub }),
  });

  const saveData = await saveRes.json().catch(() => ({}));
  if (!saveRes.ok) return { ok: false, message: saveData.message || 'تعذر حفظ الإشعارات' };

  localStorage.setItem('admin_push_enabled', '1');
  return { ok: true, message: 'تم تفعيل إشعارات الأدمن' };
}
