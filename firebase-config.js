/**
 * LaptopTime Mini App - Firebase Configuration & Cloud Sync Adapter
 * 
 * ИНСТРУКЦИЯ ПО ПОДКЛЮЧЕНИЮ:
 * 1. Перейдите на https://console.firebase.google.com/ и создайте бесплатный проект (например, "laptop-time-app").
 * 2. Создайте Web App (значок </>), скопируйте объект конфигурации firebaseConfig и вставьте его значения ниже.
 * 3. В разделе "Firestore Database" нажмите "Создать базу данных" (выберите тестовый режим / Cloud Firestore).
 * 4. Сохраните этот файл. Теперь Mini App будет автоматически синхронизироваться с облаком 24/7!
 */

const FIREBASE_DEFAULT_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

class FirebaseSyncAdapter {
  constructor() {
    this.isConfigured = false;
    this.db = null;
    this.init();
  }

  init() {
    const savedConfig = localStorage.getItem("laptop_firebase_config");
    const config = savedConfig ? JSON.parse(savedConfig) : FIREBASE_DEFAULT_CONFIG;

    if (config.apiKey && config.projectId && window.firebase) {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(config);
        }
        this.db = firebase.firestore();
        this.isConfigured = true;
        console.log("🔥 Firebase Firestore успешно подключен к проекту:", config.projectId);
      } catch (err) {
        console.warn("⚠️ Ошибка инициализации Firebase:", err);
      }
    } else {
      console.log("ℹ️ Firebase не настроен. Mini App работает в локальном режиме с data.json.");
    }
  }

  async saveConfig(apiKey, projectId) {
    const config = {
      ...FIREBASE_DEFAULT_CONFIG,
      apiKey: apiKey.trim(),
      projectId: projectId.trim(),
      authDomain: `${projectId.trim()}.firebaseapp.com`
    };
    localStorage.setItem("laptop_firebase_config", JSON.stringify(config));
    this.init();
    return this.isConfigured;
  }

  async fetchRemoteData(userId) {
    if (!this.isConfigured || !this.db) return null;
    try {
      const doc = await this.db.collection("laptop_timeline").doc(userId).get();
      if (doc.exists) {
        return doc.data();
      }
    } catch (err) {
      console.error("Ошибка чтения из Firebase:", err);
    }
    return null;
  }

  async uploadData(userId, data) {
    if (!this.isConfigured || !this.db) return false;
    try {
      await this.db.collection("laptop_timeline").doc(userId).set(data, { merge: true });
      return true;
    } catch (err) {
      console.error("Ошибка загрузки в Firebase:", err);
      return false;
    }
  }
}

window.firebaseAdapter = new FirebaseSyncAdapter();
