/**
 * LaptopTime Mini App - Core Interactive Application
 * iOS Liquid Glass & Tactile Micro-Interactions
 *
 * Implements all 13 agreed advanced settings:
 * 13: Accent Themes (Emerald, Sapphire, Amethyst, Sunset, Rose)
 * 14: Glass Blur intensity slider (10-40px)
 * 15: Density selector (Comfortable / Compact)
 * 16: Spring Physics (Rubber, Snappy, Smooth)
 * 17: Ambient Glow Orbs toggle
 * 18: Duration Format (Human / Exact)
 * 19: Ignore Micro-Wakeups (< 2 min filter)
 * 20: Smart Session Merge (0, 2, 5 min pause merging)
 * 21: Hibernate interpretation (Cyan separate vs Off)
 * 22: Timeline View Mode (Full 24h vs Active Work-hours)
 * 23: Data Retention period (14, 30, 90, All days)
 * 25: Auto backup to Telegram toggle
 * 27: Multi-PC device profile switcher
 */

(function () {
  'use strict';

  // Global Application State
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
      // 13 Advanced Settings
      accentColor: 'emerald',      // 13
      glassBlur: 24,               // 14
      density: 'comfortable',      // 15
      springPhysics: 'rubber',     // 16
      ambientGlow: true,           // 17
      durationFormat: 'human',     // 18
      ignoreMicro: true,           // 19
      sessionMerge: 5,             // 20
      hibernateMode: 'cyan',       // 21
      timelineMode: 'full',        // 22
      dataRetention: '30',         // 23
      autoBackup: true,            // 25
      activeDevice: 'primary',     // 27
      // Feature 10: Parental Weekly Score & Bedtime Curfew
      weeklyScore: true,
      weeklyScoreTime: '20:00',
      curfewTime: '22:30'
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
      console.warn('Telegram WebApp API init:', e);
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

  // Duration Formatting Helpers
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
    clearTimeout(banner._toastTimer);
    banner._toastTimer = setTimeout(() => {
      banner.classList.remove('show');
    }, 2400);
  }

  // Process raw day data according to active filters (Micro-wakeups, Smart Merge, Hibernate)
  function getProcessedDay(rawDay) {
    if (!rawDay) return null;
    const day = JSON.parse(JSON.stringify(rawDay));
    let sessions = day.sessions || [];

    // Setting 21: Hibernate interpretation
    if (state.settings.hibernateMode === 'off') {
      sessions.forEach(s => {
        if (s.state === 'гибернация') s.state = 'выключен';
      });
      if (day.currentState === 'гибернация') {
        day.currentState = 'выключен';
      }
    }

    // Setting 19: Ignore micro-wakeups (< 2 minutes = 120s)
    if (state.settings.ignoreMicro && sessions.length > 1) {
      const filtered = [];
      for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i];
        const isLastSession = (i === sessions.length - 1);
        if (s.state === 'включен' && s.durationSeconds < 120 && !isLastSession) {
          const prev = filtered[filtered.length - 1];
          const next = sessions[i + 1];
          if (prev) {
            prev.end = s.end;
            prev.endMinute = s.endMinute;
            prev.durationSeconds += s.durationSeconds;
            prev.duration = formatSecondsExact(prev.durationSeconds);
            continue;
          } else if (next) {
            s.state = next.state;
          }
        }
        filtered.push(s);
      }
      sessions = filtered;
    }

    // Setting 20: Smart session merging (merge short pause <= N minutes)
    const mergeThresholdSec = (parseInt(state.settings.sessionMerge, 10) || 0) * 60;
    if (mergeThresholdSec > 0 && sessions.length > 2) {
      const merged = [];
      for (let i = 0; i < sessions.length; i++) {
        const curr = sessions[i];
        if (
          merged.length > 0 &&
          curr.state === 'сон' &&
          curr.durationSeconds <= mergeThresholdSec &&
          i < sessions.length - 1 &&
          merged[merged.length - 1].state === 'включен' &&
          sessions[i + 1].state === 'включен'
        ) {
          const prev = merged[merged.length - 1];
          const next = sessions[i + 1];
          prev.end = next.end;
          prev.endMinute = next.endMinute;
          prev.durationSeconds += curr.durationSeconds + next.durationSeconds;
          prev.duration = formatSecondsExact(prev.durationSeconds);
          i++; // Skip merged next session
          continue;
        }
        merged.push(curr);
      }
      sessions = merged;
    }

    // Consolidate adjacent identical states
    const consolidated = [];
    for (const s of sessions) {
      if (consolidated.length > 0 && consolidated[consolidated.length - 1].state === s.state) {
        const prev = consolidated[consolidated.length - 1];
        prev.end = s.end;
        prev.endMinute = s.endMinute;
        prev.durationSeconds += s.durationSeconds;
        prev.duration = formatSecondsExact(prev.durationSeconds);
      } else {
        consolidated.push(s);
      }
    }
    day.sessions = consolidated;

    // Recalculate summary metrics from updated sessions
    let activeSec = 0;
    let sleepSec = 0;
    let hibernateSec = 0;
    let offSec = 0;

    consolidated.forEach(s => {
      if (s.state === 'включен') activeSec += s.durationSeconds;
      else if (s.state === 'сон') sleepSec += s.durationSeconds;
      else if (s.state === 'гибернация') hibernateSec += s.durationSeconds;
      else offSec += s.durationSeconds;
    });

    day.activeSeconds = activeSec;
    day.sleepSeconds = sleepSec;
    day.hibernateSeconds = hibernateSec;
    day.offSeconds = offSec;

    return day;
  }

  // Device UI Sync Helper
  function updateDeviceUI(deviceKey) {
    const deviceTitle = document.getElementById('deviceTitle');
    const deviceBadge = document.getElementById('deviceSelectorBtn');
    const deviceSelect = document.getElementById('settingActiveDevice');
    const profileName = document.getElementById('settingsProfileName');
    const profileSub = document.getElementById('settingsProfileSub');

    const tgUser = tg?.initDataUnsafe?.user?.first_name || 'Артемий';
    if (profileName) profileName.textContent = tgUser;

    let devName = 'Мой Ноутбук';
    if (deviceKey === 'desktop') {
      devName = 'Домашний ПК';
      if (deviceTitle) deviceTitle.textContent = devName;
      if (deviceBadge) deviceBadge.textContent = '🖥 ПК ▼';
    } else {
      devName = state.timelineData?.device || 'Мой Ноутбук';
      if (deviceTitle) deviceTitle.textContent = devName;
      if (deviceBadge) deviceBadge.textContent = '💻 Ноутбук ▼';
    }

    if (profileSub) profileSub.textContent = `${devName} • Windows 11 • В сети`;
    if (deviceSelect) deviceSelect.value = deviceKey;
  }

  // Visual Theme & UI Application
  function applyVisualSettings() {
    // 13: Accent Theme
    const theme = state.settings.accentColor || 'emerald';
    if (theme === 'emerald') {
      document.body.removeAttribute('data-theme');
    } else {
      document.body.setAttribute('data-theme', theme);
    }
    document.querySelectorAll('.color-circle').forEach(circle => {
      circle.classList.toggle('active', circle.getAttribute('data-color') === theme);
    });

    // 14: Glass Blur
    const blur = state.settings.glassBlur || 24;
    document.documentElement.style.setProperty('--glass-blur', `${blur}px`);
    const blurLabel = document.getElementById('blurValLabel');
    if (blurLabel) blurLabel.textContent = `${blur}px`;
    const blurInput = document.getElementById('settingGlassBlur');
    if (blurInput) blurInput.value = blur;

    // 15: Density
    const isCompact = state.settings.density === 'compact';
    document.body.classList.toggle('density-compact', isCompact);
    const densitySelect = document.getElementById('settingDensity');
    if (densitySelect) densitySelect.value = state.settings.density || 'comfortable';

    // 16: Spring Physics
    const spring = state.settings.springPhysics || 'rubber';
    document.body.setAttribute('data-spring', spring);
    const springSelect = document.getElementById('settingSpring');
    if (springSelect) springSelect.value = spring;

    // 17: Ambient Glow
    const showGlow = state.settings.ambientGlow !== false;
    document.body.classList.toggle('hide-ambient', !showGlow);
    const glowToggle = document.getElementById('settingAmbientGlow');
    if (glowToggle) glowToggle.checked = showGlow;

    // 18: Duration Format select
    const durFormatSelect = document.getElementById('settingDurationFormat');
    if (durFormatSelect) durFormatSelect.value = state.settings.durationFormat || 'human';

    // 19: Ignore Micro
    const ignoreMicroToggle = document.getElementById('settingIgnoreMicro');
    if (ignoreMicroToggle) ignoreMicroToggle.checked = state.settings.ignoreMicro !== false;

    // 20: Session Merge
    const sessionMergeSelect = document.getElementById('settingSessionMerge');
    if (sessionMergeSelect) sessionMergeSelect.value = (state.settings.sessionMerge !== undefined ? state.settings.sessionMerge : 5).toString();

    // 21: Hibernate Mode
    const hibSelect = document.getElementById('settingHibernateMode');
    if (hibSelect) hibSelect.value = state.settings.hibernateMode || 'cyan';

    // 22: Timeline Mode
    const tlModeSelect = document.getElementById('settingTimelineMode');
    if (tlModeSelect) tlModeSelect.value = state.settings.timelineMode || 'full';

    // 23: Data Retention
    const retentionSelect = document.getElementById('settingDataRetention');
    if (retentionSelect) retentionSelect.value = state.settings.dataRetention || '30';

    // 25: Auto Backup
    const backupToggle = document.getElementById('settingAutoBackup');
    if (backupToggle) backupToggle.checked = state.settings.autoBackup !== false;

    // 27: Device
    updateDeviceUI(state.settings.activeDevice || 'primary');
    window._updateCustomSelectLabels?.();
  }

  // Load Settings from LocalStorage
  function loadSettings() {
    try {
      const saved = localStorage.getItem('laptop_miniapp_settings');
      if (saved) {
        state.settings = { ...state.settings, ...JSON.parse(saved) };
      }
    } catch (e) {}

    // Populate standard controls
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

    // Feature 10: Parental Weekly Score & Curfew
    const weeklyScoreToggle = document.getElementById('settingWeeklyScore');
    if (weeklyScoreToggle) weeklyScoreToggle.checked = state.settings.weeklyScore !== false;

    const curfewInput = document.getElementById('settingCurfewTime');
    if (curfewInput) curfewInput.value = state.settings.curfewTime || '22:30';

    const weeklyScoreTimeInput = document.getElementById('settingWeeklyScoreTime');
    if (weeklyScoreTimeInput) weeklyScoreTimeInput.value = state.settings.weeklyScoreTime || '20:00';

    applyVisualSettings();
  }

  function saveSettings() {
    try {
      localStorage.setItem('laptop_miniapp_settings', JSON.stringify(state.settings));
    } catch (e) {}
    window._updateRootSettingsLabels?.();
  }

  // Re-render current active screen
  function refreshCurrentScreen() {
    const dates = Object.keys(state.timelineData?.days || {}).sort().reverse();
    if (dates.length > 0) {
      renderDay(dates[0], 'today');
      if (state.selectedDateKey) {
        renderDay(state.selectedDateKey, 'history');
      }
    }
  }

  // Data Loading (supports local window.LOCAL_TIMELINE_DATA and fetch)
  async function loadData() {
    // 1. Try local memory store first (instant, 0 network latency, 0 CORS)
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

    // 3. Fallback dummy data if nothing loaded
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

  // Render Day Screen with All Processed Filters & Settings
  function renderDay(dateKey, containerPrefix = 'today') {
    if (!state.timelineData?.days) return;
    const rawDay = state.timelineData.days[dateKey];
    if (!rawDay) return;

    // Apply data filters (micro wakeups, merge pauses, hibernate interpretation)
    const day = getProcessedDay(rawDay);

    // Header Greeting & Device
    const userBadge = document.getElementById('userGreeting');
    if (userBadge) {
      const tgUser = tg?.initDataUnsafe?.user?.first_name || 'Артемий';
      userBadge.textContent = `Привет, ${tgUser}`;
    }
    updateDeviceUI(state.settings.activeDevice || 'primary');

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

    // Setting 18: Duration Format (Human vs Exact)
    const bigStat = document.getElementById(`${containerPrefix}BigStat`);
    const bigStatExact = document.getElementById(`${containerPrefix}BigStatExact`);
    if (bigStat && bigStatExact) {
      if (state.settings.durationFormat === 'exact') {
        bigStat.textContent = formatSecondsExact(day.activeSeconds);
        bigStatExact.textContent = formatSecondsHuman(day.activeSeconds);
      } else {
        bigStat.textContent = formatSecondsHuman(day.activeSeconds);
        bigStatExact.textContent = formatSecondsExact(day.activeSeconds);
      }
    }

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
    if (sleepDuration) {
      const totalSleepSec = day.sleepSeconds + day.hibernateSeconds;
      sleepDuration.textContent = state.settings.durationFormat === 'exact'
        ? formatSecondsExact(totalSleepSec)
        : formatSecondsHuman(totalSleepSec);
    }

    const offDuration = document.getElementById(`${containerPrefix}OffDuration`);
    if (offDuration) {
      offDuration.textContent = state.settings.durationFormat === 'exact'
        ? formatSecondsExact(day.offSeconds)
        : formatSecondsHuman(day.offSeconds);
    }

    // Setting 22: Timeline View Mode (Full 24h vs Active Work-hours)
    const timelineBar = document.getElementById(`${containerPrefix}TimelineBar`);
    const hoursRuler = timelineBar?.parentElement?.querySelector('.hours-ruler');
    if (timelineBar) {
      timelineBar.innerHTML = '';

      let startMin = 0;
      let endMin = 1440;
      let totalMinutes = 1440;

      if (state.settings.timelineMode === 'work') {
        const activeSessions = (day.sessions || []).filter(s => s.state === 'включен');
        if (activeSessions.length > 0) {
          const minAct = Math.min(...activeSessions.map(s => s.startMinute));
          const maxAct = Math.max(...activeSessions.map(s => s.endMinute));
          startMin = Math.max(0, Math.floor((minAct - 60) / 60) * 60); // 1 hr before first active
          endMin = Math.min(1440, Math.ceil((maxAct + 60) / 60) * 60); // 1 hr after last active
          if (endMin - startMin < 360) {
            endMin = Math.min(1440, startMin + 360); // min 6 hours span
          }
        } else {
          startMin = 480; // 08:00
          endMin = 1200;  // 20:00
        }
        totalMinutes = endMin - startMin;
      }

      // Update Hours Ruler labels dynamically
      if (hoursRuler) {
        hoursRuler.innerHTML = '';
        const step = state.settings.timelineMode === 'work'
          ? Math.max(60, Math.round(totalMinutes / 60 / 5) * 60)
          : 180;
        for (let m = startMin; m <= endMin; m += step) {
          const span = document.createElement('span');
          span.className = 'ruler-hour';
          const hh = Math.floor(m / 60).toString().padStart(2, '0');
          const mm = (m % 60).toString().padStart(2, '0');
          span.textContent = `${hh}:${mm}`;
          hoursRuler.appendChild(span);
        }
      }

      // Render timeline segments
      (day.sessions || []).forEach((session) => {
        const segStart = Math.max(startMin, session.startMinute);
        const segEnd = Math.min(endMin, session.endMinute);
        if (segEnd <= segStart) return;

        const seg = document.createElement('div');
        seg.className = 'timeline-segment';

        // State class
        if (session.state === 'включен') seg.classList.add('segment-on');
        else if (session.state === 'сон') seg.classList.add('segment-sleep');
        else if (session.state === 'гибернация') seg.classList.add('segment-hibernate');
        else seg.classList.add('segment-off');

        const widthPercent = ((segEnd - segStart) / totalMinutes) * 100;
        seg.style.width = `${Math.max(0.25, widthPercent)}%`;

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

  // Floating Segment Tooltip
  function showSegmentTooltip(segmentEl, session, containerPrefix) {
    const tooltip = document.getElementById(`${containerPrefix}Tooltip`);
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

  // Render History Days Selector Chips (Respects Setting 23: Data Retention)
  function renderHistoryChips() {
    const chipContainer = document.getElementById('historyDaysScroll');
    if (!chipContainer || !state.timelineData?.days) return;

    chipContainer.innerHTML = '';
    const allDates = Object.keys(state.timelineData.days).sort().reverse();

    // Setting 23: Data Retention filter
    let sortedDates = allDates;
    if (state.settings.dataRetention !== 'all') {
      const limit = parseInt(state.settings.dataRetention, 10);
      if (!isNaN(limit)) {
        sortedDates = allDates.slice(0, limit);
      }
    }

    sortedDates.forEach((dateKey) => {
      const rawDay = state.timelineData.days[dateKey];
      const day = getProcessedDay(rawDay);
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

    // Select first chip by default if needed
    if (!state.selectedDateKey && sortedDates.length > 0) {
      state.selectedDateKey = sortedDates[0];
    }
    if (sortedDates.includes(state.selectedDateKey)) {
      renderDay(state.selectedDateKey, 'history');
      const titleEl = document.getElementById('historySelectedDateTitle');
      if (titleEl && state.timelineData.days[state.selectedDateKey]) {
        titleEl.textContent = `Активность за ${state.timelineData.days[state.selectedDateKey].displayDate}`;
      }
    }
  }

  // Interactive Liquid Glass Tab Bar & Gesture Navigation
  function initTabs() {
    const floatingDock = document.getElementById('floatingDock');
    const pill = document.getElementById('dockGlassPill');
    const dockButtons = Array.from(document.querySelectorAll('.dock-btn'));
    if (!floatingDock || !pill || dockButtons.length === 0) return;

    let isDragging = false;
    let justFinishedDrag = false;
    let startPointerX = 0;
    let startPointerY = 0;
    let startPillX = 0;
    let currentPillX = 0;
    let activeIndex = 0;
    let hoveredIndex = 0;
    let hasMoved = false;
    let downBtn = null;

    // Helper to find button closest to an X coordinate
    function getButtonAtX(clientX) {
      let bestIdx = 0;
      let minDiff = Infinity;
      dockButtons.forEach((btn, idx) => {
        const rect = btn.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        const diff = Math.abs(clientX - center);
        if (diff < minDiff) {
          minDiff = diff;
          bestIdx = idx;
        }
      });
      return bestIdx;
    }

    // Switch Tab Content View
    function switchTab(targetTab, shouldHaptic = true) {
      if (state.currentTab === targetTab) return;
      if (shouldHaptic) triggerHaptic('medium');
      state.currentTab = targetTab;

      // Close settings sub-page without transition when leaving settings tab
      if (targetTab !== 'settings') {
        window._closeSettingsSubPage?.(false);
      }

      // Switch active tab view with smooth scroll to top
      document.querySelectorAll('.tab-content').forEach(view => view.classList.remove('active'));
      const activeView = document.getElementById(`tab-${targetTab}`);
      if (activeView) activeView.classList.add('active');

      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (targetTab === 'history') {
        renderHistoryChips();
      }
    }

    // Position and Animate the Glass Pill to Target Tab
    function snapPillToTab(index, animate = true) {
      if (index < 0 || index >= dockButtons.length) index = 0;
      activeIndex = index;
      hoveredIndex = index;
      const targetBtn = dockButtons[index];

      // Update button active classes
      dockButtons.forEach((b, i) => b.classList.toggle('active', i === index));

      // Reset edge effects and dock shift
      floatingDock.classList.remove('edge-left', 'edge-right', 'is-dragging');
      floatingDock.style.transform = '';

      if (animate) {
        pill.style.transition = 'transform 0.45s var(--spring-ease), width 0.45s var(--spring-ease), box-shadow 0.3s';
        floatingDock.style.transition = 'transform 0.45s var(--spring-ease), box-shadow 0.3s';
      } else {
        pill.style.transition = 'none';
        floatingDock.style.transition = 'none';
      }

      pill.style.width = `${targetBtn.offsetWidth}px`;
      pill.style.height = `${targetBtn.offsetHeight}px`;
      pill.style.top = `${targetBtn.offsetTop}px`;
      pill.style.transform = `translate3d(${targetBtn.offsetLeft}px, 0, 0) scale(1, 1)`;
    }

    // Direct Click Handlers on each Tab Button (Instant Tap Guarantee)
    dockButtons.forEach((btn, idx) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (justFinishedDrag) return;
        snapPillToTab(idx, true);
        const targetTab = btn.getAttribute('data-tab');
        switchTab(targetTab, true);
      });
    });

    // Drag / Touch Gesture Handling
    floatingDock.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;

      startPointerX = e.clientX;
      startPointerY = e.clientY;
      hasMoved = false;
      isDragging = true;
      justFinishedDrag = false;

      // Determine clicked button directly under finger/cursor
      downBtn = e.target.closest('.dock-btn');
      if (!downBtn) {
        const atIdx = getButtonAtX(e.clientX);
        downBtn = dockButtons[atIdx];
      }

      const clickedIdx = dockButtons.indexOf(downBtn);
      if (clickedIdx >= 0) {
        hoveredIndex = clickedIdx;
        startPillX = dockButtons[clickedIdx].offsetLeft;
      } else {
        activeIndex = dockButtons.findIndex(b => b.getAttribute('data-tab') === state.currentTab);
        if (activeIndex < 0) activeIndex = 0;
        hoveredIndex = activeIndex;
        startPillX = dockButtons[activeIndex].offsetLeft;
      }
      currentPillX = startPillX;

      try {
        floatingDock.setPointerCapture(e.pointerId);
      } catch (err) {}

      // Disable transitions for 1:1 real-time finger tracking
      pill.style.transition = 'none';
      floatingDock.style.transition = 'none';
      floatingDock.classList.add('is-dragging');

      // Tactile compression upon press
      pill.style.transform = `translate3d(${currentPillX}px, 0, 0) scale(0.96, 0.96)`;
    });

    floatingDock.addEventListener('pointermove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startPointerX;
      const deltaY = e.clientY - startPointerY;

      if (!hasMoved && (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6)) {
        hasMoved = true;
        triggerHaptic('light');
      }

      if (!hasMoved) return;

      const minX = dockButtons[0].offsetLeft;
      const maxX = dockButtons[dockButtons.length - 1].offsetLeft;

      const rawX = startPillX + deltaX;
      let actualX = rawX;
      let scaleX = 1;
      let scaleY = 1;

      // EDGE RUBBER-BANDING & SQUISH PHYSICS
      if (rawX < minX) {
        // Dragging past the left edge ("Сегодня")
        const overshoot = minX - rawX;
        const damped = Math.min(36, Math.pow(overshoot, 0.8) * 1.5);
        actualX = minX - damped;

        // Squish horizontally, bulge vertically at boundary collision
        const squish = Math.min(0.28, (overshoot / 120) * 0.28);
        scaleX = 1 - squish;
        scaleY = 1 + squish * 0.7;

        floatingDock.classList.add('edge-left');
        floatingDock.classList.remove('edge-right');
        floatingDock.style.transform = `translateX(${-damped * 0.22}px)`;
      } else if (rawX > maxX) {
        // Dragging past the right edge ("Настройки")
        const overshoot = rawX - maxX;
        const damped = Math.min(36, Math.pow(overshoot, 0.8) * 1.5);
        actualX = maxX + damped;

        const squish = Math.min(0.28, (overshoot / 120) * 0.28);
        scaleX = 1 - squish;
        scaleY = 1 + squish * 0.7;

        floatingDock.classList.add('edge-right');
        floatingDock.classList.remove('edge-left');
        floatingDock.style.transform = `translateX(${damped * 0.22}px)`;
      } else {
        // Inside normal bar range: clear edge classes and dock lean
        floatingDock.classList.remove('edge-left', 'edge-right');
        floatingDock.style.transform = '';

        // Dynamic fluid elongation in motion direction
        const speed = Math.abs(deltaX);
        scaleX = 1 + Math.min(0.08, speed * 0.001);
        scaleY = 1 / scaleX;
      }

      currentPillX = actualX;

      // Smoothly interpolate width between buttons
      const clampedX = Math.max(minX, Math.min(maxX, rawX));
      let interpolatedWidth = dockButtons[0].offsetWidth;
      for (let i = 0; i < dockButtons.length - 1; i++) {
        const b1 = dockButtons[i];
        const b2 = dockButtons[i + 1];
        if (clampedX >= b1.offsetLeft && clampedX <= b2.offsetLeft) {
          const t = (clampedX - b1.offsetLeft) / (b2.offsetLeft - b1.offsetLeft);
          interpolatedWidth = b1.offsetWidth + (b2.offsetWidth - b1.offsetWidth) * t;
          break;
        }
      }

      pill.style.width = `${interpolatedWidth}px`;
      pill.style.transform = `translate3d(${actualX}px, 0, 0) scale(${scaleX}, ${scaleY})`;

      // Hover / proximity detection for active tab highlight & haptic clicks
      const pillCenter = actualX + interpolatedWidth / 2;
      let closestIdx = 0;
      let minDistance = Infinity;

      dockButtons.forEach((btn, idx) => {
        const btnCenter = btn.offsetLeft + btn.offsetWidth / 2;
        const dist = Math.abs(pillCenter - btnCenter);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      });

      if (closestIdx !== hoveredIndex) {
        hoveredIndex = closestIdx;
        triggerHaptic('selection');
        dockButtons.forEach((b, i) => b.classList.toggle('active', i === hoveredIndex));
      }
    });

    const endDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      floatingDock.classList.remove('is-dragging', 'edge-left', 'edge-right');

      try {
        floatingDock.releasePointerCapture(e.pointerId);
      } catch (err) {}

      let targetIndex = -1;

      // If it was a quick tap without significant dragging (< 6px)
      if (!hasMoved) {
        if (downBtn) {
          targetIndex = dockButtons.indexOf(downBtn);
        }
        if (targetIndex < 0) {
          targetIndex = getButtonAtX(e.clientX);
        }
      } else {
        // Dragging gesture finished
        justFinishedDrag = true;
        setTimeout(() => { justFinishedDrag = false; }, 100);
        targetIndex = hoveredIndex;
      }

      if (targetIndex < 0 || targetIndex >= dockButtons.length) {
        targetIndex = activeIndex;
      }

      // Magnetic snap with rubber spring animation
      snapPillToTab(targetIndex, true);

      // Trigger tab switch
      const targetTab = dockButtons[targetIndex].getAttribute('data-tab');
      switchTab(targetTab, true);
    };

    floatingDock.addEventListener('pointerup', endDrag);
    floatingDock.addEventListener('pointercancel', endDrag);

    // Initial positioning of the glass pill
    const currentIdx = dockButtons.findIndex(b => b.getAttribute('data-tab') === state.currentTab);
    snapPillToTab(currentIdx >= 0 ? currentIdx : 0, false);

    // Re-snap on window resize / orientation change
    window.addEventListener('resize', () => {
      const idx = dockButtons.findIndex(b => b.getAttribute('data-tab') === state.currentTab);
      snapPillToTab(idx >= 0 ? idx : 0, false);
    });

    // Ensure layout coordinates are accurate after styles/fonts load
    setTimeout(() => {
      const idx = dockButtons.findIndex(b => b.getAttribute('data-tab') === state.currentTab);
      snapPillToTab(idx >= 0 ? idx : 0, false);
    }, 100);
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

  // Settings Event Handlers (Wiring all 13 features)
  function initSettings() {
    // 13: Accent Themes Color Circles
    document.querySelectorAll('.color-circle').forEach(circle => {
      circle.addEventListener('click', () => {
        const color = circle.getAttribute('data-color');
        state.settings.accentColor = color;
        saveSettings();
        applyVisualSettings();
        triggerHaptic('medium');
        const colorNames = {
          emerald: 'Изумрудный',
          sapphire: 'Сапфировый',
          amethyst: 'Аметистовый',
          sunset: 'Закатный',
          rose: 'Неоново-розовый'
        };
        showToast(`Цвет темы: ${colorNames[color] || color}`, '🎨');
      });
    });

    // 14: Glass Blur Intensity Slider
    const blurSlider = document.getElementById('settingGlassBlur');
    const blurLabel = document.getElementById('blurValLabel');
    if (blurSlider) {
      blurSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        state.settings.glassBlur = val;
        document.documentElement.style.setProperty('--glass-blur', `${val}px`);
        if (blurLabel) blurLabel.textContent = `${val}px`;
        saveSettings();
      });
    }

    // 15: Density Selector
    const densitySelect = document.getElementById('settingDensity');
    if (densitySelect) {
      densitySelect.addEventListener('change', (e) => {
        state.settings.density = e.target.value;
        saveSettings();
        applyVisualSettings();
        triggerHaptic('selection');
        showToast(e.target.value === 'compact' ? 'Компактный режим' : 'Комфортный режим', '📐');
      });
    }

    // 16: Spring Physics Selector
    const springSelect = document.getElementById('settingSpring');
    if (springSelect) {
      springSelect.addEventListener('change', (e) => {
        state.settings.springPhysics = e.target.value;
        saveSettings();
        applyVisualSettings();
        triggerHaptic('selection');
        showToast(`Физика: ${e.target.options[e.target.selectedIndex].text}`, '🧲');
      });
    }

    // 17: Ambient Glow Toggle
    const glowToggle = document.getElementById('settingAmbientGlow');
    if (glowToggle) {
      glowToggle.addEventListener('change', (e) => {
        state.settings.ambientGlow = e.target.checked;
        saveSettings();
        applyVisualSettings();
        triggerHaptic('light');
        showToast(e.target.checked ? 'Фоновое свечение включено' : 'Свечение выключено', '✨');
      });
    }

    // 18: Duration Format Selector
    const durFormatSelect = document.getElementById('settingDurationFormat');
    if (durFormatSelect) {
      durFormatSelect.addEventListener('change', (e) => {
        state.settings.durationFormat = e.target.value;
        saveSettings();
        refreshCurrentScreen();
        triggerHaptic('selection');
        showToast(e.target.value === 'exact' ? 'Формат: секунды (00:00:00)' : 'Формат: краткий (ч/м)', '⏱');
      });
    }

    // 19: Ignore Micro-Wakeups Toggle
    const ignoreMicroToggle = document.getElementById('settingIgnoreMicro');
    if (ignoreMicroToggle) {
      ignoreMicroToggle.addEventListener('change', (e) => {
        state.settings.ignoreMicro = e.target.checked;
        saveSettings();
        refreshCurrentScreen();
        triggerHaptic('light');
        showToast(e.target.checked ? 'Микро-пробуждения (<2м) отсечены' : 'Учитываются все пробуждения', '🔍');
      });
    }

    // 20: Smart Session Merge Selector
    const sessionMergeSelect = document.getElementById('settingSessionMerge');
    if (sessionMergeSelect) {
      sessionMergeSelect.addEventListener('change', (e) => {
        state.settings.sessionMerge = parseInt(e.target.value, 10);
        saveSettings();
        refreshCurrentScreen();
        triggerHaptic('selection');
        showToast(e.target.value === '0' ? 'Склейка отключена' : `Склейка пауз до ${e.target.value}м`, '🔗');
      });
    }

    // 21: Hibernate Interpretation Selector
    const hibSelect = document.getElementById('settingHibernateMode');
    if (hibSelect) {
      hibSelect.addEventListener('change', (e) => {
        state.settings.hibernateMode = e.target.value;
        saveSettings();
        refreshCurrentScreen();
        triggerHaptic('selection');
        showToast(e.target.value === 'off' ? 'Гибернация считается выключением' : 'Гибернация отображается отдельно', '🧊');
      });
    }

    // 22: Timeline View Mode Selector
    const tlModeSelect = document.getElementById('settingTimelineMode');
    if (tlModeSelect) {
      tlModeSelect.addEventListener('change', (e) => {
        state.settings.timelineMode = e.target.value;
        saveSettings();
        refreshCurrentScreen();
        triggerHaptic('selection');
        showToast(e.target.value === 'work' ? 'Шкала: только активные часы' : 'Шкала: полные 24 часа', '📊');
      });
    }

    // 23: Data Retention Period Selector
    const retentionSelect = document.getElementById('settingDataRetention');
    if (retentionSelect) {
      retentionSelect.addEventListener('change', (e) => {
        state.settings.dataRetention = e.target.value;
        saveSettings();
        renderHistoryChips();
        triggerHaptic('selection');
        showToast(`Архив: ${e.target.options[e.target.selectedIndex].text}`, '📅');
      });
    }

    // 25: Auto Backup to Telegram Toggle
    const backupToggle = document.getElementById('settingAutoBackup');
    if (backupToggle) {
      backupToggle.addEventListener('change', (e) => {
        state.settings.autoBackup = e.target.checked;
        saveSettings();
        triggerHaptic('light');
        showToast(e.target.checked ? 'Автобэкап в Telegram включен' : 'Автобэкап отключен', '💾');
      });
    }

    // 27: Multi-PC Device Switcher
    const deviceSelect = document.getElementById('settingActiveDevice');
    const deviceSelectorBtn = document.getElementById('deviceSelectorBtn');

    if (deviceSelect) {
      deviceSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'add') {
          const newName = prompt('Введите название нового устройства (например, Рабочий ПК):');
          if (newName && newName.trim()) {
            const trimmed = newName.trim();
            const newOpt = document.createElement('option');
            newOpt.value = 'device_' + Date.now();
            newOpt.textContent = `💻 ${trimmed}`;
            deviceSelect.insertBefore(newOpt, deviceSelect.lastElementChild);
            deviceSelect.value = newOpt.value;
            state.settings.activeDevice = newOpt.value;
            saveSettings();
            updateDeviceUI(newOpt.value);
            showToast(`Добавлено: ${trimmed}`, '💻');
          } else {
            deviceSelect.value = state.settings.activeDevice;
          }
        } else {
          state.settings.activeDevice = val;
          saveSettings();
          updateDeviceUI(val);
          triggerHaptic('selection');
          showToast(`Устройство: ${deviceSelect.options[deviceSelect.selectedIndex].text}`, '💻');
        }
      });
    }

    // Header Device Badge Click - Quick Toggle
    if (deviceSelectorBtn) {
      deviceSelectorBtn.addEventListener('click', () => {
        triggerHaptic('selection');
        const next = state.settings.activeDevice === 'primary' ? 'desktop' : 'primary';
        state.settings.activeDevice = next;
        saveSettings();
        updateDeviceUI(next);
        showToast(`Устройство: ${next === 'desktop' ? 'Домашний ПК' : 'Мой Ноутбук'}`, '💻');
      });
    }

    // Telegram Bot Notifications: Report Time
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

    // Feature 10: Parental Weekly Score & Curfew
    const weeklyScoreToggle = document.getElementById('settingWeeklyScore');
    if (weeklyScoreToggle) {
      weeklyScoreToggle.addEventListener('change', (e) => {
        state.settings.weeklyScore = e.target.checked;
        saveSettings();
        triggerHaptic('light');
        updateWeeklyScoreDisplay();
        showToast(e.target.checked ? 'Дневник режима недели включен' : 'Дневник режима отключен', '⭐');
      });
    }

    const curfewInput = document.getElementById('settingCurfewTime');
    if (curfewInput) {
      curfewInput.addEventListener('change', (e) => {
        state.settings.curfewTime = e.target.value;
        saveSettings();
        updateWeeklyScoreDisplay();
        showToast(`Отбой: ${e.target.value}`, '🌙');
      });
    }

    const weeklyScoreTimeInput = document.getElementById('settingWeeklyScoreTime');
    if (weeklyScoreTimeInput) {
      weeklyScoreTimeInput.addEventListener('change', (e) => {
        state.settings.weeklyScoreTime = e.target.value;
        saveSettings();
        showToast(`Время табеля: ${e.target.value}`, '📊');
      });
    }

    // Sync Handlers (Header icon & Settings button)
    const handleSync = async () => {
      triggerHaptic('medium');
      const btnSyncNow = document.getElementById('btnSyncNow');
      if (btnSyncNow) {
        btnSyncNow.disabled = true;
        btnSyncNow.textContent = 'Синхронизация...';
      }

      await loadData();
      refreshCurrentScreen();
      renderHistoryChips();

      setTimeout(() => {
        if (btnSyncNow) {
          btnSyncNow.disabled = false;
          btnSyncNow.textContent = 'Синхронизировать сейчас';
        }
        showToast('Данные актуальны', '🔄');
      }, 500);
    };

    const btnSyncNow = document.getElementById('btnSyncNow');
    if (btnSyncNow) btnSyncNow.addEventListener('click', handleSync);

    const btnSyncHeader = document.getElementById('btnSyncHeader');
    if (btnSyncHeader) btnSyncHeader.addEventListener('click', handleSync);

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

  // iOS Authentic Settings Drill-Down Navigation & Sub-Pages
  function initSettingsNavigation() {
    let currentOpenSub = null;
    let isTransitioning = false;
    const root = document.getElementById('settingsViewRoot');
    const tabSettings = document.getElementById('tab-settings');

    function updateRootValueLabels() {
      // 1. Device badge
      const rootValDevice = document.getElementById('rootValDevice');
      if (rootValDevice) {
        rootValDevice.textContent = state.settings.activeDevice === 'desktop' ? 'ПК' : 'Ноутбук';
      }

      // 2. Notify badge
      const rootValNotify = document.getElementById('rootValNotify');
      if (rootValNotify) {
        rootValNotify.textContent = state.settings.reportTime || '23:59';
      }

      // 3. Theme badge
      const rootValTheme = document.getElementById('rootValTheme');
      if (rootValTheme) {
        const themeMap = {
          emerald: 'Изумруд',
          sapphire: 'Сапфир',
          amethyst: 'Аметист',
          sunset: 'Закат',
          rose: 'Роза'
        };
        rootValTheme.textContent = themeMap[state.settings.accentColor] || 'Изумруд';
      }

      // 4. Interface badge
      const rootValInterface = document.getElementById('rootValInterface');
      if (rootValInterface) {
        rootValInterface.textContent = state.settings.density === 'compact' ? 'Компакт' : 'Комфорт';
      }

      // 5. Goals badge
      const rootValGoals = document.getElementById('rootValGoals');
      if (rootValGoals) {
        if (state.settings.weeklyScore && state.timelineData?.days) {
          const sc = computeWeeklyScore(state.timelineData.days, state.settings.curfewTime, state.settings.dailyTargetHours);
          rootValGoals.textContent = `${state.settings.dailyTargetHours}ч • ${sc.score}★`;
        } else {
          rootValGoals.textContent = `${state.settings.dailyTargetHours || 8} ч`;
        }
      }

      // Root Score Badge in subGoals
      const rootScoreBadge = document.getElementById('rootScoreBadge');
      if (rootScoreBadge && state.timelineData?.days) {
        const sc = computeWeeklyScore(state.timelineData.days, state.settings.curfewTime, state.settings.dailyTargetHours);
        rootScoreBadge.textContent = `${sc.score} ★`;
      }

      // 6. Filters badge
      const rootValFilters = document.getElementById('rootValFilters');
      if (rootValFilters) {
        rootValFilters.textContent = state.settings.ignoreMicro ? 'Фильтр <2м' : 'Все';
      }

      // 7. Storage badge
      const rootValStorage = document.getElementById('rootValStorage');
      if (rootValStorage) {
        const ret = state.settings.dataRetention;
        rootValStorage.textContent = ret === 'all' ? 'Все' : `${ret || 30} дн.`;
      }
    }

    function handleTgBack() {
      closeCurrentSubPage(true);
    }

    function openSubPage(subId) {
      if (isTransitioning) return;
      const targetSub = document.getElementById(subId);
      if (!targetSub || !root) return;

      isTransitioning = true;
      currentOpenSub = targetSub;

      // Ensure subpage is displayed before transitioning in
      targetSub.style.display = 'block';
      targetSub.classList.remove('slide-out');
      void targetSub.offsetWidth; // Force reflow

      root.classList.add('slide-left');
      targetSub.classList.add('active');

      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Telegram Native Back Button
      if (tg?.BackButton) {
        try {
          tg.BackButton.show();
          tg.BackButton.onClick(handleTgBack);
        } catch (e) {}
      }
      triggerHaptic('light');

      setTimeout(() => {
        if (currentOpenSub === targetSub) {
          root.style.display = 'none';
        }
        isTransitioning = false;
      }, 340);
    }

    function closeCurrentSubPage(animate = true) {
      if (!currentOpenSub) return;
      const closingSub = currentOpenSub;
      currentOpenSub = null;

      // Bring root back into flow before transition starts
      if (root) {
        root.style.display = 'block';
        void root.offsetWidth; // Force reflow
      }

      if (tg?.BackButton) {
        try {
          tg.BackButton.offClick(handleTgBack);
          tg.BackButton.hide();
        } catch (e) {}
      }
      triggerHaptic('light');

      if (animate) {
        isTransitioning = true;
        closingSub.classList.add('slide-out');
        closingSub.classList.remove('active');
        if (root) {
          root.classList.remove('slide-left');
        }

        setTimeout(() => {
          closingSub.style.display = 'none';
          closingSub.classList.remove('slide-out');
          isTransitioning = false;
        }, 340);
      } else {
        closingSub.classList.remove('active', 'slide-out');
        closingSub.style.display = 'none';
        if (root) {
          root.classList.remove('slide-left');
        }
      }

      updateRootValueLabels();
    }

    // Expose for external calls
    window._closeSettingsSubPage = closeCurrentSubPage;
    window._openSettingsSubPage = openSubPage;
    window._updateRootSettingsLabels = updateRootValueLabels;

    // Bulletproof Event Delegation on tabSettings container
    if (tabSettings) {
      tabSettings.addEventListener('click', (e) => {
        // 1. Check if back button clicked
        const backBtn = e.target.closest('[data-back]');
        if (backBtn) {
          e.preventDefault();
          e.stopPropagation();
          closeCurrentSubPage(true);
          return;
        }

        // 2. Check if drill-down setting row clicked
        const row = e.target.closest('[data-open-sub]');
        if (row) {
          // Do not open subpage if clicking directly on a form element or select trigger
          if (e.target.closest('input, select, label.ios-toggle, .ios-custom-select, a')) return;
          const subId = row.getAttribute('data-open-sub');
          if (subId) {
            e.preventDefault();
            e.stopPropagation();
            openSubPage(subId);
          }
        }
      });
    }

    // Direct event listener fallback on rows
    document.querySelectorAll('[data-open-sub]').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('input, select, label.ios-toggle, .ios-custom-select, a')) return;
        const subId = item.getAttribute('data-open-sub');
        if (subId) {
          openSubPage(subId);
        }
      });
    });

    document.querySelectorAll('[data-back]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        closeCurrentSubPage(true);
      });
    });

    // Initial label population
    updateRootValueLabels();
  }

  // iOS Liquid Glass Action Sheet Picker for <select> elements
  function initCustomSelectPickers() {
    let activeSelect = null;
    let activeTrigger = null;

    const overlay = document.getElementById('iosPickerOverlay');
    const sheet = document.getElementById('iosPickerSheet');
    const titleEl = document.getElementById('iosPickerTitle');
    const subEl = document.getElementById('iosPickerSub');
    const optionsContainer = document.getElementById('iosPickerOptions');
    const closeBtn = document.getElementById('iosPickerCloseBtn');

    if (!overlay || !sheet || !optionsContainer) return;

    function openPicker(selectEl, triggerEl) {
      activeSelect = selectEl;
      activeTrigger = triggerEl;

      // Extract title from parent row
      const row = selectEl.closest('.settings-row, .settings-nav-row');
      const title = row?.querySelector('.settings-label-main')?.textContent || 'Выберите вариант';
      const sub = row?.querySelector('.settings-label-sub')?.textContent || 'Настройка приложения';

      if (titleEl) titleEl.textContent = title;
      if (subEl) subEl.textContent = sub;

      // Populate options with authentic iOS checkmark items
      optionsContainer.innerHTML = '';
      Array.from(selectEl.options).forEach(opt => {
        const item = document.createElement('div');
        const isSelected = (opt.value === selectEl.value);
        item.className = 'ios-picker-item' + (isSelected ? ' selected' : '');
        item.setAttribute('data-value', opt.value);

        const label = document.createElement('span');
        label.className = 'ios-picker-item-label';
        label.textContent = opt.text;
        item.appendChild(label);

        if (isSelected) {
          const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          check.setAttribute('class', 'ios-picker-check');
          check.setAttribute('width', '20');
          check.setAttribute('height', '20');
          check.setAttribute('viewBox', '0 0 24 24');
          check.setAttribute('fill', 'none');
          check.innerHTML = '<path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
          item.appendChild(check);
        }

        item.addEventListener('click', () => {
          triggerHaptic('selection');
          const val = opt.value;

          // Update underlying select element
          selectEl.value = val;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));

          // Update trigger label
          if (activeTrigger) {
            const lbl = activeTrigger.querySelector('.ios-custom-select-label');
            if (lbl) lbl.textContent = opt.text;
          }

          // Visual feedback before dismissing
          optionsContainer.querySelectorAll('.ios-picker-item').forEach(el => {
            const match = (el.getAttribute('data-value') === val);
            el.classList.toggle('selected', match);
            const oldCheck = el.querySelector('.ios-picker-check');
            if (oldCheck) oldCheck.remove();
            if (match) {
              const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
              check.setAttribute('class', 'ios-picker-check');
              check.setAttribute('width', '20');
              check.setAttribute('height', '20');
              check.setAttribute('viewBox', '0 0 24 24');
              check.setAttribute('fill', 'none');
              check.innerHTML = '<path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
              el.appendChild(check);
            }
          });

          setTimeout(() => {
            closePicker();
          }, 140);
        });

        optionsContainer.appendChild(item);
      });

      overlay.classList.add('active');
      triggerHaptic('light');
    }

    function closePicker() {
      overlay.classList.remove('active');
      if (activeTrigger) {
        activeTrigger.classList.remove('active');
      }
      activeSelect = null;
      activeTrigger = null;
    }

    // Backdrop dismissal
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closePicker();
      }
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        triggerHaptic('light');
        closePicker();
      });
    }

    // Convert each select.ios-select into custom trigger
    document.querySelectorAll('select.ios-select').forEach(sel => {
      let trigger = sel.nextElementSibling;
      if (!trigger || !trigger.classList.contains('ios-custom-select')) {
        trigger = document.createElement('div');
        trigger.className = 'ios-custom-select';
        trigger.setAttribute('data-select-id', sel.id);

        const currentOpt = sel.options[sel.selectedIndex] || sel.options[0];
        const labelText = currentOpt ? currentOpt.text : 'Выбрать';

        trigger.innerHTML = `
          <span class="ios-custom-select-label">${labelText}</span>
          <svg class="ios-custom-select-arrow" width="9" height="6" viewBox="0 0 9 6" fill="none">
            <path d="M1 1L4.5 4.5L8 1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;

        sel.parentNode.insertBefore(trigger, sel.nextSibling);
      }

      sel.style.display = 'none';

      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        trigger.classList.add('active');
        openPicker(sel, trigger);
      });

      const parentRow = sel.closest('.settings-row');
      if (parentRow && !parentRow.dataset.hasPickerListener) {
        parentRow.dataset.hasPickerListener = 'true';
        parentRow.style.cursor = 'pointer';
        parentRow.addEventListener('click', (e) => {
          if (e.target.closest('input, select, label.ios-toggle, a, .ios-custom-select')) return;
          trigger.classList.add('active');
          openPicker(sel, trigger);
        });
      }

      sel.addEventListener('change', () => {
        const opt = sel.options[sel.selectedIndex];
        const lbl = trigger.querySelector('.ios-custom-select-label');
        if (lbl && opt) {
          lbl.textContent = opt.text;
        }
      });
    });

    window._updateCustomSelectLabels = function () {
      document.querySelectorAll('select.ios-select').forEach(sel => {
        const trigger = sel.nextElementSibling;
        if (trigger && trigger.classList.contains('ios-custom-select')) {
          const opt = sel.options[sel.selectedIndex];
          const lbl = trigger.querySelector('.ios-custom-select-label');
          if (lbl && opt) {
            lbl.textContent = opt.text;
          }
        }
      });
    };
  }

  // ==========================================================================
  // Feature 10: Parental Weekly Score & Digital Health Scorecard
  // ==========================================================================
  function computeWeeklyScore(daysObj, curfewTime = '22:30', targetHours = 8) {
    const dates = Object.keys(daysObj || {}).sort().reverse().slice(0, 7);
    if (dates.length === 0) {
      return {
        score: '5.0',
        stars: '★★★★★',
        verdict: 'Данные накапливаются',
        curfewRatioStr: '0/0',
        avgHoursStr: '0ч 00м',
        targetRatioStr: '100%',
        peakDayStr: '—',
        recommendation: 'Начните работу на компьютере, чтобы сформировать первый недельный табель дисциплины.',
        days: []
      };
    }

    let curfewOkCount = 0;
    let targetOkCount = 0;
    let totalActiveSec = 0;
    let maxActiveSec = 0;
    let peakDayStr = '—';
    const dayResults = [];

    const [curfewH, curfewM] = (curfewTime || '22:30').split(':').map(Number);
    const curfewMinutes = curfewH * 60 + curfewM;

    dates.forEach(dKey => {
      const day = daysObj[dKey];
      const actSec = day.activeSeconds || 0;
      totalActiveSec += actSec;
      if (actSec > maxActiveSec) {
        maxActiveSec = actSec;
        peakDayStr = `${day.displayDate || dKey} (${Math.floor(actSec / 3600)}ч ${Math.round((actSec % 3600) / 60)}м)`;
      }

      // Check last event against bedtime curfew
      let curfewOk = true;
      if (day.lastEvent) {
        const parts = day.lastEvent.split(':').map(Number);
        const lastMin = parts[0] * 60 + parts[1];
        if (lastMin > curfewMinutes || lastMin < 5 * 60) {
          curfewOk = false;
        }
      }
      if (curfewOk) curfewOkCount++;

      // Check daily target
      const targetOk = (actSec <= targetHours * 3600);
      if (targetOk) targetOkCount++;

      const hrs = Math.floor(actSec / 3600);
      const mins = Math.round((actSec % 3600) / 60);

      dayResults.push({
        date: dKey,
        displayDate: day.displayDate || dKey,
        dayOfWeek: day.dayOfWeek || '',
        hoursStr: `${hrs}ч ${mins}м`,
        curfewOk: curfewOk,
        lastEvent: day.lastEvent || '—'
      });
    });

    const totalDays = dates.length;
    const avgSec = Math.round(totalActiveSec / totalDays);
    const curfewRatio = curfewOkCount / totalDays;
    const targetRatio = targetOkCount / totalDays;

    let scoreNum = (curfewRatio * 3.0 + targetRatio * 2.0).toFixed(1);
    scoreNum = Math.max(1.0, Math.min(5.0, parseFloat(scoreNum)));

    let stars = '★★★★★';
    let verdict = 'Отличная дисциплина';
    if (scoreNum < 3.0) {
      stars = '★★☆☆☆';
      verdict = 'Нарушение режима';
    } else if (scoreNum < 4.0) {
      stars = '★★★☆☆';
      verdict = 'Требует внимания';
    } else if (scoreNum < 4.8) {
      stars = '★★★★☆';
      verdict = 'Хороший баланс';
    }

    let rec = `Режим недели проанализирован. Комендантский час (${curfewTime}) соблюден в ${curfewOkCount} из ${totalDays} дней.`;
    if (curfewOkCount < totalDays) {
      const lateCount = totalDays - curfewOkCount;
      rec += ` Зафиксировано ${lateCount} поздних сессий после ${curfewTime}. Рекомендуется уделить внимание отбою ребенка.`;
    } else {
      rec += ` Все сессии завершались строго вовремя. Признаков ночной усталости и переутомления не обнаружено.`;
    }

    const firstDate = dates[dates.length - 1];
    const lastDate = dates[0];
    const periodStr = `${daysObj[firstDate]?.displayDate || firstDate} — ${daysObj[lastDate]?.displayDate || lastDate}`;

    return {
      score: scoreNum.toFixed(1),
      stars,
      verdict,
      periodStr,
      curfewRatioStr: `${curfewOkCount}/${totalDays}`,
      avgHoursStr: `${Math.floor(avgSec / 3600)}ч ${Math.round((avgSec % 3600) / 60)}м`,
      targetRatioStr: `${Math.round(targetRatio * 100)}%`,
      peakDayStr,
      recommendation: rec,
      days: dayResults
    };
  }

  function updateWeeklyScoreDisplay() {
    const isEnabled = state.settings.weeklyScore !== false;
    const banner = document.getElementById('historyWeeklyScoreBanner');
    if (banner) {
      banner.style.display = isEnabled ? 'flex' : 'none';
    }

    const scoreData = computeWeeklyScore(
      state.timelineData?.days,
      state.settings.curfewTime || '22:30',
      state.settings.dailyTargetHours || 8
    );

    // Banner in History Tab
    const bannerStars = document.getElementById('bannerStars');
    const bannerScoreNum = document.getElementById('bannerScoreNum');
    const bannerVerdict = document.getElementById('bannerVerdict');
    const bannerScoreDesc = document.getElementById('bannerScoreDesc');
    if (bannerStars) bannerStars.textContent = scoreData.stars;
    if (bannerScoreNum) bannerScoreNum.textContent = scoreData.score;
    if (bannerVerdict) bannerVerdict.textContent = scoreData.verdict;
    if (bannerScoreDesc) bannerScoreDesc.textContent = `Комендантский час соблюден ${scoreData.curfewRatioStr} дней`;

    // Root badge in subGoals
    const rootScoreBadge = document.getElementById('rootScoreBadge');
    if (rootScoreBadge) rootScoreBadge.textContent = `${scoreData.score} ★`;

    // Modal elements
    const weeklyPeriod = document.getElementById('weeklyScorePeriod');
    if (weeklyPeriod) weeklyPeriod.textContent = scoreData.periodStr || 'За последние 7 дней';

    const modalScoreNum = document.getElementById('modalScoreNum');
    if (modalScoreNum) modalScoreNum.textContent = scoreData.score;

    const modalScoreStars = document.getElementById('modalScoreStars');
    if (modalScoreStars) modalScoreStars.textContent = scoreData.stars;

    const modalScoreVerdict = document.getElementById('modalScoreVerdict');
    if (modalScoreVerdict) modalScoreVerdict.textContent = scoreData.verdict;

    const scoreCurfewVal = document.getElementById('scoreCurfewVal');
    if (scoreCurfewVal) scoreCurfewVal.textContent = scoreData.curfewRatioStr;

    const scoreAvgHoursVal = document.getElementById('scoreAvgHoursVal');
    if (scoreAvgHoursVal) scoreAvgHoursVal.textContent = scoreData.avgHoursStr;

    const scoreTargetRatioVal = document.getElementById('scoreTargetRatioVal');
    if (scoreTargetRatioVal) scoreTargetRatioVal.textContent = scoreData.targetRatioStr;

    const scorePeakDayVal = document.getElementById('scorePeakDayVal');
    if (scorePeakDayVal) scorePeakDayVal.textContent = scoreData.peakDayStr;

    const modalRec = document.getElementById('modalScoreRecommendation');
    if (modalRec) modalRec.textContent = scoreData.recommendation;

    // Mini Days Breakdown List
    const daysList = document.getElementById('weeklyDaysList');
    if (daysList) {
      daysList.innerHTML = '';
      scoreData.days.forEach(d => {
        const row = document.createElement('div');
        row.className = 'weekly-day-row';
        row.innerHTML = `
          <div class="weekly-day-left">
            <span>${d.displayDate}</span>
            <span class="weekly-day-hours">${d.hoursStr}</span>
          </div>
          <div class="weekly-day-right">
            <span class="weekly-day-status ${d.curfewOk ? 'ok' : 'warn'}">
              ${d.curfewOk ? '✅ До ' + (state.settings.curfewTime || '22:30') : '⚠️ Отбой ' + d.lastEvent}
            </span>
          </div>
        `;
        daysList.appendChild(row);
      });
    }
  }

  async function sendWeeklyScoreToTelegram() {
    const token = '9264075011:AAEuTIlcMnjzKw8T85NE9lvpSMWJRfbQ_QM';
    const chatId = tg?.initDataUnsafe?.user?.id ? tg.initDataUnsafe.user.id.toString() : '6278269178';
    const scoreData = computeWeeklyScore(
      state.timelineData?.days,
      state.settings.curfewTime || '22:30',
      state.settings.dailyTargetHours || 8
    );

    let daysText = '';
    scoreData.days.forEach(d => {
      const statusIcon = d.curfewOk ? '✅ В норме' : '⚠️ Поздний отбой';
      daysText += `• <b>${d.displayDate}</b>: ${d.hoursStr} (отбой: ${d.lastEvent}) — ${statusIcon}\n`;
    });

    const msg = `⭐️ <b>ТАБЕЛЬ ДИСЦИПЛИНЫ НЕДЕЛИ</b>\n` +
      `<i>Родительский отчет цифрового баланса</i>\n\n` +
      `Период: <b>${scoreData.periodStr}</b>\n\n` +
      `📊 <b>Общая оценка:</b> ${scoreData.score} / 5.0 (${scoreData.stars})\n` +
      `Статус: <b>${scoreData.verdict}</b>\n\n` +
      `🌙 <b>Комендантский час (до ${state.settings.curfewTime || '22:30'}):</b> ${scoreData.curfewRatioStr} дней соблюден\n` +
      `⏱ <b>Среднее время за ПК:</b> ${scoreData.avgHoursStr} в день\n` +
      `⚡ <b>Пиковый день:</b> ${scoreData.peakDayStr}\n` +
      `🎯 <b>Соблюдение дневной нормы:</b> ${scoreData.targetRatioStr}\n\n` +
      `📅 <b>Хроника по дням:</b>\n${daysText}\n` +
      `💡 <b>Рекомендация:</b>\n${scoreData.recommendation}\n\n` +
      `<i>Сформировано Mini App @LaptopTimeBot</i>`;

    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: msg,
          parse_mode: 'HTML'
        })
      });
      const res = await resp.json();
      if (res.ok) {
        showToast('Табель успешно отправлен в бот! 📤', '⭐️');
        triggerHaptic('success');
      } else {
        showToast('Ошибка отправки в Telegram', '⚠️');
      }
    } catch (e) {
      showToast('Сетевая ошибка при отправке', '⚠️');
    }
  }

  function initWeeklyScoreModal() {
    const overlay = document.getElementById('iosWeeklyScoreOverlay');
    const closeBtn = document.getElementById('btnCloseWeeklyScore');
    const openBtnHistory = document.getElementById('btnOpenWeeklyScoreHistory');
    const openRowSettings = document.getElementById('rowOpenWeeklyScoreCard');
    const sendBtn = document.getElementById('btnSendScoreToBot');

    if (!overlay) return;

    function openModal() {
      updateWeeklyScoreDisplay();
      overlay.classList.add('active');
      triggerHaptic('light');
    }

    function closeModal() {
      overlay.classList.remove('active');
    }

    if (openBtnHistory) openBtnHistory.addEventListener('click', openModal);
    if (openRowSettings) openRowSettings.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        triggerHaptic('medium');
        sendBtn.disabled = true;
        sendBtn.textContent = 'Отправка...';
        await sendWeeklyScoreToTelegram();
        sendBtn.disabled = false;
        sendBtn.textContent = '📤 Отправить табель в Telegram';
      });
    }
  }

  // iOS Fluid Rubber Stretch & Physics Engine for All Elements
  function initRubberPhysics() {
    // 1. Global Viewport Overscroll Rubber Pull-to-Stretch
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      let startY = 0;
      let startX = 0;
      let isPulling = false;
      let pullDirection = 0; // 1: pull down at top, -1: pull up at bottom

      window.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        startY = e.touches[0].clientY;
        startX = e.touches[0].clientX;
        isPulling = false;
        pullDirection = 0;

        const atTop = window.scrollY <= 1;
        const atBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 3);

        if (atTop) pullDirection = 1;
        else if (atBottom) pullDirection = -1;
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1 || pullDirection === 0) return;

        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const dy = currentY - startY;
        const dx = currentX - startX;

        // Ignore if horizontal gesture dominates
        if (Math.abs(dx) > Math.abs(dy) && !isPulling) {
          pullDirection = 0;
          return;
        }

        // Pulling down at top of page (elastic overscroll)
        if (pullDirection === 1 && dy > 0 && window.scrollY <= 1) {
          isPulling = true;
          const dampedY = Math.min(85, Math.pow(dy, 0.76) * 1.85);
          const scaleFactor = 1 + Math.min(0.04, dampedY * 0.0004);

          appContainer.style.transition = 'none';
          appContainer.style.transformOrigin = 'top center';
          appContainer.style.transform = `translate3d(0, ${dampedY}px, 0) scale(${scaleFactor})`;

          if (dampedY > 35 && !appContainer._hasHaptic) {
            appContainer._hasHaptic = true;
            triggerHaptic('light');
          }
        }
        // Pulling up at bottom of page
        else if (pullDirection === -1 && dy < 0) {
          const atBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 3);
          if (atBottom) {
            isPulling = true;
            const overshoot = -dy;
            const dampedY = Math.min(70, Math.pow(overshoot, 0.76) * 1.85);
            const scaleFactor = 1 + Math.min(0.035, dampedY * 0.0004);

            appContainer.style.transition = 'none';
            appContainer.style.transformOrigin = 'bottom center';
            appContainer.style.transform = `translate3d(0, ${-dampedY}px, 0) scale(${scaleFactor})`;

            if (dampedY > 35 && !appContainer._hasHaptic) {
              appContainer._hasHaptic = true;
              triggerHaptic('light');
            }
          }
        }
      }, { passive: true });

      const endPull = () => {
        if (!isPulling) return;
        isPulling = false;
        pullDirection = 0;
        appContainer._hasHaptic = false;

        appContainer.style.transition = 'transform 0.45s var(--spring-ease)';
        appContainer.style.transform = 'translate3d(0, 0, 0) scale(1)';
        setTimeout(() => {
          appContainer.style.transition = '';
        }, 450);
      };

      window.addEventListener('touchend', endPull, { passive: true });
      window.addEventListener('touchcancel', endPull, { passive: true });
    }

    // 2. Card-Level Tactile Deflection & Rubber Stretch on Swipe
    const cards = document.querySelectorAll('.glass-card, .metric-card');
    cards.forEach(card => {
      let startX = 0;
      let startY = 0;
      let isSwiping = false;

      card.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isSwiping = false;
      }, { passive: true });

      card.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const dx = currentX - startX;
        const dy = currentY - startY;

        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) {
          isSwiping = true;
          const dampedX = Math.sign(dx) * Math.min(22, Math.pow(Math.abs(dx), 0.72) * 0.85);
          const rotation = dampedX * 0.035;
          const scale = 1 - Math.min(0.02, Math.abs(dampedX) * 0.001);

          card.style.transition = 'none';
          card.style.transform = `translate3d(${dampedX}px, 0, 0) scale(${scale}) rotate(${rotation}deg)`;
        }
      }, { passive: true });

      const endCardSwipe = () => {
        if (!isSwiping) return;
        isSwiping = false;
        card.style.transition = 'transform 0.45s var(--spring-ease)';
        card.style.transform = '';
        setTimeout(() => {
          card.style.transition = '';
        }, 450);
      };

      card.addEventListener('touchend', endCardSwipe, { passive: true });
      card.addEventListener('touchcancel', endCardSwipe, { passive: true });
    });

    // 3. Horizontal Scroll Rubber Stretch (Day Chips Carousel)
    const scrollDays = document.getElementById('historyDaysScroll');
    if (scrollDays) {
      let startX = 0;
      let isOverscrolling = false;

      scrollDays.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        isOverscrolling = false;
      }, { passive: true });

      scrollDays.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - startX;
        const atLeft = scrollDays.scrollLeft <= 1;
        const atRight = scrollDays.scrollLeft + scrollDays.clientWidth >= scrollDays.scrollWidth - 2;

        if ((atLeft && dx > 0) || (atRight && dx < 0)) {
          isOverscrolling = true;
          const dampedX = Math.sign(dx) * Math.min(42, Math.pow(Math.abs(dx), 0.75) * 1.4);
          scrollDays.style.transition = 'none';
          scrollDays.style.transform = `translate3d(${dampedX}px, 0, 0)`;
        }
      }, { passive: true });

      const endOverscroll = () => {
        if (!isOverscrolling) return;
        isOverscrolling = false;
        scrollDays.style.transition = 'transform 0.45s var(--spring-ease)';
        scrollDays.style.transform = '';
        setTimeout(() => {
          scrollDays.style.transition = '';
        }, 450);
      };

      scrollDays.addEventListener('touchend', endOverscroll, { passive: true });
      scrollDays.addEventListener('touchcancel', endOverscroll, { passive: true });
    }

    // 4. Timeline 24h Bar Track Rubber Overscroll
    ['today', 'history'].forEach(prefix => {
      const track = document.getElementById(`${prefix}TimelineTrack`);
      const container = track?.parentElement;
      if (!track || !container) return;

      let startX = 0;
      let isOver = false;

      container.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        isOver = false;
      }, { passive: true });

      container.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - startX;
        const atLeft = container.scrollLeft <= 1;
        const atRight = container.scrollLeft + container.clientWidth >= container.scrollWidth - 2;

        if ((atLeft && dx > 0) || (atRight && dx < 0)) {
          isOver = true;
          const dampedX = Math.sign(dx) * Math.min(36, Math.pow(Math.abs(dx), 0.75) * 1.25);
          const scaleX = 1 + Math.min(0.04, Math.abs(dampedX) * 0.001);
          track.style.transition = 'none';
          track.style.transform = `translate3d(${dampedX}px, 0, 0) scaleX(${scaleX})`;
        }
      }, { passive: true });

      const endTrackOver = () => {
        if (!isOver) return;
        isOver = false;
        track.style.transition = 'transform 0.45s var(--spring-ease)';
        track.style.transform = '';
        setTimeout(() => {
          track.style.transition = '';
        }, 450);
      };

      container.addEventListener('touchend', endTrackOver, { passive: true });
      container.addEventListener('touchcancel', endTrackOver, { passive: true });
    });
  }

  // Application Initialization
  async function init() {
    loadSettings();
    initTabs();
    initTimelineStretch();
    initSettings();
    initSettingsNavigation();
    initCustomSelectPickers();
    initWeeklyScoreModal();
    initRubberPhysics();

    const data = await loadData();
    const sortedDates = Object.keys(data.days || {}).sort().reverse();
    if (sortedDates.length > 0) {
      renderDay(sortedDates[0], 'today');
      state.selectedDateKey = sortedDates[0];
      renderHistoryChips();
    }
    updateWeeklyScoreDisplay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
