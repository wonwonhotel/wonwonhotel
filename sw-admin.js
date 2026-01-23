// 汪汪犬旅後台 Service Worker
const CACHE_NAME = 'wanwan-admin-v3';
const urlsToCache = [
  './',
  './admin.html',
  './logo.png',
  './manifest-admin.json',
  './入住須知.jpg'
];

// 安裝 Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting(); // 強制跳過等待，立即啟用新版

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Admin SW] Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.log('[Admin SW] Cache failed:', error);
      })
  );
  self.skipWaiting();
});

// 啟動 Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // 只清理以 'wanwan-admin-' 開頭的舊快取
          if (cacheName.startsWith('wanwan-admin-') && cacheName !== CACHE_NAME) {
            console.log('[Admin SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 攔截請求
self.addEventListener('fetch', (event) => {
  // 跳過非 GET 請求
  if (event.request.method !== 'GET') return;
  
  // 跳過 Supabase API 請求（需要即時資料）
  if (event.request.url.includes('supabase.co')) return;
  
  // 跳過 CDN 資源（讓瀏覽器處理）
  if (event.request.url.includes('cdn.') || 
      event.request.url.includes('unpkg.com') ||
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('google.com/recaptcha')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 如果有快取，返回快取
        if (response) {
          return response;
        }

        // 否則發送網路請求
        return fetch(event.request).then((response) => {
          // 檢查是否為有效回應
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // 複製回應（因為回應只能使用一次）
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
      .catch(() => {
        // 離線時返回 admin.html
        return caches.match('./admin.html');
      })
  );
});

// ===== Web Push 推送通知 =====

// 處理推送通知
self.addEventListener('push', (event) => {
  console.log('[Admin SW] Push received:', event);
  
  let notificationData = {
    title: '汪汪犬旅後台',
    body: '您有新的通知',
    icon: './logo.png',
    badge: './logo.png',
    tag: 'wanwan-admin-notification',
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    data: {
      url: './admin.html',
      timestamp: Date.now()
    },
    actions: [
      { action: 'view', title: '查看詳情', icon: './logo.png' },
      { action: 'dismiss', title: '稍後處理' }
    ]
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = {
        ...notificationData,
        title: payload.title || notificationData.title,
        body: payload.body || notificationData.body,
        tag: payload.tag || notificationData.tag,
        data: {
          ...notificationData.data,
          ...payload.data,
          url: payload.url || notificationData.data.url
        }
      };
    } catch (e) {
      // 如果不是 JSON，使用純文字
      notificationData.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      renotify: notificationData.renotify,
      requireInteraction: notificationData.requireInteraction,
      vibrate: notificationData.vibrate,
      data: notificationData.data,
      actions: notificationData.actions
    })
  );
});

// 點擊通知
self.addEventListener('notificationclick', (event) => {
  console.log('[Admin SW] Notification clicked:', event.action);
  event.notification.close();

  // 處理不同的操作按鈕
  if (event.action === 'dismiss') {
    return; // 只關閉通知
  }

  const urlToOpen = event.notification.data?.url || './admin.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 檢查是否已有開啟的後台視窗
      for (const client of clientList) {
        if (client.url.includes('admin.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // 如果沒有，開啟新視窗
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// 通知關閉事件
self.addEventListener('notificationclose', (event) => {
  console.log('[Admin SW] Notification closed:', event.notification.tag);
});

// 處理推送訂閱變更
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[Admin SW] Push subscription changed');
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self.VAPID_PUBLIC_KEY
    }).then((subscription) => {
      // 這裡可以將新的訂閱資訊發送到伺服器
      console.log('[Admin SW] New subscription:', subscription);
    })
  );
});

// 接收來自主頁面的訊息
self.addEventListener('message', (event) => {
  console.log('[Admin SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, url } = event.data;
    self.registration.showNotification(title || '汪汪犬旅後台', {
      body: body || '您有新的通知',
      icon: './logo.png',
      badge: './logo.png',
      tag: 'wanwan-admin-local-notification',
      vibrate: [200, 100, 200],
      data: { url: url || './admin.html' }
    });
  }
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

