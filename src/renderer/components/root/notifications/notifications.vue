<template>
  <div class="Notifications">
    <transition-group
      enter-active-class="animated fadeInDown extrafaster"
      leave-active-class="animated fadeOutUp extrafaster"
    >
      <base-notification
        v-for="notification in notifications"
        :key="notification.id || notification.groupKey || notification.title"
        :notification="notification"
      />
    </transition-group>
  </div>
</template>

<script>
import { ipcRenderer } from '@/platform/ipc';
import { mapMutations } from 'vuex';

export default {
  name: 'Notifications',

  computed: {
    notifications() {
      return this.$store.state.NotificationManager.notifications;
    }
  },
  methods: {
    ...mapMutations(['pushNotification', 'removeNotification'])
  },
  mounted() {
    ipcRenderer.on('notification', (e, notification) => {
      this.pushNotification(notification);
    });
    ipcRenderer.on('closeNotification', (e, title) => {
      // The main process may send either a stable group key or, on desktop,
      // the translation key of the title. Both are accepted.
      this.removeNotification(title);
      this.removeNotification(this.t(title));
    });
  }
};
</script>

<style lang="scss">
.Notifications {
  position: fixed;
  z-index: 100;
  left: 50%;
  transform: translateX(-50%);
}
@media (max-width: 700px), (hover: none) and (pointer: coarse) {
  .Notifications {
    top: calc(env(safe-area-inset-top) + 5px);
    width: min(100vw - 16px, 420px);
    max-width: 100%;
  }
}
</style>
