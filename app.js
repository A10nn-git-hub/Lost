/**
 * LaptopTime Mini App - Core Interactive Application
 * iOS Liquid Glass & Tactile Micro-Interactions
 */

(function () {
  'use strict';

  // State Management
  const state = {
    currentTab: 'today',
    selectedDateKey: null,
    isTimelineStretched: false,
    timelineData: null,
    settings: {
      reportTime: '23:59',
      detailedTable: true,
      dailyTargetHours: 8,
      breakReminder: true,
      hapticFeedback: true,
      glassBlur: 'high',
      timezone: 'MSK'
    }
  };

  // Telegram WebApp Integration
  const tg = window.Telegram?.WebApp;
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#0a0e17');
      tg.setBackgroundColor('#0a0e17');
      document.body.classList.add('telegram-theme');
    } catch (e) {
      console.warn("Telegram WebApp API init:", e);
    }
  }

  function triggerHaptic(type = 'light') {
    if (!state.settings.hapticFeedback || !tg?.HapticFeedback) return;
    try {
      switch (type) {
        case 'light': tg.HapticFeedback.impactOccurred('light'); break;
        case 'medium': tg.HapticFeedback.impactOccurred('medium'); break;
        case 'heavy': tg.HapticFeedback.impactOccurred('heavy'); break;
        case 'selection': tg.HapticFeedback.selectionChanged(); break;
        case 'success': tg.HapticFeedback.notificationOccurred('success'); break;
        case 'warning': tg.HapticFeedback.notificationOccurred('warning'); break;
      }
    } catch (e) {}
  }

  // Utilities
  function formatSecondsHuman(sec) {
    if (!sec || sec <= 0) return '0м';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (hrs > 0) return `${hrs}ч ${mins}м`;
    return `${mins}м`;
  }

  function formatSecondsExact(sec) {
    if (!sec || sec <= 0) return '00:00:00';
    const hrs = Math.floor(sec / 3600).toString().padStart(2, '0');
    const mins = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${s}`;
  }

  function showToast(text, icon = '✅') {
    const banner = document.getElementById('toastBanner');
    if (!banner) return;
    banner.innerHTML = `<span>${icon}</span> <span>${text}</span>`;
    banner.classList.add('show');
    triggerHaptic('success');
    setTimeout(() => {
      banner.classList.remove('show');
    }, 2600);
  }

  // Load Settings from LocalStorage
  function loadSettings() {
    try {
      const saved = localStorage.getItem('laptop_miniapp_settings');
      if (saved) {
        state.settings = { ...state.settings, ...JSON.parse(saved) };
      }
    } catch (e) {}

    // Populate UI inputs
    const reportTimeInput = document.getElementById('settingReportTime');
    if (reportTimeInput) reportTimeInput.value = state.settings.reportTime;

    const detailedToggle = document.getElementById('settingDetailedTable');
    if (detailedToggle) detailedToggle.checked = state.settings.detailedTable;

    const targetSlider = document.getElementById('settingDailyTarget');
    const targetLabel = document.getElementById('targetHoursLabel');
    if (targetSlider) {
      targetSlider.value = state.settings.dailyTargetHours;
      if (targetLabel) targetLabel.textContent = `${state.settings.dailyTargetHours} ч`;
    }

    const breakToggle = document.getElementById('settingBreakReminder');
    if (breakToggle) breakToggle.checked = state.settings.breakReminder;

    const hapticToggle = document.getElementById('settingHaptic');
    if (hapticToggle) hapticToggle.checked = state.settings.hapticFeedback;
  }

  function saveSettings() {
    try {
      localStorage.setItem('laptop_miniapp_settings', JSON.stringify(state.settings));
    } catch (e) {}
  }

  // Data Loading (supports local window.LOCAL_TIMELINE_DATA and fetch)
  async function loadData() {
    // 1. Try local memory store first (instant, 0 CORS issues)
    if (window.LOCAL_TIMELINE_DATA && window.LOCAL_TIMELINE_DATA.days) {
      state.timelineData = window.LOCAL_TIMELINE_DATA;
      return state.timelineData;
    }

    // 2. Try fetch data.json
    try {
      const res = await fetch('./data.json');
      if (res.ok) {
        state.timelineData = await res.json();
        return state.timelineData;
      }
    } catch (e) {}

    // 3. Fallback dummy structure if file empty
    const todayStr = new Date().toISOString().split('T')[0];
    state.timelineData = {
      updatedAt: new Date().toISOString(),
      device: 'LAPTOP-USER',
      userId: '6278269178',
      days: {
        [todayStr]: {
          date: todayStr,
          displayDate: 'Сегодня',
          dayOfWeek: 'сегодня',
          activeSeconds: 14400,
          sleepSeconds: 3600,
          offSeconds: 30000,
          hibernateSeconds: 0,
          firstOn: '09:00:00',
          lastEvent: '15:00:00',
          currentState: 'включен',
          sessions: [
            { state: 'выключен', start: '00:00:00', end: '09:00:00', duration: '09:00:00', durationSeconds: 32400, startMinute: 0, endMinute: 540 },
            { state: 'включен', start: '09:00:00', end: '13:00:00', duration: '04:00:00', durationSeconds: 14400, startMinute: 540, endMinute: 780 },
            { state: 'сон', start: '13:00:00', end: '14:00:00', duration: '01:00:00', durationSeconds: 3600, startMinute: 780, endMinute: 840 },
            { state: 'включен', start: '14:00:00', end: '15:00:00', duration: '01:00:00', durationSeconds: 3600, startMinute: 840, endMinute: 900 }
          ]
        }
      }
    };
    return state.timelineData;
  }

  // Render Day Screen
  function renderDay(dateKey, containerPrefix = 'today') {
    if (!state.timelineData?.days) return;
    const day = state.timelineData.days[dateKey];
    if (!day) return;

    // Device / User Header
    const userBadge = document.getElementById('userGreeting');
    if (userBadge) {
      const tgUser = tg?.initDataUnsafe?.user?.first_name || 'Артемий';
      userBadge.textContent = `Привет, ${tgUser}`;
    }
    const deviceName = document.getElementById('deviceTitle');
    if (deviceName && state.timelineData.device) {
      deviceName.textContent = state.timelineData.device;
    }

    // Status pill
    const statusPill = document.getElementById(`${containerPrefix}StatusPill`);
    if (statusPill) {
      statusPill.className = 'status-pill';
      if (day.currentState === 'включен') {
        statusPill.textContent = '🟢 В сети (Активен)';
      } else if (day.currentState === 'сон') {
        statusPill.classList.add('sleep');
        statusPill.textContent = '💤 Спящий режим';
      } else if (day.currentState === 'гибернация') {
        statusPill.classList.add('sleep');
        statusPill.textContent = '🧊 Гибернация';
      } else {
        statusPill.classList.add('off');
        statusPill.textContent = '🔌 Выключен';
      }
    }

    // Big Active Stats
    const bigStat = document.getElementById(`${containerPrefix}BigStat`);
    if (bigStat) bigStat.textContent = formatSecondsHuman(day.activeSeconds);

    const bigStatExact = document.getElementById(`${containerPrefix}BigStatExact`);
    if (bigStatExact) bigStatExact.textContent = formatSecondsExact(day.activeSeconds);

    // Daily Target Progress
    const targetSeconds = (state.settings.dailyTargetHours || 8) * 3600;
    const progressPercent = Math.min(100, Math.round((day.activeSeconds / targetSeconds) * 100));
    const targetLabel = document.getElementById(`${containerPrefix}TargetPercent`);
    if (targetLabel) targetLabel.textContent = `${progressPercent}%`;

    const targetBarFill = document.getElementById(`${containerPrefix}TargetBarFill`);
    if (targetBarFill) targetBarFill.style.width = `${progressPercent}%`;

    // Metrics 2x2 Grid
    const firstOn = document.getElementById(`${containerPrefix}FirstOn`);
    if (firstOn) firstOn.textContent = day.firstOn || '—';

    const lastEvent = document.getElementById(`${containerPrefix}LastEvent`);
    if (lastEvent) lastEvent.textContent = day.lastEvent || '—';

    const sleepDuration = document.getElementById(`${containerPrefix}SleepDuration`);
    if (sleepDuration) sleepDuration.textContent = formatSecondsHuman(day.sleepSeconds + day.hibernateSeconds);

    const offDuration = document.getElementById(`${containerPrefix}OffDuration`);
    if (offDuration) offDuration.textContent = formatSecondsHuman(day.offSeconds);

    // 24-Hour Timeline Bar Rendering
    const timelineBar = document.getElementById(`${containerPrefix}TimelineBar`);
    if (timelineBar) {
      timelineBar.innerHTML = '';
      const totalMinutes = 1440; // 24 hours

      (day.sessions || []).forEach((session, idx) => {
        const seg = document.createElement('div');
        seg.className = 'timeline-segment';

        // State class
        if (session.state === 'включен') seg.classList.add('segment-on');
        else if (session.state === 'сон') seg.classList.add('segment-sleep');
        else if (session.state === 'гибернация') seg.classList.add('segment-hibernate');
        else seg.classList.add('segment-off');

        // Width in percentage
        const durationMin = session.endMinute - session.startMinute;
        const widthPercent = (durationMin / totalMinutes) * 100;
        seg.style.width = `${Math.max(0.25, widthPercent)}%`;

        // Interactivity: tap/click for floating tooltip
        seg.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerHaptic('light');
          showSegmentTooltip(seg, session, containerPrefix);
        });

        timelineBar.appendChild(seg);
      });
    }

    // Sessions Detailed List
    const sessionList = document.getElementById(`${containerPrefix}SessionsList`);
    if (sessionList) {
      sessionList.innerHTML = '';
      (day.sessions || []).slice().reverse().forEach((session) => {
        const item = document.createElement('div');
        item.className = 'session-item';

        let iconClass = 'icon-off';
        let iconEmoji = '🔌';
        if (session.state === 'включен') { iconClass = 'icon-on'; iconEmoji = '⚡'; }
        else if (session.state === 'сон') { iconClass = 'icon-sleep'; iconEmoji = '💤'; }
        else if (session.state === 'гибернация') { iconClass = 'icon-hibernate'; iconEmoji = '🧊'; }

        item.innerHTML = `
          <div class="session-left">
            <div class="session-icon ${iconClass}">${iconEmoji}</div>
            <div>
              <div class="session-meta-time">${session.start} – ${session.end}</div>
              <div class="session-meta-state">${session.state}</div>
            </div>
          </div>
          <div class="session-dur">${session.duration}</div>
        `;

        item.addEventListener('click', () => {
          triggerHaptic('selection');
        });

        sessionList.appendChild(item);
      });
    }
  }

  // Floating Tooltip for 24-Hour Bar
  function showSegmentTooltip(segmentEl, session, containerPrefix) {
    let tooltip = document.getElementById(`${containerPrefix}Tooltip`);
    if (!tooltip) return;

    tooltip.innerHTML = `
      <strong>${session.state.toUpperCase()}</strong>: ${session.start} – ${session.end} (${session.duration})
    `;

    const barRect = segmentEl.parentElement.getBoundingClientRect();
    const segRect = segmentEl.getBoundingClientRect();
    const centerOffset = (segRect.left + segRect.width / 2) - barRect.left;

    tooltip.style.left = `${centerOffset}px`;
    tooltip.classList.add('show');

    clearTimeout(tooltip._timer);
    tooltip._timer = setTimeout(() => {
      tooltip.classList.remove('show');
    }, 3200);
  }

  // Render History Days Selector Chips
  function renderHistoryChips() {
    const chipContainer = document.getElementById('historyDaysScroll');
    if (!chipContainer || !state.timelineData?.days) return;

    chipContainer.innerHTML = '';
    const sortedDates = Object.keys(state.timelineData.days).sort().reverse();

    sortedDates.forEach((dateKey, index) => {
      const day = state.timelineData.days[dateKey];
      const chip = document.createElement('div');
      chip.className = 'day-chip';
      if (dateKey === state.selectedDateKey) chip.classList.add('active');

      const dateObj = new Date(dateKey);
      const dayNum = dateObj.getDate();

      chip.innerHTML = `
        <div class="day-chip-name">${day.dayOfWeek || ''}</div>
        <div class="day-chip-num">${dayNum}</div>
        <div class="day-chip-dur">${formatSecondsHuman(day.activeSeconds)}</div>
      `;

      chip.addEventListener('click', () => {
        triggerHaptic('selection');
        state.selectedDateKey = dateKey;
        document.querySelectorAll('.day-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderDay(dateKey, 'history');

        const titleEl = document.getElementById('historySelectedDateTitle');
        if (titleEl) titleEl.textContent = `Активность за ${day.displayDate}`;
      });

      chipContainer.appendChild(chip);
    });

    // Select first chip by default if not set
    if (!state.selectedDateKey && sortedDates.length > 0) {
      state.selectedDateKey = sortedDates[0];
      const firstChip = chipContainer.children[0];
      if (firstChip) firstChip.classList.add('active');
      renderDay(state.selectedDateKey, 'history');
      const titleEl = document.getElementById('historySelectedDateTitle');
      if (titleEl) titleEl.textContent = `Активность за ${state.timelineData.days[state.selectedDateKey].displayDate}`;
    }
  }

  // Tab Navigation Handling
  function initTabs() {
    const dockButtons = document.querySelectorAll('.dock-btn');
    dockButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (targetTab === state.currentTab) return;

        triggerHaptic('medium');
        state.currentTab = targetTab;

        // Switch button states
        dockButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Switch tab views
        document.querySelectorAll('.tab-content').forEach(view => view.classList.remove('active'));
        const activeView = document.getElementById(`tab-${targetTab}`);
        if (activeView) activeView.classList.add('active');

        // Window scroll to top smoothly
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (targetTab === 'history') {
          renderHistoryChips();
        }
      });
    });
  }

  // 24-Hour Timeline Stretch Interaction
  function initTimelineStretch() {
    ['today', 'history'].forEach(prefix => {
      const btn = document.getElementById(`${prefix}StretchBtn`);
      const track = document.getElementById(`${prefix}TimelineTrack`);
      if (btn && track) {
        btn.addEventListener('click', () => {
          triggerHaptic('light');
          state.isTimelineStretched = !state.isTimelineStretched;
          track.classList.toggle('stretched', state.isTimelineStretched);
          btn.textContent = state.isTimelineStretched ? 'Сжать 🤏' : 'Растянуть ↔';
          showToast(state.isTimelineStretched ? 'Шкала растянута' : 'Шкала сжата', '🔍');
        });
      }
    });
  }

  // Settings Events
  function initSettings() {
    // Report Time Picker
    const reportTime = document.getElementById('settingReportTime');
    if (reportTime) {
      reportTime.addEventListener('change', (e) => {
        state.settings.reportTime = e.target.value;
        saveSettings();
        triggerHaptic('selection');
        showToast(`Время отчета: ${e.target.value}`, '⏰');
      });
    }

    // Detailed Table Toggle
    const detailedToggle = document.getElementById('settingDetailedTable');
    if (detailedToggle) {
      detailedToggle.addEventListener('change', (e) => {
        state.settings.detailedTable = e.target.checked;
        saveSettings();
        triggerHaptic('light');
        showToast(e.target.checked ? 'Полная таблица включена' : 'Краткий дайджест', '📋');
      });
    }

    // Daily Target Hours Slider
    const targetSlider = document.getElementById('settingDailyTarget');
    const targetLabel = document.getElementById('targetHoursLabel');
    if (targetSlider) {
      targetSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        state.settings.dailyTargetHours = val;
        if (targetLabel) targetLabel.textContent = `${val} ч`;
        saveSettings();
        // Re-render today's progress bar immediately
        const todayKey = Object.keys(state.timelineData?.days || {}).sort().reverse()[0];
        if (todayKey) renderDay(todayKey, 'today');
      });
    }

    // Break Reminder Toggle
    const breakToggle = document.getElementById('settingBreakReminder');
    if (breakToggle) {
      breakToggle.addEventListener('change', (e) => {
        state.settings.breakReminder = e.target.checked;
        saveSettings();
        triggerHaptic('light');
        showToast(e.target.checked ? 'Напоминания об отдыхе включены' : 'Напоминания отключены', '☕');
      });
    }

    // Haptic Feedback Toggle
    const hapticToggle = document.getElementById('settingHaptic');
    if (hapticToggle) {
      hapticToggle.addEventListener('change', (e) => {
        state.settings.hapticFeedback = e.target.checked;
        saveSettings();
        if (e.target.checked) triggerHaptic('medium');
        showToast(e.target.checked ? 'Виброотклик включен' : 'Виброотклик выключен', '📳');
      });
    }

    // Firebase Connect Button
    const btnSaveFirebase = document.getElementById('btnSaveFirebase');
    if (btnSaveFirebase) {
      btnSaveFirebase.addEventListener('click', async () => {
        triggerHaptic('medium');
        const projectId = document.getElementById('fbProjectId')?.value || '';
        const apiKey = document.getElementById('fbApiKey')?.value || '';

        if (!projectId || !apiKey) {
          showToast('Введите Project ID и API Key', '⚠️');
          return;
        }

        if (window.firebaseAdapter) {
          const success = await window.firebaseAdapter.saveConfig(apiKey, projectId);
          if (success) {
            showToast('Firebase успешно подключен!', '🔥');
            const badge = document.getElementById('firebaseStatusBadge');
            if (badge) badge.textContent = 'Подключено к Firebase';
          } else {
            showToast('Конфигурация сохранена', '💾');
          }
        }
      });
    }

    // Sync Now Button
    const btnSyncNow = document.getElementById('btnSyncNow');
    if (btnSyncNow) {
      btnSyncNow.addEventListener('click', async () => {
        triggerHaptic('medium');
        btnSyncNow.disabled = true;
        btnSyncNow.textContent = 'Синхронизация...';

        await loadData();
        const dates = Object.keys(state.timelineData?.days || {}).sort().reverse();
        if (dates.length > 0) {
          renderDay(dates[0], 'today');
          renderHistoryChips();
        }

        setTimeout(() => {
          btnSyncNow.disabled = false;
          btnSyncNow.textContent = 'Синхронизировать сейчас';
          showToast('Данные актуальны', '🔄');
        }, 600);
      });
    }

    // Export JSON
    const btnExportJson = document.getElementById('btnExportJson');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => {
        triggerHaptic('light');
        const jsonStr = JSON.stringify(state.timelineData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `laptop-timeline-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('JSON успешно скачан', '📥');
      });
    }

    // Export CSV
    const btnExportCsv = document.getElementById('btnExportCsv');
    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', () => {
        triggerHaptic('light');
        let csv = 'Дата,День,Время_работы_сек,Время_сна_сек,Выключен_сек,Первое_вкл,Последнее_событие\n';
        const days = state.timelineData?.days || {};
        Object.keys(days).sort().forEach(date => {
          const d = days[date];
          csv += `${d.date},${d.dayOfWeek},${d.activeSeconds},${d.sleepSeconds},${d.offSeconds},${d.firstOn},${d.lastEvent}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `laptop-timeline-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('CSV успешно скачан', '📊');
      });
    }
  }

  // App Initialization
  async function init() {
    loadSettings();
    initTabs();
    initTimelineStretch();
    initSettings();

    const data = await loadData();
    const sortedDates = Object.keys(data.days || {}).sort().reverse();
    if (sortedDates.length > 0) {
      // First date is today
      renderDay(sortedDates[0], 'today');
      // Set history default
      state.selectedDateKey = sortedDates[0];
      renderHistoryChips();
    }
  }

  // Boot up when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
