<template>
  <div
    :class="[
      `notification_${currentNotification.type}`,
      'notificationCard',
      'blurred_bg blur30'
    ]"
    role="status"
    aria-live="polite"
    @click="dismissNotification"
  >
    <div class="notification_body">
      <p class="notification_title">
        {{ currentNotification.title }}
      </p>
      <p
        v-if="currentNotification.subTitle"
        class="notification_subtitle"
      >
        {{ currentNotification.subTitle }}
      </p>
      <div
        v-if="currentNotification.progress"
        class="notification_progress"
        :aria-valuenow="currentNotification.progress.current"
        :aria-valuemin="0"
        :aria-valuemax="currentNotification.progress.total"
        role="progressbar"
      >
        <span :style="{ width: progressPercent + '%' }" />
      </div>
    </div>
    <base-icon
      class="closeNotification"
      icon="x"
    />
  </div>
</template>

<script>
import { mapMutations } from 'vuex';

export default {
  name: 'BaseNotification',

  data() {
    return {
      dismissTimer: null
    };
  },
  computed: {
    currentNotification() {
      return this.notification;
    },
    progressPercent() {
      const progress = this.currentNotification.progress;
      if (!progress || !progress.total) return 0;
      return Math.max(0, Math.min(100, (progress.current / progress.total) * 100));
    }
  },
  methods: {
    ...mapMutations(['popNotification']),
    dismissNotification() {
      const notification = this.currentNotification;
      this.popNotification(notification.id || notification.groupKey || notification.title);
    },
    scheduleDismiss() {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
      if (this.currentNotification.isPersistent || this.currentNotification.groupKey) return;
      this.dismissTimer = setTimeout(() => {
        this.dismissNotification();
      }, 3000);
    }
  },
  watch: {
    notification() {
      this.scheduleDismiss();
    }
  },
  mounted() {
    this.scheduleDismiss();
  },
  beforeDestroy() {
    clearTimeout(this.dismissTimer);
  },
  props: {
    notification: Object
  }
};
</script>

<style lang="scss">
.notificationCard {
  border-radius: 10px;
  margin: 10px;
  max-width: 300px;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 2px;
  .notification_title {
    font-size: 0.8rem;
  }
  .notification_subtitle {
    font-size: 0.75rem;
    font-weight: 300;
  }
  .notification_body {
    flex: 1;
    min-width: 0;
    padding: 10px;
  }
  .notification_progress {
    width: 100%;
    height: 3px;
    margin-top: 7px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 18%, transparent);
    span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: currentColor;
      transition: width .18s ease;
    }
  }
  .closeNotification {
    margin-right: 10px;
  }
  .closeNotification:hover {
    transform: scale(1.2);
  }
}
.notification_normal {
  border-bottom: 2px solid #0066ff;
  border-top: 2px solid #0066ff;
}
.notification_success {
  border-top: 2px solid #00ff91;
  border-bottom: 2px solid #00ff91;
}
.notification_danger {
  border-bottom: 2px solid crimson;
  border-top: 2px solid crimson;
}
.notification_warning {
  border-bottom: 2px solid orangered;
  border-top: 2px solid orangered;
}
@media (max-width: 700px), (hover: none) and (pointer: coarse) {
  .notificationCard {
    max-width: calc(100vw - 28px);
    margin: 6px 10px;
    padding: 1px;
    border-radius: 14px;
  }
  .notificationCard .notification_body {
    padding: 9px 8px 9px 11px;
  }
  .notificationCard .notification_title {
    font-size: 12px;
    line-height: 1.25;
  }
  .notificationCard .notification_subtitle {
    margin-top: 2px;
    font-size: 11px;
    line-height: 1.3;
  }
}
</style>
